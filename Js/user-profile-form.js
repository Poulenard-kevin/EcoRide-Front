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

  // sentinel pour éviter double initialisation sur le même container
  if (container.__roleInit) {
    console.log('initRoleForm: déjà initialisé pour', container);
    return;
  }
  container.__roleInit = true;

  // helper : trouve d'abord dans le container, fallback vers document
  const q = (sel) => container.querySelector(sel) || document.querySelector(sel);
  const qa = (sel) => Array.from((container.querySelectorAll(sel).length ? container.querySelectorAll(sel) : document.querySelectorAll(sel)));

  // attacher les handlers de changement sur les radios role (idempotent)
  function attachRoleListeners() {
    const radios = qa('input[name="role"]');
    radios.forEach(radio => {
      if (radio.__roleListenerAttached) return;
      radio.addEventListener('change', toggleVehicleFields);
      radio.addEventListener('click', toggleVehicleFields);
      radio.__roleListenerAttached = true;
    });
    return radios.length;
  }

  function setControlsDisabled(root, disabled) {
    if (!root) return;
    const controls = root.querySelectorAll('input, select, textarea, button, a');
    controls.forEach(el => {
      // skip elements explicitly marked to never be disabled
      if (el.classList && el.classList.contains('no-disable')) return;
  
      // inputs/selects/textareas/buttons -> disabled
      if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(el.tagName)) {
        try { el.disabled = disabled; } catch (e) { /* ignore */ }
        el.setAttribute('aria-disabled', String(disabled));
        el.classList.toggle('disabled-by-role', disabled);
      }
  
      // links -> make non-interactive
      if (el.tagName === 'A') {
        el.style.pointerEvents = disabled ? 'none' : '';
        el.setAttribute('aria-disabled', String(disabled));
        el.classList.toggle('disabled-by-role', disabled);
      }
  
      // manage tabindex for accessibility (prevent tabbing when disabled)
      if (disabled) {
        if (el.tabIndex >= 0) el.dataset._savedTabindex = el.tabIndex;
        try { el.tabIndex = -1; } catch (e) { /* ignore */ }
      } else {
        if (el.dataset && el.dataset._savedTabindex !== undefined) {
          try { el.tabIndex = parseInt(el.dataset._savedTabindex, 10); } catch {}
          delete el.dataset._savedTabindex;
        }
      }
    });
  }
  
  function toggleVehicleFields() {
    // recalculer les champs à la volée (car peuvent être injectés dynamiquement)
    const plate = q('#plate');
    const registrationDate = q('#registration-date');
    const vehicleMarque = q('#vehicle-marque');
    const vehicleModel = q('#vehicle-model');
    const vehicleColor = q('#vehicle-color');
    const vehicleType = q('#vehicle-type') || q('#vehicleType');
    const seats = q('#seats');
    const other = q('#other');
  
    // préférer le scope container pour le choix du rôle, fallback document
    const selected = container.querySelector('input[name="role"]:checked') || document.querySelector('input[name="role"]:checked');
    const role = selected ? selected.value : null;
    const isPassager = role === 'passager';
  
    const preferences = qa('input[name="preferences"]');
  
    // champs inputs/selects
    [plate, registrationDate, vehicleMarque, vehicleModel, vehicleColor, vehicleType, seats, other].forEach((field) => {
      if (!field) return;
      field.disabled = isPassager;
      field.setAttribute('aria-disabled', String(isPassager));
      field.classList.toggle('disabled-by-role', isPassager);
    });
  
    // checkboxes preferences
    preferences.forEach((chk) => {
      if (!chk) return;
      chk.disabled = isPassager;
      chk.setAttribute('aria-disabled', String(isPassager));
      chk.classList.toggle('disabled-by-role', isPassager);
    });
  
    // --- NOUVEAU : appliquer la même logique au formulaire "Publier un trajet" ---
    // adapte ces sélecteurs si ton HTML diffère
    const publishContainer = document.querySelector('#user-trajects-form') || document.querySelector('#publish-trajet-form') || document.querySelector('#trajets-en-cours');
    if (publishContainer) {
      // disable all standard controls inside the publish form when passager
      setControlsDisabled(publishContainer, isPassager);
  
      // additionally, disable edit/delete actions in the trajets list (si tu as des classes spécifiques)
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
    } else {
      // console.debug('toggleVehicleFields: publishContainer introuvable, skip trajets lock');
    }
  
    // événement global pour listeners externes
    window.dispatchEvent(new CustomEvent('ecoride:roleChanged', {
      detail: { role, isPassager }
    }));
  
    console.log('initRoleForm -> role:', role, 'isPassager:', isPassager,
                'fieldsFound:', {
                  plate: !!plate,
                  registrationDate: !!registrationDate,
                  vehicleMarque: !!vehicleMarque,
                  vehicleModel: !!vehicleModel,
                  vehicleColor: !!vehicleColor,
                  vehicleType: !!vehicleType,
                  seats: !!seats,
                  other: !!other,
                  preferencesCount: preferences.length
                });
  }

  // expose la fonction pour appel manuel après injection dynamique
  // safe: n'écrase pas si une implémentation existe déjà
  if (typeof window.updateRoleFields !== 'function') {
    window.updateRoleFields = toggleVehicleFields;
  } else {
    // si déjà défini, on conserve l'existant mais on propose un fallback si nécessaire
    window.updateRoleFieldsFallback = toggleVehicleFields;
  }

  // tentative d'attacher si les radios existent maintenant
  attachRoleListeners();

  // exécution initiale (ne fera rien si pas de radios cochées)
  toggleVehicleFields();

  // MutationObserver : détecte l'apparition d'éléments injectés dynamiquement
  const observer = new MutationObserver((mutations) => {
    let sawRelevant = false;

    for (const m of mutations) {
      // si de nouveaux noeuds ajoutés, vérifier s'ils contiennent nos éléments
      if (m.addedNodes && m.addedNodes.length) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          // selectors à surveiller : role radios, vehicle fields, preferences
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
          // si node contient sous-éléments pertinents
          if (node.querySelector &&
            (node.querySelector('input[name="role"], #plate, #vehicle-type, input[name="preferences"]'))
          ) {
            sawRelevant = true;
            break;
          }
        }
      }
      if (sawRelevant) break;
    }

    if (sawRelevant) {
      // attacher listeners si de nouvelles radios sont apparues
      attachRoleListeners();
      // mettre à jour l'état des champs
      toggleVehicleFields();
      // option : on peut déconnecter l'observer si on juge que c'est suffisant
      // observer.disconnect();
    }
  });

  // commencer l'observation du container (subtree true pour surveiller profondément)
  try {
    observer.observe(container, { childList: true, subtree: true });
  } catch (err) {
    console.warn('initRoleForm: échec observer.observe', err);
  }

  // sécurité : arrêter l'observer automatiquement après 10s pour éviter leak si inutile
  setTimeout(() => {
    try { observer.disconnect(); } catch (e) { /* ignore */ }
  }, 10000);
}

