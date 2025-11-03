// user-profile-form.js

//<!-- FORM : Rôle -->
//<!-- FORM : Rôle -->
//<!-- FORM : Rôle -->

function initRoleForm(containerSelector = document) {
  const container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector)
    : (containerSelector || document);

  if (!container) {
    console.warn('initRoleForm: container introuvable pour', containerSelector);
    return;
  }

  if (container.__roleInit) {
    console.log('initRoleForm: déjà initialisé pour', container);
    return;
  }
  container.__roleInit = true;

  const q = (sel) => container.querySelector(sel) || document.querySelector(sel);
  const qa = (sel) => Array.from((container.querySelectorAll(sel).length ? container.querySelectorAll(sel) : document.querySelectorAll(sel)));

  // persistence helpers
  function persistRole(role) {
    if (!role) return;
    try {
      if (typeof getCanonicalUser === 'function' && typeof setCanonicalUser === 'function') {
        const user = getCanonicalUser() || {};
        user.role = role;
        setCanonicalUser(user);
      } else {
        localStorage.setItem('ecoride_role', role);
        window.dispatchEvent(new CustomEvent('ecoride:rolePersisted', { detail: { role } }));
      }
    } catch (err) {
      console.warn('persistRole error', err);
      try { localStorage.setItem('ecoride_role', role); } catch(e){}
    }
  }

  function restoreRole() {
    try {
      if (typeof getCanonicalUser === 'function') {
        const c = getCanonicalUser();
        if (c && c.role) return c.role;
      }
      return localStorage.getItem('ecoride_role') || null;
    } catch (err) {
      console.warn('restoreRole error', err);
      return localStorage.getItem('ecoride_role');
    }
  }

  function applyRoleToRadios(role, root = document) {
    if (!role) return false;
    const radio = (root && root.querySelector ? root : document).querySelector(`input[name="role"][value="${role}"]`)
                || document.querySelector(`input[name="role"][value="${role}"]`);
    if (radio) {
      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        if (typeof window.updateRoleFields === 'function') window.updateRoleFields();
        else radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  // install storage listener once globally
  if (!window.__ecoride_role_storage_listener_installed) {
    window.addEventListener('storage', (e) => {
      if (e.key === 'ecoride_role' || e.key === 'ecoride_user') {
        const r = restoreRole();
        if (r) applyRoleToRadios(r);
      }
    }, { passive: true });
    window.__ecoride_role_storage_listener_installed = true;
  }

  // listeners with persist
  function attachRoleListenersWithPersist() {
    const radios = qa('input[name="role"]');
    radios.forEach(radio => {
      if (radio.__roleListenerAttached) return;
      radio.addEventListener('change', (ev) => {
        try {
          const val = (ev.target && ev.target.value) ? ev.target.value : null;
          persistRole(val);
          toggleVehicleFields();
        } catch(e) { console.warn('role change handler error', e); }
      });
      radio.addEventListener('click', toggleVehicleFields);
      radio.__roleListenerAttached = true;
    });
    return radios.length;
  }

  function setControlsDisabled(root, disabled) {
    if (!root) return;
    const controls = root.querySelectorAll('input, select, textarea, button, a');
    controls.forEach(el => {
      if (el.classList && el.classList.contains('no-disable')) return;
      if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(el.tagName)) {
        try { el.disabled = disabled; } catch (e) {}
        el.setAttribute('aria-disabled', String(disabled));
        el.classList.toggle('disabled-by-role', disabled);
      }
      if (el.tagName === 'A') {
        el.style.pointerEvents = disabled ? 'none' : '';
        el.setAttribute('aria-disabled', String(disabled));
        el.classList.toggle('disabled-by-role', disabled);
      }
      if (disabled) {
        if (el.tabIndex >= 0) el.dataset._savedTabindex = el.tabIndex;
        try { el.tabIndex = -1; } catch (e) {}
      } else {
        if (el.dataset && el.dataset._savedTabindex !== undefined) {
          try { el.tabIndex = parseInt(el.dataset._savedTabindex, 10); } catch {}
          delete el.dataset._savedTabindex;
        }
      }
    });
  }

  function toggleVehicleFields() {
    const plate = q('#plate');
    const registrationDate = q('#registration-date');
    const vehicleMarque = q('#vehicle-marque');
    const vehicleModel = q('#vehicle-model');
    const vehicleColor = q('#vehicle-color');
    const vehicleType = q('#vehicle-type') || q('#vehicleType');
    const seats = q('#seats');
    const other = q('#other');

    const selected = container.querySelector('input[name="role"]:checked') || document.querySelector('input[name="role"]:checked');
    const role = selected ? selected.value : null;
    const isPassager = role === 'passager';

    const preferences = qa('input[name="preferences"]');

    [plate, registrationDate, vehicleMarque, vehicleModel, vehicleColor, vehicleType, seats, other].forEach((field) => {
      if (!field) return;
      field.disabled = isPassager;
      field.setAttribute('aria-disabled', String(isPassager));
      field.classList.toggle('disabled-by-role', isPassager);
    });

    preferences.forEach((chk) => {
      if (!chk) return;
      chk.disabled = isPassager;
      chk.setAttribute('aria-disabled', String(isPassager));
      chk.classList.toggle('disabled-by-role', isPassager);
    });

    const publishContainer = document.querySelector('#user-trajects-form') || document.querySelector('#publish-trajet-form') || document.querySelector('#trajets-en-cours');
    if (publishContainer) {
      setControlsDisabled(publishContainer, isPassager);
      const trajetsList = document.querySelector('#trajets-list') || document.querySelector('#user-trajets-list') || document.querySelector('#trajets-en-cours-list');
      if (trajetsList) {
        trajetsList.querySelectorAll('.link-edit, .link-delete, .btn-edit, .btn-delete').forEach(el => {
          if (isPassager) {
            if (el.tagName === 'A') el.removeAttribute('href');
            el.style.pointerEvents = 'none';
            el.setAttribute('aria-disabled', 'true');
            el.classList.add('disabled-by-role');
          } else {
            el.style.pointerEvents = '';
            el.setAttribute('aria-disabled', 'false');
            el.classList.remove('disabled-by-role');
          }
        });
      }
    }

    window.dispatchEvent(new CustomEvent('ecoride:roleChanged', {
      detail: { role, isPassager }
    }));

    console.log('initRoleForm -> role:', role, 'isPassager:', isPassager);
  }

  // expose helper
  if (typeof window.updateRoleFields !== 'function') {
    window.updateRoleFields = toggleVehicleFields;
  } else {
    window.updateRoleFieldsFallback = toggleVehicleFields;
  }

  // attach listeners & restore saved value
  attachRoleListenersWithPersist();

  const saved = restoreRole();
  if (saved) {
    if (!applyRoleToRadios(saved, container)) applyRoleToRadios(saved, document);
  } else {
    const c = (typeof getCanonicalUser === 'function') ? getCanonicalUser() : null;
    if (c && c.role) applyRoleToRadios(c.role, container);
  }

  toggleVehicleFields();

  // observer pour injections dynamiques
  const observer = new MutationObserver((mutations) => {
    let sawRelevant = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches && (
              node.matches('input[name="role"]') ||
              node.matches('#plate') ||
              node.matches('#registration-date') ||
              node.matches('#vehicle-marque') ||
              node.matches('#vehicle-model') ||
              node.matches('#vehicle-color') ||
              node.matches('#vehicle-type') ||
              node.matches('#seats') ||
              node.matches('#other') ||
              node.matches('input[name="preferences"]')
            )
          ) {
            sawRelevant = true;
            break;
          }
          if (node.querySelector && node.querySelector('input[name="role"], #plate, #vehicle-type, input[name="preferences"]')) {
            sawRelevant = true;
            break;
          }
        }
      }
      if (sawRelevant) break;
    }

    if (sawRelevant) {
      attachRoleListenersWithPersist();
      toggleVehicleFields();
      const savedNow = restoreRole();
      if (savedNow) applyRoleToRadios(savedNow, container);
    }
  });

  try {
    observer.observe(container, { childList: true, subtree: true });
  } catch (err) {
    console.warn('initRoleForm: échec observer.observe', err);
  }

  setTimeout(() => {
    try { observer.disconnect(); } catch (e) { /* ignore */ }
  }, 10000);
}

window.initRoleForm = initRoleForm;

//<!-- FORM 1 : Photo de profil -->
//<!-- FORM 1 : Photo de profil -->
//<!-- FORM 1 : Photo de profil -->

// Textes/labels centralisés (évite les doublons)
const MESSAGES = {
  PREVIEW_READY: "Aperçu prêt — cliquez sur Valider, pour enregistrer la photo de profil",
  PREVIEW_READY_ALT: "Aperçu prêt — cliquez sur Valider, pour enregistrer la photo de profil.", // si tu veux garder l'alternative temporairement
  NO_FILE_SELECTED: "Aucun fichier sélectionné — choisissez un fichier avant de valider.",
  TYPE_NOT_SUPPORTED: "Type non supporté (PNG/JPG/WEBP seulement).",
  SIZE_TOO_LARGE: "Fichier trop volumineux (max 2 Mo).",
  LOAD_ERROR: "Impossible de lire le fichier.",
  SAVED: "Photo de profil enregistrée.",
  SAVE_ERROR: "Impossible d’enregistrer la photo de profil. (localStorage plein ?)."
};

