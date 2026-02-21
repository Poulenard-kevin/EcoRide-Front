// /Js/credits.js - VERSION UNIQUE ET NETTOYÉE
(function() {
    // 1. L'objet de gestion
    window.ecorideCredits = {
        current: parseInt(localStorage.getItem('ecoride.credits') || '0', 10),

        updateUI(value) {
            this.current = Number(value);
            // On cherche le nombre et le label
            const numEl = document.querySelector('.ecoride-credit-number');
            const labelEl = document.querySelector('.ecoride-credit-label');
            const circle = document.getElementById('ecoCircle');

            if (numEl) {
                numEl.textContent = this.current;
            } else if (circle) {
                // Si les spans n'existent pas, on les crée proprement
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

    // 2. La fonction de rafraîchissement (Port 8000 forcé)
    window.refreshUserSession = async function() {
        const token = localStorage.getItem('api_token');
        if (!token) return;

        try {
            const response = await fetch('http://localhost:8000/api/me', {
                headers: { 'Accept': 'application/json', 'X-AUTH-TOKEN': token }
            });
            if (response.ok) {
                const user = await response.json();
                window.ecorideCredits.syncFromUser(user);
                localStorage.setItem('ecoride_user', JSON.stringify(user));
                console.log("🔄 Session API synchronisée :", user.credits);
            }
        } catch (e) {
            console.error("Erreur synchro session:", e);
        }
    };

    // 3. Exécution au chargement ET lors des changements d'onglets
    document.addEventListener('DOMContentLoaded', window.refreshUserSession);
    
    // On écoute aussi les changements d'onglets de ton user-space.js
    window.addEventListener('ecoride:userUpdated', (ev) => {
        if (ev.detail) window.ecorideCredits.syncFromUser(ev.detail);
    });

})();