// export global
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

  function normalize(s) {
    return String(s || '').replace(/<\/?[^>]+(>|$)/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function validate(s) {
    const cleaned = normalize(s);
    const len = cleaned.length;
    const errors = [];
    if (len === 0) errors.push('Le texte ne peut pas être vide.');
    if (len < MIN) errors.push(`Minimum ${MIN} caractères requis (${len}).`);
    if (len > MAX) errors.push(`Maximum ${MAX} caractères autorisés (${len}).`);
    return { ok: errors.length === 0, cleaned, len, errors };
  }

  function saveLocal(cleaned) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: cleaned, updatedAt: Date.now() }));
      return true;
    } catch (e) {
      console.error('saveLocal error', e);
      return false;
    }
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
    card.innerHTML = text
      ? `<p class="mb-0">${String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</p>`
      : `<p class="text-muted mb-0">Aucune description fournie.</p>`;
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
        saveBtn.disabled = !ok;
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
        renderCard('');
      }

      // initial UI state
      refreshUI();

      saveBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const { ok, cleaned } = validate(textarea.value);
        if (!ok) { textarea.focus(); refreshUI(); return; }

        // final guard (truncate)
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

      console.log('ecoride: about handlers attachés (unifié)');
    } catch (err) {
      console.warn('ecoride: about - éléments introuvables dans le temps imparti', err);
    }
  })();
})();