(function () {
  const STORAGE_KEY = 'ecoride.profileAvatar';
  const DEFAULT_SRC = 'images/default-avatar.png'; // adapte si nécessaire
  const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

  function isValidImageFile(file) {
    if (!file) return { ok: false, reason: 'no-file' };
    if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, reason: 'type' };
    if (file.size > MAX_BYTES) return { ok: false, reason: 'size' };
    return { ok: true };
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('read-error'));
      fr.readAsDataURL(file);
    });
  }

  function saveAvatarToStorage(dataURL, meta = {}) {
    try {
      const payload = {
        dataURL,
        meta: {
          name: meta.name || null,
          type: meta.type || null,
          size: meta.size || null,
          timestamp: Date.now()
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('saveAvatarToStorage error', e);
      return false;
    }
  }

  function removeAvatarFromStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function loadAvatarFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.dataURL ? parsed : null;
    } catch (e) {
      console.warn('loadAvatarFromStorage parse fail', e);
      return null;
    }
  }

  function dispatchAvatarEvent(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // Main init
  function initProfilePhotoForm(root = document) {
    const form = root.querySelector('#profile-photo-form');
    if (!form) return console.warn('initProfilePhotoForm: form introuvable');

    const previewImg = form.querySelector('#profileAvatarPreview');
    const fileInput = form.querySelector('#profileAvatarInput');
    const btnConfirm = form.querySelector('#confirmAvatarBtn');
    const btnRemove = form.querySelector('#removeAvatarBtn');
    const smallMsg = form.querySelector('.avatar-actions small') || null;
    const row = form.querySelector('.profile-photo-row');

    let currentDataURL = null;
    let currentFileMeta = null;

    function setStatus(msg, isError = false) {
      if (!smallMsg) return;
      smallMsg.textContent = msg;
      smallMsg.style.color = isError ? '#b02a37' : '#6c757d';
    }

    function updateUIForLoadedAvatar(dataURL, meta) {
      previewImg.src = dataURL || DEFAULT_SRC;
      currentDataURL = dataURL || null;
      currentFileMeta = meta || null;
    
      // Si une image est déjà présente (dataURL truthy) -> bouton Valider désactivé
      if (btnConfirm) btnConfirm.disabled = !!dataURL;
    
      // Le bouton Supprimer doit être activé uniquement si on a une image enregistrée
      if (btnRemove) btnRemove.disabled = !dataURL;
    }

    // load existing
    const saved = loadAvatarFromStorage();
    if (saved) {
      updateUIForLoadedAvatar(saved.dataURL, saved.meta);
    } else {
      updateUIForLoadedAvatar(DEFAULT_SRC, null);
      if (btnConfirm) btnConfirm.disabled = true;
      if (btnRemove) btnRemove.disabled = true;
    }

    // file input change -> update preview + ready state
    if (fileInput) {
      fileInput.addEventListener('change', async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        const check = isValidImageFile(file);
        if (!check.ok) {
          if (check.reason === 'type') setStatus(MESSAGES.TYPE_NOT_SUPPORTED, true);
          else if (check.reason === 'size') setStatus(MESSAGES.SIZE_TOO_LARGE, true);
          else setStatus('Fichier invalide.', true);
          const saved2 = loadAvatarFromStorage();
          previewImg.src = saved2 ? saved2.dataURL : DEFAULT_SRC;
          try { fileInput.value = ''; } catch {}
          currentDataURL = null;
          if (btnConfirm) btnConfirm.disabled = true;
          if (btnRemove) btnRemove.disabled = saved2 ? false : true;
          return;
        }

        setStatus('Chargement de l’aperçu…');
        try {
          const dataURL = await readFileAsDataURL(file);
          previewImg.src = dataURL;
          currentDataURL = dataURL;
          currentFileMeta = { name: file.name, size: file.size, type: file.type };
          if (btnConfirm) btnConfirm.disabled = false;
          if (btnRemove) btnRemove.disabled = false;
          setStatus(MESSAGES.PREVIEW_READY);
        } catch (err) {
          console.error(err);
          setStatus(MESSAGES.LOAD_ERROR, true);
        }
      });
    }

    // confirm (robuste) - lit le fichier au clic si nécessaire
    if (btnConfirm) {
      btnConfirm.addEventListener('click', (ev) => {
        ev.preventDefault();

        function finalizeSave(dataURL, meta) {
          if (!dataURL) {
            setStatus("Aucun avatar à enregistrer.", true);
            return;
          }
          const ok = saveAvatarToStorage(dataURL, meta || {});
          if (!ok) {
            setStatus('Impossible d’enregistrer la photo de profil, (localStorage plein ?).', true);
            return;
          }
        
          // mise à jour UI locale
          currentDataURL = dataURL;
          currentFileMeta = meta || currentFileMeta || {};
          updateUIForLoadedAvatar(dataURL, currentFileMeta);
          setStatus('Photo de profil enregistrée.');
          try { fileInput.value = ''; } catch {}
        
          // --- PATCH : copier la photo dans ecoride_user (si présent) ---
          try {
            const raw = localStorage.getItem('ecoride_user');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                parsed.photo = dataURL; // stocke la dataURL (persistante)
                localStorage.setItem('ecoride_user', JSON.stringify(parsed));
                console.log('ecoride_user mis à jour avec la photo (patch automatique)');
              }
            }
          } catch (err) {
            console.warn('Erreur lors du patch de ecoride_user', err);
          }
        
          // dispatch global (notifie les autres modules)
          window.dispatchEvent(new Event('userUpdated'));
        
          // event local / backward-compat (tu as déjà ce dispatch dans le code existant)
          dispatchAvatarEvent('ecoride:avatarChanged', { dataURL, meta: currentFileMeta });
        
          if (btnConfirm) btnConfirm.disabled = true;
        }

        if (currentDataURL) {
          finalizeSave(currentDataURL, currentFileMeta);
          return;
        }

        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) {
          setStatus(MESSAGES.NO_FILE_SELECTED, true);
          return;
        }

        const check = isValidImageFile(file);
        if (!check.ok) {
          if (check.reason === 'type') setStatus(MESSAGES.TYPE_NOT_SUPPORTED, true);
          else if (check.reason === 'size') setStatus(MESSAGES.SIZE_TOO_LARGE, true);
          else setStatus('Fichier invalide.', true);
          return;
        }

        setStatus('Lecture du fichier en cours…');
        btnConfirm.disabled = true;
        const fr = new FileReader();
        fr.onload = () => {
          const dataURL = fr.result;
          finalizeSave(dataURL, { name: file.name, size: file.size, type: file.type });
          btnConfirm.disabled = true;
        };
        fr.onerror = (err) => {
          console.error('FileReader error', err);
          setStatus('Erreur lecture fichier', true);
          btnConfirm.disabled = false;
        };
        fr.readAsDataURL(file);
      });
    }

    // drag & drop (optionnel)
    if (row) {
      (function enableDragDrop() {
        const overClass = 'avatar-drag-over';
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add(overClass); });
        row.addEventListener('dragleave', (e) => { row.classList.remove(overClass); });
        row.addEventListener('drop', async (e) => {
          e.preventDefault();
          row.classList.remove(overClass);
          const files = e.dataTransfer && e.dataTransfer.files;
          if (!files || !files.length) return;
          const file = files[0];
          const check = isValidImageFile(file);
          if (!check.ok) {
            setStatus(check.reason === 'size' ? 'Fichier trop volumineux (max 2 Mo).' : 'Type non supporté.', true);
            return;
          }
          setStatus('Chargement de l’aperçu…');
          try {
            const dataURL = await readFileAsDataURL(file);
            previewImg.src = dataURL;
            currentDataURL = dataURL;
            currentFileMeta = { name: file.name, size: file.size, type: file.type };
            if (btnConfirm) btnConfirm.disabled = false;
            if (btnRemove) btnRemove.disabled = false;
            setStatus(MESSAGES.PREVIEW_READY);
          } catch (err) {
            console.error(err);
            setStatus('Erreur lors de la lecture du fichier.', true);
          }
        });
      })();
    }

    // expose helper to update UI from other parts of app
    form.updateAvatarUI = function () {
      const saved = loadAvatarFromStorage();
      if (saved) updateUIForLoadedAvatar(saved.dataURL, saved.meta);
      else updateUIForLoadedAvatar(DEFAULT_SRC, null);
    };

    return {
      el: form,
      load: form.updateAvatarUI,
      save: () => {
        if (currentDataURL) {
          saveAvatarToStorage(currentDataURL, currentFileMeta || {});
          dispatchAvatarEvent('ecoride:avatarChanged', { dataURL: currentDataURL, meta: currentFileMeta });
          setStatus(MESSAGES.SAVED);
        }
      },
      remove: () => {
        removeAvatarFromStorage();
        updateUIForLoadedAvatar(DEFAULT_SRC, null);
        dispatchAvatarEvent('ecoride:avatarRemoved', {});
      }
    };
  }

  // auto-init if form present
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#profile-photo-form')) {
      window.__ecoride_profilePhoto = initProfilePhotoForm(document);
    }
  });

  // expose for manual init (if form is injected dynamically)
  window.initProfilePhotoForm = initProfilePhotoForm;

  (function watchProfileFormInsert() {
    if (document.querySelector('#profile-photo-form')) {
      if (!window.__ecoride_profilePhoto) {
        try { window.__ecoride_profilePhoto = initProfilePhotoForm(document); } catch(e) { console.warn(e); }
      }
      return;
    }
    const mo = new MutationObserver((mutations, obs) => {
      if (document.querySelector('#profile-photo-form')) {
        try {
          if (!window.__ecoride_profilePhoto) {
            window.__ecoride_profilePhoto = initProfilePhotoForm(document);
            console.log('profilePhotoForm init (observed)');
          }
        } catch (e) { console.warn('initProfilePhotoForm failed', e); }
        obs.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { try { mo.disconnect(); } catch(_){}; }, 15000);
  })();
})();

// Delegation globale pour le bouton "Supprimer l'avatar"
// idempotent : s'installe une seule fois même si le fichier est chargé plusieurs fois
if (!window.__ecoride_avatarDeleteDelegationAdded) {
  window.__ecoride_avatarDeleteDelegationAdded = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ecoride-avatar-delete], #removeAvatarBtn');
    if (!btn) return;

    // si on veut permettre propagation dans certains cas, on peut retirer e.preventDefault()
    e.preventDefault();

    const form = btn.closest('form');
    if (form) {
      try { form.querySelector('input[type="submit"], button[type="submit"]')?.blur(); } catch (err) {}
    }

    if (!confirm('Supprimer la photo de profil ?')) return;

    try {
      if (window.__ecoride_profilePhoto && typeof window.__ecoride_profilePhoto.remove === 'function') {
        window.__ecoride_profilePhoto.remove();
      } else {
        localStorage.removeItem('ecoride.profileAvatar');
        document.querySelectorAll('[data-ecoride-avatar], #headerAvatar, #profileAvatarPreview').forEach(img => {
          if (!img) return;
          if (img.tagName === 'IMG') img.src = 'images/default-avatar.png';
        });
        window.dispatchEvent(new CustomEvent('ecoride:avatarRemoved', {}));
      }
      console.log('Avatar supprimé via délégation');
    } catch (err) {
      console.error('Erreur suppression avatar (délégation)', err);
      alert('Impossible de supprimer l\'avatar — voir console.');
    }
  });
}

