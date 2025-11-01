// ===========================================================
// Espace Utilisateur - Véhicules (version stable)
// ===========================================================

// -------------------- Variables globales --------------------
let editingVehicleIndex = null;
let vehicleToDeleteIndex = null;
const vehicles = [];

// -------------------- Utils --------------------
function normalizePlate(p) {
  return (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Conversion jj/mm/aaaa → yyyy-mm-dd
function convertFRtoISO(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Pour pré-remplir input[type="date"]
function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

// Helpers réutilisables au niveau module (utilisés par plusieurs fonctions)
function readField(frm, idOrName) {
  if (!frm) return '';
  const byId = frm.querySelector(`#${idOrName}`);
  if (byId) return (byId.value ?? '').trim();
  const byName = frm.elements?.[idOrName];
  if (byName) return (byName.value ?? '').trim();
  const byNameSel = frm.querySelector(`[name="${idOrName}"]`);
  if (byNameSel) return (byNameSel.value ?? '').trim();
  return '';
}

function setField(frm, idOrName, value) {
  if (!frm) return false;
  const byId = frm.querySelector(`#${idOrName}`);
  if (byId) { byId.value = value ?? ''; return true; }
  if (frm.elements?.[idOrName]) { frm.elements[idOrName].value = value ?? ''; return true; }
  const byNameSel = frm.querySelector(`[name="${idOrName}"]`);
  if (byNameSel) { byNameSel.value = value ?? ''; return true; }
  return false;
}

// -------------------- Normalisation dates trajets --------------------
function normalizeRideDates() {
  let trajets = JSON.parse(localStorage.getItem('trajets')) || [];
  let changed = false;

  trajets = trajets.map(t => {
    if (!t.date) return t;

    // 🔹 Cas 1 : format FR -> convertir en ISO
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(t.date)) {
      const [d, m, y] = t.date.split('/');
      t.date = `${y}-${m}-${d}`; // devient YYYY-MM-DD
      changed = true;
    }

    // 🔹 Cas 2 : format ISO tronqué (YYYY-MM-DD) → OK
    // 🔹 Cas 3 : autre format -> parse to ISO
    else if (isNaN(new Date(t.date).getTime())) {
      const parsed = new Date(t.date);
      if (!isNaN(parsed)) {
        t.date = parsed.toISOString().split('T')[0];
        changed = true;
      }
    }
    return t;
  });

  if (changed) {
    localStorage.setItem('trajets', JSON.stringify(trajets));
    console.log("✅ Dates normalisées dans localStorage");
  } else {
    console.log("✔️ Dates déjà au bon format");
  }
}

// -------------------- Persistance véhicules --------------------
function loadVehicles() {
  try {
    const stored = localStorage.getItem('ecoride_vehicles');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        vehicles.length = 0;
        vehicles.push(...parsed);
      }
    }
  } catch (e) {
    console.error("Erreur chargement véhicules depuis localStorage", e);
  }
}

function saveVehicles() {
  try {
    localStorage.setItem('ecoride_vehicles', JSON.stringify(vehicles));
    if (typeof populateVehiclesSelect === 'function') {
      populateVehiclesSelect();  // ✅ OK
    }
  } catch (err) {
    console.error("❌ Erreur sauvegarde véhicules:", err);
  }

  window.dispatchEvent(new CustomEvent('ecoride:vehiclesUpdated', {
    detail: { vehicles: JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]') }
  }));
}

// -------------------- Import --------------------
import { initTrajets, renderHistorique, getTrajets, debugTrajets } from '../Js/trajets.js';

// ✅ Sentinelle d'initialisation
let userSpaceInitialized = false;

