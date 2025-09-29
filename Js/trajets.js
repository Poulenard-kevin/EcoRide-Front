// -------------------- Helpers --------------------
function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

// Helper pour obtenir l'ID du covoiturage à partir d'un objet trajet/réservation
function getCovoId(item) {
  if (!item) return null;
  return item.detailId
    || item.covoId
    || item.covoiturageId
    || item.tripId
    || (item.covoiturage && item.covoiturage.id)
    || null;
}

function normalizePassagers(list = []) {
  return list.map(p => {
    if (!p) return null;
    if (typeof p === 'object' && p.pseudo) {
      return { pseudo: p.pseudo, places: Number(p.places || 1) };
    }
    if (typeof p === 'string') {
      const m = p.match(/^(.+?)\s*x(\d+)$/i);
      return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
    }
    return null;
  }).filter(Boolean);
}

function openRatingModal({ reservationId, onSubmit }) {
  // structure simple bootstrap modal
  const modalId = 'ratingModal';
  // nettoyage s'il existe déjà
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const html = `
  <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Valider le trajet & laisser un avis</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
        </div>
        <div class="modal-body">
          <p>Merci d'indiquer votre note et un commentaire (facultatif).</p>
          <div class="rating-stars mb-3" id="${modalId}-stars" style="font-size: 1.6rem; display:flex; gap:8px;">
            <button type="button" class="star" data-value="1">☆</button>
            <button type="button" class="star" data-value="2">☆</button>
            <button type="button" class="star" data-value="3">☆</button>
            <button type="button" class="star" data-value="4">☆</button>
            <button type="button" class="star" data-value="5">☆</button>
          </div>
          <textarea id="${modalId}-review" class="form-control" rows="4" placeholder="Ton avis (facultatif)"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
          <button type="button" class="btn btn-primary" id="${modalId}-submit">Valider</button>
        </div>
      </div>
    </div>
  </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  const modalEl = document.getElementById(modalId);
  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();

  let currentRating = 5; // valeur par défaut

  const stars = modalEl.querySelectorAll('.star');
  const updateStars = (value) => {
    currentRating = value;
    stars.forEach(s => {
      const v = Number(s.dataset.value);
      if (v <= value) {
        s.textContent = '★';
        s.classList.add('filled');
      } else {
        s.textContent = '☆';
        s.classList.remove('filled');
      }
    });
  };

  stars.forEach(s => {
    s.addEventListener('click', () => updateStars(Number(s.dataset.value)));
    s.addEventListener('mouseenter', () => {
      const v = Number(s.dataset.value);
      stars.forEach(ss => ss.textContent = Number(ss.dataset.value) <= v ? '★' : '☆');
    });
    s.addEventListener('mouseleave', () => updateStars(currentRating));
  });

  updateStars(currentRating);

  const reviewEl = modalEl.querySelector(`#${modalId}-review`);
  const submitBtn = modalEl.querySelector(`#${modalId}-submit`);

  const cleanup = () => {
    try { bsModal.hide(); } catch(e){}
    setTimeout(() => { wrapper.remove(); }, 300);
  };

  submitBtn.addEventListener('click', () => {
    const review = reviewEl.value.trim();
    cleanup();
    if (typeof onSubmit === 'function') onSubmit({ rating: currentRating, review });
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (document.body.contains(wrapper)) wrapper.remove();
  });
}

function getCurrentUserPseudo() {
  try {
    const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
    return me && me.pseudo ? me.pseudo : 'Moi';
  } catch (e) { return 'Moi'; }
}

function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}



// -------------------- Variables globales --------------------
let trajets = [];
let editingIndex = null; // 👈 nouvel indicateur d'édition

