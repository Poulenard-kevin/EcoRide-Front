// main.js
import { setToken, initReviewsCleanup } from '/assets/js/api.js';
import { initTrajets } from '/assets/js/trajets.js';

// Récupérer et appliquer le token une seule fois
const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token');
setToken(token);

// Option : attendre DOMContentLoaded pour lancer l'initialisation
document.addEventListener('DOMContentLoaded', () => {
  // Lancer le nettoyage périodique des reviews orphelines
  // Ajuste backendBaseOverride si ton backend tourne sur un port différent en dev
  if (typeof initReviewsCleanup === 'function') {
    initReviewsCleanup({
      backendBaseOverride: 'http://localhost:8000', // ou null pour utiliser window.API_BASE / origin
      intervalMinutes: 60,                          // intervalle en minutes
      useCredentials: false                         // true si ton API utilise des cookies de session
    });
  } else {
    console.warn('initReviewsCleanup non défini — vérifie l\'export dans /assets/js/api.js');
  }

  // Initialiser le reste de l'app
  initTrajets().catch(err => console.error('initTrajets failed:', err));
});