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
      populateVehiclesSelect();
    }
  } catch (err) {
    console.error("❌ Erreur sauvegarde véhicules:", err);
  }

  window.dispatchEvent(new CustomEvent('ecoride:vehiclesUpdated', {
    detail: { vehicles: JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]') }
  }));
}

// -------------------- Import --------------------
import { initTrajets } from '../Js/trajets.js';

// -------------------- Initialisation --------------------
export async function initUserSpace() {
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

  // Tabs: comportement simple et prévisible
  setupTabs(userSpaceSection);

  // Init sections
  initRoleForm();
  initVehicleManagement();
  injectDeleteModal();

  // Placeholders pour date/time
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => input.classList.toggle('empty', !input.value);
    toggleClass();
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });

  // Trajets
  setTimeout(() => { try { initTrajets(); } catch(e){ console.error(e); } }, 100);
}

// -------------------- Chargement HTML dynamique --------------------
async function loadHTMLContent() {
  await Promise.all([
    loadHTML("user-profile-form", "pages/user-profile-form.html"),
    loadHTML("user-trajects-form", "pages/user-trajects-form.html"),
    loadHTML("user-vehicles-form", "pages/user-vehicles-form.html"),
    loadHTML("user-history-form", "pages/user-history-form.html")
  ]);
}

async function loadHTML(id, filePath) {
  const container = document.getElementById(id);
  if (!container) return;

  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      console.error(`❌ Erreur de statut pour ${filePath}:`, response.status);
      return;
    }
    const html = await response.text();
    container.innerHTML = html;
  } catch (err) {
    console.error(`❌ Erreur de chargement de ${filePath}:`, err);
  }
}