// -------------------- Fonction principale d'initialisation --------------------
export function initTrajets() {
  console.log("🚀 Initialisation des trajets");

  // 🔄 Migration des anciennes clés localStorage
  const oldVehicules = localStorage.getItem('ecoride_vehicules');
  if (oldVehicules) {
    localStorage.setItem('ecoride_vehicles', oldVehicules);
    localStorage.removeItem('ecoride_vehicules');
    console.log("🔄 Migration effectuée : ecoride_vehicules ➝ ecoride_vehicles");
  }

  const form = document.querySelector('#trajet-form');
  console.log("📋 Formulaire trouvé:", form);

  trajets = getTrajets()

  updatePlacesReservees()

  console.log("📥 Trajets chargés:", trajets);

  // ⚡ Injection dynamique des véhicules
  populateVehiclesDatalist();

  if (form) {
    form.addEventListener('submit', handleTrajetSubmit);
    console.log("✅ Event listener formulaire ajouté");
  }

  // Event listeners pour les boutons dynamiques
  document.addEventListener('click', handleTrajetActions);

  renderTrajetsInProgress();
  renderHistorique();
  populateVehiclesDatalist();

  // =================== ⚡ Gestion placeholder Date / Time ===================
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => {
      if (!input.value) {
        input.classList.add('empty');
      } else {
        input.classList.remove('empty');
      }
    };
    toggleClass(); // au chargement
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });

  // ================== DEV ONLY: Bouton pour vider l'historique ==================
  // Affiché uniquement en local (localhost ou 127.0.0.1)
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const histoContainer = document.querySelector('.trajets-historique');
    if (histoContainer) {
      // Eviter les doublons si initTrajets est rappelé
      if (!document.getElementById('btn-clear-historique-dev')) {
        const clearBtn = document.createElement('button');
        clearBtn.id = 'btn-clear-historique-dev';
        clearBtn.type = 'button';
        clearBtn.textContent = "🗑 Vider l'historique (DEV)";
        clearBtn.style.margin = "10px 0";
        clearBtn.style.background = "red";
        clearBtn.style.color = "white";
        clearBtn.style.border = "none";
        clearBtn.style.padding = "8px 12px";
        clearBtn.style.borderRadius = "6px";
        clearBtn.style.cursor = "pointer";

        clearBtn.addEventListener('click', () => {
          // On passe tous les trajets non "valide" tels quels
          // et on supprime ceux en "valide" (historique)
          const before = trajets.length;
          trajets = trajets.filter(t => t.status !== 'valide');
          const removed = before - trajets.length;

          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();

          console.log(`🧹 Historique vidé (dev). Trajets supprimés: ${removed}`);
        });

        // Insérer le bouton au-dessus du titre de l'historique
        histoContainer.parentNode.insertBefore(clearBtn, histoContainer);
      }
    }
  }
  window.addEventListener('ecoride:reservationAdded', (e) => {
    try {
      const reservation = e.detail;
  
      // Vérifier si la réservation existe déjà (évite doublons)
      if (!trajets.find(r => r.id === reservation.id)) {
        trajets.push(reservation);
        saveTrajets(); // sauve la variable globale trajets
        updatePlacesReservees();
        renderTrajetsInProgress();
      }
    } catch (err) {
      console.warn('Erreur lors du traitement de l\'événement reservationAdded', err);
    }
  });

  // à exécuter une fois, par ex. dans initTrajets
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.trajet-cancel-btn, .trajet-delete-btn');
    if (!btn) return;
    btn.classList.add('btn-danger');
    btn.style.setProperty('background-color', '#dc3545', 'important');
    btn.style.setProperty('border-color', '#dc3545', 'important');
    btn.style.setProperty('color', '#fff', 'important');
  });
}

// -------------------- Gestion soumission formulaire --------------------

function handleTrajetSubmit(e) {
  e.preventDefault();
  console.log("📝 Soumission du formulaire trajet");

  const formData = new FormData(e.target);

  // 🔹 Récupérer l'objet véhicule complet depuis localStorage
  const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || "[]");
  const selectedPlate = formData.get('vehicle');

  const selectedVehicle = vehicles.find(v => v.plate === selectedPlate);

  console.log("DEBUG selectedVehicle.places:", selectedVehicle ? selectedVehicle.places : "aucun véhicule sélectionné");

  console.log("DEBUG selectedPlate:", selectedPlate);
  console.log("DEBUG selectedVehicle:", selectedVehicle);

  const trajetData = {
    id: (editingIndex !== null && trajets[editingIndex]) 
      ? trajets[editingIndex].id 
      : genId(),
    depart: formData.get('depart')?.trim() || '',
    arrivee: formData.get('arrivee')?.trim() || '',
    date: formData.get('date') || '',
    heureDepart: formData.get('heure-depart') || '',
    heureArrivee: formData.get('heure-arrivee') || '',
    prix: formData.get('prix') || '',
    vehicle: selectedVehicle || null, // 👉 objet véhicule complet
    places: (selectedVehicle && selectedVehicle.seats !== undefined && selectedVehicle.seats !== null)
  ? Number(selectedVehicle.seats)
  : (formData.get('places') ? Number(formData.get('places')) : 4),
    role: "chauffeur",
    status: 'ajoute'
  };

  // 🔎 Vérification champs obligatoires
  if (!trajetData.depart || !trajetData.arrivee || !trajetData.date) {
    alert('Veuillez remplir les champs obligatoires (départ, arrivée, date)');
    return;
  }

  // ✏️ Mise à jour ou ajout
  if (editingIndex !== null && trajets[editingIndex]) {
    trajetData.status = trajets[editingIndex].status; 
    trajets[editingIndex] = trajetData;
    console.log("✏️ Trajet modifié:", trajetData);
    editingIndex = null;
  } else {
    trajets.push(trajetData);
    console.log("➕ Nouveau trajet ajouté:", trajetData);
  }

  // 💾 Sauvegarde et mise à jour UI
  saveTrajets();
  ajouterAuCovoiturage(trajetData);
  updatePlacesReservees();
  renderTrajetsInProgress();
  renderHistorique();

  // 🔄 Reset du formulaire
  e.target.reset();
  document.querySelectorAll('input, select').forEach(input => {
    if (!input.value) input.classList.add('empty'); 
    else input.classList.remove('empty');
  });
}

// -------------------- Gestion des actions --------------------

// Helper : retry until fn() returns true (ou maxAttempts atteintes)
function tryUntilExists(fn, maxAttempts = 8, intervalMs = 80) {
  let attempts = 0;
  return new Promise(resolve => {
    const runner = () => {
      try {
        const ok = fn();
        if (ok) return resolve(true);
      } catch (err) { /* ignore */ }
      attempts++;
      if (attempts >= maxAttempts) return resolve(false);
      setTimeout(runner, intervalMs);
    };
    runner();
  });
}


