document.getElementById('btnRechercheAccueil').addEventListener('click', () => {
  const depart = encodeURIComponent(document.getElementById('inputDepartAccueil').value.trim());
  const arrivee = encodeURIComponent(document.getElementById('inputArriveeAccueil').value.trim());

  if (depart && arrivee) {
    window.location.href = `/covoiturage?depart=${depart}&arrivee=${arrivee}`;
  } else {
    alert('Veuillez saisir un lieu de départ et un lieu d\'arrivée.');
  }
});