// -------------------- Initialisation --------------------
export async function initUserSpace() {
  // 🧹 Nettoie les doublons de panels
  ['user-profile-form', 'user-trajects-form', 'user-vehicles-form', 'user-history-form'].forEach(id => {
    const all = document.querySelectorAll(`#${id}`);
    if (all.length > 1) {
      console.warn(`⚠️ ${all.length} éléments #${id} détectés, suppression des doublons`);
      all.forEach((el, i) => {
        if (i > 0) el.remove(); // garde le premier, supprime les autres
      });
    }
  });

  // ✅ Empêcher double initialisation
  if (userSpaceInitialized) {
    console.log('⚪ initUserSpace déjà appelé, skip');
    return;
  }
  userSpaceInitialized = true;

  // Migration éventuelle
  const oldVehicules = localStorage.getItem('ecoride_vehicules');
  if (oldVehicules) {
    localStorage.setItem('ecoride_vehicles', oldVehicules);
    localStorage.removeItem('ecoride_vehicules');
  }

  loadVehicles();

  const userSpaceSection = document.querySelector(".user-space-section");
  if (!userSpaceSection) {
    console.error("❌ .user-space-section introuvable dans le DOM.");
    return;
  }

  await loadHTMLContent();

  // -- Important : setupTabs avant d'éventuelles injections qui modifient le DOM
  try {
    if (typeof setupTabs === 'function') {
      setupTabs(userSpaceSection);
      console.log('setupTabs exécuté');
    } else {
      console.warn('setupTabs non défini');
    }
  } catch (e) {
    console.warn('setupTabs error', e);
  }

  // 🔍 DIAGNOSTICS : surveiller les écritures dans #user-vehicles-form
  (function watchVehiclesPanelWrites(){
    const container = document.getElementById('user-vehicles-form');
    if (!container) return;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!desc) return;
    const originalSet = desc.set;
    Object.defineProperty(container, 'innerHTML', {
      set(value) {
        if (document.body.dataset.lockVehiclesWrite === '1') {
          console.warn('🔒 WRITE innerHTML BLOCKED on #user-vehicles-form (lockVehiclesWrite active)');
          return;
        }
        console.trace('WRITE innerHTML on #user-vehicles-form', { snippet: String(value).slice(0,120) });
        originalSet.call(this, value);
      },
      get: desc.get,
      configurable: true
    });
  })();

  (function observeVehiclesPanel(){
    const el = document.getElementById('user-vehicles-form');
    if (!el) return;
    const mo = new MutationObserver((mutations) => {
      console.trace('MUTATION in #user-vehicles-form', mutations.map(m => m.type));
    });
    mo.observe(el, { childList: true, subtree: true });
  })();

  // Init sections (scopées au container) — robustes (try/catch)
  try { initRoleForm(userSpaceSection); } catch (e) { console.warn('initRoleForm failed', e); }

  if (typeof initProfilePhotoForm === 'function') {
    try { initProfilePhotoForm(userSpaceSection); } catch (e) { console.warn('initProfilePhotoForm failed', e); }
  }

  try {
    // si initVehicleManagement supporte un container, passe-le ; sinon fallback
    if (typeof initVehicleManagement === 'function') {
      if (initVehicleManagement.length > 0) initVehicleManagement(userSpaceSection);
      else initVehicleManagement();
    } else {
      console.warn('initVehicleManagement non défini');
    }
  } catch (e) {
    console.warn('initVehicleManagement error', e);
  }

  try { injectDeleteModal(); } catch (e) { console.warn('injectDeleteModal failed', e); }

  // --- INIT CREDITS (après rendu / initialisation des controls) ---
  try {
    const hasCreditsUI = !!userSpaceSection.querySelector('#creditsValue, #creditsForm, #creditsAddInput');
    if (hasCreditsUI) {
      if (window.ecorideCredits && typeof window.ecorideCredits.init === 'function') {
        window.ecorideCredits.init(userSpaceSection);
        console.log('ecorideCredits initialisé pour user space — credits:', window.ecorideCredits.get());
      } else {
        console.warn('ecorideCredits non défini au moment de l\'init user space. Attente courte avant retry.');
        // fallback léger si le script arrive juste après (optionnel)
        setTimeout(() => {
          if (window.ecorideCredits && typeof window.ecorideCredits.init === 'function') {
            try {
              window.ecorideCredits.init(userSpaceSection);
              console.log('ecorideCredits init (retry) success — credits:', window.ecorideCredits.get());
            } catch (err) {
              console.warn('ecorideCredits.init retry erreur', err);
            }
          }
        }, 50);
      }
    } else {
      console.log('Pas d\'UI crédits détectée dans userSpaceSection — skip credits init');
    }
  } catch (e) {
    console.warn('ecorideCredits.init erreur', e);
  }

  // Placeholders pour date/time (tu peux garder/adapter)
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => input.classList.toggle('empty', !input.value);
    toggleClass();
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });

  // Trajets
  setTimeout(() => {
    try {
      initTrajets();

      // ✅ Normalisation des dates (sans re-render)
      setTimeout(() => {
        console.log("🟢 Normalisation des dates après initTrajets");
        normalizeRideDates();
        // renderHistorique() sera appelé par onDomReady dans trajets.js
      }, 200);
    } catch (e) {
      console.error(e);
    }
  }, 100);
}

// -------------------- Chargement HTML dynamique --------------------

let userHtmlLoaded = false;

async function loadHTMLContent() {
  if (userHtmlLoaded) {
    console.log('⚪ HTML user-space déjà chargé, skip global');
    return;
  }
  await Promise.all([
    loadHTML("user-profile-form", "pages/user-profile-form.html"),
    loadHTML("user-trajects-form", "pages/user-trajects-form.html"),
    loadHTML("user-vehicles-form", "pages/user-vehicles-form.html"),
    loadHTML("user-history-form", "pages/user-history-form.html")
  ]);
  userHtmlLoaded = true;
}

async function loadHTML(id, filePath) {
  const container = document.getElementById(id);
  if (!container) return;

  // ✅ Éviter rechargement si déjà fait
  if (container.dataset.loaded === '1') {
    console.log(`⚪ ${id} déjà chargé, skip`);
    return;
  }

  // ✅ NOUVEAU : Si plusieurs conteneurs avec cet ID existent, on nettoie
  const allWithId = document.querySelectorAll(`#${id}`);
  if (allWithId.length > 1) {
    console.warn(`⚠️ ${allWithId.length} conteneurs #${id} détectés, nettoyage...`);
    allWithId.forEach((el, i) => {
      if (i > 0) el.remove(); // garde le premier, supprime les autres
    });
  }

  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      console.error(`❌ Erreur de statut pour ${filePath}:`, response.status);
      return;
    }
    const html = await response.text();
    container.innerHTML = html;
    container.dataset.loaded = '1';  // ✅ marque comme chargé
    console.log(`✅ ${id} chargé depuis ${filePath}`);
  } catch (err) {
    console.error(`❌ Erreur de chargement de ${filePath}:`, err);
  }
}