// Patch de secours : activer/désactiver #confirmAvatarBtn à chaque changement de #profileAvatarInput
(function ensureAvatarConfirmToggle() {
  if (window.__ecoride_avatarConfirmToggleAdded) return;
  window.__ecoride_avatarConfirmToggleAdded = true;

  document.addEventListener('change', (e) => {
    const input = e.target.closest && e.target.closest('#profileAvatarInput');
    if (!input) return;
    try {
      const btn = document.querySelector('#confirmAvatarBtn');
      if (!btn) return;
      const hasFile = input.files && input.files.length > 0;
      btn.disabled = !hasFile;
      console.log('avatarConfirmToggle -> hasFile:', hasFile, 'btn.disabled=', btn.disabled);
    } catch (err) {
      console.warn('avatarConfirmToggle error', err);
    }
  }, { capture: true });
})();

//<!-- FORM 2 : Crédits -->
//<!-- FORM 2 : Crédits -->
//<!-- FORM 2 : Crédits -->

// credits.js (ou coller dans ton bundle)
(function () {
  const CREDITS_KEY = 'ecoride.credits';
  const CREDITS_INIT_FLAG = 'ecoride.credits.initialized';
  const INITIAL_CREDITS = 20;

  function getCredits() {
    const raw = localStorage.getItem(CREDITS_KEY);
    return raw == null ? 0 : (parseInt(raw, 10) || 0);
  }

  function setCredits(n) {
    const safe = Math.max(0, Math.floor(n));
    localStorage.setItem(CREDITS_KEY, String(safe));
    window.dispatchEvent(new CustomEvent('ecoride:creditsChanged', { detail: { credits: safe } }));
    return safe;
  }

  function initCreditsFromLocal() {
    try {
      const existing = localStorage.getItem(CREDITS_KEY);
      if (existing == null) {
        // jamais initialisé -> on crée les 20 crédits
        localStorage.setItem(CREDITS_KEY, String(INITIAL_CREDITS));
        localStorage.setItem(CREDITS_INIT_FLAG, '1');
        console.log('[credits] initialisés à', INITIAL_CREDITS);
      } else {
        // s'il y a une valeur mais pas de flag, pose juste le flag pour éviter ré-init ultérieure
        if (!localStorage.getItem(CREDITS_INIT_FLAG)) {
          localStorage.setItem(CREDITS_INIT_FLAG, '1');
        }
      }
    } catch (e) {
      console.warn('[credits] init error', e);
    }
  }

  function addCredits(delta) {
    if (!Number.isFinite(delta)) return getCredits();
    const prev = getCredits();
    return setCredits(prev + Math.floor(delta));
  }

  // validation : multiple de 5
  function isMultipleOfFive(n) {
    return (Math.floor(n) % 5) === 0;
  }

  // --- boot / binding robustes pour SPA (PATCHED) ---
  (function () {
    // utilitaires & storage already defined above (getCredits, addCredits, etc.)

    // utilitaire : recherche tolérante de l'élément d'affichage des crédits
    function findCreditsDisplay(root) {
      if (!root) return null;

      // tentatives explicites
      let el = root.querySelector('#creditsValue') ||
              root.querySelector('[data-ecoride-credits]') ||
              root.querySelector('.credits-value') ||
              root.querySelector('.eco-circle, .credit-control, .credit-row');
      if (el) return el;

      // fallback : chercher un noeud sans enfants qui contient le mot "crédit"
      const candidates = Array.from(root.querySelectorAll('*')).filter(n => {
        try {
          return n.children.length === 0 && /crédit/i.test(n.textContent || '');
        } catch (e) {
          return false;
        }
      });
      return candidates.length ? candidates[0] : null;
    }

    // binding UI vers un container (idempotent)
    function bindCreditsUI(root = document) {
      // try to find the display element (tolerant)
      const display = findCreditsDisplay(root);
      const form = root.querySelector('#creditsForm') || root.querySelector('.credits-form');
      const input = root.querySelector('#creditsAddInput') || root.querySelector('input[name="creditsAdd"]');

      function refreshUI() {
        const credits = getCredits();
        if (!display) return; // rien à mettre à jour pour le moment
        // si l'élément contient déjà le mot "crédit", on affiche "N crédits", sinon on met juste la valeur
        if (/crédit/i.test(display.textContent || '')) {
          display.textContent = `${credits} crédits`;
        } else {
          display.textContent = String(credits);
        }
      }

      // attacher listener global (idempotent)
      if (!bindCreditsUI.__attached) {
        window.addEventListener('ecoride:creditsChanged', refreshUI);
        bindCreditsUI.__attached = true;
      }

      // initial render (peut être no-op si display absent)
      refreshUI();

      // si le formulaire existe, attacher / remplacer proprement le handler submit
      if (form && input) {
        if (form.__ecorideCreditsSubmitHandler) {
          try { form.removeEventListener('submit', form.__ecorideCreditsSubmitHandler); } catch (e) {}
        }

        const handler = function (ev) {
          ev.preventDefault();
          const val = parseInt(input.value, 10) || 5;
          if (window.__ecorideOpenCreditsModal) {
            window.__ecorideOpenCreditsModal(val);
          } else {
            addCredits(val);
            input.value = 5;
          }
        };

        form.addEventListener('submit', handler);
        form.__ecorideCreditsSubmitHandler = handler;
      }

      // Optionnel : si display est absent pour l'instant, surveiller les insertions dans root
      if (!display && root instanceof Element) {
        const mo = new MutationObserver((mutations, obs) => {
          const found = findCreditsDisplay(root);
          if (found) {
            // petite latence pour laisser le DOM se stabiliser
            setTimeout(() => {
              try {
                refreshUI();
              } catch (e) { /* ignore */ }
            }, 30);
            obs.disconnect();
          }
        });
        try {
          mo.observe(root, { childList: true, subtree: true });
          // sécurité : déconnecte au bout de 10s
          setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, 10000);
        } catch (e) { /* ignore */ }
      }
    }
    
  /* ecoride-credits-modal.js
   Modal Bootstrap 5 dynamique pour achat de crédits.
   - Idempotent : n'injecte qu'une seule fois.
   - Expose window.__ecorideOpenCreditsModal(initialValue)
   - Requiert Bootstrap 5 JS chargé avant ce script.
*/
  (function () {
    if (window.__ecorideCreditsModalBootstrapAdded) return;
    window.__ecorideCreditsModalBootstrapAdded = true;

    // markup Bootstrap 5
    const modalHtml = `
    <div class="modal fade" id="ecorideCreditsModal" tabindex="-1" aria-labelledby="ecorideCreditsModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="ecorideCreditsModalLabel">Acheter des crédits</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
          </div>
          <div class="modal-body">
            <div class="ecoride-credit-packs d-flex gap-2 flex-wrap mb-3" role="list">
              <button type="button" class="ecoride-pack btn btn-outline-secondary" data-value="5">5 crédits</button>
              <button type="button" class="ecoride-pack btn btn-outline-secondary" data-value="10">10 crédits</button>
              <button type="button" class="ecoride-pack btn btn-outline-secondary" data-value="20">20 crédits</button>
              <button type="button" class="ecoride-pack btn btn-outline-secondary" data-value="50">50 crédits</button>
            </div>

            <div class="mb-2">
              <label class="form-label small">Ou montant personnalisé (multiple de 5)</label>
              <input type="number" min="5" step="5" value="5" class="form-control ecoride-custom-input" />
            </div>

            <div class="text-muted small mt-2">Paiement simulé — remplace par ton intégration CB/Stripe si nécessaire.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-cancel" data-bs-dismiss="modal">Annuler</button>
            <button type="button" class="btn btn-success btn-confirm">Payer et ajouter</button>
          </div>
        </div>
      </div>
    </div>
    `;

    // inject DOM once
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);

    const modalEl = document.getElementById('ecorideCreditsModal');
    const packs = Array.from(modalEl.querySelectorAll('.ecoride-pack'));
    const input = modalEl.querySelector('.ecoride-custom-input');
    const btnConfirm = modalEl.querySelector('.btn-confirm');

    function setSelectedPack(val) {
      packs.forEach(p => p.classList.remove('active'));
      const match = packs.find(p => Number(p.dataset.value) === Number(val));
      if (match) match.classList.add('active');
    }

    packs.forEach(p => {
      p.addEventListener('click', () => {
        setSelectedPack(p.dataset.value);
        input.value = p.dataset.value;
      });
    });

    // create bootstrap modal instance (requires bootstrap to be available)
    let bsModal = null;
    if (window.bootstrap && typeof window.bootstrap.Modal === 'function') {
      bsModal = new window.bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    } else {
      console.warn('Bootstrap Modal API non trouvée — vérifie que bootstrap.js est chargé avant ecoride-credits-modal.js');
    }

    async function confirmHandler() {
      const val = parseInt(input.value, 10);
      if (!Number.isFinite(val) || val <= 0) {
        alert('Entrez un nombre entier positif (au moins 5).');
        return;
      }
      if ((Math.floor(val) % 5) !== 0) {
        alert('Le montant doit être un multiple de 5.');
        return;
      }

      // UI lock
      btnConfirm.disabled = true;
      const prevText = btnConfirm.textContent;
      btnConfirm.textContent = 'Traitement…';

      try {
        // simulate payment
        await new Promise(r => setTimeout(r, 700));

        if (typeof addCredits === 'function') {
          addCredits(val);
        } else if (window.ecorideCredits && typeof window.ecorideCredits.add === 'function') {
          window.ecorideCredits.add(val);
        } else {
          // fallback LS / event
          const prev = parseInt(localStorage.getItem('ecoride.credits') || '0', 10);
          localStorage.setItem('ecoride.credits', String(prev + val));
          window.dispatchEvent(new CustomEvent('ecoride:creditsChanged', { detail: { credits: prev + val } }));
        }

        btnConfirm.textContent = 'Crédits ajoutés ✓';

        setTimeout(() => {
          btnConfirm.disabled = false;
          btnConfirm.textContent = prevText;
          if (bsModal) {
            bsModal.hide();
          } else if (typeof accessibleHide === 'function') {
            accessibleHide(modalEl);
          } else if (window.__ecorideAccessibleHideCreditsModal) {
            window.__ecorideAccessibleHideCreditsModal();
          } else {
            // dernier recours
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
          }
        }, 350);
        
      } catch (err) {
        console.error('Paiement simulé échoué', err);
        alert('Erreur paiement (simulation).');
        btnConfirm.disabled = false;
        btnConfirm.textContent = prevText;
      }
    }

    btnConfirm.addEventListener('click', confirmHandler);

    // expose opener that selects pack and shows modal
    window.__ecorideOpenCreditsModal = function (initialValue = 5) {
      input.value = initialValue || 5;
      setSelectedPack(initialValue);
      if (bsModal) {
        bsModal.show();
      } 
      // Accessible fallback si bootstrap.Modal absent
      (function() {
        let prevFocused = null;
      
        function accessibleShow(modalEl) {
          // ensure focusable
          if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
      
          // save previously focused element to restore later
          prevFocused = document.activeElement;
      
          // show visually
          modalEl.classList.add('show');
          modalEl.style.display = 'block';
          modalEl.setAttribute('aria-modal', 'true');
          modalEl.removeAttribute('aria-hidden');
      
          // inert background (optional): add inert to main content container if you have one
          const main = document.querySelector('main') || document.querySelector('#app') || document.body;
          try { if (main && main !== modalEl) main.inert = true; } catch(e){ /* some browsers need polyfill */ }
      
          // focus modal
          try { modalEl.focus(); } catch(e) { /* ignore */ }
        }
      
        function accessibleHide(modalEl) {
          if (!modalEl) return;
        
          // 1) blur l'élément encore focusé dans la modal (si présent)
          try {
            const activeInside = modalEl.contains(document.activeElement) ? document.activeElement : null;
            if (activeInside && typeof activeInside.blur === 'function') {
              activeInside.blur();
            }
          } catch (e) { /* ignore */ }
        
          // 2) restaurer le focus précédent (si connu) ou donner le focus au body comme fallback
          try {
            if (prevFocused && typeof prevFocused.focus === 'function') {
              prevFocused.focus();
            } else if (document.body && typeof document.body.focus === 'function') {
              document.body.focus();
            }
          } catch (e) { /* ignore */ }
        
          // 3) maintenant on peut cacher la modal visuellement
          try {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
          } catch(e){ /* ignore */ }
        
          // 4) remettre les attributs ARIA (après restauration du focus)
          try { modalEl.removeAttribute('aria-modal'); } catch(e){}
          try { modalEl.setAttribute('aria-hidden', 'true'); } catch(e){}
        
          // 5) restaurer l'interaction du contenu principal (inert)
          const main = document.querySelector('main') || document.querySelector('#app') || document.body;
          try { if (main && main !== modalEl) main.inert = false; } catch(e){ /* ignore */ }
        
          // 6) cleanup
          prevFocused = null;
        }
      
        // override __ecorideOpenCreditsModal to use accessible fallback when bsModal absent
        const modalEl = document.getElementById('ecorideCreditsModal');
        if (modalEl && !window.__ecorideOpenCreditsModalAccessiblePatched) {
          window.__ecorideOpenCreditsModalAccessiblePatched = true;
          const originalOpener = window.__ecorideOpenCreditsModal || function(v){ /* noop */ };
      
          window.__ecorideOpenCreditsModal = function(initialValue = 5) {
            // update input & packs first (existing logic)
            const input = modalEl.querySelector('.ecoride-custom-input');
            const packs = Array.from(modalEl.querySelectorAll('.ecoride-pack'));
            if (input) input.value = initialValue || 5;
            packs.forEach(p => p.classList.toggle('active', Number(p.dataset.value) === Number(initialValue)));
      
            if (window.bootstrap && typeof window.bootstrap.Modal === 'function') {
              // use bootstrap if available
              try {
                const bs = new window.bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
                bs.show();
              } catch(e) {
                // fallback accessible
                accessibleShow(modalEl);
              }
            } else {
              // accessible fallback show
              accessibleShow(modalEl);
            }
          };
      
          // patcher l'événement de fermeture si tu utilises ton btnCancel / close
          const cancelBtns = modalEl.querySelectorAll('[data-bs-dismiss], .btn-cancel, .btn-close');
          cancelBtns.forEach(btn => btn.addEventListener('click', () => accessibleHide(modalEl)));
          // si tu caches la modal côté code (ex: après paiement), appelle accessibleHide(modalEl) à la place de modalEl.classList.remove(...)
        }

        // bootstrap accessibility fixes
        (function ensureBootstrapModalA11y(modalEl) {
          if (!modalEl || !window.bootstrap) return;

          let prevFocused = null;

          modalEl.addEventListener('show.bs.modal', () => {
            // avant d'afficher, sauvegarde le focus (Bootstrap va afficher)
            prevFocused = document.activeElement;
          });

          modalEl.addEventListener('shown.bs.modal', () => {
            // Bootstrap a montré la modal -> retirer aria-hidden et focus
            try { modalEl.removeAttribute('aria-hidden'); } catch(e){}
            try { modalEl.setAttribute('aria-modal', 'true'); } catch(e){}
            try { modalEl.focus(); } catch(e){}
          });

          modalEl.addEventListener('hide.bs.modal', () => {
            // avant la fermeture visuelle : blur le bouton si nécessaire pour éviter qu'il reste focusé
            try {
              const active = modalEl.querySelector(':focus');
              if (active && typeof active.blur === 'function') active.blur();
            } catch(e){}
          });

          modalEl.addEventListener('hidden.bs.modal', () => {
            // Bootstrap a caché la modal -> restaurer focus et marquer aria-hidden
            try {
              if (prevFocused && typeof prevFocused.focus === 'function') prevFocused.focus();
            } catch(e){}
            try { modalEl.setAttribute('aria-hidden', 'true'); } catch(e){}
            try { modalEl.removeAttribute('aria-modal'); } catch(e){}
            prevFocused = null;
          });
        })(document.getElementById('ecorideCreditsModal'));
      })();
    };
  })();

  // Fix permanent pour attacher l'ouverture de la modal au vrai bouton "Ajouter"
  (function bindCreditsButtonPermanent() {
    const btnSelector = '#creditAddBtn'; // <-- bouton identifié dans tes logs
    const inputSelector = '#creditAdd, .ecoride-custom-input, input[name="creditsAdd"]';

    function attach() {
      const btn = document.querySelector(btnSelector);
      if (!btn) return false;

      // remove previous handler if any
      try { if (btn.__ecorideCreditsClickHandler) btn.removeEventListener('click', btn.__ecorideCreditsClickHandler); } catch(e){}

      const handler = function(ev) {
        ev.preventDefault();
        const input = document.querySelector(inputSelector);
        const val = input ? (parseInt(input.value, 10) || 5) : 5;
        if (window.__ecorideOpenCreditsModal) {
          window.__ecorideOpenCreditsModal(val);
        } else {
          console.warn('__ecorideOpenCreditsModal absent — fallback addCredits/localStorage will be used');
          if (typeof addCredits === 'function') addCredits(val);
          else {
            const prev = parseInt(localStorage.getItem('ecoride.credits') || '0', 10);
            localStorage.setItem('ecoride.credits', String(prev + val));
            window.dispatchEvent(new CustomEvent('ecoride:creditsChanged', { detail: { credits: prev + val } }));
          }
        }
      };

      btn.addEventListener('click', handler);
      btn.__ecorideCreditsClickHandler = handler;
      console.log('[credits] handler attaché définitivement sur', btnSelector);
      return true;
    }

    // Try attach immediately, otherwise observe DOM for injection (SPA)
    if (!attach()) {
      const mo = new MutationObserver((mutations, obs) => {
        if (attach()) obs.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      // safety timeout
      setTimeout(() => { try { mo.disconnect(); } catch(e){} }, 10000);
    }
  })();

  function findCreditsElementsForUpdate() {
    // priorité : attribut explicite (ajoute data-ecoride-credits à ton élément d'affichage)
    const explicit = Array.from(document.querySelectorAll('[data-ecoride-credits], #creditsValue, .credits-value, .credits-count'));
    const filteredExplicit = explicit.filter(el => !el.closest('#ecorideCreditsModal'));
    if (filteredExplicit.length) return filteredExplicit;

    // fallback : cherche éléments texte contenant "crédit" en excluant modal & boutons & packs
    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter(n => n.children.length === 0) // éléments feuilles
      .filter(n => !n.closest('#ecorideCreditsModal')) // exclure la modal
      .filter(n => n.tagName !== 'BUTTON' && n.tagName !== 'INPUT' && !n.classList.contains('ecoride-pack'))
      .filter(n => /\d/.test((n.textContent||'').trim()) && /crédit/i.test(n.textContent || ''))
      .slice(0, 2);

    return candidates;
  }

  function refreshCreditsUI(credits) {
    const els = findCreditsElementsForUpdate(); // ta fonction de recherche actuelle
    if (!els || !els.length) return;
  
    els.forEach(el => {
      // ne pas toucher les éléments dans la modal (sécurité)
      if (el.closest && el.closest('#ecorideCreditsModal')) return;
  
      // insère deux spans : nombre + label
      el.innerHTML = `<span class="ecoride-credit-number">${Number(credits)}</span>` +
                     `<span class="ecoride-credit-label">crédits</span>`;
  
      // s'assure que l'attribut existe pour ciblage futur
      el.setAttribute('data-ecoride-credits', '');
  
      // effet visuel (optionnel)
      el.classList.add('ecoride-credits-updated');
      setTimeout(() => el.classList.remove('ecoride-credits-updated'), 500);
    });
  
    console.log('[credits] UI rafraîchie ->', credits, els);
  }

  // écoute l'event dispatché par setCredits / addCredits / modal
  window.addEventListener('ecoride:creditsChanged', function (ev) {
    const credits = (ev && ev.detail && Number(ev.detail.credits)) || parseInt(localStorage.getItem('ecoride.credits') || '0', 10) || 0;
    refreshCreditsUI(credits);
  }, { passive: true });

  // initialisation immédiate au chargement si possible (au cas où le listener arrive trop tard)
  try {
    const initial = parseInt(localStorage.getItem('ecoride.credits') || '0', 10) || 0;
    refreshCreditsUI(initial);
  } catch (e) { /* ignore */ }

  // CSS utilitaire (tu peux le mettre dans ton CSS global si tu préfères)
  if (!document.getElementById('ecoride-credits-update-style')) {
    const s = document.createElement('style');
    s.id = 'ecoride-credits-update-style';
    s.textContent = `.ecoride-credits-updated{ transition: transform .18s ease, color .18s ease; transform: scale(1.03); color: #246b2a; }`;
    document.head.appendChild(s);
  }

    // fonction d'init publique (idempotente)
    function initCreditsUIAndStorage(root = document) {
      try { initCreditsFromLocal(); } catch (e) { console.warn('[credits] init error', e); }
      bindCreditsUI(root);
    
      function doRefresh() {
        try {
          const credits = getCredits();
          if (typeof refreshCreditsUI === 'function') {
            refreshCreditsUI(credits);
          } else {
            window.dispatchEvent(new CustomEvent('ecoride:creditsChanged', { detail: { credits } }));
          }
        } catch (e) {
          console.warn('[credits] refresh error', e);
        }
      }
    
      // refresh immédiat
      doRefresh();
    
      // retry après courts délais pour gérer les scripts qui écrasent l'élément
      setTimeout(doRefresh, 120);
      setTimeout(doRefresh, 600);
    
      // expose pour debug manuel si besoin
      window.__ecoride_forceRefreshCredits = doRefresh;
    }

    // auto-run si page est chargé normalement (utile si la page n'est pas injectée par SPA)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initCreditsUIAndStorage(document));
    } else {
      initCreditsUIAndStorage(document);
    }

    // API publique pour ton routeur / initUserSpace
    window.ecorideCredits = window.ecorideCredits || {};
    window.ecorideCredits.init = initCreditsUIAndStorage;
    window.ecorideCredits.get = window.ecorideCredits.get || getCredits;
    window.ecorideCredits.add = window.ecorideCredits.add || addCredits;
    window.ecorideCredits.set = window.ecorideCredits.set || setCredits;
  })();
})();


