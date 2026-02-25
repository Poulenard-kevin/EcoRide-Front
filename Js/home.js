document.getElementById('btnRechercheAccueil').addEventListener('click', () => {
  const depart = document.getElementById('inputDepartAccueil').value.trim();
  const arrivee = document.getElementById('inputArriveeAccueil').value.trim();

  if (!depart && !arrivee) {
    alert('Veuillez saisir au moins un lieu de départ ou d\'arrivée.');
    return;
  }

  // Vérifie si l'utilisateur est connecté via l'attribut data sur <body>
  const isConnected = document.body.dataset.userConnected === 'true';

  if (!isConnected) {
    if (confirm("Vous devez être connecté pour rechercher un trajet. Voulez-vous vous connecter ou vous inscrire ?")) {
      window.location.href = '/login'; // ou '/register' selon ton choix
    }
    return; // stoppe la redirection vers /covoiturage
  }

  // Construction de l'URL avec le paramètre "from=home"
  const params = new URLSearchParams({ from: 'home' });
  if (depart) params.set('depart', encodeURIComponent(depart));
  if (arrivee) params.set('arrivee', encodeURIComponent(arrivee));

  window.location.href = `/covoiturage?${params.toString()}`;
});