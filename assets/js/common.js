// /assets/js/common.js
(function () {
  const API_BASE = 'http://127.0.0.1:8000/api';
  const LOGIN_URL = '/auth?tab=login';
  const AUTH_PATH_PREFIX = '/auth';

  const PUBLIC_PATHS = ['/', '/accueil', '/contact', '/auth'];

  (async function ensureRoleOnProtectedPage() {
    try {
      const waitForEcoAuth = (timeout = 2000, interval = 50) => new Promise((resolve) => {
        const start = Date.now();
        (function check() {
          if (window.ecoAuth && typeof window.ecoAuth.fetchMe === 'function') return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(check, interval);
        })();
      });
  
      const ready = await waitForEcoAuth();
      if (!ready) {
        console.warn('ecoAuth not ready — skipping role check');
        return;
      }
  
      const path = location.pathname;
      if (path.startsWith('/espace-administrateur')) {
        const user = await window.ecoAuth.fetchMe();
        const roles = (user && user.roles) || [];
        if (!roles.map(r => r.toUpperCase()).includes('ROLE_ADMIN')) {
          window.location.href = '/';
          return;
        }
      }
  
      if (path.startsWith('/espace-employe')) {
        const user = await window.ecoAuth.fetchMe();
        const roles = (user && user.roles) || [];
        const allowed = roles.map(r => r.toUpperCase())
          .some(r => ['ROLE_EMPLOYE', 'ROLE_EMPLOYEE', 'ROLE_ADMIN'].includes(r));
        if (!allowed) window.location.href = '/';
      }
  
    } catch (err) {
      console.error('ensureRoleOnProtectedPage failed', err);
    }
  })();

  function normalizePath(p) {
    const path = (p || '').split('?')[0];
    return path.replace(/\/+$/, '') || '/';
  }
  function isPathPublic(pathname) {
    const p = normalizePath(pathname);
    return PUBLIC_PATHS.some(pub => {
      const pubNorm = normalizePath(pub);
      return p === pubNorm || p.startsWith(pubNorm + '/');
    });
  }

  function getToken() { return localStorage.getItem('api_token'); }
  function setToken(token) {
    if (token) localStorage.setItem('api_token', token);
    else localStorage.removeItem('api_token');
  }

  async function fetchMe() {
    const token = getToken();
    if (!token) {
      localStorage.removeItem('ecoride_user');
      return null;
    }
  
    const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : 'http://127.0.0.1:8000/api';
    const url = base + '/me';
  
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      });
  
      if (res.status === 401) {
        setToken(null);
        localStorage.removeItem('ecoride_user');
        return null;
      }
      if (res.status === 204) {
        localStorage.removeItem('ecoride_user');
        return null;
      }
  
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
  
      if (!ct.includes('application/json')) {
        console.warn('[fetchMe] réponse non JSON pour', url, 'content-type=', ct);
        return undefined;
      }
  
      let user;
      try {
        user = JSON.parse(text);
      } catch (e) {
        console.warn('[fetchMe] JSON invalide reçu:', e);
        return undefined;
      }
  
      if (user && user.id && (!user.avatar || !String(user.avatar).trim())) {
        try {
          const resFull = await fetch(`${base}/users/${user.id}`, {
            headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
          });
          if (resFull.ok) {
            const userFull = await resFull.json();
            if (userFull && userFull.avatar) user.avatar = userFull.avatar;
          }
        } catch (e) {
          console.debug('[fetchMe] fallback /users/ failed', e);
        }
      }
  
      if (user && typeof user === 'object' && Object.keys(user).length > 0) {
        try { localStorage.setItem('ecoride_user', JSON.stringify(user)); }
        catch (e) { console.warn('fetchMe: impossible d\'écrire localStorage', e); }
        console.log('[fetchMe] Profil chargé (id=' + user.id + ') avatar=', user.avatar || 'n/a');
        return user;
      } else {
        localStorage.removeItem('ecoride_user');
        return null;
      }
    } catch (e) {
      console.error('fetchMe error (network?)', e);
      return undefined;
    }
  }

  function doLogout(redirect = true) {
    setToken(null);
    localStorage.removeItem('ecoride_user');
    localStorage.removeItem('ecoride_trajets_cache');
    sessionStorage.clear();

    console.log('[Auth] Déconnexion : LocalStorage nettoyé.');

    if (redirect) {
      window.location.href = LOGIN_URL;
    } else {
      refreshAuthUI();
    }
  }

  function replaceWithClone(el) {
    if (!el || !el.parentNode) return el;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }

  function setLoginToLogout() {
    const loginEls = Array.from(document.querySelectorAll('#dropdown-login'));
    loginEls.forEach(loginEl => {
      if (loginEl.dataset.logoutAttached === 'true') return;
  
      const newLogin = replaceWithClone(loginEl);
      newLogin.textContent = 'Déconnexion';
      if (newLogin.tagName === 'A') {
        const btn = document.createElement('button');
        btn.id = 'logoutBtn';
        btn.type = 'button';
        btn.className = newLogin.className || 'logout-btn';
        btn.textContent = 'Déconnexion';
        newLogin.parentNode && newLogin.parentNode.replaceChild(btn, newLogin);
        btn.dataset.logoutAttached = 'true';
      } else {
        newLogin.id = newLogin.id || 'logoutBtn';
        newLogin.dataset.logoutAttached = 'true';
      }
  
      const target = document.getElementById('logoutBtn') || newLogin;
      if (target && !target._logoutHandlerAttached) {
        target.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.ecoAuth && typeof window.ecoAuth.logout === 'function') {
            window.ecoAuth.logout();
          } else {
            doLogout(true);
          }
        });
        target._logoutHandlerAttached = true;
      }
    });
  }
  function restoreLoginLinks() {
    const btns = Array.from(document.querySelectorAll('#logoutBtn, .logout-btn'));
    if (btns.length) {
      btns.forEach(b => {
        const a = document.createElement('a');
        a.id = 'dropdown-login';
        a.className = b.className || 'nav-link';
        a.href = LOGIN_URL;
        a.textContent = 'Connexion';
        b.parentNode && b.parentNode.replaceChild(a, b);
      });
      return;
    }
  
    const loginEls = Array.from(document.querySelectorAll('#dropdown-login'));
    loginEls.forEach(loginEl => {
      const newLogin = replaceWithClone(loginEl);
      newLogin.textContent = 'Connexion';
      newLogin.setAttribute('href', LOGIN_URL);
      delete newLogin.dataset.logoutAttached;
      newLogin._logoutHandlerAttached = false;
    });
  }

  function hideRegisterLinks() {
    const regEls = Array.from(document.querySelectorAll('#dropdown-register'));
    regEls.forEach(el => { el.style.display = 'none'; });
  }
  function showRegisterLinks() {
    const regEls = Array.from(document.querySelectorAll('#dropdown-register'));
    regEls.forEach(el => { el.style.display = ''; });
  }

  function isLargeScreen() {
    return window.matchMedia('(min-width: 992px)').matches;
  }

  function hideProtectedMenuItemsInContainer(container) {
    const items = Array.from(container.querySelectorAll('.nav-item, .dropdown-item'));
    items.forEach(item => {
      const link = item.querySelector('a, .dropdown-item') || item;
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (!isPathPublic(href)) item.style.display = 'none';
      else item.style.display = '';
    });
  }

  function showAllInContainer(container) {
    const items = Array.from(container.querySelectorAll('.nav-item, .dropdown-item'));
    items.forEach(item => item.style.display = '');
  }

  function hideProtectedMenuItemsResponsive() {
    const navRoot = document.querySelector('.navbar .navbar-nav');
    const offcanvasNav = document.querySelector('.offcanvas-body .navbar-nav');

    if (navRoot) hideProtectedMenuItemsInContainer(navRoot);
    if (offcanvasNav) hideProtectedMenuItemsInContainer(offcanvasNav);
  }

  function showAllMenuItemsResponsive() {
    if (isLargeScreen()) {
      const navRoot = document.querySelector('.navbar .navbar-nav');
      if (navRoot) showAllInContainer(navRoot);
      const offcanvasNav = document.querySelector('.offcanvas-body .navbar-nav');
      if (offcanvasNav) showAllInContainer(offcanvasNav);
    } else {
      const offcanvasNav = document.querySelector('.offcanvas-body .navbar-nav');
      if (offcanvasNav) showAllInContainer(offcanvasNav);
      const navRoot = document.querySelector('.navbar .navbar-nav');
      if (navRoot) showAllInContainer(navRoot);
    }
  }

  function computeRoles(user) {
    const roles = Array.isArray(user && user.roles) ? user.roles.map(r => String(r).toUpperCase()) : [];
    return {
      isAdmin: roles.includes('ROLE_ADMIN'),
      isEmployee: roles.includes('ROLE_EMPLOYE') || roles.includes('ROLE_EMPLOYEE'),
      isUser: roles.includes('ROLE_USER'),
      isVisitor: roles.includes('ROLE_VISITEUR')
    };
  }

  function applyMenuVisibilityResponsive(isAuthenticated, user) {
    const { isAdmin, isEmployee } = user ? computeRoles(user) : { isAdmin: false, isEmployee: false };
  
    const adminSelector = [
      'a[href="/espace-administrateur"]',
      'a[href="/espace-administrateur/"]'
    ].join(',');
    const employeeSelector = [
      'a[href="/espace-employe"]',
      'a[href="/espace-employe/"]'
    ].join(',');
  
    const adminEls = Array.from(document.querySelectorAll(adminSelector));
    const employeeEls = Array.from(document.querySelectorAll(employeeSelector));
  
    if (isAuthenticated) {
      showAllMenuItemsResponsive();
      hideRegisterLinks();
      adminEls.forEach(a => {
        const parentItem = a.closest('.nav-item, .dropdown-item');
        if (parentItem) parentItem.style.display = isAdmin ? '' : 'none';
        else a.style.display = isAdmin ? '' : 'none';
      });
      const showEmployee = isEmployee || isAdmin;
      employeeEls.forEach(a => {
        const parentItem = a.closest('.nav-item, .dropdown-item');
        if (parentItem) parentItem.style.display = showEmployee ? '' : 'none';
        else a.style.display = showEmployee ? '' : 'none';
      });
    } else {
      hideProtectedMenuItemsResponsive();
    }
  }

  function getDisplayNameFromUser(user) {
    if (!user) return 'Utilisateur';
    const candidates = [
      user.firstName,
      user.firstname,
      user.first_name,
      user.name,
      user.fullName,
      user.full_name,
      user.username
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim()) {
        return c.trim().split(/\s+/)[0];
      }
    }
    if (user.email && typeof user.email === 'string') {
      const local = user.email.split('@')[0];
      if (local) return capitalize(local.split(/[.\-_]/)[0]);
    }
    return 'Utilisateur';
  }
  function capitalize(s) { if (!s) return s; return s.charAt(0).toUpperCase() + s.slice(1); }

  function setDropdownTogglesToName(name) {
    const toggles = Array.from(document.querySelectorAll('.nav-item.dropdown .dropdown-toggle, #dropdownMenuButton'));
    toggles.forEach(t => {
      t.textContent = name;
      if (!t.hasAttribute('data-bs-toggle')) t.setAttribute('data-bs-toggle', 'dropdown');
      t.setAttribute('aria-expanded', 'false');
      t.setAttribute('title', name);
    });
  }

  /**
   * Affichage instantané depuis localStorage pour une UX immédiate.
   * Ne remplace pas la vérification serveur : refreshAuthUI() viendra corriger si nécessaire.
   */
  function applyImmediateAuth() {
    try {
      const raw = localStorage.getItem('ecoride_user');
      if (!raw) return;
      const user = JSON.parse(raw);
      if (!user) return;

      const name = user.firstName || user.firstname || user.first_name || user.username || user.name || (user.email && user.email.split('@')[0]) || 'Mon Compte';

      // Applique le prénom tout de suite
      const toggles = Array.from(document.querySelectorAll('.nav-item.dropdown .dropdown-toggle, #dropdownMenuButton'));
      toggles.forEach(t => {
        try { t.textContent = name; } catch (e) { /* ignore */ }
      });

      const loginLink = document.getElementById('dropdown-login');
      if (loginLink) {
        // Affiche "Déconnexion" visuellement — le listener de logout gèrera l'action réelle
        loginLink.textContent = 'Déconnexion';
        loginLink.setAttribute('href', '#');
      }

      const regs = document.querySelectorAll('#dropdown-register');
      regs.forEach(e => { e.style.display = 'none'; });

    } catch (err) {
      console.debug('[applyImmediateAuth] erreur lecture cache', err);
    }
  }

  // Appliquer immédiatement au chargement du script (common.js est chargé en defer)
  applyImmediateAuth();

  function restoreDropdownTogglesToMenu() {
    const toggles = Array.from(document.querySelectorAll('.nav-item.dropdown .dropdown-toggle, #dropdownMenuButton'));
    toggles.forEach(t => {
      const newT = replaceWithClone(t);
      newT.textContent = 'Menu';
      newT.setAttribute('title', 'Menu');
      if (!newT.hasAttribute('data-bs-toggle')) newT.setAttribute('data-bs-toggle', 'dropdown');
    });
  }

  async function refreshAuthUI() {
    // petit feedback visuel pendant la mise à jour distante
    const toggles = Array.from(document.querySelectorAll('.nav-item.dropdown .dropdown-toggle, #dropdownMenuButton'));
    toggles.forEach(t => t.classList.add('updating'));

    const avatarEl = document.querySelector('.user-avatar-img');
    if (avatarEl) avatarEl.src = '/assets/default-avatar.png';
  
    const user = await fetchMe();
  
    if (user === undefined) {
      console.warn('[refreshAuthUI] fetchMe returned undefined (network/CORS). Conserver état actuel.');
      // retirer auth-loading pour que la page ne reste pas bloquée visuellement
      document.body.classList.remove('auth-loading');
      return;
    }
  
    const isAuthenticated = !!user;
  
    if (isAuthenticated) {
      hideRegisterLinks();
      setLoginToLogout();
      const displayName = getDisplayNameFromUser(user);
      setDropdownTogglesToName(displayName);
      if (avatarEl) {
        avatarEl.src = (user.avatar ? user.avatar.split('?')[0] + '?t=' + Date.now() : '/assets/default-avatar.png');
      }
      applyMenuVisibilityResponsive(isAuthenticated, user);
    } else {
      showRegisterLinks();
      restoreLoginLinks();
      restoreDropdownTogglesToMenu();
      applyMenuVisibilityResponsive(isAuthenticated, user);
  
      const token = getToken();
      if (!token && !isPathPublic(location.pathname)) {
        if (!normalizePath(location.pathname).startsWith(normalizePath('/auth'))) {
          window.location.href = LOGIN_URL;
          return;
        }
      } else if (token && !isPathPublic(location.pathname)) {
        window.location.href = LOGIN_URL;
        return;
      }
    }

    // Retirer le masque d'auth à la fin (toujours)
    document.documentElement.classList.remove('auth-loading');
    document.body.classList.remove('auth-loading');

    // retirer le feedback visuel 'updating'
    toggles.forEach(t => t.classList.remove('updating'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        refreshAuthUI().finally(() => {
            document.documentElement.classList.remove('auth-loading');
        });
    });
  } else {
      refreshAuthUI().finally(() => {
          document.documentElement.classList.remove('auth-loading');
      });
  }

  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(async () => {
      const currentUser = await fetchMe();
      applyMenuVisibilityResponsive(!!currentUser, currentUser);
    }, 150);
  });

  window.ecoAuth = {
    getToken,
    setToken,
    logout: () => doLogout(true),
    refresh: refreshAuthUI,
    fetchMe
  };

  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('#logoutBtn, .logout-btn');
    if (!btn) return;
  
    console.log('[DEBUG] Clic sur Déconnexion détecté');
    e.preventDefault();
  
    localStorage.removeItem('api_token');
    localStorage.removeItem('ecoride_user');
    localStorage.removeItem('ecoride_trajets_cache');
    sessionStorage.clear();
  
    if (window.ecoAuth && typeof window.ecoAuth.logout === 'function') {
      window.ecoAuth.logout();
    } else {
      window.location.href = '/auth?tab=login';
    }
  });
})();