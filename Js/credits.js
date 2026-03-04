// /Js/credits.js
(function() {
    'use strict';

    // 1. L'objet de gestion
    window.ecorideCredits = {
        current: parseInt(localStorage.getItem('ecoride.credits') || '0', 10),

        updateUI(value) {
            this.current = Number(value);
            const numEl = document.querySelector('.ecoride-credit-number');
            const circle = document.getElementById('ecoCircle');

            if (numEl) {
                numEl.textContent = this.current;
            } else if (circle) {
                // Injection propre si le cercle est vide
                circle.innerHTML = `<span class="ecoride-credit-number">${this.current}</span><span class="ecoride-credit-label">crédits</span>`;
            }
            
            console.log("💰 UI Crédits mise à jour :", this.current);
        },

        syncFromUser(user) {
            if (user && user.credits !== undefined) {
                this.updateUI(user.credits);
                localStorage.setItem('ecoride.credits', user.credits);
            }
        }
    };

    // 2. La fonction de rafraîchissement (Utilise la base dynamique et le bon Header)
    window.refreshUserSession = async function() {
        const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token');
        if (!token) return;
      
        // Utilise la même logique que tes autres fichiers pour l'URL
        const getApiBase = () => {
            if (typeof window.getApiBase === 'function') return window.getApiBase().replace(/\/+$/, '').replace(/\/api$/i, '');
            return (window.__API_BASE || window.API_BASE || 'http://localhost:8000').replace(/\/+$/, '').replace(/\/api$/i, '');
        };
        
        const apiBase = getApiBase();
      
        try {
          const response = await fetch(`${apiBase}/api/me`, {
            headers: { 
                'Accept': 'application/json', 
                'Authorization': `Bearer ${token}` // CORRECTION : Utilise Bearer pour JWT
            }
          });

          if (response.ok) {
            const user = await response.json();
            window.ecorideCredits.syncFromUser(user);
            // Mise à jour du cache utilisateur global
            localStorage.setItem('ecoride_user', JSON.stringify(user));
            console.log("🔄 Session API synchronisée (Crédits) :", user.credits);
          } else if (response.status === 401) {
            console.warn('Session expirée ou token invalide');
          }
        } catch (e) {
          console.error("Erreur synchro session credits:", e);
        }
    };

    // 3. Exécution
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.refreshUserSession);
    } else {
        window.refreshUserSession();
    }
    
    // Écoute les mises à jour profil (ex: après un achat de crédits ou une réservation)
    window.addEventListener('ecoride:userUpdated', (ev) => {
        if (ev.detail) window.ecorideCredits.syncFromUser(ev.detail);
    });

    // Optionnel : rafraîchir quand on revient sur l'onglet du navigateur
    window.addEventListener('focus', () => {
        window.refreshUserSession();
    });

})();