// -------------------- Tabs (simple et stable) --------------------
function setupTabs(userSpaceSection) {
  // ✅ Empêcher double initialisation des tabs
  if (userSpaceSection.dataset.tabsInitialized === '1') {
    console.log('⚪ setupTabs déjà appelé, skip');
    return;
  }

  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = [
    document.getElementById('user-profile-form'),
    document.getElementById('user-trajects-form'),
    document.getElementById('user-vehicles-form'),
    document.getElementById('user-history-form')
  ].filter(Boolean); // retire les null si un panel n'existe pas
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  // Retire data-bs-toggle pour garder un contrôle JS simple
  [...desktopTabs, ...offcanvasTabs].forEach(tab => tab.removeAttribute('data-bs-toggle'));

  const syncActiveClass = (index) => {
    if (document.body.dataset.lockTab === '1') {
      console.warn('TAB sync blocked by lockTab. index=', index);
      return;
    }
    console.trace('TAB -> syncActiveClass called with index =', index);
  
    desktopTabs.forEach(tab => tab.classList.remove("active"));
    offcanvasTabs.forEach(tab => tab.classList.remove("active"));
  
    // Cacher tous les panels
    forms.forEach(form => form.style.display = "none");
  
    // Activer onglet desktop et offcanvas
    if (desktopTabs[index]) desktopTabs[index].classList.add("active");
    if (offcanvasTabs[index]) offcanvasTabs[index].classList.add("active");
  
    // Trouver le panel correspondant au href de l’onglet desktop
    const href = desktopTabs[index]?.getAttribute('href') || desktopTabs[index]?.dataset.target;
    if (href) {
      const panel = document.querySelector(href);
      if (panel) {
        panel.style.display = "block";
        console.log(`📍 Affichage panel ${href}`);
      }
    }
  
    // Gestion historique (comme avant)
    forms.forEach(form => form.classList.remove('active'));
    const panel = document.querySelector(href);
    if (panel && panel.id === "user-history-form" && typeof renderHistorique === "function") {
      renderHistorique();
    }
  
    // Fermer offcanvas si ouvert
    if (offcanvas && offcanvas.classList.contains("show") && window.bootstrap && bootstrap.Offcanvas) {
      const oc = bootstrap.Offcanvas.getInstance(offcanvas);
      if (oc) oc.hide();
    }
  };

  function onTabClickFactory(index) {
    return (e) => {
      // Si un submit véhicules est en cours, on bloque juste ce clic
      if (document.body.dataset.lockTab === '1') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      syncActiveClass(index);
    };
  }

  desktopTabs.forEach((tab, index) => {
    tab.addEventListener('click', onTabClickFactory(index), true);
  });

  offcanvasTabs.forEach((tab, index) => {
    tab.addEventListener('click', onTabClickFactory(index), true);
  });

  // ✅ Marquer comme initialisé
  userSpaceSection.dataset.tabsInitialized = '1';
  console.log('✅ setupTabs initialisé');
}

// API publique pour changer d’onglet par code si besoin
function switchToTab(tabId) {
  if (document.body.dataset.lockTab === '1') {
    console.warn('TAB switch blocked by lockTab during modal close. tabId=', tabId);
    return;
  }
  console.trace('TAB -> switchToTab called with tabId =', tabId);
  const userSpaceSection = document.querySelector('.user-space-section');
  if (!userSpaceSection) return;

  const desktopTabs = [...userSpaceSection.querySelectorAll('.nav-pills.user-tabs .nav-link')];
  const offcanvasTabs = [...userSpaceSection.querySelectorAll('.nav-pills.user-tabs-offcanvas .nav-link')];
  const forms = userSpaceSection.querySelectorAll('.user-space-form');

  // Cacher tous les formulaires
  forms.forEach(form => form.style.display = 'none');

  // Désactiver tous les onglets
  desktopTabs.forEach(tab => tab.classList.remove('active'));
  offcanvasTabs.forEach(tab => tab.classList.remove('active'));

  // Afficher le formulaire ciblé
  const targetForm = document.getElementById(tabId);
  if (targetForm) targetForm.style.display = 'block';

  // Activer le bon onglet en fonction du href ou data-target
  const match = (tab) => {
    const href = tab.getAttribute('href') || tab.dataset.target || '';
    return href === `#${tabId}`;
  };
  desktopTabs.find(match)?.classList.add('active');
  offcanvasTabs.find(match)?.classList.add('active');
}
window.switchToTab = switchToTab;