//<!-- FORM 3 : À propos -->
//<!-- FORM 3 : À propos -->
//<!-- FORM 3 : À propos -->

(function () {
  const STORAGE_KEY = 'ecoride.profileAbout';
  const MIN = 20;
  const MAX = 350;
  const NO_DESCRIPTION_MSG = 'Aucune description fournie.';

  function normalize(s) {
    return String(s || '').replace(/<\/?[^>]+(>|$)/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Validation :
   * - si vide => autorisé (ok=true)
   * - si non vide => longueur must be between MIN and MAX
   */
  function validate(s) {
    const cleaned = normalize(s);
    const len = cleaned.length;
    const errors = [];

    if (len > 0 && len < MIN) errors.push(`Minimum ${MIN} caractères requis (${len}).`);
    if (len > MAX) errors.push(`Maximum ${MAX} caractères autorisés (${len}).`);

    const ok = errors.length === 0; // empty string => ok true
    return { ok, cleaned, len, errors };
  }

  function saveLocal(cleaned) {
    try {
      // if cleaned is empty => remove storage key (treat as "no description")
      if (!cleaned || !String(cleaned).trim()) {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: cleaned, updatedAt: Date.now() }));
      return true;
    } catch (e) {
      console.error('saveLocal error', e);
      return false;
    }
  }

  // Supprimer uniquement la description exacte de l'utilisateur (safe)
  function deleteAboutSafely() {
    const STORAGE_KEY = 'ecoride.profileAbout';
    const knownProfileKeys = ['profil', 'profile', 'ecoride_user', 'ecorideUser', 'user'];
    const needleCandidates = ['about','bio','text','description','role','driver','chauffeur'];
  
    // 1) déterminer targetText (textarea ou canonical)
    let targetText = '';
    const ta = document.getElementById('profileBio');
    if (ta && String(ta.value).trim()) {
      targetText = String(ta.value).trim();
    } else {
      try {
        const rawCanon = localStorage.getItem(STORAGE_KEY);
        if (rawCanon) {
          const parsed = JSON.parse(rawCanon);
          if (parsed && parsed.text && String(parsed.text).trim()) {
            targetText = String(parsed.text).trim();
          }
        }
      } catch (e) { /* ignore */ }
    }
  
    // supprime la clé canonique (toujours)
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.error('Erreur suppression clé canonique', e); }
  
    // helper : remplace toute chaîne égale (trim) à targetText par '' dans un objet (récursif)
    function recursiveBlankMatches(obj, target) {
      let changed = false;
      if (obj == null) return changed;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const v = obj[i];
          if (typeof v === 'string') {
            if (v.trim() === target) { obj[i] = ''; changed = true; }
          } else if (typeof v === 'object' && v !== null) {
            if (recursiveBlankMatches(v, target)) changed = true;
          }
        }
        return changed;
      }
      if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'string') {
            if (v.trim() === target) { obj[k] = ''; changed = true; }
          } else if (typeof v === 'object' && v !== null) {
            if (recursiveBlankMatches(v, target)) changed = true;
          }
        }
      }
      return changed;
    }
  
    // Si on n'a pas de targetText (déjà vide), on met à jour l'UI et on quitte
    if (!targetText) {
      renderCard('');
      if (ta) ta.value = '';
      window.dispatchEvent(new CustomEvent('ecoride:profileAboutChanged', { detail: { about: '' } }));
      try { localStorage.setItem('__ecoride_sync__', JSON.stringify({ t: Date.now(), action: 'profileAboutDeleted' })); setTimeout(() => localStorage.removeItem('__ecoride_sync__'), 500); } catch(e){}
      return true;
    }
  
    // 2) nettoyer clés connues en ne remplaçant que les chaînes égales à targetText
    for (const k of knownProfileKeys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let obj;
        try { obj = JSON.parse(raw); } catch (e) { continue; }
        if (!obj || typeof obj !== 'object') continue;
        const changed = recursiveBlankMatches(obj, targetText);
        if (changed) {
          localStorage.setItem(k, JSON.stringify(obj));
          console.info(`ecoride: cleaned exact matches in localStorage key "${k}"`);
        }
      } catch (e) {
        console.warn('ecoride: error sanitizing key', k, e);
      }
    }
  
    // 3) parcourir toutes les clés JSON et nettoyer uniquement les chaînes EXACTES (safe)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === STORAGE_KEY || key === '__ecoride_sync__') continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (parsed && typeof parsed === 'object') {
        try {
          const changed = recursiveBlankMatches(parsed, targetText);
          if (changed) {
            localStorage.setItem(key, JSON.stringify(parsed));
            console.info(`ecoride: cleaned exact matches in JSON key "${key}"`);
          }
        } catch (e) {
          console.warn('ecoride: error recursive cleaning key', key, e);
        }
      } else {
        // non-JSON string, si EXACT match => supprimer la clé (conservateur)
        try {
          if (raw.trim() === targetText) {
            localStorage.removeItem(key);
            console.info(`ecoride: removed non-JSON key "${key}" with exact match`);
            // adjust loop because length changed
            i--;
          }
        } catch (e) { /* ignore */ }
      }
    }
  
    // 4) Tentative de mise à jour in-memory des trajets (si utilisés)
    try {
      // exemples de noms possibles pour la variable en mémoire ; on la nettoie si présente
      const candidateGlobals = ['trajets', 'rides', 'trips', 'window.trajets', 'window.rides', 'window.trips'];
      for (const g of candidateGlobals) {
        // accède prudemment
        const name = g.replace(/^window\./,'');
        const val = window[name];
        if (!val) continue;
        // si tableau, on nettoie récursivement et on tente d'appeler un render associé
        if (Array.isArray(val)) {
          let changed = false;
          for (const item of val) {
            if (recursiveBlankMatches(item, targetText)) changed = true;
          }
          if (changed) {
            console.info(`ecoride: cleaned exact matches in global ${name}`);
            // dispatch event pour que le code de rendu réagisse
            window.dispatchEvent(new CustomEvent('ecoride:ridesDataChanged', { detail: { source: 'deleteAboutSafely' } }));
          }
        }
      }
    } catch (e) { console.warn('ecoride: error cleaning in-memory trips', e); }
  
    // 5) Update UI and broadcast
    renderCard('');
    if (ta) ta.value = '';
    window.dispatchEvent(new CustomEvent('ecoride:profileAboutChanged', { detail: { about: '' } }));
    try { localStorage.setItem('__ecoride_sync__', JSON.stringify({ t: Date.now(), action: 'profileAboutDeleted' })); setTimeout(() => localStorage.removeItem('__ecoride_sync__'), 500); } catch(e){}
  
    return true;
  }

  function loadLocalText() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p && p.text ? p.text : null;
    } catch (e) {
      return null;
    }
  }

  function renderCard(text) {
    const card = document.querySelector('#profileAboutCard') || document.querySelector('[data-ecoride-about]');
    if (!card) return;
    card.innerHTML = text && String(text).trim()
      ? `<p class="mb-0">${String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</p>`
      : `<p class="text-muted mb-0">${NO_DESCRIPTION_MSG}</p>`;
  }

  function waitFor(selector, timeout = 6000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('timeout waiting for ' + selector)); }, timeout);
    });
  }

  async function getElement(selector) {
    const el = document.querySelector(selector);
    if (el) return el;
    return await waitFor(selector);
  }

  (async function init() {
    try {
      const form = await getElement('#about-me-form');
      const textarea = await getElement('#profileBio');
      const saveBtn = await getElement('#saveBioBtn');

      // create delete button next to saveBtn if not present
      let deleteBtn = form.querySelector('#deleteBioBtn');
      if (!deleteBtn) {
        deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.id = 'deleteBioBtn';
        deleteBtn.className = 'btn btn-outline-secondary ms-2'; // adapte classes si besoin
        deleteBtn.textContent = 'Supprimer';
        // insert after saveBtn
        saveBtn.insertAdjacentElement('afterend', deleteBtn);
      }

      // Sécurité : empêcher le submit natif
      form.addEventListener('submit', e => e.preventDefault());

      // Attribuer maxlength pour limiter côté navigateur
      textarea.setAttribute('maxlength', String(MAX));

      // Créer / récupérer UI helper (counter + error)
      let counter = form.querySelector('.about-counter');
      if (!counter) {
        counter = document.createElement('small');
        counter.className = 'about-counter text-muted';
        counter.style.display = 'block';
        counter.style.marginTop = '6px';
        textarea.insertAdjacentElement('afterend', counter);
      }

      let errorEl = form.querySelector('.about-error');
      if (!errorEl) {
        errorEl = document.createElement('small');
        errorEl.className = 'about-error text-danger';
        errorEl.style.display = 'none';
        counter.insertAdjacentElement('afterend', errorEl);
      }

      function refreshUI() {
        const { ok, cleaned, len, errors } = validate(textarea.value);
        counter.textContent = `${len}/${MAX}`;
        if (!ok) {
          errorEl.textContent = errors.join(' ');
          errorEl.style.display = 'block';
        } else {
          errorEl.textContent = '';
          errorEl.style.display = 'none';
        }
        // allow save when ok (including empty)
        saveBtn.disabled = !ok;
        // if textarea is empty, change Save button label optionally
        // saveBtn.textContent = cleaned.length === 0 ? 'Enregistrer (vide)' : 'Enregistrer';
      }

      // Protection contre paste / programmatic input > MAX
      textarea.addEventListener('input', () => {
        if (textarea.value.length > MAX) {
          textarea.value = textarea.value.slice(0, MAX);
          try { textarea.setSelectionRange(MAX, MAX); } catch (e){/* ignore */ }
        }
        refreshUI();
      }, { passive: true });

      // restore from storage
      const stored = loadLocalText();
      if (stored) {
        textarea.value = stored;
        renderCard(stored);
      } else {
        textarea.value = ''; // ensure empty
        renderCard('');
      }

      // initial UI state
      refreshUI();

      saveBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const { ok, cleaned } = validate(textarea.value);
        if (!ok) { textarea.focus(); refreshUI(); return; }

        // if cleaned empty => treat as deletion
        if (!cleaned || !String(cleaned).trim()) {
          const deleted = deleteAboutSafely();
          if (!deleted) {
            alert('Impossible de supprimer la description localement.');
            return;
          }
          renderCard('');
          // dispatch event with empty about (already done in deleteAboutSafely but safe to keep)
          window.dispatchEvent(new CustomEvent('ecoride:profileAboutChanged', { detail: { about: '' } }));
          // feedback UX
          const prev = saveBtn.textContent;
          saveBtn.textContent = 'Supprimé ✓';
          saveBtn.disabled = true;
          setTimeout(() => { saveBtn.textContent = prev; refreshUI(); }, 900);
          return;
        }

        // final guard (truncate if necessary)
        let final = cleaned;
        if (final.length > MAX) final = final.slice(0, MAX);

        const saved = saveLocal(final);
        if (!saved) {
          alert('Impossible d\'enregistrer localement.');
          return;
        }

        // mise à jour du card et dispatch
        renderCard(final);
        window.dispatchEvent(new CustomEvent('ecoride:profileAboutChanged', { detail: { about: final } }));

        // feedback UX
        const prev = saveBtn.textContent;
        saveBtn.textContent = 'Enregistré ✓';
        saveBtn.disabled = true;
        setTimeout(() => { saveBtn.textContent = prev; refreshUI(); }, 900);
      }, { passive: false });

      // delete button behavior (explicit delete)
      deleteBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const okConfirm = confirm('Supprimer la description du profil ?');
        if (!okConfirm) return;
      
        const deleted = deleteAboutSafely();
        if (!deleted) {
          alert('Impossible de supprimer localement.');
          return;
        }
      
        textarea.value = '';
        renderCard('');
        refreshUI();
      
      }, { passive: false });

      console.log('ecoride: about handlers attachés (unifié) + delete button');
    } catch (err) {
      console.warn('ecoride: about - éléments introuvables dans le temps imparti', err);
    }
  })();
})();

