// -------------------------------------------------
// Fonction principale d'initialisation de l'espace utilisateur
// -------------------------------------------------
async function initUserSpace() {
  console.log("🚀 Initialisation de l'espace utilisateur...");

  const userSpaceSection = document.querySelector(".user-space-section");
  if (!userSpaceSection) {
    console.error("❌ .user-space-section introuvable dans le DOM.");
    return;
  }

  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  // Fonction interne pour synchroniser les onglets/interface
  const syncActiveClass = (index) => {
    desktopTabs.forEach((tab) => tab.classList.remove("active"));
    offcanvasTabs.forEach((tab) => tab.classList.remove("active"));
    forms.forEach((form) => (form.style.display = "none"));

    if (desktopTabs[index]) desktopTabs[index].classList.add("active");
    if (offcanvasTabs[index]) offcanvasTabs[index].classList.add("active");
    if (forms[index]) forms[index].style.display = "block";

    // Fermer l'offcanvas si ouvert
    if (offcanvas && offcanvas.classList.contains("show")) {
      const bootstrapOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
      if (bootstrapOffcanvas) bootstrapOffcanvas.hide();
    }
  };

  // Attacher les événements
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

  // Charger le contenu des vues partielles (attendre la fin)
  await loadHTMLContent();

  // Init formulaire de rôle après petit délai
  setTimeout(() => initRoleForm(), 500);

  // Initialiser la gestion des véhicules après chargement des contenus
  initVehicleManagement();

  console.log("✅ Espace utilisateur initialisé");
}

// -------------------------------------------------
// Charger les fichiers HTML dynamiques
// -------------------------------------------------
async function loadHTMLContent() {
  await Promise.all([
    loadHTML("user-profile-form", "pages/user-profile-form.html"),
    loadHTML("user-trajects-form", "pages/user-trajects-form.html"),
    loadHTML("user-vehicles-form", "pages/user-vehicles-form.html"),
    loadHTML("user-history-form", "pages/user-history-form.html")
  ]);
}

// -------------------------------------------------
// Charger un fichier HTML dans un conteneur
// -------------------------------------------------
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

// -------------------------------------------------
// Initialiser le formulaire du rôle
// -------------------------------------------------
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

// -------------------------------------------------
// Gestion des véhicules
// -------------------------------------------------
const vehicles = [];

function switchToTab(tabId) {
  const userSpaceSection = document.querySelector('.user-space-section');
  if (!userSpaceSection) return;

  const desktopTabs = userSpaceSection.querySelectorAll('.nav-pills.user-tabs .nav-link');
  const offcanvasTabs = userSpaceSection.querySelectorAll('.nav-pills.user-tabs-offcanvas .nav-link');
  const forms = userSpaceSection.querySelectorAll('.user-space-form');

  // Masquer tous les formulaires
  forms.forEach(form => form.style.display = 'none');

  // Retirer la classe active de tous les onglets
  desktopTabs.forEach(tab => tab.classList.remove('active'));
  offcanvasTabs.forEach(tab => tab.classList.remove('active'));

  // Afficher le formulaire ciblé
  const targetForm = document.getElementById(tabId);
  if (targetForm) targetForm.style.display = 'block';

  // Activer l’onglet correspondant (desktop)
  desktopTabs.forEach(tab => {
    if (tab.textContent.trim().toLowerCase().includes('véhicules') && tabId === 'user-vehicles-form') {
      tab.classList.add('active');
    }
    // Ajoute d’autres conditions si besoin pour d’autres onglets
  });

  // Activer l’onglet correspondant (offcanvas)
  offcanvasTabs.forEach(tab => {
    if (tab.textContent.trim().toLowerCase().includes('véhicules') && tabId === 'user-vehicles-form') {
      tab.classList.add('active');
    }
    // Ajoute d’autres conditions si besoin pour d’autres onglets
  });
}

function injectDeleteModal() {
  if (document.getElementById('deleteModal')) return; // Évite les doublons

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

// Appelle cette fonction au chargement de la page ou dans initUserSpace
injectDeleteModal();

function initVehicleManagement() {
  const profileForm = document.querySelector('#user-profile-form form');
  const vehicleListContainer = document.getElementById('user-vehicles-form');

  if (!profileForm || !vehicleListContainer) {
    console.warn('Formulaire profil ou conteneur véhicules introuvable');
    return;
  }

  let editingVehicleIndex = null;

  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
  
    // Récupération des valeurs comme avant
    const plate = profileForm.querySelector('#plate').value.trim();
    const registrationDate = profileForm.querySelector('#registration-date').value.trim();
    const vehicleModelRaw = profileForm.querySelector('#vehicle-model').value.trim();
    const parts = vehicleModelRaw.split(',').map(s => s.trim());
    const brand = parts[0] || '';
    const model = parts[1] || '';
    const color = parts[2] || '';
    const seats = profileForm.querySelector('#seats').value.trim();
    const preferences = Array.from(profileForm.querySelectorAll('input[name="preferences"]:checked')).map(el => el.value);
    const other = profileForm.querySelector('#other').value.trim();
  
    if (!model) {
      alert('Le modèle est obligatoire');
      return;
    }
  
    const vehicleData = {
      plate,
      registrationDate,
      brand,
      vehicleModel: model,
      color,
      seats,
      preferences,
      other
    };
  
    if (editingVehicleIndex !== null) {
      // Modification d’un véhicule existant
      vehicles[editingVehicleIndex] = vehicleData;
      editingVehicleIndex = null; // reset
    } else {
      // Ajout d’un nouveau véhicule
      vehicles.push(vehicleData);
    }
  
    profileForm.reset();
    renderVehicleList();
    switchToTab('user-vehicles-form');
  });

  let vehicleToDeleteIndex = null;

