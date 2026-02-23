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
  const DEFAULT_SRC = '/images/default-avatar.png';
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

  // global helper (single definition)
  async function tryUploadAvatarToBackend(dataURL, meta, file) {
    if (!window.apiPersist || typeof window.apiPersist.uploadAvatar !== 'function') return;
    try {
      const userId = window.apiPersist.getCurrentUserIdFallback ? window.apiPersist.getCurrentUserIdFallback() : null;
      if (!userId) {
        console.warn('tryUploadAvatarToBackend: userId introuvable, upload annulé');
        return;
      }
  
      function dataURLtoFile(dataurl, filename = 'avatar.png') {
        const arr = dataurl.split(',');
        const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
        const bstr = atob(arr[1] || '');
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
      }
  
      const fileToSend = (file instanceof File) ? file : (dataURL ? dataURLtoFile(dataURL, meta && meta.name ? meta.name : 'avatar.png') : null);
      if (!fileToSend) {
        console.warn('tryUploadAvatarToBackend: aucun fichier détecté pour upload');
        return;
      }
  
      const res = await window.apiPersist.uploadAvatar(userId, fileToSend);
      console.log('Avatar upload backend OK', res);
  
      if (res && res.url) {
        try {
          const raw = localStorage.getItem('ecoride_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.photo = res.url;
            localStorage.setItem('ecoride_user', JSON.stringify(parsed));
            window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: { user: parsed } }));
          }
        } catch (e) { console.warn('maj ecoride_user après upload avatar failed', e); }
        try {
          const preview = document.querySelector('#profileAvatarPreview');
          if (preview) preview.src = res.url;
        } catch (e) { /* silent */ }
      }
  
      return res;
    } catch (err) {
      console.warn('Upload avatar backend échoué (non bloquant)', err);
      throw err;
    }
  }

  async function handleProfileAvatarUpload(file) {
    try {
      const rawUser = localStorage.getItem('ecoride_user') || null;
      const user = rawUser ? JSON.parse(rawUser) : null;
      const userId = user?.id || user?._id || user?.userId || await window.apiPersist.getCurrentUserIdFallback?.();
      if (!userId) throw new Error('Utilisateur non identifié');
  
      // Appelle l'API d'upload (window.apiPersist.uploadAvatar doit accepter un File)
      const res = await window.apiPersist.uploadAvatar(userId, file);
  
      let avatarUrl = null;
      if (!res) avatarUrl = null;
      else if (res.avatar) avatarUrl = res.avatar;
      else if (res.avatarUrl) avatarUrl = res.avatarUrl;
      else if (res.filePath) avatarUrl = res.filePath;
      else if (res.path) avatarUrl = res.path;
      else if (res['@id']) avatarUrl = res['@id'];
      else if (typeof res === 'string') avatarUrl = res;
  
      if (!avatarUrl && res?.user && (res.user.avatar || res.user.photo)) {
        avatarUrl = res.user.avatar || res.user.photo;
      }
  
      // fallback : re-fetch user si nécessaire (peu coûteux)
      if (!avatarUrl && userId && typeof apiFetch === 'function') {
        try {
          const fresh = await apiFetch(`/users/${userId}`);
          avatarUrl = fresh?.avatar || fresh?.avatarUrl || fresh?.photo || null;
          if (fresh) localStorage.setItem('ecoride_user', JSON.stringify(fresh));
        } catch (e) { /* ignore */ }
      }
  
      // Si on a une URL canonique renvoyée par le backend, mettre à jour ecoride_user
      if (avatarUrl) {
        try {
          const raw = localStorage.getItem('ecoride_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              parsed.avatar = avatarUrl;
              parsed.photo = parsed.photo || avatarUrl;
              localStorage.setItem('ecoride_user', JSON.stringify(parsed));
            }
          }
        } catch (e) { /* ignore */ }
        window.dispatchEvent(new CustomEvent('ecoride:profileAvatarChanged', { detail: { avatar: avatarUrl } }));
      }
  
      return avatarUrl;
    } catch (err) {
      console.error('handleProfileAvatarUpload error', err);
      throw err;
    }
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
      const isDefault = !dataURL || dataURL === DEFAULT_SRC;
      previewImg.src = dataURL || DEFAULT_SRC;
      currentDataURL = isDefault ? null : dataURL;
      currentFileMeta = isDefault ? null : (meta || null);
    
      // Si une image enregistrée -> bouton Valider activé, sinon désactivé
      if (btnConfirm) btnConfirm.disabled = isDefault;
    
      // Le bouton Supprimer activé uniquement si on a une image enregistrée
      if (btnRemove) btnRemove.disabled = isDefault;
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

        function finalizeSave(dataURL, meta, file) {
          if (!dataURL) {
            setStatus("Aucun avatar à enregistrer.", true);
            return;
          }
          const ok = saveAvatarToStorage(dataURL, meta || {});
          if (!ok) {
            setStatus(MESSAGES.SAVE_ERROR, true);
            return;
          }
        
          // mise à jour UI locale
          currentDataURL = dataURL;
          currentFileMeta = meta || currentFileMeta || {};
          updateUIForLoadedAvatar(dataURL, currentFileMeta);
          setStatus(MESSAGES.SAVED);
          try { fileInput.value = ''; } catch {}
        
          // patch ecoride_user
          try {
            const raw = localStorage.getItem('ecoride_user');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                parsed.photo = dataURL;
                localStorage.setItem('ecoride_user', JSON.stringify(parsed));
                console.log('ecoride_user mis à jour avec la photo (patch automatique)');
              }
            }
          } catch (err) { console.warn('Erreur lors du patch de ecoride_user', err); }
        
          // dispatchs
          window.dispatchEvent(new Event('userUpdated'));
          dispatchAvatarEvent('ecoride:avatarChanged', { dataURL, meta: currentFileMeta });
        
          // upload vers backend : privilégier le File natif via handleProfileAvatarUpload
          if (file) {
            handleProfileAvatarUpload(file)
              .then((avatarUrl) => {
                console.log('Upload natif OK, avatarUrl =', avatarUrl);
                // avatarUrl a déjà mis à jour localStorage dans handleProfileAvatarUpload
                // Si tu veux, mettre à jour le preview/global immédiatement :
                if (avatarUrl) {
                  document.querySelectorAll('img.profile-photo, #detail-photo, [data-ecoride-avatar]').forEach(img => {
                    if (img && img.tagName === 'IMG') img.src = (typeof resolveAvatarSrc === 'function') ? resolveAvatarSrc(avatarUrl) : avatarUrl;
                  });
                }
              })
              .catch((err) => {
                console.warn('Upload natif échoué (non bloquant)', err);
                // fallback : tenter la méthode existante si tu veux la conserver
                try { tryUploadAvatarToBackend(dataURL, currentFileMeta, file).catch(()=>{}); } catch(e){}
              });
          } else {
            // Pas de File natif (par ex. on a seulement dataURL) -> fallback à ta méthode existante
            try { tryUploadAvatarToBackend(dataURL, currentFileMeta, file).catch(()=>{}); } catch(e){}
          }
        
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
          finalizeSave(dataURL, { name: file.name, size: file.size, type: file.type }, file);
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
        // explicitement remettre l'UI à l'état "aucune image"
        updateUIForLoadedAvatar(DEFAULT_SRC, null);
        if (btnConfirm) btnConfirm.disabled = true;
        if (btnRemove) btnRemove.disabled = true;
        dispatchAvatarEvent('ecoride:avatarRemoved', {});
      }
    };
  }

  // auto-init if form present
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#profile-photo-form')) {
      window.__ecoride_profilePhoto = initProfilePhotoForm(document);
    }
  
    // Synchroniser et appliquer l'avatar au chargement
    (function syncAndApplyAvatar() {
      try {
        const profileAvatarRaw = localStorage.getItem('ecoride.profileAvatar');
        if (!profileAvatarRaw) return;
        const profileAvatar = JSON.parse(profileAvatarRaw);
        if (!profileAvatar?.dataURL) return;
  
        const userRaw = localStorage.getItem('ecoride_user');
        if (!userRaw) return;
        const user = JSON.parse(userRaw);
  
        if (user.photo !== profileAvatar.dataURL) {
          user.photo = profileAvatar.dataURL;
          localStorage.setItem('ecoride_user', JSON.stringify(user));
          console.log('Avatar synchronisé dans ecoride_user.photo');
        }
  
        const avatarSrc = profileAvatar.dataURL;
        document.querySelectorAll('img.profile-photo, #detail-photo, [data-ecoride-avatar], #headerAvatar, .header-avatar').forEach(img => {
          if (img && img.tagName === 'IMG') {
            img.src = avatarSrc;
          }
        });
  
      } catch (e) {
        console.warn('Erreur lors de la synchronisation avatar:', e);
      }
    })();
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

  if (!window.__ecoride_profileAvatarChanged_listener_installed) {
    window.addEventListener('ecoride:profileAvatarChanged', (ev) => {
      try {
        const src = ev?.detail?.avatar || null;
        // si pas d'avatar fourni -> utiliser le fallback DEFAULT_SRC
        const resolved = src
          ? ((typeof resolveAvatarSrc === 'function') ? resolveAvatarSrc(src) : src)
          : (typeof DEFAULT_SRC !== 'undefined' ? DEFAULT_SRC : '/images/default-avatar.png');
  
        document.querySelectorAll('img.profile-photo, #detail-photo, [data-ecoride-avatar], #headerAvatar, .header-avatar')
          .forEach(img => {
            if (img && img.tagName === 'IMG') {
              try { img.src = resolved; } catch (_) { /* ignore per-image */ }
            }
          });
  
        if (typeof renderTrajetsInProgress === 'function') {
          try { renderTrajetsInProgress(); } catch (e) { console.warn(e); }
        }
      } catch (err) {
        console.warn('ecoride:profileAvatarChanged handler error', err);
      }
    });
    window.__ecoride_profileAvatarChanged_listener_installed = true;
  }
})();



