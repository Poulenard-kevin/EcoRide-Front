// /assets/js/common.js
(function () {
  const API_BASE = 'http://127.0.0.1:8000/api';
  const LOGIN_URL = '/auth?tab=login';
  const AUTH_PATH_PREFIX = '/auth';

  const PUBLIC_PATHS = ['/', '/accueil', '/contact', '/auth'];

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
    if (!token) return null;
    try {
      const res = await fetch(API_BASE + '/me', {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
      });
      if (res.status === 401) { setToken(null); return null; }
      if (res.status === 204) return null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
      if (ct.includes('application/json') && text) {
        try { return JSON.parse(text); } catch (e) { return null; }
      }
      return null;
    } catch (e) {
      console.error('fetchMe error', e);
      return null;
    }
  }

  function doLogout(redirect = true) {
    setToken(null);
    if (redirect) window.location.href = LOGIN_URL;
    else refreshAuthUI();
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
      const newLogin = replaceWithClone(loginEl);
      newLogin.textContent = 'Déconnexion';
      newLogin.setAttribute('href', '#');
      newLogin.addEventListener('click', function (e) {
        e.preventDefault();
        doLogout(true);
      });
    });
  }
  function restoreLoginLinks() {
    const loginEls = Array.from(document.querySelectorAll('#dropdown-login'));
    loginEls.forEach(loginEl => {
      const newLogin = replaceWithClone(loginEl);
      newLogin.textContent = 'Connexion';
      newLogin.setAttribute('href', LOGIN_URL);
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
    // On applique toujours le filtre sur les deux conteneurs (navbar + offcanvas)
    // pour s'assurer que seuls les liens publics restent visibles quand on est
    // non authentifié, quelle que soit la taille d'écran.
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

  // utilitaire pour déterminer les rôles (utiliser les noms exacts définis en PHP)
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
    // calcul des rôles
    const { isAdmin, isEmployee } = user ? computeRoles(user) : { isAdmin: false, isEmployee: false };
  
    // sélecteurs couvrant navbar, offcanvas, dropdown-items — ajoute variantes si nécessaire
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
      // 1) Montrer d'abord les éléments généraux (navbar/offcanvas)
      showAllMenuItemsResponsive();
  
      // 2) Masquer l'inscription
      hideRegisterLinks();
  
      // 3) Appliquer règles fines :
      // - Admin uniquement : montre adminEls seulement si isAdmin
      adminEls.forEach(a => {
        const parentItem = a.closest('.nav-item, .dropdown-item');
        if (parentItem) parentItem.style.display = isAdmin ? '' : 'none';
        else a.style.display = isAdmin ? '' : 'none';
      });
  
      // - Employé (ou admin) : montre employeeEls seulement si isEmployee OR isAdmin
      //   (ici on autorise admin aussi à voir l'espace employé)
      const showEmployee = isEmployee || isAdmin;
      employeeEls.forEach(a => {
        const parentItem = a.closest('.nav-item, .dropdown-item');
        if (parentItem) parentItem.style.display = showEmployee ? '' : 'none';
        else a.style.display = showEmployee ? '' : 'none';
      });
  
    } else {
      // non authentifié : masquer les éléments protégés selon le comportement responsive existant
      hideProtectedMenuItemsResponsive();
    }
  }

  // utils affichage prénom
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
    const user = await fetchMe();
    const isAuthenticated = !!user;

    if (isAuthenticated) {
      hideRegisterLinks();
      setLoginToLogout();

      const displayName = getDisplayNameFromUser(user);
      setDropdownTogglesToName(displayName);

      applyMenuVisibilityResponsive(isAuthenticated, user);
    } else {
      showRegisterLinks();
      restoreLoginLinks();
      restoreDropdownTogglesToMenu();
      applyMenuVisibilityResponsive(isAuthenticated, user);

      if (!isPathPublic(location.pathname)) {
        if (!normalizePath(location.pathname).startsWith(normalizePath('/auth'))) {
          window.location.href = LOGIN_URL;
          return;
        }
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshAuthUI);
  else refreshAuthUI();

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
})();