// 🟢 Quand une réservation est ajoutée → aller sur "Mes trajets"
window.addEventListener('ecoride:reservationAdded', () => {
  console.log("🟢 Réservation ajoutée → ouvrir l’onglet Mes trajets");
  if (typeof switchToTab === 'function') {
    switchToTab('user-trajects-form'); // ou le bon id
  }

  const sectionMesTrajets = document.querySelector('#trajets-en-cours');
  if (sectionMesTrajets) {
    sectionMesTrajets.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// 🔵 Quand une réservation est annulée → rafraîchir les trajets et l'historique
window.addEventListener('ecoride:reservationRemoved', () => {
  console.log("🔵 Réservation supprimée → mise à jour de l'espace utilisateur");

  // Rafraîchir la section ‘Mes trajets en cours’ s’il y a une fonction pour ça
  if (typeof renderTrajetsInProgress === 'function') {
    try {
      renderTrajetsInProgress();
    } catch (err) {
      console.warn('⚠️ Erreur lors du rafraîchissement de Mes trajets:', err);
    }
  }

  // Rafraîchir l’historique aussi pour éviter les anciens trajets obsolètes
  if (typeof renderHistorique === 'function') {
    try {
      renderHistorique();
    } catch (err) {
      console.warn('⚠️ Erreur lors du rafraîchissement de l’historique:', err);
    }
  }
});

// -------------------- Gestion des véhicules --------------------
function initVehicleManagement() {
  renderVehicleList();
  bindVehiclesFormHandlers();
}

function bindVehiclesFormHandlers() {
  // Récupère le form au moment de l'init (pour l'attacher),
  // mais dans le handler on re-query pour avoir des références fraîches.
  let form = document.querySelector('#user-vehicles-form #create-vehicle-form');
  if (!form) {
    console.warn('Formulaire véhicules introuvable (bind)');
    return;
  }

  const saveBtn = document.querySelector('#vehicle-save-btn');
  if (saveBtn) saveBtn.type = 'button';

  // Format plaque (on garde ta logique)
  const plateInput = form.querySelector('#plate');
  if (plateInput) {
    plateInput.addEventListener('input', (e) => {
      let raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      raw = raw.slice(0, 7);
      let formatted = '';
      if (raw.length <= 2) formatted = raw;
      else if (raw.length <= 5) formatted = raw.slice(0, 2) + ' - ' + raw.slice(2);
      else formatted = raw.slice(0, 2) + ' - ' + raw.slice(2, 5) + ' - ' + raw.slice(5);
      e.target.value = formatted;
    });
  }

  // Le handler de submit — on re-query le form et les champs à l'intérieur
  const handleSubmit = (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Reprendre une référence fraîche du form (au cas où il ait été réinjecté)
    form = document.querySelector('#user-vehicles-form #create-vehicle-form');
    if (!form) {
      console.error('Formulaire introuvable au moment du submit');
      return;
    }

    // Lecture défensive des champs
    const plate = readField(form, 'plate');
    // Debug utile si plate est vide
    if (!plate) {
      console.error('Champ #plate introuvable ou vide', { plate });
      alert('Le champ de la plaque est introuvable ou vide.');
      return;
    }

    const regex = /^[A-Z]{2} - \d{3} - [A-Z]{2}$/;
    if (!regex.test(plate)) {
      alert("⚠️ La plaque doit être au format : AB - 123 - CD");
      return;
    }

    let registrationDate = readField(form, 'registration-date');
    if (registrationDate.includes('/')) registrationDate = convertFRtoISO(registrationDate);

    const vehicleData = {
      id: plate,
      plate,
      registrationDate,
      marque: readField(form, 'vehicle-marque'),
      model: readField(form, 'vehicle-model'),
      color: readField(form, 'vehicle-color'),
      // support id="vehicle-type" ou name="vehicleType"
      type: readField(form, 'vehicle-type') || readField(form, 'vehicleType'),
      seats: readField(form, 'seats'),
      preferences: Array.from(form.querySelectorAll('input[name="preferences"]:checked')).map(el => el.value),
      other: readField(form, 'other'),
    };

    try {
      document.body.dataset.lockTab = '1';
      loadVehicles();

      const editIdxAttr = form.dataset.editIndex;
      const editIdx = editIdxAttr !== undefined ? parseInt(editIdxAttr, 10) : null;

      const existsIdx = vehicles.findIndex(v =>
        normalizePlate(v.id || v.plate) === normalizePlate(plate)
      );

      const isEditing = (editIdx !== null && !Number.isNaN(editIdx)) || (editingVehicleIndex !== null);

      if (!isEditing && existsIdx !== -1) {
        alert("Un véhicule avec cette plaque existe déjà.");
        return;
      }

      if (editIdx !== null && !Number.isNaN(editIdx)) {
        vehicles[editIdx] = vehicleData;
        delete form.dataset.editIndex;
        editingVehicleIndex = null;
      } else if (editingVehicleIndex !== null) {
        vehicles[editingVehicleIndex] = vehicleData;
        editingVehicleIndex = null;
      } else {
        vehicles.push(vehicleData);
      }

      saveVehicles();
      form.reset();
      updateVehicleListOnly();

      const usedForm = document.querySelector('#used-vehicles-form');
      const usedTitle = usedForm?.querySelector('.title-my-used-vehicles h2');
      (usedTitle || usedForm)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('❌ Erreur submit véhicules', err);
      alert('Une erreur est survenue lors de l\'enregistrement du véhicule. Regarde la console.');
    } finally {
      delete document.body.dataset.lockTab;
    }
  };

  // Attache le listener (une seule fois)
  form.addEventListener('submit', handleSubmit);

  // Bouton Enregistrer : appelle directement le handler (plus sûr que dispatchEvent)
  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    });
  }

  // Gestion propre d'Enter : navigation + envoi uniquement au dernier champ
  const refreshFields = () => Array.from(form.querySelectorAll('input, select, textarea'));
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();

    const fields = refreshFields();
    const lastField = fields[fields.length - 1];
    const currentIndex = fields.indexOf(document.activeElement);
    const next = fields[currentIndex + 1];

    if (next && document.activeElement !== lastField) {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (document.activeElement === lastField) {
      if (saveBtn) saveBtn.click();
    }
  });
}