function handleTrajetActions(e) {
  const target = e.target;

  // -------------------- trajet-start-btn --------------------

  if (target.classList.contains('trajet-start-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === "chauffeur") {
      trajet.status = "demarre";
      saveTrajets();
      updatePlacesReservees()
      renderTrajetsInProgress();
      //console.log("🚀 Trajet démarré :", trajet);
    }
  }

  // -------------------- trajet-arrive-btn --------------------

  if (target.classList.contains('trajet-arrive-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'termine';
      saveTrajets();
      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
      console.log("🏁 Trajet terminé :", trajet);
    }
  
    try {
      const covoId = trajet.id;
      let reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  
      let updated = false;
      reservations = reservations.map(r => {
        if (getCovoId(r) === covoId && r.role === 'passager' && r.status === 'reserve') {
          r.status = 'a_valider'; // nouveau statut : attente de validation par le passager
          updated = true;
        }
        return r;
      });
  
      console.log('Réservation avant mise à jour:', reservations);
      console.log('getCovoId pour chaque réservation:', reservations.map(r => getCovoId(r)));
  
      if (updated) {
        localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
  
        // Synchroniser la variable trajets en mémoire
        reservations.forEach(r => {
          const idx = trajets.findIndex(t => t.id === r.id);
          if (idx !== -1) {
            trajets[idx].status = r.status;
          }
        });
  
        // Re-render UI
        updatePlacesReservees();
        renderTrajetsInProgress();
        renderHistorique();
  
        window.dispatchEvent(new CustomEvent('ecoride:reservationsAwaitingValidation', { detail: { covoId } }));
        window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
        console.log(`🔔 Réservations pour le covo ${covoId} marquées 'a_valider'`);
      }
    } catch (err) {
      console.error('Erreur lors du marquage a_valider :', err);
    }
  }

  // -------------------- trajet-edit-btn --------------------

  if (target.classList.contains('trajet-edit-btn')) {
    e.preventDefault?.();           // empêcher comportement par défaut
    e.stopPropagation?.();          // empêcher propagation

    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);

    // Seuls les trajets chauffeur peuvent être édités
    if (!trajet || trajet.role !== 'chauffeur') return;

    // Forcer l'onglet "Mes trajets"
    if (typeof switchToTab === 'function') {
      switchToTab('user-trajects-form');
      console.log('switchToTab called for user-trajects-form');
    }

    // Attendre que le formulaire soit présent / prêt dans le DOM
    tryUntilExists(() => {
      return document.querySelector('#trajet-form') !== null;
    }, 12, 80).then(found => {
      if (!found) {
        console.warn('trajet-form introuvable après retries');
        return;
      }

      const form = document.querySelector('#trajet-form');
      if (!form) return;

      // Pré-remplissage
      const setIf = (selector, value) => {
        const el = form.querySelector(selector);
        if (el) el.value = value || '';
      };

      setIf('[name="depart"]', trajet.depart);
      setIf('[name="arrivee"]', trajet.arrivee);
      setIf('[name="date"]', trajet.date);
      setIf('[name="heure-depart"]', trajet.heureDepart);
      setIf('[name="heure-arrivee"]', trajet.heureArrivee);
      setIf('[name="prix"]', trajet.prix);
      setIf('[name="vehicle"]', trajet.vehicle ? trajet.vehicle.plate : '');

      // marque l'index d'édition
      editingIndex = trajets.findIndex(t => t.id === id);
      console.log("✏️ Trajet prêt pour modification (index:", editingIndex, "):", trajet);

      // Scroll robuste vers le formulaire (gère parents scrollables)
      const getScrollableParent = el => {
        let node = el.parentElement;
        while (node) {
          const style = window.getComputedStyle(node);
          const overflow = style.overflow + style.overflowY + style.overflowX;
          if (/(auto|scroll)/.test(overflow)) return node;
          node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
      };

      const robustScrollTo = (el) => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const parent = getScrollableParent(el);
          if (parent && parent !== document.scrollingElement && parent !== document.documentElement) {
            const elRect = el.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const offset = (elRect.top - parentRect.top) - (parentRect.height / 2) + (elRect.height / 2);
            parent.scrollTo({ top: parent.scrollTop + offset, behavior: 'smooth' });
          }
        } catch (err) {
          console.error('robustScrollTo error', err);
        }
      };

      // Laisser un petit délai si nécessaire (après injection du contenu)
      setTimeout(() => {
        robustScrollTo(form);
        // focus premier champ pour montrer visuellement que c'est prêt
        const first = form.querySelector('input, textarea, select, button');
        if (first) first.focus({ preventScroll: true });
      }, 40);
    });

    return; // sortir du handler pour éviter autres branches
  }

  // -------------------- trajet-delete-btn --------------------

  if (target.classList.contains('trajet-delete-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index === -1) return;
  
    if (!confirm("Voulez-vous vraiment supprimer ce trajet ? Les passagers seront notifiés que le trajet a été annulé par le chauffeur.")) {
      return;
    }
  
    // 1) Supprimer le trajet local (chauffeur)
    const removed = trajets.splice(index, 1)[0];
    saveTrajets();
  
    // 2) Supprimer le covoiturage (nouveauxTrajets)
    let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const covoIndex = trajetsCovoit.findIndex(t => t.id === id);
    let removedCovo = null;
    if (covoIndex !== -1) {
      removedCovo = trajetsCovoit.splice(covoIndex, 1)[0];
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
      console.log("🚮 Covoiturage supprimé depuis nouveauxTrajets (ID:", id, ")");
    } else {
      console.log("ℹ️ Aucun covoiturage trouvé dans nouveauxTrajets pour l'ID:", id);
    }
  
    // 3) Marquer les réservations liées dans ecoride_trajets et créer notifications
    let userTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    let notifications = JSON.parse(localStorage.getItem('ecoride_notifications') || '[]');
  
    const beforeCount = userTrajets.length;
    let affected = 0;
  
    // helper pour récupérer un identifiant utilisateur depuis une réservation (si présent)
    const getPassengerIdentifier = (res) => {
      return res.userId || res.passagerId || res.pseudo || (res.user && res.user.id) || (res.passager && res.passager.id) || null;
    };
  
    userTrajets = userTrajets.map(res => {
      const ref = getCovoId(res);
      if (ref === id) {
        affected++;
  
        // Marquer la réservation comme annulée par le chauffeur
        res.status = 'annule_par_chauffeur';
        res.cancellationReason = res.cancellationReason || "Trajet annulé par le chauffeur";
        res.cancellationAt = new Date().toISOString();
        res.notified = false; // on pourra utiliser ce flag pour afficher une notif non lue
  
        // Créer une notification destinée au passager
        const passengerId = getPassengerIdentifier(res);
        const notification = {
          id: genId ? genId() : ('notif_' + Date.now() + Math.random().toString(36).slice(2)),
          to: passengerId, // peut être null si pas d'identifiant lié
          message: `Le trajet ${removedCovo ? (removedCovo.depart + ' → ' + removedCovo.arrivee) : ''} du ${removedCovo ? removedCovo.date : ''} a été annulé par le chauffeur.`,
          relatedCovoiturageId: id,
          type: 'trajet_annule',
          read: false,
          createdAt: new Date().toISOString()
        };
        notifications.push(notification);
      }
      return res;
    });
  
    if (affected > 0) {
      localStorage.setItem('ecoride_trajets', JSON.stringify(userTrajets));
      localStorage.setItem('ecoride_notifications', JSON.stringify(notifications));
      console.log(`🔔 ${affected} réservation(s) marquée(s) 'annule_par_chauffeur' et notifications créées.`);
    } else {
      console.log("ℹ️ Aucune réservation utilisateur liée trouvée.");
    }
  
    // 4) Mettre à jour places réservées avant rendu
    updatePlacesReservees();
  
    // 5) Re-render + event global pour que l'UI se mette à jour
    if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();
    if (typeof renderHistorique === 'function') renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('ecoride:notificationsUpdated'));
  
    // 6) Message au chauffeur
    alert(`Trajet supprimé. ${affected} réservation(s) ont été marquée(s) comme annulée(s) et les passagers ont été notifiés.`);
  }

  // -------------------- trajet-close-btn --------------------

  if (target.classList.contains('trajet-close-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'valide'; // ✅ on bascule en historique
      saveTrajets();
      updatePlacesReservees();

      // 🚀 Supprimer aussi de la liste covoiturage
      let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
      trajetsCovoit = trajetsCovoit.filter(t => t.id !== id);
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));

      renderTrajetsInProgress();
      renderHistorique();
      console.log("📂 Trajet déplacé dans l'historique ET retiré du covoiturage :", trajet);
    }
  }

  // -------------------- trajet-cancel-btn --------------------

  if (target.classList.contains('trajet-cancel-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index === -1) return;

    const trajet = trajets[index];
    if (!trajet || trajet.role !== 'passager') return;

    if (!confirm("Voulez-vous vraiment annuler cette réservation ?")) return;

    // --- 1) Supprimer la réservation locale (trajets global / ecoride_trajets) ---
    const removed = trajets.splice(index, 1)[0];
    saveTrajets(); // écrit dans localStorage 'ecoride_trajets'
    console.log("🗑 Réservation supprimée de trajets (local) :", removed);

    // --- 2) Mettre à jour ecoride_trajets (source de vérité pour réservations utilisateur) ---
    // (saveTrajets() a déjà mis à jour localStorage mais on s'assure)
    let userReservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    userReservations = userReservations.filter(r => r.id !== id);
    localStorage.setItem('ecoride_trajets', JSON.stringify(userReservations));
    console.log("🔁 ecoride_trajets mis à jour, count:", userReservations.length);

    // --- 3) Mettre à jour le covoiturage dans nouveauxTrajets ---
    let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const refId = getCovoId(trajet);

    if (!refId) {
      console.warn("❌ Impossible de trouver l'ID du covoiturage pour la réservation :", trajet);
      return;
    }

    const covoIndex = trajetsCovoit.findIndex(t => t.id === refId);

    if (covoIndex === -1) {
      console.log("ℹ️ Aucun covoiturage trouvé pour la référence:", refId);
    } else {
      const covo = trajetsCovoit[covoIndex];

      // récupérer pseudo courant (fallback "Moi")
      let userPseudo = "Moi";
      try {
        const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
        if (me && me.pseudo) userPseudo = me.pseudo;
      } catch (e) { /* ignore */ }

      console.log("🔎 Annulation pour pseudo:", userPseudo, "avant passagers:", covo.passagers);

      // 1) Retirer toutes les entrées correspondant au pseudo courant (objets ou chaînes)
      //    et normaliser le reste en { pseudo, places }
      covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
        .filter(p => {
          if (!p) return false;
          if (typeof p === 'object' && p.pseudo) return p.pseudo !== userPseudo;
          if (typeof p === 'string') {
            // accepter différentes variantes "Moi", "Moi x3", "Pseudo x2"
            return !p.startsWith(userPseudo) && !p.startsWith("Moi");
          }
          return true;
        })
        .map(p => {
          if (typeof p === 'object' && p.pseudo) {
            return { pseudo: p.pseudo, places: Number(p.places || 1) };
          }
          if (typeof p === 'string') {
            const m = p.match(/^(.+?)\s*x(\d+)$/i);
            return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
          }
          return null;
        })
        .filter(Boolean);

      // 2) Recalculer occupants depuis covo.passagers normalisés
      const totalOccupiedFromPassagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
        .reduce((sum, p) => sum + (Number(p.places) || 1), 0);

      // 3) Déterminer/mettre à jour la capacité
      const vehiclePlaces = covo.vehicle?.places ?? covo.vehicule?.places ?? null;
      covo.capacity = (typeof covo.capacity === 'number')
        ? covo.capacity
        : (vehiclePlaces !== null ? Number(vehiclePlaces) : (typeof covo.places === 'number' ? Number(covo.places) : 4));

      // 4) Mettre à jour places en fonction des passagers normalisés
      covo.places = Math.max(0, covo.capacity - totalOccupiedFromPassagers);

      // 5) Sauvegarder le covoiturage mis à jour
      trajetsCovoit[covoIndex] = covo;
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));

      console.log("🔄 Covoiturage mis à jour après annulation :", covo);
    }

    // --- 4) Forcer mise à jour UI / events ---
    updatePlacesReservees();
    renderTrajetsInProgress();
    renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('ecoride:reservationCancelled', { detail: { id } }));

    // Forcer l'onglet "Mes trajets" actif
    const ongletMesTrajets = document.getElementById('tab-mes-trajets') || document.querySelector('.tab-mes-trajets');
    if (ongletMesTrajets) {
      // Ajouter la classe active
      ongletMesTrajets.classList.add('active');
      // Retirer la classe active des autres onglets
      document.querySelectorAll('.tab').forEach(tab => {
        if (tab !== ongletMesTrajets) tab.classList.remove('active');
      });
    }

    // Optionnel : scroller vers la section "Mes trajets"
    const sectionMesTrajets = document.querySelector('#mes-trajets-section');
    if (sectionMesTrajets) {
      sectionMesTrajets.scrollIntoView({ behavior: 'smooth' });
    }

    alert("✅ Réservation annulée.");
  }

  // -------------------- trajet-validate-btn --------------------
  if (target.classList && target.classList.contains('trajet-validate-btn')) {
    e.preventDefault();
    e.stopPropagation();
  
    if (typeof switchToTab === 'function') {
      switchToTab('user-trajects-form');
    }
  
    const reservationId = target.dataset.id;
    if (!reservationId) return;
  
    openRatingModal({
      reservationId,
      onSubmit: async ({ rating, review, flagged }) => {
        try {
          let reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
          const idx = reservations.findIndex(r => r.id === reservationId);
          if (idx === -1) {
            alert('Réservation introuvable.');
            return;
          }
  
          reservations[idx].status = 'valide';
          reservations[idx].rating = rating;
          reservations[idx].review = review;
          reservations[idx].validatedAt = new Date().toISOString();
          reservations[idx].reviewModeration = {
            status: 'pending',
            flagged: !!flagged,
            submittedAt: new Date().toISOString(),
            reviewedBy: null,
            reviewedAt: null,
            adminComment: null
          };
  
          localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
  
          const localIdx = trajets.findIndex(t => t.id === reservationId);
          if (localIdx !== -1) {
            trajets[localIdx] = { ...trajets[localIdx], ...reservations[idx] };
          } else {
            trajets = getTrajets();
          }
  
          // Mise à jour covoiturage : retirer le passager
          let nouveaux = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          const reservation = reservations[idx];
          const covoId = getCovoId(reservation);
          const covoIndex = nouveaux.findIndex(t => t.id === covoId);
          if (covoIndex !== -1) {
            const covo = nouveaux[covoIndex];
            const userPseudo = (() => {
              try {
                const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
                return (me && me.pseudo) ? me.pseudo : 'Moi';
              } catch (e) { return 'Moi'; }
            })();
  
            covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
              .filter(p => {
                if (!p) return false;
                if (typeof p === 'object' && p.pseudo) return p.pseudo !== userPseudo;
                if (typeof p === 'string') return !(p.startsWith(userPseudo) || p.startsWith('Moi'));
                return true;
              })
              .map(p => {
                if (typeof p === 'object' && p.pseudo) return { pseudo: p.pseudo, places: Number(p.places || 1) };
                if (typeof p === 'string') {
                  const m = p.match(/^(.+?)\s*x(\d+)$/i);
                  return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
                }
                return null;
              }).filter(Boolean);
  
            const totalOccupied = covo.passagers.reduce((sum, p) => sum + (Number(p.places) || 1), 0);
            const capacity = typeof covo.capacity === 'number' ? covo.capacity : (covo.vehicle?.places ?? covo.places ?? 4);
            covo.places = Math.max(0, capacity - totalOccupied);
  
            nouveaux[covoIndex] = covo;
            localStorage.setItem('nouveauxTrajets', JSON.stringify(nouveaux));
          }
  
          // Passer le trajet chauffeur en historique et le retirer de nouveauxTrajets
          const trajetChauffeurIndex = trajets.findIndex(t => t.id === covoId && t.role === 'chauffeur');
          if (trajetChauffeurIndex !== -1) {
            trajets[trajetChauffeurIndex].status = 'valide';
          }
  
          let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          trajetsCovoit = trajetsCovoit.filter(t => t.id !== covoId);
          localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
  
          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
  
          alert('✅ Merci ! Votre validation et avis ont bien été enregistrés (en attente de modération).');
        } catch (err) {
          console.error('Erreur validation trajet :', err);
          alert('⚠️ Une erreur est survenue lors de l’enregistrement.');
        }
      }
    });
    return;
  }
}

