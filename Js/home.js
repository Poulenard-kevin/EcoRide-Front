document.getElementById('btnRechercheAccueil').addEventListener('click', () => {
  const depart = document.getElementById('inputDepartAccueil').value.trim();
  const arrivee = document.getElementById('inputArriveeAccueil').value.trim();

  // ✅ Accepte si AU MOINS un champ est rempli
  if (!depart && !arrivee) {
    alert('Veuillez saisir au moins un lieu de départ ou d\'arrivée.');
    return;
  }

  // ✅ Construction de l'URL avec le paramètre "from=home"
  const params = new URLSearchParams({ from: 'home' });
  if (depart) params.set('depart', encodeURIComponent(depart));
  if (arrivee) params.set('arrivee', encodeURIComponent(arrivee));

  window.location.href = `/covoiturage?${params.toString()}`;
});