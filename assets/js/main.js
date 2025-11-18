import { setToken } from '/assets/js/api.js';
import { initTrajets } from '/assets/js/trajets.js';

setToken(localStorage.getItem('api_token'));

setToken(localStorage.getItem('api_token'));

// Option B: attendre DOMContentLoaded (si tu veux être sûr que le DOM est prêt)
document.addEventListener('DOMContentLoaded', () => {
  initTrajets().catch(err => console.error('initTrajets failed:', err));
});