// -------------------- Rendu dynamique --------------------

function updatePlacesReservees() {
  const reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');

  trajets.forEach(trajet => {
    if (trajet.role === 'chauffeur') {
      const id = trajet.id;
      const count = reservations.reduce((acc, res) => {
        const ref = getCovoId(res);
        const okStatus = ['reserve', 'a_valider', 'valide'];
        if (ref === id && okStatus.includes(res.status)) {
          const places = Number(res.placesReservees ?? res.places ?? res.placesReserved ?? 1);
          return acc + (isNaN(places) ? 1 : places);
        }
        return acc;
      }, 0);
      trajet.placesReservees = count;
    } else if (trajet.role === 'passager') {
      const res = reservations.find(r => r.id === trajet.id);
      if (res) {
        trajet.placesReservees = Number(res.placesReservees ?? res.places ?? res.placesReserved ?? 1);
      } else {
        trajet.placesReservees = 1;
      }
    } else {
      trajet.placesReservees = 0;
    }
  });
}

function renderTrajetsInProgress() {
  console.log("🎨 Rendu dans 'Mes trajets en cours'");

  const container = document.querySelector('#trajets-en-cours .trajets-list');
  if (!container) return;

  container.innerHTML = ''; // On vide uniquement la liste, pas le titre 😉

  // Filtrer les trajets en cours (exclure ceux en 'valide')
  const enCours = trajets.filter(t => t.status !== "valide");

  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  updatePlacesReservees();
  console.log("DEBUG — enCours après updatePlacesReservees:", enCours);

  enCours.forEach((trajet, index) => {
    let bgClass = "";
    let actionHtml = "";

    let dateToDisplay = formatDateForCovoiturage(trajet.date) || '';
    if (trajet.role === 'passager') {
      const covoId = getCovoId(trajet);
      const trajetChauffeur = trajets.find(t => t.id === covoId && t.role === 'chauffeur');
      if (trajetChauffeur) {
        dateToDisplay = formatDateForCovoiturage(trajetChauffeur.date) || dateToDisplay;
      }
    }

    if (trajet.role === "chauffeur") {
     
      if (trajet.status === "valide") {
        return; 
      }

      if (trajet.status === "ajoute") {
        bgClass = "trajet-card actif";
        actionHtml = `
          <button class="btn-trajet trajet-edit-btn" data-id="${trajet.id}">Modifier</button>
          <button class="btn-trajet trajet-delete-btn" data-id="${trajet.id}">Supprimer</button>
          <button class="btn-trajet trajet-start-btn" data-id="${trajet.id}">Démarrer</button>
        `;
      } else if (trajet.status === "demarre") {
        bgClass = "trajet-card termine";
        actionHtml = `
          <button class="btn-trajet trajet-arrive-btn" data-id="${trajet.id}">Arrivée à destination</button>
        `;
      } else if (trajet.status === "termine") {
        bgClass = "trajet-card attente";
        actionHtml = `
          <span class="trajet-status">En attente de validation des passagers...</span>
          <!-- bouton clôturer supprimé -->
        `;
      }
    } else if (trajet.role === 'passager') {
      if (trajet.status === 'reserve') {
        bgClass = "trajet-card reserve";
        const refId = getCovoId(trajet);
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-cancel-btn" data-id="${trajet.id}">Annuler</button>
        `;
      } else if (trajet.status === 'a_valider') {
        bgClass = "trajet-card attente";
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${getCovoId(trajet)}">Détail</button>
          <button class="btn-trajet trajet-validate-btn" data-id="${trajet.id}">Valider</button>
        `;
      } else {
        // statut inattendu ou autre -> afficher au minimum Détail
        const refId = getCovoId(trajet);
        actionHtml = `<button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>`;
      }
    }

    container.innerHTML += `
      <div class="${bgClass}" data-id="${trajet.id}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${dateToDisplay}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${trajet.placesReservees} place${trajet.placesReservees > 1 ? 's' : ''} réservée${trajet.placesReservees > 1 ? 's' : ''}
            </span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
          ${actionHtml}
        </div>
      </div>
    `;
  });

  // 🔥 Ajout bouton reset en DEV
  if (window.location.hostname === "localhost") {
    container.innerHTML += `
      <button class="btn-dev-reset" id="reset-trajets-en-cours">
        🗑 Supprimer tous les trajets en cours (DEV)
      </button>
    `;

    const resetBtn = document.getElementById("reset-trajets-en-cours");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Supprimer tous les trajets en cours ? (DEV)")) {
          trajets = trajets.filter(t => t.status === "valide");
          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
        }
      });
    }
  }

  // Attacher les listeners "Détail" (à ré-attacher à chaque rendu)
  container.querySelectorAll('.trajet-detail-btn').forEach(btn => {
    if (btn._detailHandler) btn.removeEventListener('click', btn._detailHandler);

    const handler = (ev) => {
      ev.preventDefault?.();
      const covoId = btn.dataset.covoId;

      if (!covoId || covoId === 'null' || covoId === 'undefined') {
        console.warn('Aucun ID de covoiturage disponible pour ce trajet.', covoId);
        return;
      }

      const newPath = `/detail/${encodeURIComponent(covoId)}`;

      try {
        // Format attendu par ton router : { id }
        history.pushState({ id: covoId }, '', newPath);
        const pop = new PopStateEvent('popstate', { state: { id: covoId } });
        window.dispatchEvent(pop);
      } catch (err) {
        console.error('Erreur navigation détail:', err);
        window.location.href = newPath; // fallback
      }
    };

    btn._detailHandler = handler;
    btn.addEventListener('click', handler);
  });
}