function renderVehicleList() {
  if (document.body.dataset.lockVehiclesWrite === '1') {
    console.warn('🔒 renderVehicleList() blocked by lockVehiclesWrite');
    return;
  }
  console.log('🔄 renderVehicleList() appelé');
  
  const container = document.getElementById('user-vehicles-form');
  if (!container) return;

  container.innerHTML = `
    <h1>Mes véhicules</h1>

    <!-- Formulaire 1 : Créer un véhicule -->
    <form id="create-vehicle-form">
      <div class="form-fields">
        <h2>Ajouter un véhicule</h2>

        <div class="form-field-1">
          <label for="plate">Plaque d'immatriculation</label>
          <input type="text" id="plate" class="form-control" placeholder="AB - 123 - CD" autocomplete="off">
        </div>

        <div class="form-field-1">
          <label for="registration-date">Date de première immatriculation</label>
          <input type="date" id="registration-date" class="form-control">
        </div>

        <div class="form-field-1">
          <label for="vehicle-marque">Marque</label>
          <input type="text" id="vehicle-marque" class="form-control" placeholder="Tesla">
        </div>

        <div class="form-field-1">
          <label for="vehicle-model">Modèle</label>
          <input type="text" id="vehicle-model" class="form-control" placeholder="Model 3">
        </div>

        <div class="form-field-1">
          <label for="vehicle-color">Couleur</label>
          <input type="text" id="vehicle-color" class="form-control" placeholder="Noir">
        </div>

        <div class="form-field-1">
          <label for="vehicle-type">Type de véhicule</label>
          <select id="vehicle-type" name="vehicleType" class="form-input">
            <option value="" selected hidden>-- Sélectionner un type--</option>
            <option value="Électrique">Électrique</option>
            <option value="Hybride">Hybride</option>
            <option value="Thermique">Thermique</option>
          </select>
        </div>

        <div class="form-field-1">
          <label for="seats">Nombre de places disponibles</label>
          <input type="number" id="seats" class="form-control" placeholder="3" min="1" max="8">
        </div>

        <div class="form-field-1">
          <label>Préférences chauffeur</label>
          <div class="checkbox-group">
            <label><input type="checkbox" class="checkbox-input custom-checkbox" name="preferences" value="fumeur"> Fumeur</label>
            <label><input type="checkbox" class="checkbox-input custom-checkbox" name="preferences" value="animal"> Animal</label>
            <label><input type="checkbox" class="checkbox-input custom-checkbox" name="preferences" value="musique"> Musique</label>
          </div>
        </div>

        <div class="form-field-1">
          <label for="other">Autre</label>
          <input type="text" id="other" class="form-control" placeholder="Discussion...">
        </div>

        <button type="submit" id="vehicle-save-btn" class="btn btn-success">Enregistrer</button>
      </div>
    </form>

    <!-- Formulaire 2 : Mes véhicules enregistrés -->
    <form id="used-vehicles-form">
      <div class="form-fields">
        <div class="title-my-used-vehicles">
          <h2>Mes véhicules enregistrés</h2>
        </div>
        <div id="vehicleList"></div>
      </div>
    </form>
  `;

  // ✅ Utilise la fonction utilitaire pour remplir la liste
  updateVehicleListOnly();

  // Bouton submit: hardening
  const saveBtn = container.querySelector('#vehicle-save-btn');
  if (saveBtn) {
    saveBtn.removeAttribute('data-bs-toggle');
    saveBtn.removeAttribute('data-bs-target');
    saveBtn.removeAttribute('href');
    saveBtn.addEventListener('click', (ev) => ev.stopPropagation());
  }
}

// ✅ Fonction utilitaire pour générer UN véhicule
function createVehicleElement(v, index) {
  const vehicleContainer = document.createElement('div');
  vehicleContainer.className = 'vehicle-container';

  const vehicleLine = document.createElement('div');
  vehicleLine.className = 'form-field vehicle-label vehicle-line';
  vehicleLine.style.cursor = 'pointer';

  const brandDiv = document.createElement('div');
  brandDiv.className = 'vehicle-brand';
  brandDiv.textContent = v.marque || v.brand || '';

  const modelDiv = document.createElement('div');
  modelDiv.className = 'vehicle-model';
  modelDiv.textContent = v.model || v.modele || '';

  const colorDiv = document.createElement('div');
  colorDiv.className = 'vehicle-color';
  colorDiv.textContent = v.color || v.couleur || '';

  vehicleLine.appendChild(brandDiv);
  vehicleLine.appendChild(modelDiv);
  vehicleLine.appendChild(colorDiv);
  vehicleLine.addEventListener('click', () => showVehicleModal(v));

  const actionDiv = document.createElement('div');
  actionDiv.className = 'form-field-modify-delete';
  actionDiv.innerHTML = `
    <a href="javascript:void(0);" class="link-modify" data-index="${index}">Modifier</a>
    <a href="javascript:void(0);" class="link-delete" data-index="${index}" data-bs-toggle="modal" data-bs-target="#deleteModal">Supprimer</a>
  `;

  vehicleContainer.appendChild(vehicleLine);
  vehicleContainer.appendChild(actionDiv);
  
  return vehicleContainer;
}

function ensureVehiclesPanelMarkup() {
  const container = document.getElementById('user-vehicles-form');
  if (!container) return;

  const hasCreate = container.querySelector('#create-vehicle-form');
  const hasList = container.querySelector('#vehicleList');

  if (!hasCreate || !hasList) {
    console.warn('⚠️ Panel véhicules corrompu, reconstruction du markup');
    renderVehicleList();
    bindVehiclesFormHandlers(); // réattache les événements
  } else {
    console.log('✅ Panel véhicules intact');
  }
}

function updateVehicleListOnly() {
  const listDiv = document.querySelector('#vehicleList');
  if (!listDiv) {
    console.warn('⚠️ #vehicleList introuvable');
    return;
  }

  listDiv.innerHTML = "";

  const stored = localStorage.getItem('ecoride_vehicles');
  const vehiclesLocal = stored ? JSON.parse(stored) : [];

  if (vehiclesLocal.length === 0) {
    listDiv.innerHTML = "<p>Aucun véhicule enregistré.</p>";
  } else {
    vehiclesLocal.forEach((v, index) => {
      listDiv.appendChild(createVehicleElement(v, index));
    });
  }
  
  console.log('✅ Liste véhicules mise à jour:', vehiclesLocal.length, 'véhicules');
}