//<!-- FORM 4 : Informations du compte -->
//<!-- FORM 4 : Informations du compte -->
//<!-- FORM 4 : Informations du compte -->

// ===== helpers email / user canonical =====
function getCanonicalUser() {
  try {
    const raw = localStorage.getItem('ecoride_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('getCanonicalUser: parse error', err, localStorage.getItem('ecoride_user'));
    return null;
  }
}

function setCanonicalUser(obj) {
  try {
    if (!obj || typeof obj !== 'object') {
      console.warn('setCanonicalUser: invalid obj', obj);
      return false;
    }
    localStorage.setItem('ecoride_user', JSON.stringify(obj));
    console.log('setCanonicalUser: stored OK', obj);
    window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: { user: obj } }));
    return true;
  } catch (err) {
    console.error('setCanonicalUser error', err);
    return false;
  }
}

// <-- après la définition des fonctions
if (typeof window.getCanonicalUser !== 'function') window.getCanonicalUser = getCanonicalUser;
if (typeof window.setCanonicalUser !== 'function') window.setCanonicalUser = setCanonicalUser;

// --- handleProfileSave : met à jour ecoride_user (pseudo, about, photo) et notifie app ---
window.handleProfileSave = window.handleProfileSave || async function(btn) {
  try {
    // defensive selectors (adapt si nécessaire)
    const pseudoEl = document.getElementById('pseudo') || document.querySelector('input[name="pseudo"]');
    const aboutEl  = document.getElementById('about')  || document.querySelector('textarea[name="about"], #profileBio');

    const pseudo = pseudoEl && pseudoEl.value ? String(pseudoEl.value).trim() : null;
    const about  = aboutEl  && aboutEl.value  ? String(aboutEl.value).trim()  : null;

    // try to read avatar saved by profile-photo form (supports legacy keys)
    function readSavedAvatar() {
      try {
        // priority : canonical avatar storage used by your profile form
        const keys = ['ecoride.profileAvatar','ecoride_profileAvatar','ecoride.profileAvatar']; // keep candidates
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              if (parsed.dataURL) return parsed.dataURL;
              if (parsed.url) return parsed.url;
            } else if (typeof raw === 'string' && raw.trim()) {
              return raw.trim();
            }
          } catch(e) {
            // not JSON -> maybe a plain dataURL string
            if (typeof raw === 'string' && raw.trim()) return raw.trim();
          }
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    const avatarFromAvatarForm = readSavedAvatar();

    // get existing canonical user or fallback to raw localStorage read
    let user = (typeof getCanonicalUser === 'function' ? getCanonicalUser() : null) || null;
    if (!user) {
      try { user = JSON.parse(localStorage.getItem('ecoride_user') || '{}'); } catch(e){ user = {}; }
    }
    if (!user || typeof user !== 'object') user = {};

    // merge only non-empty fields (do not wipe existing data)
    if (pseudo) user.pseudo = pseudo;
    if (about) user.about = about;

    // if avatar available from the profile-photo form, prefer it (overwrite)
    if (avatarFromAvatarForm) user.photo = avatarFromAvatarForm;

    // ensure updatedAt
    user.updatedAt = Date.now();

    // persist: prefer setCanonicalUser if present (keeps event already wired), else raw setItem
    try {
      if (typeof setCanonicalUser === 'function') {
        setCanonicalUser(user); // setCanonicalUser already dispatches ecoride:userUpdated in your file
      } else {
        localStorage.setItem('ecoride_user', JSON.stringify(user));
        // dispatch legacy / global events for compatibility with other modules
        window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: { user } }));
      }
    } catch (e) {
      // fallback direct write
      try { localStorage.setItem('ecoride_user', JSON.stringify(user)); } catch(err) { console.error('save ecoride_user failed', err); }
      window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: { user } }));
    }

    // also emit a generic userUpdated event (older code listens to this plain name)
    window.dispatchEvent(new CustomEvent('userUpdated', { detail: { avatar: user.photo || null, about: user.about || null, user } }));

    // UX feedback (if btn provided)
    if (btn && btn instanceof Element) {
      const prev = btn.textContent;
      try {
        btn.textContent = 'Enregistré ✓';
        btn.disabled = true;
      } catch(e){}
      setTimeout(() => {
        try { btn.textContent = prev; btn.disabled = false; } catch(e){}
      }, 900);
    }

    console.log('handleProfileSave: ecoride_user updated', user);
    return true;
  } catch (err) {
    console.error('handleProfileSave error', err);
    return false;
  }
};