// -------------------- Historique --------------------

function renderHistorique() {
  const container = document.querySelector('.trajets-historique');
  if (!container) return;

  container.innerHTML = `<h2>Mes trajets passés</h2>`;

  const passe = trajets.filter(t => t.status === "valide");

  if (passe.length === 0) {
    container.innerHTML += `<p>Aucun trajet terminé</p>`;
    return;
  }

  passe.forEach(trajet => {
    const placesReservees = trajet.placesReservees || 0;
    let cardClass = 'trajet-card valide';
  
    if (trajet.role === 'passager') {
      cardClass = 'trajet-card reserve';
  
      // Récupérer la date du trajet chauffeur lié
      const covoId = getCovoId(trajet);
      const trajetChauffeur = trajets.find(t => t.id === covoId && t.role === 'chauffeur');
      if (trajetChauffeur && trajetChauffeur.date) {
        trajet.date = trajetChauffeur.date; // injecter la date pour affichage
      }
    }
  
    container.innerHTML += `
      <div class="${cardClass}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${formatDateForCovoiturage(trajet.date) || ""}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${placesReservees} place${placesReservees > 1 ? 's' : ''} réservée${placesReservees > 1 ? 's' : ''}
            </span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
        </div>
      </div>
    `;
  });
}

// -------------------- Persistance --------------------
export function getTrajets() {
  try {
    const stored = localStorage.getItem('ecoride_trajets');
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("❌ Erreur lecture trajets localStorage:", err);
    return [];
  }
}