// ---------- showVehicleModal ----------
function showVehicleModal(vehicle) {
  let modal = document.getElementById('vehicleDetailModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vehicleDetailModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Détails du véhicule</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
          </div>
          <div class="modal-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Remplir le contenu
  const modalBody = modal.querySelector('.modal-body');
  modalBody.innerHTML = `
    <p><strong>Marque :</strong> ${vehicle.marque || "Non spécifiée"}</p>
    <p><strong>Modèle :</strong> ${vehicle.model || "Non spécifié"}</p>
    <p><strong>Couleur :</strong> ${vehicle.color || "Non spécifiée"}</p>
    <p><strong>Type :</strong> ${vehicle.type || "Non spécifié"}</p>
    <p><strong>Plaque :</strong> ${vehicle.id || vehicle.plate || "Non spécifiée"}</p>
    <p><strong>Date d'immatriculation :</strong> ${vehicle.registrationDate || "Non spécifiée"}</p>
    <p><strong>Nombre de places :</strong> ${vehicle.seats || "Non spécifié"}</p>
    <p><strong>Préférences :</strong> ${(vehicle.preferences && vehicle.preferences.length > 0) ? vehicle.preferences.join(', ') : "Aucune"}</p>
    <p><strong>Autre :</strong> ${vehicle.other || "N/A"}</p>
  `;

  // Attacher handlers idempotents (shown / hide) pour gérer le focus et éviter le warning aria-hidden
  if (!modal.dataset.modalHandlersAttached) {
    // Quand la modale est affichée -> focus sur la croix
    modal.addEventListener('shown.bs.modal', () => {
      const closeBtn = modal.querySelector('.btn-close');
      if (closeBtn && typeof closeBtn.focus === 'function') {
        try { closeBtn.focus({ preventScroll: true }); } catch (e) { try { closeBtn.focus(); } catch (er) {} }
      } else {
        // fallback : focus sur le dialog container
        try { modal.focus(); } catch (e) {}
      }
    });

    // Avant que la modale commence à se cacher -> blur l'élément actif s'il est dans la modale (évite aria-hidden block)
    modal.addEventListener('hide.bs.modal', () => {
      try {
        const active = document.activeElement;
        if (active && modal.contains(active) && typeof active.blur === 'function') {
          active.blur();
        } else if (active && typeof active.blur === 'function') {
          // fallback: blur global
          active.blur();
        }
      } catch (e) { /* ignore */ }
    });

    modal.dataset.modalHandlersAttached = '1';
  }

  // Blur l'élément actif avant d'ouvrir (préventif)
  if (typeof safeBlurActiveElement === 'function') safeBlurActiveElement();

  // Ouvrir la modale (backdrop true / keyboard true) => permet fermeture clic en dehors
  let bs = bootstrap.Modal.getInstance(modal);
  if (!bs) bs = new bootstrap.Modal(modal, { backdrop: true, keyboard: true, focus: true });
  bs.show();
}

// ---------- injectDeleteModal ----------
function injectDeleteModal() {
  if (document.getElementById('deleteModal')) return;

  const modalHTML = `
    <div class="modal fade" id="deleteModal" tabindex="-1" aria-labelledby="deleteModalLabel" role="dialog" aria-modal="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="deleteModalLabel">Confirmer la suppression</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
          </div>
          <div class="modal-body">
            Êtes-vous sûr de vouloir supprimer ce véhicule ?
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
            <button type="button" class="btn btn-danger" id="confirmDeleteBtn">Supprimer</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const el = document.getElementById('deleteModal');
  if (el) el.setAttribute('tabindex', '-1');

  // Attacher handlers idempotents pour focus / blur
  if (!el.dataset.modalHandlersAttached) {
    el.addEventListener('shown.bs.modal', () => {
      const closeBtn = el.querySelector('.btn-close');
      if (closeBtn && typeof closeBtn.focus === 'function') {
        try { closeBtn.focus({ preventScroll: true }); } catch (e) { try { closeBtn.focus(); } catch (er) {} }
      } else {
        try { el.focus(); } catch (e) {}
      }
    });

    el.addEventListener('hide.bs.modal', () => {
      try {
        const active = document.activeElement;
        if (active && el.contains(active) && typeof active.blur === 'function') {
          active.blur();
        } else if (active && typeof active.blur === 'function') {
          active.blur();
        }
      } catch (e) { /* ignore */ }
    });

    el.dataset.modalHandlersAttached = '1';
  }

  // (optionnel) initialiser instance Bootstrap pour être sûr
  let inst = bootstrap.Modal.getInstance(el);
  if (!inst) inst = new bootstrap.Modal(el, { backdrop: true, keyboard: true, focus: true });
}

// -------------------- Events globaux actions (Modifier/Supprimer) --------------------
document.body.addEventListener('click', (event) => {
  const target = event.target;

  if (target.classList.contains('link-modify')) {
    event.preventDefault();
    const index = parseInt(target.getAttribute('data-index'), 10);
    handleModifyClick(index);
  } else if (target.id === 'addVehicleBtn') {
    event.preventDefault();
    handleAddClick();
  } else if (target.classList.contains('link-delete')) {
    event.preventDefault();
    handleDeleteClick(target);
  } else if (target.id === 'confirmDeleteBtn') {
    event.preventDefault();
    handleConfirmDelete();
  }
});

function handleModifyClick(index) {
  loadVehicles();
  if (isNaN(index) || !vehicles[index]) {
    console.error('Véhicule à modifier introuvable', { index, vehiclesLen: vehicles.length });
    return;
  }

  editingVehicleIndex = index;
  const vehicle = vehicles[index];

  switchToTab('user-vehicles-form');

  // >>> Scroll vers "Ajouter un véhicule"
  const formContainer = document.querySelector('#user-vehicles-form');
  const createForm = document.querySelector('#user-vehicles-form #create-vehicle-form');
  // On cible le titre si tu veux être précis:
  const addTitle = createForm?.querySelector('h2'); // "Ajouter un véhicule"
  (addTitle || createForm || formContainer)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  setTimeout(() => {
    const form = document.querySelector('#user-vehicles-form #create-vehicle-form');
    if (!form) {
      console.error('Formulaire véhicules introuvable');
      return;
    }
  
    form.dataset.editIndex = String(index);
  
    // remplissage défensif via setField (supporte id ou name)
    setField(form, 'plate', vehicle.plate || '');
    setField(form, 'registration-date', formatDateForInput(vehicle.registrationDate));
    setField(form, 'vehicle-marque', vehicle.marque || '');
    setField(form, 'vehicle-model', vehicle.model || '');
    setField(form, 'vehicle-color', vehicle.color || '');
    // support id="vehicle-type" ou name="vehicleType"
    setField(form, 'vehicle-type', vehicle.type || '');
    setField(form, 'vehicleType', vehicle.type || '');
    setField(form, 'seats', vehicle.seats || '');
    setField(form, 'other', vehicle.other || '');
  
    // preferences (checkboxes)
    form.querySelectorAll('input[name="preferences"]').forEach(input => {
      input.checked = !!(vehicle.preferences && vehicle.preferences.includes(input.value));
    });
  }, 50);
}

function handleAddClick() {
  editingVehicleIndex = null;
  const form = document.querySelector('#user-vehicles-form #create-vehicle-form');
  if (form) {
    form.reset();
    delete form.dataset.editIndex;
  }
  switchToTab('user-vehicles-form');
}

// Helper module-level (unique)
function safeBlurActiveElement() {
  try {
    const prev = document.activeElement;
    if (prev && prev !== document.body && typeof prev.blur === 'function') {
      prev.blur();
    }
  } catch (e) { /* ignore */ }
}

// ---------------- handleDeleteClick corrigé ----------------
function handleDeleteClick(target) {
  const vehicleElements = Array.from(document.querySelectorAll('#vehicleList .vehicle-container'));
  vehicleToDeleteIndex = vehicleElements.findIndex(vc => vc.contains(target));
  if (vehicleToDeleteIndex === -1) {
    console.error("Véhicule à supprimer non trouvé");
    return;
  }

  const deleteModalEl = document.getElementById('deleteModal');
  if (!deleteModalEl) {
    console.error('❌ deleteModal introuvable');
    return;
  }

  // Blur l'élément actif pour éviter le warning aria-hidden
  safeBlurActiveElement();

  // Récupère l'instance existante ou en crée une nouvelle
  let deleteModalInstance = bootstrap.Modal.getInstance(deleteModalEl);
  if (!deleteModalInstance) {
    deleteModalInstance = new bootstrap.Modal(deleteModalEl, { backdrop: true, focus: true });
  }

  deleteModalInstance.show();
}

function handleConfirmDelete() {
  if (vehicleToDeleteIndex === null || vehicleToDeleteIndex < 0) {
    console.error('❌ Index invalide', vehicleToDeleteIndex);
    return;
  }

  console.log('🗑️ Suppression du véhicule à l\'index', vehicleToDeleteIndex);

  // Suppression des données + persistance
  vehicles.splice(vehicleToDeleteIndex, 1);
  saveVehicles();
  vehicleToDeleteIndex = null;

  // Mise à jour uniquement de la liste visible
  updateVehicleListOnly();

  const deleteModalEl = document.getElementById('deleteModal');
  if (!deleteModalEl) {
    console.error('❌ Modal deleteModal introuvable');
    return;
  }

  // 🔒 Verrouille navigation + réécritures
  document.body.dataset.lockTab = '1';
  document.body.dataset.lockVehiclesWrite = '1';

  // Récupère et prépare la modale Bootstrap
  let bsModal = bootstrap.Modal.getInstance(deleteModalEl);
  if (!bsModal) bsModal = new bootstrap.Modal(deleteModalEl);

  // Déplacer le focus sur une cible sûre (onglet Véhicules ou body)
  const safeTarget = document.querySelector('.nav-pills.user-tabs .nav-link[href="#user-vehicles-form"]') || document.body;

  try {
    // Si le focus est dans la modale, blur() d'abord
    const prevActive = document.activeElement;
    if (deleteModalEl.contains(prevActive) && typeof prevActive.blur === 'function') {
      try { prevActive.blur(); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // Tenter de focaliser l'élément sûr
  try {
    if (safeTarget && typeof safeTarget.focus === 'function') safeTarget.focus({ preventScroll: true });
  } catch (e) { /* ignore */ }

  // Fonction util : attendre que le focus ne soit plus dans la modal, sinon fallback
  const waitAndHide = (modalEl, modalInstance, maxMs = 300) => {
    const start = Date.now();
    const tick = () => {
      // Si l'élément focussé n'est PAS dans la modal -> safe to hide
      if (!modalEl.contains(document.activeElement)) {
        try {
          modalInstance.hide();
        } catch (err) {
          console.warn('Erreur hide() (fallback remove)', err);
          try { modalEl.remove(); } catch (e) {}
        }
        return;
      }
      // timeout encore disponible -> re-tenter rapidement
      if (Date.now() - start < maxMs) {
        setTimeout(tick, 10);
        return;
      }
      // Timeout atteint : fallback forcé (blur + hide)
      try { document.activeElement && document.activeElement.blur(); } catch (e) {}
      setTimeout(() => {
        try {
          modalInstance.hide();
        } catch (err) {
          try { modalEl.remove(); } catch (e) {}
        }
      }, 0);
    };
    // Lancer la première vérification dans la prochaine frame
    setTimeout(tick, 0);
  };

  // Lance la fermeture sécurisée
  waitAndHide(deleteModalEl, bsModal, 400);

  // Nettoyage et réactivation UI quand la modale est effectivement cachée
  deleteModalEl.addEventListener('hidden.bs.modal', () => {
    console.log('🔓 Modal hidden event triggered');

    // Nettoyage des backdrops / classes Bootstrap si restées
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');

    // Remise à zéro des styles (scroll)
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '';

    // Vérifie et restaure le markup si corrompu
    try { ensureVehiclesPanelMarkup(); } catch (e) { console.warn('ensureVehiclesPanelMarkup erreur', e); }

    // Désactive tous les onglets et active "Mes véhicules"
    try {
      const allTabs = document.querySelectorAll('.nav-pills .nav-link');
      let vehTabActivated = false;
      allTabs.forEach(tab => {
        tab.classList.remove('active');
        const text = tab.textContent.trim().toLowerCase();
        if (text.includes('véhicule') || text.includes('vehicule')) {
          tab.classList.add('active');
          vehTabActivated = true;
        }
      });
      if (!vehTabActivated) console.error('❌ Impossible d\'activer l\'onglet "Mes véhicules"');
    } catch (e) {
      console.warn('Erreur lors de la réactivation des onglets', e);
    }

    // Déverrouille
    delete document.body.dataset.lockTab;
    delete document.body.dataset.lockVehiclesWrite;

    const activeTab = document.querySelector('.nav-pills .nav-link.active');
    console.log('✅ Modal closed. Active tab =', activeTab?.textContent?.trim() || 'NONE');
  }, { once: true });
}

// -------------------- Datalist/select véhicules (global) --------------------
function populateVehiclesSelect() {
  const datalist = document.getElementById('vehiclesDatalist');
  if (!datalist) return;

  datalist.innerHTML = '';
  vehicles.forEach(v => {
    const option = document.createElement('option');
    option.value = getVehicleLabel(v);
    datalist.appendChild(option);
  });
}

// === Apply stored avatar globally (applique l'avatar sauvegardé au chargement et sur injection SPA) ===
(function applyStoredAvatarGlobal() {
  const KEY = 'ecoride.profileAvatar';
  let parsed;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    parsed = JSON.parse(raw);
    if (!parsed || !parsed.dataURL) return;
  } catch (e) {
    console.warn('applyStoredAvatarGlobal parse error', e);
    return;
  }
  const dataURL = parsed.dataURL;

  // Appliquer immédiatement aux emplacements connus
  document.querySelectorAll('[data-ecoride-avatar], #headerAvatar, .header-avatar').forEach(img => {
    if (img && img.tagName === 'IMG') img.src = dataURL;
  });

  // Appliquer au preview du profil si déjà présent
  const preview = document.querySelector('#profileAvatarPreview');
  if (preview && preview.tagName === 'IMG') preview.src = dataURL;

  // Si le module expose une API pour recharger l'UI du profile, l'appeler
  try {
    if (window.__ecoride_profilePhoto && typeof window.__ecoride_profilePhoto.load === 'function') {
      window.__ecoride_profilePhoto.load();
    } else if (typeof window.initProfilePhotoForm === 'function') {
      // initProfilePhotoForm peut être appelé de manière sûre (idempotent)
      try { window.initProfilePhotoForm(document); } catch (err) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // Observer le DOM pour appliquer l'avatar si la form est injectée plus tard (SPA)
  const mo = new MutationObserver((mutations, obs) => {
    const p = document.querySelector('#profileAvatarPreview');
    if (p) {
      p.src = dataURL;
      try {
        if (window.__ecoride_profilePhoto && typeof window.__ecoride_profilePhoto.load === 'function') {
          window.__ecoride_profilePhoto.load();
        }
      } catch (e) {}
      obs.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();

// -------------------- Lancement --------------------
document.addEventListener('pageContentLoaded', () => {
  const pathname = window.location.pathname.replace(/\/$/, "");

  if (pathname === "/espace-utilisateur") {
    initUserSpace();

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");

    setTimeout(() => {
      const allTabs = document.querySelectorAll('.nav-pills.user-tabs .nav-link');
      const allPanels = document.querySelectorAll('.user-space-form');
    
      // ⚙️ si l'URL dit tab=trajets → ouvrir “Mes trajets”
      if (tab === "trajets") {
        console.log("🚗 Ouverture automatique de l'onglet Mes trajets");
    
        // 🟢 Correction : l’onglet "Mes trajets" = index 1
          const mesTrajetsIndex = 1;

          if (allTabs.length && allTabs[mesTrajetsIndex] && allPanels[mesTrajetsIndex]) {
            allTabs.forEach(t => t.classList.remove('active'));
            allPanels.forEach(p => (p.style.display = 'none'));

            allTabs[mesTrajetsIndex].classList.add('active');
            allPanels[mesTrajetsIndex].style.display = 'block';
            allPanels[mesTrajetsIndex].classList.add('active');

            // 🔽 scroll après affichage (on laisse un petit délai pour stabilité)
            setTimeout(() => {
              const sectionEnCours = document.querySelector('#trajets-en-cours');
              if (sectionEnCours) {
                console.log("📍 Scroll vers #trajets-en-cours");
                sectionEnCours.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                console.warn("⚠️ Section #trajets-en-cours introuvable");
              }
            }, 100);
          } else {
            console.warn("⚠️ Impossible de trouver l'onglet Mes trajets (index 1)");
          }
        }
    
      // ⚙️ si l'URL dit tab=historique → ouvrir Historique
      else if (tab === "historique") {
        console.log("📜 Ouverture de l'onglet Historique");
    
        if (allTabs.length && allTabs[3] && allPanels[3]) {
          allTabs.forEach(t => t.classList.remove('active'));
          allPanels.forEach(p => (p.style.display = 'none'));
    
          allTabs[3].classList.add('active');
          allPanels[3].style.display = 'block';
          allPanels[3].classList.add('active');
    
          if (typeof renderHistorique === "function") renderHistorique();
        } else {
          console.warn("⚠️ Onglet Historique introuvable (index 3)");
        }
      }
    }, 800);
  }
});