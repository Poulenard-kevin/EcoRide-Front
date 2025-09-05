// -------------------------------------------------
// Fonction principale d'initialisation de l'espace utilisateur
// -------------------------------------------------
function initUserSpace() {
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

  // Charger le contenu des vues partielles
  loadHTMLContent();

  // Init formulaire de rôle après petit délai
  setTimeout(() => initRoleForm(), 500);

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
// Ajout de la fonction globale : redirection vers Profil/Rôle
// -------------------------------------------------
window.redirectToProfileRole = function () {
  console.log("🔄 Redirection vers l’onglet Profil / Rôle…");

  const userSpaceSection = document.querySelector(".user-space-section");
  if (!userSpaceSection) {
    console.error("❌ Impossible de trouver .user-space-section");
    return;
  }

  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  if (desktopTabs.length > 0) {
    // Simule un clic sur l’onglet "Profil / Rôle" (index 0)
    desktopTabs[0].click();
  }
};

// -------------------------------------------------
// Écouteur route
// -------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname === "/espace-utilisateur") {
    setTimeout(() => initUserSpace(), 100);
  }
});