function saveTrajets() {
  try {
    localStorage.setItem('ecoride_trajets', JSON.stringify(trajets));
    console.log("💾 Trajets sauvegardés:", trajets.length);
  } catch (err) {
    console.error("❌ Erreur sauvegarde trajets:", err);
  }
}


// -------------------- Injection dynamique véhicules --------------------

function populateVehiclesDatalist() {
  try {
    const stored = localStorage.getItem('ecoride_vehicles');
    const vehicles = stored ? JSON.parse(stored) : [];

    const select = document.querySelector('#vehicle'); // ⚠️ bien "#vehicle"
    if (!select) return;

    select.innerHTML = '<option value="" selected hidden>-- Sélectionner un véhicule --</option>';

    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = v.plate;
      option.textContent = getVehicleLabel(v); 
      select.appendChild(option);

      // normalisation minimale
      v.seats = Number(v.seats ?? v.places ?? 4);
      v.plate = v.plate || v.licencePlate || v.immatriculation || '';
    });

    console.log("🚗 Véhicules injectés dans le select:", vehicles.length, vehicles);
  } catch (err) {
    console.error("❌ Erreur chargement véhicules:", err);
  }
}

// -------------------- Ajout au covoiturage --------------------
function ajouterAuCovoiturage(trajetData) {
  console.log("🚗 ajout/update covoiturage pour:", trajetData.id);

  // Charger la liste existante
  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');

  // Déterminer la capacity (priorité : vehicle.places, puis trajetData.places, sinon 4)
  const capacity = (trajetData.vehicle && trajetData.vehicle.seats !== undefined)
    ? Number(trajetData.vehicle.seats)
    : (trajetData.places !== undefined ? Number(trajetData.places) : 4);

  // Construire l'objet standardisé pour le covoiturage
  const baseTrajetCovoit = {
    id: trajetData.id,
    date: formatDateForCovoiturage(trajetData.date),
    chauffeur: {
      pseudo: trajetData.chauffeur?.pseudo || "Moi",
      rating: trajetData.chauffeur?.rating || 0,
      photo: trajetData.chauffeur?.photo || "images/default-avatar.png"
    },
    type: getVehicleType(trajetData.vehicle),
    capacity,
    places: capacity, // valeur par défaut, sera réajustée ensuite
    depart: trajetData.depart,
    arrivee: trajetData.arrivee,
    heureDepart: trajetData.heureDepart ? trajetData.heureDepart.replace(':', 'h') : '',
    heureArrivee: trajetData.heureArrivee ? trajetData.heureArrivee.replace(':', 'h') : '',
    prix: parseInt(trajetData.prix) || 0,
    rating: trajetData.rating || 0,
    passagers: Array.isArray(trajetData.passagers) ? trajetData.passagers.slice() : [],
    vehicle: trajetData.vehicle || null
  };

  baseTrajetCovoit.passagers = normalizePassagers(baseTrajetCovoit.passagers);

  // Chercher si le covoiturage existe déjà
  const idx = trajetsCovoiturage.findIndex(t => t.id === baseTrajetCovoit.id);

  if (idx !== -1) {
    // Mise à jour : ne pas écraser passagers ni places sans recalcul
    const existing = trajetsCovoiturage[idx];

    
    // Normaliser les passagers existants (s'ils existent) et les utiliser si présents
    const existingPassagers = normalizePassagers(Array.isArray(existing.passagers) ? existing.passagers : []);
    baseTrajetCovoit.passagers = existingPassagers.length > 0
      ? existingPassagers.slice()
      : baseTrajetCovoit.passagers;

    // Si la capacité a changé (p.ex. véhicule modifié), recalculer places restantes
    const totalOccupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      return sum + (Number(p.places) || 1);
    }, 0);

    const newCapacity = baseTrajetCovoit.capacity;
    baseTrajetCovoit.capacity = (typeof existing.capacity === 'number') ? existing.capacity : newCapacity;

    // Si on détecte que vehicle a changé => mettre à jour capacity puis places
    if (newCapacity !== baseTrajetCovoit.capacity) {
      // si capacity réduit en dessous de occupants, places=0 sinon capacity - occupied
      baseTrajetCovoit.places = Math.max(0, newCapacity - totalOccupied);
    } else {
      // sinon préserver places si existant sinon calculer
      baseTrajetCovoit.places = (typeof existing.places === 'number') ? existing.places : Math.max(0, newCapacity - totalOccupied);
    }

    // Merge non destructif (préserver champs existants si présents)
    trajetsCovoiturage[idx] = Object.assign({}, existing, baseTrajetCovoit);
    console.log("🔁 Trajet covoiturage mis à jour :", trajetsCovoiturage[idx]);
  } else {
    // Nouveau covoiturage : recalculer places en fonction des passagers actuels
    const occupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      return sum + (Number(p.places) || 1);
    }, 0);
    baseTrajetCovoit.places = Math.max(0, capacity - occupied);

    trajetsCovoiturage.push(baseTrajetCovoit);
    console.log("➕ Nouveau trajet covoiturage ajouté :", baseTrajetCovoit);
  }

  // Sauvegarde
  localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
  // Notifier si tu utilises l'événement global
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
}

