function initUserSpace() {
  const userSpaceSection = document.querySelector(".user-space-section");

  if (!userSpaceSection) {
    console.error("Erreur : .user-space-section introuvable dans le DOM.");
    return;
  }

  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  // Supprime les événements précédents
  desktopTabs.forEach((tab) => tab.replaceWith(tab.cloneNode(true)));
  offcanvasTabs.forEach((tab) => tab.replaceWith(tab.cloneNode(true)));

  const newDesktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const newOffcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");

  // Fonction pour synchroniser les classes actives et afficher le formulaire correspondant
  const syncActiveClass = (index) => {
    // Supprime la classe active de tous les onglets
    newDesktopTabs.forEach((tab) => tab.classList.remove("active"));
    newOffcanvasTabs.forEach((tab) => tab.classList.remove("active"));

    // Ajoute la classe active au lien correspondant
    newDesktopTabs[index].classList.add("active");
    newOffcanvasTabs[index].classList.add("active");

    // Affiche le formulaire correspondant
    forms.forEach((form) => (form.style.display = "none"));
    forms[index].style.display = "block";

    // Ferme l'Offcanvas après avoir cliqué sur un onglet
    if (offcanvas.classList.contains("show")) {
      const bootstrapOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
      bootstrapOffcanvas.hide();
    }
  };

  newDesktopTabs.forEach((tab, index) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      syncActiveClass(index);
    });
  });

  newOffcanvasTabs.forEach((tab, index) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      syncActiveClass(index);
    });
  });

  // Réinitialise le bouton Offcanvas pour qu'il fonctionne après un changement d'état
  const offcanvasToggleButton = document.querySelector(".user-space-toggle");
  offcanvasToggleButton.addEventListener("click", () => {
    const bootstrapOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
    if (!bootstrapOffcanvas) {
      new bootstrap.Offcanvas(offcanvas).show();
    }
  });
}

// Écoute l'événement personnalisé "routeLoaded"
document.addEventListener("routeLoaded", (event) => {
  const path = window.location.pathname;

  if (path === "/espace-utilisateur") {
    console.log("Route espace utilisateur chargée.");
    initUserSpace(); // Réinitialise les événements pour les onglets et formulaires
    initRoleForm();
  }
});

// Initialise les événements au chargement initial
document.addEventListener("DOMContentLoaded", () => {
  initUserSpace();
  initRoleForm();
});

function initRoleForm() {
  const roleRadios = document.querySelectorAll('input[name="role"]');
  if (!roleRadios.length) return;

  // Champs véhicule
  const plate = document.getElementById("plate");
  const registrationDate = document.getElementById("registration-date");
  const vehicleModel = document.getElementById("vehicle-model");
  const seats = document.getElementById("seats");

  // Préférences chauffeur + Autre
  const preferences = document.querySelectorAll('input[name="preferences"]');
  const other = document.getElementById("other");

  function toggleVehicleFields() {
    const selected = document.querySelector('input[name="role"]:checked');
    if (!selected) return;

    const isPassager = selected.value === "passager";

    // Désactiver/activer champs voiture
    [plate, registrationDate, vehicleModel, seats, other].forEach(field => {
      if (field) field.disabled = isPassager;
    });

    // Désactiver/activer checkboxes préférences
    preferences.forEach(chk => {
      chk.disabled = isPassager;
    });
  }

  // Listeners radios
  roleRadios.forEach(radio => {
    radio.removeEventListener("change", toggleVehicleFields);
    radio.addEventListener("change", toggleVehicleFields);
  });

  // Premier état
  toggleVehicleFields();
}