// -------------------- Variables globales --------------------
let editingVehicleIndex = null;
let vehicleToDeleteIndex = null;
const vehicles = [];

// -------------------- Helpers --------------------
function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

// -------------------- Import --------------------
import { initTrajets } from '../Js/trajets.js';

// -------------------- Initialisation principale --------------------
export async function initUserSpace() {
  console.log("🚀 Initialisation de l'espace utilisateur...");

  // 🔄 Migration des anciennes clés localStorage
  const oldVehicules = localStorage.getItem('ecoride_vehicules');
  if (oldVehicules) {
    localStorage.setItem('ecoride_vehicles', oldVehicules);
    localStorage.removeItem('ecoride_vehicules');
    console.log("🔄 Migration effectuée : ecoride_vehicules ➝ ecoride_vehicles");
  }

  const userSpaceSection = document.querySelector(".user-space-section");
  if (!userSpaceSection) {
    console.error("❌ .user-space-section introuvable dans le DOM.");
    return;
  }

  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  // Synchroniser onglets et affichage
  const syncActiveClass = (index) => {
    desktopTabs.forEach((tab) => tab.classList.remove("active"));
    offcanvasTabs.forEach((tab) => tab.classList.remove("active"));
    forms.forEach((form) => (form.style.display = "none"));

    if (desktopTabs[index]) desktopTabs[index].classList.add("active");
    if (offcanvasTabs[index]) offcanvasTabs[index].classList.add("active");
    if (forms[index]) forms[index].style.display = "block";

    if (offcanvas && offcanvas.classList.contains("show")) {
      const bootstrapOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
      if (bootstrapOffcanvas) bootstrapOffcanvas.hide();
    }
  };

  desktopTabs.forEach((tab, index) => {
    tab.onclick = (e) => {
      e.preventDefault();
      syncActiveClass(index);
    };
  });

  offcanvasTabs.forEach((tab, index) => {
    tab.onclick = (e) => {
      e.preventDefault();
      syncActiveClass(index);
    };
  });

  await loadHTMLContent();

  setTimeout(() => initRoleForm(), 500);

  initVehicleManagement();

  injectDeleteModal();

  // =================== ⚡ Gestion placeholder Date / Time ===================
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => {
      if (!input.value) {
        input.classList.add('empty');
      } else {
        input.classList.remove('empty');
      }
    };
    toggleClass(); // au chargement
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });

  // Initialiser les trajets
  console.log("initUserSpace start");
  setTimeout(() => {
    initTrajets();
  }, 100); // petit délai pour laisser le DOM s'injecter
  console.log("initUserSpace end");

  console.log("✅ Espace utilisateur initialisé");

  renderVehicleList();
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
    if (response.ok) {
      const html = await response.text();
      container.innerHTML = html;
      console.log(`✅ Contenu chargé pour ${id}`);
    } else {
      console.error(`❌ Erreur de statut pour ${filePath}:`, response.status);
    }
  } catch (err) {
    console.error(`❌ Erreur de chargement de ${filePath}:`, err);
  }
}

// -------------------- Gestion du formulaire rôle --------------------
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

// -------------------- Fonctions utilitaires --------------------