// --- Delegated click handler : attache une seule fois (SPA friendly) ---
// Adapte '#saveProfileBtn' au sélecteur réel de ton bouton de sauvegarde profil
if (!window.__ecoride_profile_save_delegate_installed) {
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && (e.target.closest('#saveProfileBtn') || e.target.closest('.save-profile-btn'));
    if (!btn) return;
    e.preventDefault();
    try {
      // appel asynchrone (upload photo asynchrone devrait déjà avoir mis à jour localStorage)
      window.handleProfileSave(btn);
    } catch (err) {
      console.error('profile save click handler failed', err);
    }
  }, { capture: false });
  window.__ecoride_profile_save_delegate_installed = true;
}

// === fallback visuel si showTemporarySavedText absent ===
function fallbackShowSaved(btn, text = 'Enregistré ✓', duration = 900) {
  if (!btn) return Promise.resolve();
  if (btn.dataset.__ecoride_saving === '1') return Promise.resolve();
  btn.dataset.__ecoride_saving = '1';
  const prev = btn.textContent;
  btn.textContent = text;
  btn.setAttribute('aria-disabled', 'true');
  return new Promise(res => setTimeout(() => {
    btn.textContent = prev;
    btn.removeAttribute('aria-disabled');
    delete btn.dataset.__ecoride_saving;
    res();
  }, duration));
}

