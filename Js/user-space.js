// Fonction pour charger les fichiers HTML dans les conteneurs
const loadHTML = async (id, filePath) => {
  const container = document.getElementById(id);
  if (!container) {
    console.error(`❌ Conteneur introuvable pour l'ID : ${id}`);
    return;
  }

  try {
    console.log(`🔄 Chargement de ${filePath}...`);
    const response = await fetch(filePath);
    
    if (response.ok) {
      const html = await response.text();
      container.innerHTML = html;
      console.log(`✅ Contenu chargé pour ${id} depuis ${filePath}`);
    } else {
      console.error(`❌ Erreur ${response.status} lors du chargement de ${filePath}`);
      container.innerHTML = `<p>Erreur de chargement du contenu (${response.status})</p>`;
    }
  } catch (error) {
    console.error(`❌ Erreur lors du chargement de ${filePath}:`, error);
    container.innerHTML = `<p>Erreur de chargement du contenu</p>`;
  }
};

// Fonction principale d'initialisation de l'espace utilisateur
function initUserSpace() {
  console.log("🚀 Initialisation de l'espace utilisateur...");
  
  const userSpaceSection = document.querySelector(".user-space-section");
  if (!userSpaceSection) {
    console.error("❌ .user-space-section introuvable dans le DOM.");
    return;
  }

  // Sélection des éléments
  const desktopTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs .nav-link");
  const offcanvasTabs = userSpaceSection.querySelectorAll(".nav-pills.user-tabs-offcanvas .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");
  const offcanvas = document.getElementById("userSpaceOffcanvas");

  console.log(`📋 Trouvé ${desktopTabs.length} onglets desktop, ${offcanvasTabs.length} onglets offcanvas, ${forms.length} formulaires`);

  // Fonction pour synchroniser les onglets actifs et afficher le bon formulaire
  const syncActiveClass = (index) => {
    console.log(`🔄 Activation de l'onglet ${index}`);
    
    // Retirer toutes les classes actives
    desktopTabs.forEach((tab) => tab.classList.remove("active"));
    offcanvasTabs.forEach((tab) => tab.classList.remove("active"));
    
    // Cacher tous les formulaires
    forms.forEach((form) => {
      form.style.display = "none";
      form.classList.remove("active");
    });

    // Activer l'onglet et le formulaire correspondants
    if (desktopTabs[index]) desktopTabs[index].classList.add("active");
    if (offcanvasTabs[index]) offcanvasTabs[index].classList.add("active");
    if (forms[index]) {
      forms[index].style.display = "block";
      forms[index].classList.add("active");
    }

    // Fermer l'offcanvas si ouvert
    if (offcanvas && offcanvas.classList.contains("show")) {
      const bootstrapOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
      if (bootstrapOffcanvas) {
        bootstrapOffcanvas.hide();
      }
    }
  };

  // Attacher les événements aux onglets desktop
  desktopTabs.forEach((tab, index) => {
    // Supprimer les anciens événements
    tab.onclick = null;
    
    // Ajouter le nouvel événement
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      console.log(`🖱️ Clic sur onglet desktop ${index}`);
      syncActiveClass(index);
    });
  });

  // Attacher les événements aux onglets offcanvas
  offcanvasTabs.forEach((tab, index) => {
    // Supprimer les anciens événements
    tab.onclick = null;
    
    // Ajouter le nouvel événement
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      console.log(`🖱️ Clic sur onglet offcanvas ${index}`);
      syncActiveClass(index);
    });
  });

  // Charger les contenus HTML des formulaires
  loadHTMLContent();
  
  // Initialiser le formulaire de rôle après un petit délai
  setTimeout(() => {
    initRoleForm();
  }, 500);

  console.log("✅ Espace utilisateur initialisé avec succès");
}

// Fonction pour charger tous les contenus HTML
async function loadHTMLContent() {
  console.log("📂 Chargement des contenus HTML...");
  
  // Charger les fichiers HTML pour chaque onglet (sans le / au début)
  await Promise.all([
    loadHTML("user-profile-form", "pages/user-profile-form.html"),
    loadHTML("user-trajects-form", "pages/user-trajects-form.html"),
    loadHTML("user-vehicles-form", "pages/user-vehicles-form.html"),
    loadHTML("user-history-form", "pages/user-history-form.html")
  ]);
  
  console.log("📂 Chargement des contenus terminé");
}

// Fonction pour initialiser le formulaire de rôle
function initRoleForm() {
  console.log("🔧 Initialisation du formulaire de rôle...");
  
  const roleRadios = document.querySelectorAll('input[name="role"]');
  if (!roleRadios.length) {
    console.log("ℹ️ Aucun radio button de rôle trouvé");
    return;
  }

  // Champs véhicule
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
    console.log(`🔄 Rôle sélectionné: ${selected.value}, désactiver champs: ${isPassager}`);

    // Désactiver/activer champs voiture
    [plate, registrationDate, vehicleModel, seats, other].forEach((field) => {
      if (field) {
        field.disabled = isPassager;
        if (isPassager) {
          field.style.opacity = "0.5";
        } else {
          field.style.opacity = "1";
        }
      }
    });

    // Désactiver/activer checkboxes préférences
    preferences.forEach((chk) => {
      chk.disabled = isPassager;
      if (chk.parentElement) {
        if (isPassager) {
          chk.parentElement.style.opacity = "0.5";
        } else {
          chk.parentElement.style.opacity = "1";
        }
      }
    });
  }

  // Attacher les événements aux radios
  roleRadios.forEach((radio) => {
    radio.addEventListener("change", toggleVehicleFields);
  });

  // Appliquer l'état initial
  toggleVehicleFields();
  
  console.log("✅ Formulaire de rôle initialisé");
}

// Exposer la fonction globalement
window.initUserSpace = initUserSpace;

// Écouter l'événement de route chargée (uniquement si on est sur la bonne page)
document.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM chargé, vérification de la route...");
  
  // Si on est déjà sur la page espace utilisateur au chargement
  if (window.location.pathname === "/espace-utilisateur") {
    console.log("🎯 Page espace utilisateur détectée au chargement");
    setTimeout(() => {
      initUserSpace();
    }, 100);
  }
});