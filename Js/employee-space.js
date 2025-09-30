  // employee-space.js (placer après le DOM)
  (function () {
    // Mock API helpers (à remplacer par tes endpoints réels)
    const api = {
      validateAvis: async (id) => {
        // await fetch(`/api/avis/${id}/valider`, { method: 'POST' })
        await new Promise(r => setTimeout(r, 500)); // simule latence
        return { ok: true };
      },
      refuseAvis: async (id) => {
        await new Promise(r => setTimeout(r, 500));
        return { ok: true };
      }
    };
  
    // ---------- Utilitaires UI ----------
    const toastContainer = (() => {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.style.position = 'fixed';
        container.style.right = '20px';
        container.style.bottom = '20px';
        container.style.zIndex = 2000;
        document.body.appendChild(container);
      }
      function show(msg, type = 'info', ttl = 3000) {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        t.style.background = type === 'error' ? '#e74c3c' : '#2ecc71';
        t.style.color = '#fff';
        t.style.padding = '8px 12px';
        t.style.marginTop = '8px';
        t.style.borderRadius = '8px';
        container.appendChild(t);
        setTimeout(() => t.remove(), ttl);
      }
      return { show };
    })();
  
    // ---------- Données et rendu ----------
    let avisData = [];      // état local
    let trajetsData = [];   // état local
  
    const avisListEl = document.querySelector('.avis-list');
    const trajetsTbodyEl = document.querySelector('.trajets-table tbody');
    const modal = document.getElementById('trajet-modal');
  
    // render avis list
    function renderAvisList(data) {
      if (!avisListEl) return;
      // construit fragment performant
      const frag = document.createDocumentFragment();
      data.forEach(a => {
        const card = document.createElement('div');
        card.className = 'avis-card';
        card.dataset.id = a.id;
        card.innerHTML = `
          <h3 class="pseudo">${escapeHtml(a.pseudo)}</h3>
          <div class="stars" aria-hidden="true">${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}</div>
          <p class="avis-text">${escapeHtml(a.texte)}</p>
          <div class="actions">
            <button type="button" class="btn valider" data-action="validate">Valider</button>
            <button type="button" class="btn refuser" data-action="refuse">Refuser</button>
          </div>
        `;
        frag.appendChild(card);
      });
      // vider et append
      avisListEl.innerHTML = '';
      avisListEl.appendChild(frag);
    }
  
    // render trajets table
    function renderTrajetsTable(data) {
      if (!trajetsTbodyEl) return;
      const rows = data.map(t => {
        const dateOnly = (t.dateDepart || '').split(' ')[0] || '';
        return `
          <tr data-id="${t.id}" tabindex="0" role="button" aria-label="Voir détails trajet ${t.id}">
            <td>${escapeHtml(String(t.id))}</td>
            <td>${escapeHtml(t.chauffeur)}</td>
            <td>${escapeHtml(t.passager)}</td>
            <td>${escapeHtml(dateOnly)}</td>
            <td>${escapeHtml(t.trajet)}</td>
          </tr>
        `;
      }).join('');
      trajetsTbodyEl.innerHTML = rows;
    }
  
    // helper pour éviter XSS
    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  
    // ---------- Event delegation pour avis ----------
    if (avisListEl) {
      avisListEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const card = btn.closest('.avis-card');
        if (!card) return;
        const id = card.dataset.id;
  
        // Bloquer double clic / état loading
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = action === 'validate' ? 'Validation...' : 'Refus...';
  
        try {
          if (action === 'validate') {
            // optimistic update : retirer la carte immédiatement
            card.style.opacity = '0.6';
            const res = await api.validateAvis(id);
            if (!res.ok) throw new Error('Erreur serveur');
            // retirer du DOM + état local
            avisData = avisData.filter(a => String(a.id) !== String(id));
            card.remove();
            toastContainer.show(`Avis ${id} validé`);
          } else if (action === 'refuse') {
            const res = await api.refuseAvis(id);
            if (!res.ok) throw new Error('Erreur serveur');
            // on peut supprimer ou marquer "refusé"
            avisData = avisData.filter(a => String(a.id) !== String(id));
            card.remove();
            toastContainer.show(`Avis ${id} refusé`, 'info');
          }
        } catch (err) {
          console.error(err);
          toastContainer.show('Une erreur est survenue', 'error', 4000);
          btn.disabled = false;
          btn.textContent = origText;
          card.style.opacity = '1';
        }
      });
    }
  
    // ---------- Event delegation pour trajets (ouvrir modal) ----------
    if (trajetsTbodyEl) {
      trajetsTbodyEl.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const id = tr.dataset.id;
        openTrajetModal(id);
      });
  
      // keyboard accessibility : Enter to open modal on focused row
      trajetsTbodyEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const tr = document.activeElement.closest && document.activeElement.closest('tr[data-id]');
          if (tr) openTrajetModal(tr.dataset.id);
        }
      });
    }
  
    function openTrajetModal(id) {
      const trajet = trajetsData.find(t => String(t.id) === String(id));
      if (!trajet) return;
      document.getElementById("modal-id").innerText = trajet.id;
      document.getElementById("modal-chauffeur").innerText = trajet.chauffeur;
      document.getElementById("modal-chauffeur-mail").innerText = trajet.chauffeurMail || '';
      document.getElementById("modal-passager").innerText = trajet.passager;
      document.getElementById("modal-passager-mail").innerText = trajet.passagerMail || '';
      document.getElementById("modal-date-depart").innerText = trajet.dateDepart;
      document.getElementById("modal-date-arrivee").innerText = trajet.dateArrivee || '';
      document.getElementById("modal-trajet").innerText = trajet.trajet;
      document.getElementById("modal-description").innerText = trajet.description || '';
      modal.style.display = 'block';
      // focus sur la croix pour accessibilité
      const closeBtn = modal.querySelector('.close-btn');
      if (closeBtn) closeBtn.focus();
    }
  
    // modal close handlers
    (function modalInit() {
      const closeBtn = document.querySelector(".close-btn");
      if (!closeBtn) return;
      closeBtn.addEventListener("click", () => modal.style.display = "none");
      window.addEventListener("click", (e) => {
        if (e.target === modal) modal.style.display = "none";
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === 'Escape') modal.style.display = 'none';
      });
    })();
  
    // ---------- Initialisation : charger (mock) et render ----------
    function initFromServer(mock = true) {
      if (mock) {
        // utiliser données mock fournies par toi
        avisData = [
          { id: 1, pseudo: "Alice", note: 4, texte: "Super trajet, conducteur sympa !" },
          { id: 2, pseudo: "Bob", note: 3, texte: "Bien mais voiture pas très propre" },
          { id: 3, pseudo: "Claire", note: 5, texte: "Parfait, je recommande !" },
          { id: 4, pseudo: "David", note: 2, texte: "Retard de 30 min et conduite brusque." }
        ];
        trajetsData = [
          { id: 1234, chauffeur: "Chauffeur1", chauffeurMail: "chauffeur1@email.com", passager: "Passager1", passagerMail: "passager1@email.com",
            dateDepart: "12/04/25 08:30", dateArrivee: "12/04/25 11:30", trajet: "Lyon → Grenoble", description: "Le passager se plaint..." },
          { id: 5678, chauffeur: "Chauffeur2", chauffeurMail: "chauffeur2@email.com", passager: "Passager2", passagerMail: "passager2@email.com",
            dateDepart: "13/04/25 14:00", dateArrivee: "13/04/25 19:15", trajet: "Grenoble → Lyon", description: "Signalement pour comportement..." }
        ];
        renderAvisList(avisData);
        renderTrajetsTable(trajetsData);
      } else {
        // fetch('/api/avis/pending').then(...)
      }
    }
  
    // start
    initFromServer(true);
  
    // expose pour debug
    window.__employeeSpace = { renderAvisList, renderTrajetsTable, openTrajetModal, getState: () => ({ avisData, trajetsData }) };
  })();
  
  // -------------------------------
  // Gestion MODAL
  // -------------------------------
  
  const modal = document.getElementById("trajet-modal");
  const closeBtn = document.querySelector(".close-btn");
  
  // Clic sur ligne du tableau -> ouvre modal
  document.querySelectorAll(".trajets-table tbody tr").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const trajet = trajetsData.find(t => t.id == id);
  
      if (trajet) {
        document.getElementById("modal-id").innerText = trajet.id;
        document.getElementById("modal-chauffeur").innerText = trajet.chauffeur;
        document.getElementById("modal-chauffeur-mail").innerText = trajet.chauffeurMail;
        document.getElementById("modal-passager").innerText = trajet.passager;
        document.getElementById("modal-passager-mail").innerText = trajet.passagerMail;
        document.getElementById("modal-date-depart").innerText = trajet.dateDepart;
        document.getElementById("modal-date-arrivee").innerText = trajet.dateArrivee;
        document.getElementById("modal-trajet").innerText = trajet.trajet;
        document.getElementById("modal-description").innerText = trajet.description;
        
        modal.style.display = "block";
      }
    });
  });
  
  // Fermeture modal
  closeBtn.addEventListener("click", () => modal.style.display = "none");
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });