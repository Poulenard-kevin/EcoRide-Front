// Ajoute ici ta fonction shortId
function shortId(id) {
  if (!id) return '';
  return id.slice(0, 4);
}

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

  function migrateTrajetsData(data) {
    return data.map(t => {
      let date = '';
      if (t.createdAt) {
        const d = new Date(t.createdAt);
        if (!isNaN(d)) {
          const jj = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const aaaa = d.getFullYear();
          date = `${jj}-${mm}-${aaaa}`;
        }
      }
      if (t.dateDepart && !/^\d{1,2}h\d{2}$/.test(t.dateDepart)) {
        date = t.dateDepart;
      }
      let heureDepart = '';
      let heureArrivee = '';
      if (t.dateDepart && /^\d{1,2}h\d{2}$/.test(t.dateDepart)) {
        heureDepart = t.dateDepart;
      } else if (t.heureDepart) {
        heureDepart = t.heureDepart;
      }
      if (t.dateArrivee && /^\d{1,2}h\d{2}$/.test(t.dateArrivee)) {
        heureArrivee = t.dateArrivee;
      } else if (t.heureArrivee) {
        heureArrivee = t.heureArrivee;
      }
      return {
        ...t,
        date,
        heureDepart,
        heureArrivee,
        dateDepart: undefined,
        dateArrivee: undefined
      };
    });
  }

  function formatDateSimple(dateStr) {
    if (!dateStr) return '—';
    // Remplacer / par - si besoin
    return dateStr.replace(/\//g, '-');
  }


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

  // Normalisation des données (à faire après chargement des données)
  function normalizeTrajetsData(data) {
    return data.map(t => {
      // Assure-toi que date, heureDepart, heureArrivee sont définis
      t.date = t.date || '';
      t.heureDepart = t.heureDepart || '';
      t.heureArrivee = t.heureArrivee || '';
      return t;
    });
  }

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

  console.log(trajetsData)

  // render trajets table
  function renderTrajetsTable(data) {
    if (!trajetsTbodyEl) return;
    const rows = data.map(t => {
      const dateFormatted = formatDateSimple(t.date || '—');
      const heureDepart = t.heureDepart || '—';
      const heureArrivee = t.heureArrivee || '—';
      const idComplet = t.id || '';
      const idAffiche = shortId(idComplet);
  
      return `
        <tr data-id="${idComplet}" tabindex="0" role="button" aria-label="Voir détails trajet ${idComplet}">
          <td>${escapeHtml(idAffiche)}</td>
          <td>${escapeHtml(t.chauffeur)}</td>
          <td>${escapeHtml(t.passager)}</td>
          <td>${escapeHtml(dateFormatted)}</td>
          <td>${escapeHtml(heureDepart)}</td>
          <td>${escapeHtml(heureArrivee)}</td>
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
  
    // Affiche la date seule
    document.getElementById("modal-date").innerText = trajet.date || '—';
  
    // Affiche uniquement les heures dans les champs départ et arrivée
    document.getElementById("modal-date-depart").innerText = trajet.heureDepart || '—';
    document.getElementById("modal-date-arrivee").innerText = trajet.heureArrivee || '—';
  
    document.getElementById("modal-trajet").innerText = trajet.trajet;
    document.getElementById("modal-description").innerText = trajet.description || '';
  
    modal.style.display = 'block';
  
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
    // 1) charger les avis depuis localStorage (source de vérité locale)
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem('ecoride_avis') || '[]');
      } catch (e) {
        console.warn('ecoride_avis invalide en localStorage, reset', e);
        return [];
      }
    })();
  
    // 2) tes mocks avis (uniquement utilisés si mock === true)
    const mockAvis = [
      { id: 1, pseudo: "Alice", note: 4, texte: "Super trajet, conducteur sympa !", date: '2025-04-12T08:00:00Z' },
      { id: 2, pseudo: "Bob", note: 3, texte: "Bien mais voiture pas très propre", date: '2025-04-11T12:00:00Z' },
      { id: 3, pseudo: "Claire", note: 5, texte: "Parfait, je recommande !", date: '2025-04-10T09:00:00Z' },
      { id: 4, pseudo: "David", note: 2, texte: "Retard de 30 min et conduite brusque.", date: '2025-04-09T16:00:00Z' }
    ];
  
    // 3) Fusionner sans écraser les avis déjà persistés
    const keyOf = (a) => {
      if (!a) return null;
      if (a.id !== undefined && a.id !== null) return String(a.id);
      if (a.reservationId !== undefined && a.reservationId !== null) return String(a.reservationId);
      return null;
    };
  
    const map = new Map();
  
    // ajouter d'abord les stored (prioritaires)
    stored.forEach(a => {
      const k = keyOf(a) || ('__tmp_' + (a.date || Math.random()));
      map.set(k, a);
    });
  
    // ajouter les mocks si absent
    if (mock) {
      mockAvis.forEach(a => {
        const k = keyOf(a) || ('__tmp_' + (a.date || Math.random()));
        if (!map.has(k)) map.set(k, a);
      });
    }
  
    // Construire tableau trié (plus récent d'abord si date disponible)
    avisData = Array.from(map.values()).sort((x, y) => {
      const dx = new Date(x.date || 0).getTime();
      const dy = new Date(y.date || 0).getTime();
      return dy - dx;
    });
  
    // 4) Persister la fusion (optionnel, utile si on a ajouté des mocks)
    try {
      localStorage.setItem('ecoride_avis', JSON.stringify(avisData));
    } catch (e) {
      console.warn('Impossible de sauvegarder ecoride_avis :', e);
    }
  
    // 5) render avis
    renderAvisList(avisData);

    // 6) Charger les trajets signalés (localStorage + mocks si vide)
    
    let storedSignalements = JSON.parse(localStorage.getItem('ecoride_trajets_signales') || '[]');

    // Appliquer la migration pour corriger le format date/heure
    storedSignalements = migrateTrajetsData(storedSignalements);

    // Sauvegarder les données migrées dans localStorage (optionnel mais recommandé)
    localStorage.setItem('ecoride_trajets_signales', JSON.stringify(storedSignalements));

    // Normaliser les données (assure-toi que tous les champs existent)
    trajetsData = normalizeTrajetsData(storedSignalements);

    // Afficher dans le tableau
    renderTrajetsTable(trajetsData);

    const mockTrajets = [
      {
        id: 1234,
        chauffeur: "Chauffeur1",
        chauffeurMail: "chauffeur1@email.com",
        passager: "Passager1",
        passagerMail: "passager1@email.com",
        date: "04-12-2025",
        heureDepart: "08h30",
        heureArrivee: "11h30",
        trajet: "Lyon → Grenoble",
        description: "Le passager se plaint..."
      },
      {
        id: 5678,
        chauffeur: "Chauffeur2",
        chauffeurMail: "chauffeur2@email.com",
        passager: "Passager2",
        passagerMail: "passager2@email.com",
        date: "02-12-2025",
        heureDepart: "14h00",
        heureArrivee: "19h15",
        trajet: "Grenoble → Lyon",
        description: "Signalement pour comportement..."
      }
    ];

    if (mock && storedSignalements.length === 0) {
      trajetsData = normalizeTrajetsData(mockTrajets.slice());
      localStorage.setItem('ecoride_trajets_signales', JSON.stringify(trajetsData));
    } else {
      trajetsData = normalizeTrajetsData(storedSignalements.slice());
    }

    renderTrajetsTable(trajetsData);
  
    // Si mock === false : appeler API réel (exemple)
    if (!mock) {
      // fetch('/api/avis/pending').then(...).then(remote => { merge remote similarly })
    }

    console.log("Données trajets reçues pour affichage :", trajetsData);


  }

  // start
  initFromServer(true);

  // réception des avis soumis depuis le modal (trajets.js)
  window.addEventListener('ecoride:avisSubmitted', (e) => {
    const nouvelAvis = e.detail;
    if (!nouvelAvis) return;

    // 1) Persister localement si besoin
    const stored = JSON.parse(localStorage.getItem('ecoride_avis') || '[]');
    stored.unshift(nouvelAvis);
    localStorage.setItem('ecoride_avis', JSON.stringify(stored));

    // 2) Mettre à jour l'état local et re-render
    avisData.unshift(nouvelAvis);
    renderAvisList(avisData);

    // 3) Notification UI
    toastContainer.show(`Nouvel avis reçu de ${nouvelAvis.pseudo}`, 'info', 4000);
  });

  // Écouteur pour les trajets signalés
  if (!window._ecorideTrajetSignaleListenerAdded) {
    window._ecorideTrajetSignaleListenerAdded = true;
    window.addEventListener('ecoride:trajetSignale', (e) => {
      const signalement = e.detail;
      if (!signalement) return;
    
      const [migrated] = migrateTrajetsData([signalement]);
    
      const stored = JSON.parse(localStorage.getItem('ecoride_trajets_signales') || '[]');
      stored.unshift(migrated);
      localStorage.setItem('ecoride_trajets_signales', JSON.stringify(stored));
    
      trajetsData.unshift(migrated);
      renderTrajetsTable(trajetsData);
      toastContainer.show(`Nouveau trajet signalé : ${migrated.trajet}`, 'warning', 5000);
    });
  }
  // expose pour debug
  window.__employeeSpace = { renderAvisList, renderTrajetsTable, openTrajetModal, getState: () => ({ avisData, trajetsData }) };
})();