// Fonction helper pour formater la date
function formatDateForCovoiturage(dateISO) {
  if (!dateISO) return '';
  const date = new Date(dateISO);
  if (isNaN(date.getTime())) return ''; // date invalide
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('fr-FR', options);
}

// Fonction helper pour déduire le type de véhicule
function getVehicleType(vehicle) {
  if (!vehicle) return "Economique";

  // 🔹 Si c'est déjà une chaîne
  if (typeof vehicle === "string") {
    const vehicleLower = vehicle.toLowerCase();
    if (vehicleLower.includes("tesla") || vehicleLower.includes("électrique")) {
      return "Electrique";  
    } else if (vehicleLower.includes("hybride") || vehicleLower.includes("prius")) {
      return "Hybride";     
    } else {
      return "Thermique";   
    }
  }

  // 🔹 Si c'est un objet
  if (typeof vehicle === "object") {
    if (vehicle.type) {
      // Capitaliser la première lettre
      const type = vehicle.type.toLowerCase();
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    const brand = (vehicle.brand || vehicle.marque || "").toLowerCase();
    const model = (vehicle.vehicleModel || vehicle.modele || "").toLowerCase();

    if (brand.includes("tesla") || model.includes("électrique")) {
      return "Electrique";
    } else if (brand.includes("toyota") || model.includes("hybride") || model.includes("prius")) {
      return "Hybride";
    } else {
      return "Thermique";
    }
  }

  return "Economique";
}

// -------------------- Exports debug --------------------
export function debugTrajets() {
  console.log("🔍 Etat trajets:", trajets);
  return trajets;
}

window.debugTrajets = debugTrajets;