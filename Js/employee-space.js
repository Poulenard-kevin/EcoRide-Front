import { apiFetch, setToken } from '/assets/js/api.js';

// Après login réussi : setToken(response.token);
// setToken('<TON_TOKEN_ICI>');

// Ajoute ici ta fonction shortId
function shortId(id) {
  if (id === null || id === undefined) return '';
  const s = String(id); // convertit nombre → string
  return s.slice(0, 4);
}

(function () {
  // Mock API helpers (à remplacer par tes endpoints réels)
  const api = {
    validateAvis: async (id) => {
      try {
        await apiFetch(`/reviews/${id}/validate`, { method: 'POST' });
        return { ok: true };
      } catch (err) {
        // err.status et err.body fournis par handleResponse
        console.error('validateAvis error', err);
        return { ok: false, status: err.status, body: err.body };
      }
    },
  
    refuseAvis: async (id) => {
      try {
        await apiFetch(`/reviews/${id}/refuse`, { method: 'POST' });
        return { ok: true };
      } catch (err) {
        console.error('refuseAvis error', err);
        return { ok: false, status: err.status, body: err.body };
      }
    },
  
    // Exemple : récupérer les avis en attente (API Platform => hydra)
    fetchPendingReviews: async () => {
      try {
        const data = await apiFetch(`/reviews?status=${encodeURIComponent('PENDING')}`, { method: 'GET' });
        // si API Platform, la liste est dans data['hydra:member']
        return Array.isArray(data) ? data : (data?.['hydra:member'] || []);
      } catch (err) {
        console.error('fetchPendingReviews error', err);
        return [];
      }
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
        id: (t.id !== undefined && t.id !== null) ? String(t.id) : crypto.randomUUID?.() || String(Date.now()),
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

  if (trajetsTbodyEl) {
    trajetsTbodyEl.addEventListener('click', (e) => {
      // Si clic sur un select ou un enfant d'un select, ne rien faire
      if (e.target.tagName.toLowerCase() === 'select' || e.target.closest('select')) {
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      openTrajetModal(tr.dataset.id);
    });
  }

  const modal = document.getElementById('trajet-modal');

  // render avis list
  function renderAvisList(data) {
    if (!avisListEl) return;
    const frag = document.createDocumentFragment();
    data.forEach(a => {
      const date = a.date ? new Date(a.date).toLocaleDateString() : '';
      const pseudo = a.author ? `${a.author.firstName} ${a.author.lastName}` : 'Anonyme';
      const note = a.rating || 0;
      const texte = a.comment || '';
  
      const card = document.createElement('div');
      card.className = 'avis-card';
      card.dataset.id = a.id;
      card.innerHTML = `
        <small class="date">${escapeHtml(date)}</small>
        <h3 class="pseudo">${escapeHtml(pseudo)}</h3>
        <div class="stars" aria-hidden="true">${'★'.repeat(note)}${'☆'.repeat(5 - note)}</div>
        <p class="avis-text">${escapeHtml(texte)}</p>
        <div class="actions">
          <button type="button" class="btn valider" data-action="validate">Valider</button>
          <button type="button" class="btn refuser" data-action="refuse">Refuser</button>
        </div>
      `;
      frag.appendChild(card);
    });
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
      const idComplet = (t.id !== undefined && t.id !== null) ? t.id : '';
      const idAffiche = shortId(idComplet);
      const statut = t.statut || 'non traité';
  
      // Génère la classe CSS selon le statut
      const statutClass = `statut-${statut.replace(/\s/g, '-').toLowerCase()}`;
  
      return `
        <tr data-id="${idComplet}" tabindex="0" role="button" aria-label="Voir détails trajet ${idComplet}">
          <td>${escapeHtml(idAffiche)}</td>
          <td>${escapeHtml(t.chauffeur)}</td>
          <td>${escapeHtml(t.passager)}</td>
          <td>${escapeHtml(dateFormatted)}</td>
          <td>${escapeHtml(heureDepart)}</td>
          <td>${escapeHtml(heureArrivee)}</td>
          <td>${escapeHtml(t.trajet)}</td>
          <td>
            <select class="statut-select ${statutClass}" aria-label="Statut du trajet">
              <option value="non traité" ${statut === 'non traité' ? 'selected' : ''}>Non traité</option>
              <option value="en cours" ${statut === 'en cours' ? 'selected' : ''}>En cours</option>
              <option value="traité" ${statut === 'traité' ? 'selected' : ''}>Traité</option>
            </select>
          </td>
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
      if (!id) return;

      // désactive tous les boutons de la carte pour éviter les clics multiples
      const actionButtons = Array.from(card.querySelectorAll('button[data-action]'));
      actionButtons.forEach(b => b.disabled = true);

      // état UI temporaire
      const origTexts = new Map(actionButtons.map(b => [b, b.textContent]));
      btn.textContent = action === 'validate' ? 'Validation...' : 'Refus...';
      card.style.opacity = '0.6';
      card.classList.add('loading');

      try {
        // appel API selon l'action
        let res;
        if (action === 'validate') {
          res = await api.validateAvis(id);
        } else if (action === 'refuse') {
          res = await api.refuseAvis(id);
        } else {
          throw new Error('Action inconnue');
        }

        // gestion erreurs remontées par api.* (structure { ok, status, body } attendue)
        if (!res || !res.ok) {
          const status = res?.status;
          if (status === 401) {
            setToken(null);
            toastContainer.show('Session expirée, veuillez vous reconnecter', 'error', 4000);
            throw new Error('Unauthorized');
          }
          if (status === 403) {
            toastContainer.show('Accès refusé', 'error', 4000);
            throw new Error('Forbidden');
          }
          throw new Error('Erreur serveur');
        }

        // --- Succès ---
        // Optimistic: retirer immédiatement la carte / état local
        avisData = avisData.filter(a => String(a.id) !== String(id));
        localStorage.setItem('ecoride_avis', JSON.stringify(avisData));
        card.remove();
        toastContainer.show(action === 'validate' ? `Avis ${id} validé` : `Avis ${id} refusé`);

        console.log('avisData après suppression (optimistic):', avisData);

        // Tenter de resynchroniser avec le serveur pour garantir la consistance
        try {
          const remote = await api.fetchPendingReviews();
          const normalizedRemote = Array.isArray(remote) ? remote : (remote?.['hydra:member'] || []);
          avisData = normalizedRemote;
          localStorage.setItem('ecoride_avis', JSON.stringify(avisData));
          renderAvisList(avisData);
          console.log('avisData synchronisé depuis le serveur:', avisData);
        } catch (syncErr) {
          console.warn('Impossible de rafraîchir la liste depuis le serveur après action:', syncErr);
          // on ne rollback pas l'optimistic removal ici, mais on loggue.
          // Si tu veux forcer un rollback si le serveur indique que l'avis est toujours PENDING,
          // il faudrait analyser la réponse `normalizedRemote` et remettre l'avis si présent.
        }

      } catch (err) {
        console.error('Erreur lors de la validation/refus d\'avis:', err);

        // rollback UI : ré-activer boutons, restaurer textes et opacité
        actionButtons.forEach(b => {
          b.disabled = false;
          b.textContent = origTexts.get(b) || b.textContent;
        });
        card.style.opacity = '1';
        card.classList.remove('loading');

        // messages d'erreur utilisateur
        if (err.message === 'Unauthorized') {
          // redirection optionnelle : window.location.href = '/login';
        } else if (err.message === 'Forbidden') {
          // déjà notifié par toast
        } else {
          toastContainer.show('Une erreur est survenue', 'error', 4000);
        }
      }
    });
  }

  // ---------- Event delegation pour trajets (ouvrir modal) ----------
  if (trajetsTbodyEl) {
    trajetsTbodyEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('statut-select')) return;
    
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
    
      const id = tr.dataset.id;
      const trajet = trajetsData.find(t => String(t.id) === String(id));
      if (!trajet) return;
    
      trajet.statut = e.target.value;
    
      localStorage.setItem('ecoride_trajets_signales', JSON.stringify(trajetsData));
    
      // Mise à jour des classes en conservant 'statut-select'
      const classes = e.target.className
        .split(' ')
        .filter(c => !c.startsWith('statut-'));
    
      if (!classes.includes('statut-select')) {
        classes.push('statut-select');
      }
    
      classes.push(`statut-${trajet.statut.replace(/\s/g, '-').toLowerCase()}`);
    
      e.target.className = classes.join(' ');
    
      toastContainer.show(`Statut du trajet ${shortId(id)} mis à jour : ${trajet.statut}`, 'info', 3000);
    });
  }

  let currentModalTrajet = null;

  function openTrajetModal(id) {
    currentModalTrajet = trajetsData.find(t => String(t.id) === String(id));
    if (!currentModalTrajet) {
      console.warn('Trajet non trouvé pour id:', id);
      return;
    }
  
    const modal = document.getElementById('trajet-modal');
    if (!modal) {
      console.warn('Modal element not found');
      return;
    }    
      
    document.getElementById("modal-id").innerText = currentModalTrajet.id;
    document.getElementById("modal-chauffeur").innerText = currentModalTrajet.chauffeur;
    document.getElementById("modal-chauffeur-mail").innerText = currentModalTrajet.chauffeurMail || '';
    document.getElementById("modal-passager").innerText = currentModalTrajet.passager;
    document.getElementById("modal-passager-mail").innerText = currentModalTrajet.passagerMail || '';
  
    document.getElementById("modal-date").innerText = currentModalTrajet.date || '—';
    document.getElementById("modal-date-depart").innerText = currentModalTrajet.heureDepart || '—';
    document.getElementById("modal-date-arrivee").innerText = currentModalTrajet.heureArrivee || '—';
  
    document.getElementById("modal-trajet").innerText = currentModalTrajet.trajet;
    document.getElementById("modal-description").innerText = currentModalTrajet.description || '';
  
    modal.style.display = 'block';
    console.log('Modal affiché');

    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) closeBtn.focus();
  }

  const btnRepondrePassager = document.getElementById('btn-repondre-passager');
if (btnRepondrePassager) {
  btnRepondrePassager.addEventListener('click', () => {
    if (!currentModalTrajet) return;
    const email = currentModalTrajet.passagerMail;
    if (!email) {
      alert("Email du passager non disponible");
      return;
    }
    const sujet = encodeURIComponent("Réponse concernant votre trajet signalé");
    const corps = encodeURIComponent("Bonjour,\n\nJe vous contacte au sujet du trajet signalé.\n\nCordialement,\nL'équipe EcoRide");
    window.location.href = `mailto:${email}?subject=${sujet}&body=${corps}`;
  });
}

const btnRepondreChauffeur = document.getElementById('btn-repondre-chauffeur');
if (btnRepondreChauffeur) {
  btnRepondreChauffeur.addEventListener('click', () => {
    if (!currentModalTrajet) return;
    const email = currentModalTrajet.chauffeurMail;
    if (!email) {
      alert("Email du conducteur non disponible");
      return;
    }
    const sujet = encodeURIComponent("Réponse concernant votre trajet signalé");
    const corps = encodeURIComponent("Bonjour,\n\nJe vous contacte au sujet du trajet signalé.\n\nCordialement,\nL'équipe EcoRide");
    window.location.href = `mailto:${email}?subject=${sujet}&body=${corps}`;
  });
}

const btnSupprimer = document.getElementById('btn-supprimer');
if (btnSupprimer) {
  btnSupprimer.addEventListener('click', () => {
    if (!currentModalTrajet) return;

    // Exemple : supprimer le trajet de la liste
    trajetsData = trajetsData.filter(t => t.id !== currentModalTrajet.id);

    // Mettre à jour le localStorage
    localStorage.setItem('ecoride_trajets_signales', JSON.stringify(trajetsData));

    // Re-render le tableau
    renderTrajetsTable(trajetsData);

    // Fermer le modal
    modal.style.display = 'none';

    // Afficher un toast de confirmation
    toastContainer.show(`Trajet ${shortId(currentModalTrajet.id)} supprimé`, 'info', 3000);
  });
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
  async function initFromServer(mock = true) {
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
  
    if (!mock) {
      try {
        const remote = await api.fetchPendingReviews();
        avisData = remote;
        localStorage.setItem('ecoride_avis', JSON.stringify(avisData));
        renderAvisList(avisData);
      } catch (e) {
        console.error('Erreur chargement avis depuis API', e);
        // Optionnel : afficher un message d’erreur ou fallback
      }
    }

    console.log("Données trajets reçues pour affichage :", trajetsData);


  }

  // start en mode réel (appelle l'API)
  initFromServer(false);

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