// Delegation globale pour le bouton "Supprimer l'avatar"
// idempotent : s'installe une seule fois même si le fichier est chargé plusieurs fois
if (!window.__ecoride_avatarDeleteDelegationAdded) {
  window.__ecoride_avatarDeleteDelegationAdded = true;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ecoride-avatar-delete], #removeAvatarBtn');
    if (!btn) return;

    // si on veut permettre propagation dans certains cas, on peut retirer e.preventDefault()
    e.preventDefault();

    const form = btn.closest('form');
    if (form) {
      try { form.querySelector('input[type="submit"], button[type="submit"]')?.blur(); } catch (err) {}
    }

    if (!confirm('Supprimer la photo de profil ?')) return;

    // inside the click handler for delete avatars
    try {
      const userId = (window.apiPersist && window.apiPersist.getCurrentUserIdFallback) ? window.apiPersist.getCurrentUserIdFallback() : null;

      if (userId && window.apiPersist && typeof window.apiPersist.deleteAvatar === 'function') {
        try {
          // tentative serveur (attend l'API, mais ne bloque pas la suppression locale en cas d'erreur)
          await window.apiPersist.deleteAvatar(userId);
          console.log('Avatar supprimé côté backend pour user', userId);
        } catch(apiErr) {
          console.warn('Suppression avatar backend échouée (on continue local):', apiErr);
        }
      }

      // comportement local (inchangé)
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

      console.log('Avatar supprimé via délégation (local + tentative backend)');
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

(function() {
  // Rafraîchit l'affichage des crédits à partir d'un objet user
  function applyUserToCredits(user) {
    try {
      if (!user) return;
      // Sauvegarde cohérente localement (utile si d'autres scripts lisent localStorage)
      try { localStorage.setItem('ecoride_user', JSON.stringify(user)); } catch(e){}
      // Si l'API publique existe, l'utiliser (ton credits.js)
      if (window.ecorideCredits && typeof window.ecorideCredits.syncFromUser === 'function') {
        window.ecorideCredits.syncFromUser(user);
        return;
      }
      // Fallback minimal: dispatch event creditsChanged pour que d'autres scripts réagissent
      const credits = (user && Number.isFinite(Number(user.credits))) ? Number(user.credits) : 0;
      window.dispatchEvent(new CustomEvent('ecoride:creditsChanged', { detail: { credits } }));
    } catch (e) {
      console.warn('[profile] applyUserToCredits error', e);
    }
  }

  // Handler d'événement pour ecoride:userUpdated
  function onUserUpdated(ev) {
    try {
      // Priorité au payload de l'événement (ex: dispatch new CustomEvent('ecoride:userUpdated',{detail:user}))
      const userFromEvent = ev && ev.detail ? ev.detail : null;
      if (userFromEvent && typeof userFromEvent === 'object') {
        applyUserToCredits(userFromEvent);
        return;
      }

      // Sinon, tenter de lire localStorage.ecoride_user
      const raw = localStorage.getItem('ecoride_user');
      if (raw) {
        try {
          const user = JSON.parse(raw);
          applyUserToCredits(user);
        } catch (e) {
          console.warn('[profile] failed parsing localStorage ecoride_user', e);
        }
      } else {
        // Pas d'info disponible — noop
        // Optionnel : tu pourrais fetch('/api/me') ici si tu veux forcer une synchro
      }
    } catch (e) {
      console.warn('[profile] onUserUpdated error', e);
    }
  }

  // Attache l'écouteur (idempotent)
  if (!window.__ecoride_profile_userUpdated_attached) {
    window.addEventListener('ecoride:userUpdated', onUserUpdated, { passive: true });
    window.__ecoride_profile_userUpdated_attached = true;
  }

  // Refresh initial au chargement : si localStorage contient ecoride_user, l'appliquer tout de suite
  (function initialRefresh() {
    try {
      const raw = localStorage.getItem('ecoride_user');
      if (raw) {
        const user = JSON.parse(raw);
        applyUserToCredits(user);
      }
    } catch (e) {
      console.warn('[profile] initial credits refresh failed', e);
    }
  })();

  // --- Sync avatar from API: place this after initialRefresh() or after setCanonicalUser/getCanonicalUser definitions
  async function syncAvatarFromApi() {
    try {
      // get canonical user from helpers (fallback to localStorage)
      const canonical = (typeof getCanonicalUser === 'function') ? getCanonicalUser() : null;
      let user = canonical || null;
      if (!user) {
        try { user = JSON.parse(localStorage.getItem('ecoride_user') || 'null'); } catch(e){ user = null; }
      }
      if (!user || !user.id) return;

      // If an apiPersist helper exists, prefer it
      if (window.apiPersist && typeof window.apiPersist.fetchUser === 'function') {
        try {
          const resp = await window.apiPersist.fetchUser(user.id);
          const apiUser = resp && (resp.user || resp);
          if (apiUser) applyAvatarFromApiResponse(apiUser);
          return;
        } catch (e) { console.warn('apiPersist.fetchUser failed, fallback to fetch', e); }
      }

      // Fallback fetch: add Authorization if token present in localStorage under common keys
      const headers = { 'Accept': 'application/json' };
      const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || localStorage.getItem('token') || null;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = `/api/users/${encodeURIComponent(user.id)}`;
      const res = await fetch(url, { method: 'GET', headers, credentials: token ? 'same-origin' : 'same-origin' });
      if (!res.ok) {
        // do not spam console for 401/403 in normal flows
        if (res.status >= 500) console.warn('syncAvatarFromApi: server error', res.status);
        return;
      }
      const data = await res.json();
      const apiUser = data && (data.user || data);
      applyAvatarFromApiResponse(apiUser);
    } catch (err) {
      console.warn('syncAvatarFromApi error', err);
    }

    function applyAvatarFromApiResponse(apiUser) {
      try {
        // normalise les formes possibles : { user: {...} } | { data: {...} } | {...}
        const srcUser = (apiUser && (apiUser.user || apiUser.data)) ? (apiUser.user || apiUser.data) : apiUser;
        if (!srcUser || typeof srcUser !== 'object') return false;
    
        // clés possibles d'avatar (ajoute-en si besoin)
        const avatarUrl = srcUser.photo || srcUser.avatar || srcUser.image || srcUser.picture || srcUser.profilePicture || srcUser.avatarUrl || null;
        if (!avatarUrl) return false;
    
        // charge le user stocké et merge proprement (sans écraser les autres champs)
        let stored = {};
        try {
          const raw = localStorage.getItem('ecoride_user');
          stored = raw ? JSON.parse(raw) : {};
          if (!stored || typeof stored !== 'object') stored = {};
        } catch (err) {
          // parse fail -> recommence avec objet vide
          stored = {};
        }
    
        // si l'URL est identique, on ne fait rien (prévention de boucles/events inutiles)
        if (stored.photo === avatarUrl) return false;
    
        // applique la nouvelle photo tout en préservant les autres champs
        const updated = Object.assign({}, stored, { photo: avatarUrl });
        try {
          localStorage.setItem('ecoride_user', JSON.stringify(updated));
        } catch (err) {
          console.warn('applyAvatarFromApiResponse: impossible de sauvegarder dans localStorage', err);
          // malgré l'échec de localStorage, on peut continuer à mettre à jour l'UI
        }
    
        // si setCanonicalUser existe, appelle-le avec l'objet mis à jour
        try {
          if (typeof setCanonicalUser === 'function') setCanonicalUser(updated);
        } catch (err) {
          console.warn('applyAvatarFromApiResponse: setCanonicalUser a échoué', err);
        }
    
        // dispatch événement userUpdated avec le payload standardisé
        try {
          window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: updated }));
        } catch (err) {
          console.warn('applyAvatarFromApiResponse: dispatch ecoride:userUpdated failed', err);
        }
    
        // Mise à jour ciblée de l'UI : remplacer uniquement si différent
        const selectors = ['#profileAvatarPreview', '#headerAvatar', '[data-ecoride-avatar]'];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            try {
              if (!el) return;
              if (el.tagName === 'IMG') {
                if (el.src !== avatarUrl) el.src = avatarUrl;
              } else {
                const current = (el.style && el.style.backgroundImage) ? el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, '') : '';
                // compare en enlevant les url("...") pour éviter des mismatches triviales
                if (current !== avatarUrl) el.style.backgroundImage = `url("${avatarUrl}")`;
              }
            } catch (e) {
              // ne pas bloquer la boucle pour une erreur sur un élément
            }
          });
        });
    
        console.log('Avatar synchronisé depuis API:', avatarUrl);
        return true;
      } catch (e) {
        console.warn('applyAvatarFromApiResponse error', e);
        return false;
      }
    }
  }

  // call at load and when userUpdated event fires
  document.addEventListener('DOMContentLoaded', () => {
    try { syncAvatarFromApi(); } catch(e){ console.warn(e); }
  });
  window.addEventListener('ecoride:userUpdated', (ev) => {
    try { syncAvatarFromApi(); } catch(e){ console.warn(e); }
  });
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

        // tentative de sauvegarde côté backend (non bloquante)
        if (window.apiPersist && typeof window.apiPersist.saveAbout === 'function') {
          (async () => {
            try {
              const userId = window.apiPersist.getCurrentUserIdFallback ? window.apiPersist.getCurrentUserIdFallback() : null;
              if (!userId) { console.warn('saveAbout: userId introuvable'); return; }
              const resp = await window.apiPersist.saveAbout(userId, final);
              console.log('saveAbout backend OK', resp);
              if (resp && resp.user) {
                try {
                  localStorage.setItem('ecoride_user', JSON.stringify(resp.user));
                  window.dispatchEvent(new CustomEvent('ecoride:userUpdated', { detail: { user: resp.user } }));
                } catch(e){ console.warn('saveAbout: failed to sync ecoride_user', e); }
              }
            } catch (err) {
              console.warn('saveAbout backend échoué (non bloquant)', err);
            }
          })();
        }

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
        const keys = ['ecoride.profileAvatar','ecoride_profileAvatar']; // keep candidates
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