// user-profile-form.js

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