function setupSyncHandlers(input, saveBtn) {
  if (!input) return;

  // si déjà installé, applique immédiatement au nouvel input et retourne
  if (setupSyncHandlers._installed) {
    try { applyCanonicalToInput(input); } catch(e){ console.warn(e); }
    return;
  }
  setupSyncHandlers._installed = true;

  function updateNow() {
    document.querySelectorAll('#account-info-form #profileEmail').forEach(el => {
      try { applyCanonicalToInput(el); } catch(e){ console.warn('applyCanonicalToInput single error', e); }
    });
  }

  window.addEventListener('ecoride:userUpdated', updateNow, { passive: true });
  window.addEventListener('ecoride:profileEmailChanged', updateNow, { passive: true });
  window.addEventListener('storage', function(e){ if (e.key === 'ecoride_user') updateNow(); }, { passive: true });

  [60,150,400,900].forEach(delay => setTimeout(updateNow, delay));

  let prev = localStorage.getItem('ecoride_user');
  const id = setInterval(() => {
    const now = localStorage.getItem('ecoride_user');
    if (now !== prev) { prev = now; try { updateNow(); } catch(e){} }
  }, 200);
  setTimeout(() => clearInterval(id), 2200);
}

// === initAccountInfoForm (sans deleteBtn) ===
function initAccountInfoForm(root = document) {
  try {
    // idempotence SPA-friendly : si déja inité, on refait juste le prefill/update
    const scope = (root instanceof Element ? root : document);
    const form = scope.querySelector('#account-info-form');
    if (!form) {
      console.log('initAccountInfoForm: form introuvable');
      return false;
    }

    const input = form.querySelector('#profileEmail');
    const saveBtn = form.querySelector('#saveEmailBtn');

    if (!input) {
      console.log('initAccountInfoForm: #profileEmail introuvable');
      return false;
    }

    // robust prefill à intégrer dans initAccountInfoForm
    (function prefill() {
      let canonical = (typeof getCanonicalUser === 'function') ? getCanonicalUser() : null;
      // fallback to raw localStorage if helper absent / no email
      if ((!canonical || !canonical.email) && localStorage.getItem('ecoride_user')) {
        try {
          const raw = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
          if (raw && raw.email) canonical = raw;
        } catch(e){
          console.warn('prefill: impossible de parser localStorage.ecoride_user', e);
        }
      }
      const rememberMe = localStorage.getItem('rememberMe') === 'true';
      const rememberedEmail = localStorage.getItem('rememberedEmail');

      if (canonical && canonical.email) input.value = canonical.email;
      else if (rememberMe && rememberedEmail) input.value = rememberedEmail;
      else if (rememberedEmail) input.value = rememberedEmail;
      else input.value = '';
    })();

    function isValidEmail(v) {
      if (!v) return false;
      const email = String(v).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    function updateButtonsVisibility() {
      const current = (input.value||'').trim();
      const canonical = getCanonicalUser && getCanonicalUser();
      const matchesCanonical = canonical && canonical.email && canonical.email === current;
      const valid = isValidEmail(current);
    
      if (!saveBtn) return;
    
      // VISUEL: classes is-valid / is-invalid
      if (current === '') {
        // vide -> retirer les classes
        input.classList.remove('is-valid','is-invalid');
      } else if (valid && !matchesCanonical) {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
      } else if (!valid) {
        input.classList.remove('is-valid');
        input.classList.add('is-invalid');
      } else {
        // cas matchesCanonical (même email) : neutre
        input.classList.remove('is-valid','is-invalid');
      }
    
      if (valid && !matchesCanonical) {
        // show
        saveBtn.classList.remove('hidden');
        saveBtn.removeAttribute('aria-hidden');
        saveBtn.disabled = false;
        saveBtn.tabIndex = 0;
      } else {
        if (saveBtn.contains(document.activeElement)) {
          try { input.focus(); } catch(e) { try { document.activeElement.blur(); } catch(_){} }
        }
        // hide
        saveBtn.classList.add('hidden');
        saveBtn.setAttribute('aria-hidden', 'true');
        saveBtn.disabled = true;
        saveBtn.tabIndex = -1;
      }
    }

    // Initial visibility
    updateButtonsVisibility();

    // Attach input listener (only once per form node)
    if (!form.__accountInfoHandlersAttached) {
      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        updateButtonsVisibility();
      });

      // flag pour ne pas rattacher plusieurs fois si re-inserté
      form.__accountInfoHandlersAttached = true;
    } else {
      // si déjà attaché, on met à jour la visibilité au cas où
      updateButtonsVisibility();
    }

    // appeler la configuration de sync pour le form courant
    try { setupSyncHandlers(input, saveBtn); } catch(e){ console.warn('setupSyncHandlers failed', e); }

    return true;
  } catch (err) {
    console.error('initAccountInfoForm failed', err);
    return false;
  }
}

// expose globally so it can be called from other modules / console
if (typeof window.initAccountInfoForm !== 'function') {
  window.initAccountInfoForm = initAccountInfoForm;
}

// Watcher SPA-friendly : initialise le formulaire dès qu'il est inséré dans le DOM
(function watchForAccountForm() {
  // déjà présent ?
  if (document.querySelector('#account-info-form')) {
    initAccountInfoForm(document);
    return;
  }

  const mo = new MutationObserver((_, obs) => {
    if (document.querySelector('#account-info-form')) {
      console.info('account form detected by MutationObserver — initAccountInfoForm');
      try { initAccountInfoForm(document); } catch(e){ console.warn('initAccountInfoForm failed', e); }
      obs.disconnect();
    }
  });

  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // safety: stop after 5s
  setTimeout(() => mo.disconnect(), 5000);
})();

// auto-init on DOMContentLoaded and SPA routeLoaded
document.addEventListener('DOMContentLoaded', () => initAccountInfoForm(document));
document.addEventListener('routeLoaded', (ev) => { try { initAccountInfoForm(document); } catch(e){} });