// ⚡ Conversion jj/mm/aaaa → yyyy-mm-dd
function convertFRtoISO(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// -------------------- Gestion des véhicules --------------------
function initVehicleManagement() {
  const profileForm = document.querySelector('#user-profile-form form');
  const vehicleListContainer = document.getElementById('user-vehicles-form');
  const plateInput = document.getElementById("plate");

  if (!profileForm || !vehicleListContainer || !plateInput) {
    console.warn('Formulaire profil ou conteneur véhicules introuvable');
    return;
  }

  // ⚡ Formatage automatique de la plaque
  plateInput.addEventListener("input", (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Limiter à 7 caractères utiles (AB123CD)
    value = value.slice(0, 7);

    // Ajouter format AB - 123 - CD
    let cleaned = "";
      for (let i = 0; i < value.length; i++) {
        if ((i < 2 || i > 4) && /[A-Z]/.test(value[i])) {
          cleaned += value[i]; // Lettres aux positions 0-1 et 5-6
        } else if (i >= 2 && i <= 4 && /[0-9]/.test(value[i])) {
          cleaned += value[i]; // Chiffres aux positions 2-4
        }
      }
    let formatted = "";
    if (cleaned.length > 0) formatted += cleaned.slice(0, 2);
    if (cleaned.length > 2) formatted += " - " + cleaned.slice(2, 5);
    if (cleaned.length > 5) formatted += " - " + cleaned.slice(5, 7);

    e.target.value = formatted;
  });

  renderVehicleList()

  // ⚡ Validation + sauvegarde
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
  
    console.log('editingVehicleIndex au submit:', editingVehicleIndex);
  
    const plate = profileForm.querySelector('#plate').value.trim();
    
    // ⚡ Validation format de plaque
    const regex = /^[A-Z]{2} - \d{3} - [A-Z]{2}$/;
    if (!regex.test(plate)) {
      alert("⚠️ La plaque doit être au format : AB - 123 - CD");
      return;
    }
  
    // ⚡ Récupération de la date
    let registrationDate = profileForm.querySelector('#registration-date').value.trim();
  
    // Si l’utilisateur saisit en jj/mm/aaaa → on convertit en YYYY-MM-DD
    if (registrationDate.includes("/")) {
      registrationDate = convertFRtoISO(registrationDate);
    }
  
    const marque = profileForm.querySelector('#vehicle-marque').value.trim();
    const model = profileForm.querySelector('#vehicle-model').value.trim();
    const color = profileForm.querySelector('#vehicle-color').value.trim();
    const type = profileForm.querySelector('#vehicleType').value.trim();
    const seats = profileForm.querySelector('#seats').value.trim();
    const preferences = Array.from(profileForm.querySelectorAll('input[name="preferences"]:checked')).map(el => el.value);
    const other = profileForm.querySelector('#other').value.trim();
  
    if (!model) {
      alert('Le modèle est obligatoire');
      return;
    }
  
    const vehicleData = {
      id: plate,       // 🔑 La plaque comme ID unique
      plate,
      registrationDate,   // ✅ toujours en YYYY-MM-DD
      marque,
      model,
      color,
      type,
      seats,
      preferences,
      other
    };
  
    if (editingVehicleIndex !== null) {
      vehicles[editingVehicleIndex] = vehicleData;
      editingVehicleIndex = null;
    } else {
      vehicles.push(vehicleData);
    }
  
    saveVehicles();
    profileForm.reset();
    renderVehicleList();
    switchToTab('user-vehicles-form');
  });

  renderVehicleList();
}

function renderVehicleList() {
  const container = document.getElementById('user-vehicles-form');
  if (!container) return;

  container.innerHTML = `
    <h1>Mes véhicules</h1>
    <form>
      <div class="form-fields">
        <div class="title-my-used-vehicles">
          <h2>Mes véhicules utilisés</h2>
        </div>
        <div id="vehicleList"></div>
        <div class="btn-add-vehicle">
          <button type="button" class="btn" id="addVehicleBtn">Ajouter un véhicule</button>
        </div>
      </div>
    </form>
  `;

  const listDiv = container.querySelector('#vehicleList');
  listDiv.innerHTML = "";

  // 🔥 On recharge direct depuis localStorage (fiable)
  const stored = localStorage.getItem('ecoride_vehicles');
  const vehiclesLocal = stored ? JSON.parse(stored) : [];

  console.log("📋 Véhicules trouvés pour l'affichage :", vehiclesLocal);

  if (vehiclesLocal.length === 0) {
    listDiv.innerHTML = "<p>Aucun véhicule enregistré.</p>";
    return;
  }

  vehiclesLocal.forEach((v, index) => {
    const vehicleContainer = document.createElement('div');
    vehicleContainer.className = 'vehicle-container';

    const vehicleLine = document.createElement('div');
    vehicleLine.className = 'form-field vehicle-label';
    vehicleLine.style.cursor = 'pointer';
    vehicleLine.textContent = getVehicleLabel(v);

    vehicleLine.addEventListener('click', () => {
      showVehicleModal(v);
    });

    const actionDiv = document.createElement('div');
    actionDiv.className = 'form-field-modify-delete';
    actionDiv.innerHTML = `
      <a href="javascript:void(0);" class="link-modify" data-index="${index}">Modifier</a>
      <a href="#" class="link-delete" data-bs-toggle="modal" data-bs-target="#deleteModal">Supprimer</a>
    `;

    vehicleContainer.appendChild(vehicleLine);
    vehicleContainer.appendChild(actionDiv);
    listDiv.appendChild(vehicleContainer);
  });
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

// -------------------- Gestion des événements globaux --------------------

// ⚡ Fonction utilitaire pour formater les dates dans input[type="date"]
function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0]; // 👉 retourne YYYY-MM-DD
}

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
  if (isNaN(index) || !vehicles[index]) {
    console.error('Véhicule à modifier introuvable');
    return;
  }

  editingVehicleIndex = index;
  const vehicle = vehicles[index];

  switchToTab('user-profile-form');

  const profileForm = document.querySelector('#user-profile-form form');
  if (!profileForm) {
    console.error('Formulaire Profil / Rôle introuvable');
    return;
  }

  profileForm.querySelector('#plate').value = vehicle.plate || '';
  profileForm.querySelector('#registration-date').value = formatDateForInput(vehicle.registrationDate);
  profileForm.querySelector('#vehicle-marque').value = vehicle.marque || '';
  profileForm.querySelector('#vehicle-model').value = vehicle.model || '';
  profileForm.querySelector('#vehicle-color').value = vehicle.color || '';
  profileForm.querySelector('#vehicleType').value = vehicle.type || '';  
  profileForm.querySelector('#seats').value = vehicle.seats || '';
  profileForm.querySelector('#other').value = vehicle.other || '';

  const preferencesInputs = profileForm.querySelectorAll('input[name="preferences"]');
  preferencesInputs.forEach(input => {
    input.checked = vehicle.preferences && vehicle.preferences.includes(input.value);
  });

  const roleConducteur = profileForm.querySelector('input[name="role"][value="conducteur"]');
  if (roleConducteur) roleConducteur.checked = true;

  initRoleForm();
}