// -------------------- Tabs (simple et stable) --------------------
function setupTabs(userSpaceSection) {
  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  // Retire data-bs-toggle pour garder un contrôle JS simple
  [...desktopTabs, ...offcanvasTabs].forEach(tab => tab.removeAttribute('data-bs-toggle'));

  const syncActiveClass = (index) => {
    desktopTabs.forEach((tab) => tab.classList.remove("active"));
    offcanvasTabs.forEach((tab) => tab.classList.remove("active"));
    forms.forEach((form) => (form.style.display = "none"));

    if (desktopTabs[index]) desktopTabs[index].classList.add("active");
    if (offcanvasTabs[index]) offcanvasTabs[index].classList.add("active");
    if (forms[index]) forms[index].style.display = "block";

    if (offcanvas && offcanvas.classList.contains("show")) {
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
}

// API publique pour changer d’onglet par code si besoin
function switchToTab(tabId) {
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

  // Activer le bon onglet
  const match = (tab) => {
    const href = tab.getAttribute('href') || tab.dataset.target || '';
    return href === `#${tabId}`;
  };
  desktopTabs.find(match)?.classList.add('active');
  offcanvasTabs.find(match)?.classList.add('active');

  // Si on passe vers trajets, rafraîchir la liste véhicules côté trajets si utile
  if (tabId === 'user-trajects-form') {
    loadVehicles();
    renderVehicleList();
    if (typeof populateVehiclesSelect === 'function') {
      populateVehiclesSelect();
    }
  }
}
window.switchToTab = switchToTab;

// -------------------- Formulaire Rôle --------------------
function initRoleForm() {
  const roleRadios = document.querySelectorAll('input[name="role"]');
  if (!roleRadios.length) return;

  const plate = document.getElementById("plate");
  const registrationDate = document.getElementById("registration-date");
  const vehicleModel = document.getElementById("vehicle-model");
  const seats = document.getElementById("seats");
  const preferences = document.querySelectorAll('input[name="preferences"]');
  const other = document.getElementById("other");

  function toggleVehicleFields() {
    const selected = document.querySelector('input[name="role"]:checked');
    if (!selected) return;

    const isPassager = selected.value === "passager";

    [plate, registrationDate, vehicleModel, seats, other].forEach((field) => {
      if (field) field.disabled = isPassager;
    });

    preferences.forEach((chk) => {
      chk.disabled = isPassager;
    });
  }

  roleRadios.forEach((radio) => {
    radio.addEventListener("change", toggleVehicleFields);
  });

  toggleVehicleFields();
}

// -------------------- Gestion des véhicules --------------------
function initVehicleManagement() {
  renderVehicleList();
  bindVehiclesFormHandlers();
}

function bindVehiclesFormHandlers() {
  const form = document.querySelector('#user-vehicles-form #create-vehicle-form');
  const plateInput = form?.querySelector('#plate');
  if (!form || !plateInput) {
    console.warn('Formulaire véhicules introuvable (bind)');
    return;
  }

  const saveBtn = document.querySelector('#vehicle-save-btn');

  // Enter dans le form → clique sur Enregistrer
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (saveBtn) saveBtn.click();
    }
  }, true);

  // Format plaque en saisie
  plateInput.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    value = value.slice(0, 7);
    let cleaned = "";
    for (let i = 0; i < value.length; i++) {
      if ((i < 2 || i > 4) && /[A-Z]/.test(value[i])) cleaned += value[i];
      else if (i >= 2 && i <= 4 && /[0-9]/.test(value[i])) cleaned += value[i];
    }
    let formatted = "";
    if (cleaned.length > 0) formatted += cleaned.slice(0, 2);
    if (cleaned.length > 2) formatted += " - " + cleaned.slice(2, 5);
    if (cleaned.length > 5) formatted += " - " + cleaned.slice(5, 7);
    e.target.value = formatted;
  });

  // Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Bloquer les onglets pendant le traitement
    document.body.dataset.lockTab = '1';

    try {
      loadVehicles();

      const editIdxAttr = form.dataset.editIndex;
      const editIdx = editIdxAttr !== undefined ? parseInt(editIdxAttr, 10) : null;

      const plate = form.querySelector('#plate').value.trim();
      const regex = /^[A-Z]{2} - \d{3} - [A-Z]{2}$/;
      if (!regex.test(plate)) {
        alert("⚠️ La plaque doit être au format : AB - 123 - CD");
        return;
      }

      let registrationDate = form.querySelector('#registration-date').value.trim();
      if (registrationDate.includes('/')) registrationDate = convertFRtoISO(registrationDate);

      const vehicleData = {
        id: plate,
        plate,
        registrationDate,
        marque: form.querySelector('#vehicle-marque').value.trim(),
        model: form.querySelector('#vehicle-model').value.trim(),
        color: form.querySelector('#vehicle-color').value.trim(),
        type: form.querySelector('#vehicleType').value.trim(),
        seats: form.querySelector('#seats').value.trim(),
        preferences: Array.from(form.querySelectorAll('input[name="preferences"]:checked')).map(el => el.value),
        other: form.querySelector('#other').value.trim(),
      };

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

      // >>> Scroll vers "Mes véhicules enregistrés"
    const usedForm = document.querySelector('#used-vehicles-form');
    const usedTitle = usedForm?.querySelector('.title-my-used-vehicles h2'); // "Mes véhicules enregistrés"
    (usedTitle || usedForm)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('❌ Erreur submit véhicules', err);
    } finally {
      delete document.body.dataset.lockTab;
    }
  });
}

function renderVehicleList() {
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
          <label for="vehicleType">Type de véhicule</label>
          <select id="vehicleType" name="vehicleType" class="form-input">
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

  const listDiv = container.querySelector('#vehicleList');
  listDiv.innerHTML = "";

  const stored = localStorage.getItem('ecoride_vehicles');
  const vehiclesLocal = stored ? JSON.parse(stored) : [];

  if (vehiclesLocal.length === 0) {
    listDiv.innerHTML = "<p>Aucun véhicule enregistré.</p>";
  } else {
    vehiclesLocal.forEach((v, index) => {
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
      listDiv.appendChild(vehicleContainer);
    });
  }

  // Bouton submit: hardening
  const saveBtn = container.querySelector('#vehicle-save-btn');
  if (saveBtn) {
    saveBtn.removeAttribute('data-bs-toggle');
    saveBtn.removeAttribute('data-bs-target');
    saveBtn.removeAttribute('href');
    saveBtn.addEventListener('click', (ev) => ev.stopPropagation());
  }
}

