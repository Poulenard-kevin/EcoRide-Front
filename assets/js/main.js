// main.js (version recommandée)
import { setToken, getApiBase, initReviewsCleanup } from '/assets/js/api.js';
import { initTrajets } from '/assets/js/trajets.js';

async function waitForConfig(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && (typeof window.getApiBase === 'function' || window.__API_BASE)) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

(async function bootstrap() {
  // Attendre éventuellement le chargement de public/config.js
  await waitForConfig(2000);

  // Récupérer la base API : priorité au helper exporté, puis window.__API_BASE, puis location.origin
  let apiBase = '';
  try {
    if (typeof getApiBase === 'function') {
      apiBase = String(getApiBase() || '').replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }

  if (!apiBase) {
    apiBase = (typeof window !== 'undefined' && window.__API_BASE) || window.location.origin || 'http://127.0.0.1:8000';
    apiBase = String(apiBase).replace(/\/+$/, '');
  }

  const BACKEND_BASE = apiBase;

  // Appliquer le token centralisé (préférer setToken qui stocke de façon cohérente dans api.js)
  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
  try {
    setToken(token || null);
  } catch (e) {
    console.warn('setToken indisponible ou a lancé une erreur', e);
  }

  // Attendre DOM ready pour initialisations qui touchent le DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

  function startApp() {
    // initReviewsCleanup (si exportée)
    if (typeof initReviewsCleanup === 'function') {
      try {
        initReviewsCleanup({
          backendBaseOverride: BACKEND_BASE,
          intervalMinutes: 60,
          useCredentials: false // true si cookie-based sessions
        });
      } catch (err) {
        console.error("Erreur lors de l'initialisation de initReviewsCleanup :", err);
      }
    } else {
      console.warn('initReviewsCleanup non défini — vérifier export dans /assets/js/api.js');
    }

    // initTrajets (passer BACKEND_BASE si besoin)
    if (typeof initTrajets === 'function') {
      try {
        const maybePromise = initTrajets({ backendBase: BACKEND_BASE });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.catch(err => console.error('initTrajets a échoué :', err));
        }
      } catch (err) {
        console.error('Erreur lors de l\'appel à initTrajets :', err);
      }
    } else {
      console.warn('initTrajets non défini — vérifie l\'export dans /assets/js/trajets.js');
    }
  }
})();