function handleAddClick() {
  editingVehicleIndex = null;
  const profileForm = document.querySelector('#user-profile-form form');
  if (profileForm) profileForm.reset();
  switchToTab('user-profile-form');
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

    // ✅ Sauvegarde persistante
    saveVehicles();
    
    vehicleToDeleteIndex = null;
    renderVehicleList();

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

// -------------------- Changement d'onglet --------------------
function switchToTab(tabId) {
  const userSpaceSection = document.querySelector('.user-space-section');
  if (!userSpaceSection) return;

  const desktopTabs = userSpaceSection.querySelectorAll('.nav-pills.user-tabs .nav-link');
  const offcanvasTabs = userSpaceSection.querySelectorAll('.nav-pills.user-tabs-offcanvas .nav-link');
  const forms = userSpaceSection.querySelectorAll('.user-space-form');

  // Cacher tous les formulaires
  forms.forEach(form => form.style.display = 'none');

  // Désactiver tous les onglets
  desktopTabs.forEach(tab => tab.classList.remove('active'));
  offcanvasTabs.forEach(tab => tab.classList.remove('active'));

  // Afficher le formulaire ciblé
  const targetForm = document.getElementById(tabId);
  if (targetForm) targetForm.style.display = 'block';

  // Fonction pour activer l'onglet correspondant
  function activateTab(tabs) {
    tabs.forEach(tab => {
      // Récupérer l'attribut href ou data-target (selon ta structure)
      const href = tab.getAttribute('href') || tab.dataset.target || '';
      if (href === `#${tabId}`) {
        tab.classList.add('active');
      }
    });
  }

  activateTab(desktopTabs);
  activateTab(offcanvasTabs);
}

// -------------------- Persistance véhicules --------------------
function saveVehicles() {
  try {
    localStorage.setItem('ecoride_vehicles', JSON.stringify(vehicles));
    console.log("💾 Véhicules sauvegardés:", vehicles.length);

    // ⚡ Mise à jour immédiate du datalist côté trajets
    if (typeof populateVehicles === 'function') {
      populateVehicles();
    }

  } catch (err) {
    console.error("❌ Erreur sauvegarde véhicules:", err);
  }
}

// -------------------- Lancement --------------------
document.addEventListener('pageContentLoaded', () => {
  const pathname = window.location.pathname;
  const cleanPathname = pathname.replace(/\/$/, "");

  if (cleanPathname === "/espace-utilisateur") {
    initUserSpace();

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");

    if (tab === "trajets") {
      // On attend que le DOM soit prêt avec les onglets
      setTimeout(() => {
        // 👉 Clique sur l’onglet desktop
        const desktopTab = document.querySelector('.user-tabs .nav-link[data-tab="trajets"]');
        if (desktopTab) {
          desktopTab.click();
        }
      
        // 👉 Clique aussi sur l’onglet offcanvas (si jamais affiché)
        const offcanvasTab = document.querySelector('.user-tabs-offcanvas .nav-link[data-tab="trajets"]');
        if (offcanvasTab) {
          offcanvasTab.click();
        }
      
        // 👉 Ensuite scroll sur la section "Mes trajets en cours"
        const target = document.getElementById("trajets-en-cours");
        if (target) {
          console.log("🟢 Scroll vers 'Mes trajets en cours'");
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 500); // mets 500ms si 300 était trop court
    }
  }
});

