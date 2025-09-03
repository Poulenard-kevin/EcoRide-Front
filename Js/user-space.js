// Fonction pour gérer les onglets
function handleUserSpaceTabs() {
  // Sélectionne tous les onglets et les formulaires associés
  const tabs = document.querySelectorAll('.nav-item .nav-link');
  const forms = document.querySelectorAll('.user-space-form');

  // Ajoute un événement de clic à chaque onglet
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault(); // Empêche le comportement par défaut du lien

      // Supprime la classe "active" de tous les onglets et formulaires
      tabs.forEach((t) => t.classList.remove('active'));
      forms.forEach((form) => (form.style.display = 'none'));

      // Ajoute la classe "active" à l'onglet cliqué et affiche le formulaire correspondant
      tab.classList.add('active');
      forms[index].style.display = 'block';
    });
  });
}

// Exécute la fonction lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', handleUserSpaceTabs);