// --- Robustification : lire / ré-appliquer le canonical si un autre script écrase la clé ---
function applyCanonicalToInput(input) {
  try {
    const canonical = (typeof getCanonicalUser === 'function') ? getCanonicalUser() : null;
    if (canonical && canonical.email && input) {
      input.value = canonical.email;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // fallback to direct localStorage read (safe)
      try {
        const raw = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
        if (raw && raw.email && input) {
          input.value = raw.email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch(e){}
    }
  } catch(e){ console.warn('applyCanonicalToInput error', e); }
}

// Définit une fonction globale de sauvegarde et installe une délégation de clic (SPA-friendly)
window.handleSaveEmail = async function(btn) {
  const form = document.querySelector('#account-info-form');
  const input = form?.querySelector('#profileEmail');
  if (!input) { console.warn('handleSaveEmail: input introuvable'); return; }

  const val = (input.value || '').trim();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(val)) {
    input.classList.add('is-invalid');
    setTimeout(() => input.classList.remove('is-invalid'), 1200);
    console.warn('handleSaveEmail: email invalide', val);
    return;
  }

  // merge existing canonical user and persist
  let existing = {};
  try {
    existing = (typeof getCanonicalUser === 'function' ? getCanonicalUser() : JSON.parse(localStorage.getItem('ecoride_user') || 'null')) || {};
  } catch(e) { existing = {}; }
  existing.email = val;

  // après avoir stocké existing.email = val; et persistance OK:
  try {
    if (typeof setCanonicalUser === 'function') {
      setCanonicalUser(existing);
    } else {
      localStorage.setItem('ecoride_user', JSON.stringify(existing));
    }
    console.log('handleSaveEmail: stored', existing);
  } catch(err) {
    console.error('handleSaveEmail: save failed', err);
    return;
  }

  // visuel amélioré : set valid state briefly
  input.classList.remove('is-invalid');
  input.classList.add('is-valid');

  // visual feedback on button
  if (typeof window.showTemporarySavedText === 'function') {
    try { await window.showTemporarySavedText(btn, 'Enregistré ✓', 900); } catch(e){}
  } else {
    const prev = btn.textContent;
    btn.textContent = 'Enregistré ✓';
    btn.setAttribute('aria-disabled', 'true');
    setTimeout(() => {
      btn.textContent = prev;
      btn.removeAttribute('aria-disabled');
      // optionally remove 'is-valid' after a short delay so the green halo doesn't persist forever
      setTimeout(() => { input.classList.remove('is-valid'); }, 1200);
    }, 900);
  }

  // notify other listeners / reinit
  try { initAccountInfoForm && initAccountInfoForm(document); } catch(e){ console.warn(e); }
  window.dispatchEvent(new CustomEvent('ecoride:profileEmailChanged', { detail:{ email: val } }));
};

// Delegated click handler (install once) — fonctionne même si le bouton est recréé
if (!window.__ecoride_save_delegate_installed) {
  document.addEventListener('click', e => {
    const saveBtn = e.target && e.target.closest && e.target.closest('#saveEmailBtn');
    if (saveBtn) {
      e.preventDefault();
      window.handleSaveEmail(saveBtn);
    }
  }, { capture: false });
  window.__ecoride_save_delegate_installed = true;
  console.info('Delegated save handler installed.');
}


// === Password change: nouveau module (ne modifie PAS la partie mail) ===
/*
  Module mot de passe:
  - idempotent, SPA-friendly
  - expose window.handleSavePassword pour debug / invocation
  - par défaut écrit en clair dans localStorage pour le DEV ; désactiver avant PR/production :
      window.ECORIDE_DEV_LOCAL_SAVE = false;
*/
(function EcoridePasswordModule() {
  // DEV flag override
  const DEV_LOCAL_SAVE = (typeof window.ECORIDE_DEV_LOCAL_SAVE === 'boolean') ? window.ECORIDE_DEV_LOCAL_SAVE : true;

  // Prevent multiple installs
  if (window.__ecoride_password_feature_installed) return;
  window.__ecoride_password_feature_installed = true;

  // ---------- Helpers ----------
  function isStrongPassword(v) {
    if (!v) return false;
    const pw = String(v).trim();
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/.test(pw);
  }

  function readStoredUser() {
    try {
      const raw = localStorage.getItem('ecoride_user');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('readStoredUser parse error', e);
      return {};
    }
  }

  // Dev helper to remove test password
  window.__ecoride_remove_test_password = function() {
    try {
      const obj = readStoredUser();
      if (!obj.password) return console.log('no test password found');
      delete obj.password;
      localStorage.setItem('ecoride_user', JSON.stringify(obj));
      console.log('ecoride_user.password removed');
    } catch (e) { console.error(e); }
  };

  // ---------- Main setup ----------
  // Remplace ta fonction setupPasswordChange par celle-ci (robuste + logs)
function setupPasswordChange(containerEl) {
  if (!containerEl) return;
  if (containerEl.dataset.pwValidationInit === '1') return;
  containerEl.dataset.pwValidationInit = '1';

  // try canonical selectors first
  let inputCurrent = containerEl.querySelector('#currentPassword') || document.querySelector('#currentPassword') || null;
  let inputNew     = containerEl.querySelector('#newPassword')     || document.querySelector('#newPassword')     || null;
  let inputConfirm = containerEl.querySelector('#confirmPassword') || document.querySelector('#confirmPassword') || null;
  let saveBtn      = containerEl.querySelector('#saveAccountBtn')  || document.querySelector('#saveAccountBtn')  || null;

  // Fallback #1: if inputs are rendered as <input type="password"> and have no ids,
  // try to map the first 3 password inputs found inside container (or globally)
  function tryMapByPasswordInputs(root) {
    const list = (root || document).querySelectorAll('input[type="password"]');
    if (list && list.length >= 3) {
      return { current: list[0], neu: list[1], confirm: list[2] };
    }
    return null;
  }

  if (!inputCurrent || !inputNew || !inputConfirm) {
    const mapped = tryMapByPasswordInputs(containerEl) || tryMapByPasswordInputs(document);
    if (mapped) {
      inputCurrent = inputCurrent || mapped.current;
      inputNew     = inputNew     || mapped.neu;
      inputConfirm = inputConfirm || mapped.confirm;
      console.info('setupPasswordChange: fields mapped via password inputs fallback', { inputCurrent, inputNew, inputConfirm });
    }
  }

  // Fallback #2: try to find a submit button if saveBtn missing
  if (!saveBtn) {
    // prefer button[type=submit] inside container
    saveBtn = containerEl.querySelector('button[type="submit"], input[type="submit"]') ||
              containerEl.querySelector('button') ||
              document.querySelector('button[type="submit"], input[type="submit"]') ||
              null;

    // try to find by visible text "Valider" (case-insensitive)
    if (!saveBtn) {
      const buttons = Array.from((containerEl || document).querySelectorAll('button, input[type="button"], input[type="submit"]'));
      saveBtn = buttons.find(b => {
        try {
          const txt = (b.textContent || b.value || '').trim().toLowerCase();
          return txt && txt.includes('valider');
        } catch(e) { return false; }
      }) || null;
    }
    console.info('setupPasswordChange: saveBtn fallback result', saveBtn);
  }

  // If still missing, log the container's inputs for inspection and abort (so we don't silently fail)
  if (!inputCurrent || !inputNew || !inputConfirm || !saveBtn) {
    console.warn('setupPasswordChange: éléments manquants après fallback', {
      inputCurrent, inputNew, inputConfirm, saveBtn,
      containerQuery: containerEl ? containerEl.outerHTML.slice(0,1000) : null,
      allInputsInContainer: containerEl ? Array.from(containerEl.querySelectorAll('input,button')).map(n => ({ tag: n.tagName, id: n.id, name: n.name, type: n.type, text: (n.textContent||n.value||'').trim().slice(0,40) })) : null
    });
    return;
  }

  // If we get here, we have the elements — keep the rest of the behaviour as before
  const setValid = i => { i.classList.remove('is-invalid'); i.classList.add('is-valid'); };
  const setInvalid = i => { i.classList.remove('is-valid'); i.classList.add('is-invalid'); };
  const clearValidation = i => { i.classList.remove('is-valid','is-invalid'); };

  // touched flags + listeners
  [inputCurrent, inputNew, inputConfirm].forEach(i => {
    if (typeof i.touched === 'undefined') i.touched = false;
    i.addEventListener('input', (ev) => { if (ev && !ev.isTrusted) return; i.touched = true; runValidation(); });
    i.addEventListener('blur', (ev) => { if (ev && ev.isTrusted) i.touched = true; i.value = (i.value||'').trim(); runValidation(); });
  });

  function isStrongPassword(v) {
    if (!v) return false;
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/.test(String(v).trim());
  }
  function getStoredPassword(){
    try {
      const raw = localStorage.getItem('ecoride_user');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && obj.password ? String(obj.password) : null;
    } catch(e){ return null; }
  }
  function saveNewPasswordLocally(newPw){
    try {
      const raw = localStorage.getItem('ecoride_user');
      const obj = raw ? JSON.parse(raw) : {};
      obj.password = newPw;
      localStorage.setItem('ecoride_user', JSON.stringify(obj));
      return true;
    } catch(e){ console.error(e); return false; }
  }

  function runValidation(){
    const cur = (inputCurrent.value||'').trim();
    const nw = (inputNew.value||'').trim();
    const cf = (inputConfirm.value||'').trim();
    const stored = getStoredPassword();

    const enableLogic = cur.length >= 1 &&
                        (stored ? cur === stored : true) &&
                        isStrongPassword(nw) &&
                        nw !== cur &&
                        cf === nw;

    saveBtn.disabled = !enableLogic;

    if (!inputCurrent.touched) clearValidation(inputCurrent);
    else if (stored && cur === stored) setValid(inputCurrent);
    else if (!stored && cur.length>0) setValid(inputCurrent);
    else setInvalid(inputCurrent);

    if (!inputNew.touched) clearValidation(inputNew);
    else if (isStrongPassword(nw) && nw !== cur) setValid(inputNew);
    else setInvalid(inputNew);

    if (!inputConfirm.touched) clearValidation(inputConfirm);
    else if (cf === nw && cf !== '') setValid(inputConfirm);
    else setInvalid(inputConfirm);
  }

  // central action (remplacer l'actuelle par ce bloc)
  window.handleSavePassword = window.handleSavePassword || function(btnElement) {
    const cur = (inputCurrent.value||'').trim();
    const nw  = (inputNew.value||'').trim();
    const cf  = (inputConfirm.value||'').trim();

    // checks
    if (!isStrongPassword(nw)) {
      inputNew.classList.add('is-invalid');
      setTimeout(()=>inputNew.classList.remove('is-invalid'), 1200);
      return;
    }
    if (nw !== cf) {
      inputConfirm.classList.add('is-invalid');
      setTimeout(()=>inputConfirm.classList.remove('is-invalid'), 1200);
      return;
    }

    const stored = getStoredPassword();
    if (stored && stored !== cur) {
      inputCurrent.classList.add('is-invalid');
      setTimeout(()=>inputCurrent.classList.remove('is-invalid'), 1200);
      return;
    }

    // persist (DEV only)
    const ok = saveNewPasswordLocally(nw);
    if (!ok) return console.error('handleSavePassword: save failed');

    // feedback
    const prevText = btnElement.textContent;
    btnElement.textContent = 'Enregistré ✓';
    btnElement.disabled = true;

    // clear inputs and reset validation state so current doesn't stay red
    try {
      // clear values
      inputCurrent.value = '';
      inputNew.value = '';
      inputConfirm.value = '';

      // reset touched flags
      [inputCurrent, inputNew, inputConfirm].forEach(i => { i.touched = false; });

      // clear visual validation classes
      [inputCurrent, inputNew, inputConfirm].forEach(i => {
        i.classList.remove('is-valid', 'is-invalid');
      });

      // re-run validation to set proper button state (will disable since empty)
      runValidation();
    } catch (e) {
      console.warn('handleSavePassword: clearing inputs failed', e);
    }

    // restore button text after a short delay
    setTimeout(()=> {
      btnElement.textContent = prevText;
      // keep it disabled until user enters something meaningful again
      btnElement.disabled = true;
    }, 900);

    // broadcast event
    window.dispatchEvent(new CustomEvent('ecoride:passwordChanged', { detail: {} }));
  };

  // Ensure delegated click installed once
  if (!window.__ecoride_password_delegate_installed) {
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('#saveAccountBtn');
      if (b) {
        e.preventDefault();
        window.handleSavePassword(b);
      }
    });
    window.__ecoride_password_delegate_installed = true;
  }

  // initial validation
  [100,300,700].forEach(d => setTimeout(runValidation, d));
  runValidation();
}

  // Auto-init (SPA friendly)
  function ensurePasswordInit() {
    const container = document.querySelector('.form-fields')?.closest('form') || document.querySelector('.form-fields');
    if (container) {
      setupPasswordChange(container);
      return true;
    }
    return false;
  }

  if (!ensurePasswordInit()) {
    const mo = new MutationObserver((_, obs) => {
      if (ensurePasswordInit()) obs.disconnect();
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // safety timeout
    setTimeout(()=> mo.disconnect(), 7000);
  }

  // Public API
  window.EcoridePassword = {
    init: (el) => setupPasswordChange(el || (document.querySelector('.form-fields')?.closest('form') || document.querySelector('.form-fields'))),
    removeTestPassword: window.__ecoride_remove_test_password,
    setDevLocalSave: (v) => { window.ECORIDE_DEV_LOCAL_SAVE = !!v; console.log('ECORIDE_DEV_LOCAL_SAVE set to', !!v); }
  };
})(); // end password module