function updateVehicleListOnly() {
  const listDiv = document.querySelector('#vehicleList');
  if (!listDiv) return;

  listDiv.innerHTML = "";

  const stored = localStorage.getItem('ecoride_vehicles');
  const vehiclesLocal = stored ? JSON.parse(stored) : [];

  if (vehiclesLocal.length === 0) {
    listDiv.innerHTML = "<p>Aucun véhicule enregistré.</p>";
  } else {
    vehiclesLocal.forEach((v, index) => {
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
      listDiv.appendChild(vehicleContainer);
    });
  }
}

function showVehicleModal(vehicle) {
  let modal = document.getElementById('vehicleDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vehicleDetailModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
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

  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

function injectDeleteModal() {
  if (document.getElementById('deleteModal')) return;

  const modalHTML = `
    <div class="modal fade" id="deleteModal" tabindex="-1" aria-labelledby="deleteModalLabel">
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

    form.querySelector('#plate').value = vehicle.plate || '';
    form.querySelector('#registration-date').value = formatDateForInput(vehicle.registrationDate);
    form.querySelector('#vehicle-marque').value = vehicle.marque || '';
    form.querySelector('#vehicle-model').value = vehicle.model || '';
    form.querySelector('#vehicle-color').value = vehicle.color || '';
    form.querySelector('#vehicleType').value = vehicle.type || '';
    form.querySelector('#seats').value = vehicle.seats || '';
    form.querySelector('#other').value = vehicle.other || '';

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

function handleDeleteClick(target) {
  const vehicleElements = Array.from(document.querySelectorAll('#vehicleList .vehicle-container'));
  vehicleToDeleteIndex = vehicleElements.findIndex(vc => vc.contains(target));

  if (vehicleToDeleteIndex === -1) {
    console.error("Véhicule à supprimer non trouvé");
    return;
  }

  const deleteModalEl = document.getElementById('deleteModal');
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  deleteModal.show();
}

function handleConfirmDelete() {
  if (vehicleToDeleteIndex !== null && vehicleToDeleteIndex >= 0) {
    vehicles.splice(vehicleToDeleteIndex, 1);
    saveVehicles();
    vehicleToDeleteIndex = null;

    updateVehicleListOnly();

    const deleteModalEl = document.getElementById('deleteModal');
    if (!deleteModalEl) {
      console.error('Modal deleteModal introuvable');
      return;
    }

    let bsModal = bootstrap.Modal.getInstance(deleteModalEl);
    if (!bsModal) {
      bsModal = new bootstrap.Modal(deleteModalEl);
    }

    bsModal.hide();

    deleteModalEl.addEventListener('hidden.bs.modal', () => {
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    }, { once: true });
  }
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

// -------------------- Lancement --------------------
document.addEventListener('pageContentLoaded', () => {
  const pathname = window.location.pathname.replace(/\/$/, "");
  if (pathname === "/espace-utilisateur") {
    initUserSpace();

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "trajets") {
      setTimeout(() => {
        const desktopTab = document.querySelector('.user-tabs .nav-link[data-tab="trajets"]');
        if (desktopTab) desktopTab.click();
        const offcanvasTab = document.querySelector('.user-tabs-offcanvas .nav-link[data-tab="trajets"]');
        if (offcanvasTab) offcanvasTab.click();
        const target = document.getElementById("trajets-en-cours");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 500);
    }
  }
});