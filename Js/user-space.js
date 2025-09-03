// Exécute la fonction lorsque le DOM est chargé
document.addEventListener("DOMContentLoaded", () => {
  // Limite la sélection des onglets à ceux dans la section user-space
  const userSpaceSection = document.querySelector(".user-space-section");

  if (!userSpaceSection) {
    console.error("Erreur : .user-space-section introuvable dans le DOM.");
    return; // Arrête l'exécution si l'élément n'existe pas
  }

  const tabs = userSpaceSection.querySelectorAll(".nav-item .nav-link");
  const forms = userSpaceSection.querySelectorAll(".user-space-form");

  console.log("Onglets détectés :", tabs);
  console.log("Formulaires détectés :", forms);

  // Ajoute un événement de clic à chaque onglet
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault(); // Empêche le comportement par défaut du lien
      console.log(`Onglet cliqué : ${tab.textContent}`);

      // Supprime la classe "active" de tous les onglets et formulaires
      tabs.forEach((t) => t.classList.remove("active"));
      forms.forEach((form) => (form.style.display = "none"));

      // Ajoute la classe "active" à l'onglet cliqué et affiche le formulaire correspondant
      tab.classList.add("active");
      forms[index].style.display = "block";
    });
  });
});

// Écoute l'événement personnalisé "routeLoaded"
document.addEventListener("routeLoaded", (event) => {
  const path = window.location.pathname;

  // Vérifie si la route correspond à "/espace-utilisateur"
  if (path === "/espace-utilisateur") {
    // console.log("Page Espace utilisateur chargée.");

    // Limite la sélection des onglets à ceux dans la section user-space
    const userSpaceSection = document.querySelector(".user-space-section");

    if (!userSpaceSection) {
      console.error("Erreur : .user-space-section introuvable dans le DOM.");
      return; // Arrête l'exécution si l'élément n'existe pas
    }

    const tabs = userSpaceSection.querySelectorAll(".nav-item .nav-link");
    const forms = userSpaceSection.querySelectorAll(".user-space-form");

    // console.log("Onglets détectés :", tabs);
    // console.log("Formulaires détectés :", forms);

    // Ajoute un événement de clic à chaque onglet
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault(); // Empêche le comportement par défaut du lien
        // console.log(`Onglet cliqué : ${tab.textContent}`);

        // Supprime la classe "active" de tous les onglets et formulaires
        tabs.forEach((t) => t.classList.remove("active"));
        forms.forEach((form) => (form.style.display = "none"));

        // Ajoute la classe "active" à l'onglet cliqué et affiche le formulaire correspondant
        tab.classList.add("active");
        forms[index].style.display = "block";
      });
    });
  }
});