// Délégation d'événement pour ouvrir la modal suppression
document.addEventListener('click', function(event) {
  if (event.target.matches('.link-delete')) {
    event.preventDefault();

    // Trouver l'index du véhicule à supprimer
    const vehicleElements = Array.from(document.querySelectorAll('#vehicleList .vehicle-container'));
    vehicleToDeleteIndex = vehicleElements.findIndex(vc => vc.contains(event.target));

    if (vehicleToDeleteIndex === -1) {
      console.error("Véhicule à supprimer non trouvé");
      return;
    }

    const deleteModalEl = document.getElementById('deleteModal');
    const deleteModal = new bootstrap.Modal(deleteModalEl);
    deleteModal.show();
  }
});

// Gestion du clic sur le bouton "Modifier"
document.body.addEventListener('click', function(event) {
  if (event.target.classList.contains('link-modify')) {
    event.preventDefault();

    const index = parseInt(event.target.getAttribute('data-index'), 10);
    if (isNaN(index) || !vehicles[index]) {
      console.error('Véhicule à modifier introuvable');
      return;
    }

    editingVehicleIndex = index;

    const vehicle = vehicles[index];

    // Affiche la section Profil / Rôle
    switchToTab('user-profile-form');

    // Pré-remplit le formulaire Profil / Rôle
    const profileForm = document.querySelector('#user-profile-form form');
    if (!profileForm) {
      console.error('Formulaire Profil / Rôle introuvable');
      return;
    }

    profileForm.querySelector('#plate').value = vehicle.plate || '';
    profileForm.querySelector('#registration-date').value = vehicle.registrationDate || '';
    profileForm.querySelector('#vehicle-model').value = `${vehicle.brand}, ${vehicle.vehicleModel}, ${vehicle.color}`.trim();
    profileForm.querySelector('#seats').value = vehicle.seats || '';
    profileForm.querySelector('#other').value = vehicle.other || '';

    // Pré-cocher les préférences
    const preferencesInputs = profileForm.querySelectorAll('input[name="preferences"]');
    preferencesInputs.forEach(input => {
      input.checked = vehicle.preferences.includes(input.value);
    });

    // Sélectionne le rôle "conducteur" (car véhicule modifié)
    const roleConducteur = profileForm.querySelector('input[name="role"][value="conducteur"]');
    if (roleConducteur) roleConducteur.checked = true;

    // Active/désactive les champs selon le rôle
    initRoleForm();
  }
});

// --- Ajoute ici le gestionnaire pour le bouton "Ajouter un véhicule" ---
document.body.addEventListener('click', function(event) {
  if (event.target.id === 'addVehicleBtn') {
    editingVehicleIndex = null; // Réinitialise l'index pour un nouvel ajout
    const profileForm = document.querySelector('#user-profile-form form');
    if (profileForm) profileForm.reset(); // Vide le formulaire
    switchToTab('user-profile-form'); // Affiche l'onglet Profil / Rôle
  }
});


// Gestion du clic sur le bouton "Supprimer" dans la modal
document.body.addEventListener('click', function(event) {
  if (event.target.id === 'confirmDeleteBtn') {
    if (vehicleToDeleteIndex !== null && vehicleToDeleteIndex >= 0) {
      vehicles.splice(vehicleToDeleteIndex, 1);
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
        console.log('Modal fermée correctement');

        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
    }
  }
});

  function renderVehicleList() {
    const container = document.getElementById('user-vehicles-form');
    if (!container) return;
  
    container.innerHTML = `
      <h1>Mes véhicules</h1>
      <form>
        <div class="form-fields">
          <div class="title-my-used-vehicles">
            <h2>Mes véhicules utilisées</h2>
          </div>
          <div id="vehicleList"></div>
          <div class="btn-add-vehicle">
            <button type="submit" class="btn" id="addVehicleBtn">Ajouter un véhicule</button>
          </div>
        </div>
      </form>
    `;
  
    const listDiv = container.querySelector('#vehicleList');
  
    vehicles.forEach((v, index) => {
      const vehicleContainer = document.createElement('div');
      vehicleContainer.className = 'vehicle-container';
  
      // Ligne principale avec Marque, Modèle, Couleur uniquement
      const vehicleLine = document.createElement('div');
      vehicleLine.className = 'form-field';
      vehicleLine.style.cursor = 'pointer';
      vehicleLine.innerHTML = `
        <div class="brand">${v.brand}</div>
        <div class="model">${v.vehicleModel}</div>
        <div class="color">${v.color}</div>
      `;
  
      vehicleLine.addEventListener('click', () => {
        showVehicleModal(v);
      });
  
      // Ligne des actions Modifier / Supprimer
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
      <p><strong>Marque :</strong> ${vehicle.brand}</p>
      <p><strong>Modèle :</strong> ${vehicle.vehicleModel}</p>
      <p><strong>Couleur :</strong> ${vehicle.color}</p>
      <p><strong>Plaque :</strong> ${vehicle.plate}</p>
      <p><strong>Date d'immatriculation :</strong> ${vehicle.registrationDate}</p>
      <p><strong>Nombre de places :</strong> ${vehicle.seats}</p>
      <p><strong>Préférences :</strong> ${vehicle.preferences.join(', ')}</p>
      <p><strong>Autre :</strong> ${vehicle.other}</p>
    `;
  
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
}

// -------------------------------------------------
// Écouteur personnalisé pour lancer l'init après chargement du contenu
// -------------------------------------------------

document.addEventListener('pageContentLoaded', () => {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/espace-utilisateur") {
    initUserSpace();
  }
});
