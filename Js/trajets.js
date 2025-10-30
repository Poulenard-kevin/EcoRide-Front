// -------------------- Helpers --------------------
function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

function onDomReady(selector, callback) {
  const el = document.querySelector(selector);
  if (el) return callback(el);

  // 🔁 Observe le DOM jusqu'à ce que le sélecteur existe
  const observer = new MutationObserver(() => {
    const node = document.querySelector(selector);
    if (node) {
      observer.disconnect();
      callback(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
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

// ---------- helpers/avatar / user ----------
export function resolveAvatarSrc(src) {
  if (!src) return '/images/default-avatar.png';
  src = String(src).trim();
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) return src;
  return '/' + src.replace(/^\/+/, '');
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('ecoride_user') || 'null');
  } catch (e) {
    console.warn('getCurrentUser parse error', e);
    return null;
  }
}

export function getCurrentUserPseudo() {
  const me = getCurrentUser();
  return me?.pseudo ?? 'Moi';
}

export function enrichTrajetWithCurrentUser(trajet = {}) {
  try {
    const me = getCurrentUser();
    if (!me) return trajet;

    if (!trajet.chauffeur || typeof trajet.chauffeur !== 'object') {
      trajet.chauffeur = {};
    }

    trajet.chauffeur.pseudo = trajet.chauffeur.pseudo ?? me.pseudo ?? 'Moi';
    const rawPhoto = trajet.chauffeur.photo ?? me.photo ?? 'images/default-avatar.png';
    trajet.chauffeur.photo = resolveAvatarSrc(rawPhoto);
    trajet.chauffeur.rating = (trajet.chauffeur.rating ?? me.rating ?? 0);
  } catch (e) {
    console.warn('enrichTrajetWithCurrentUser error', e);
  }
  return trajet;
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

  submitBtn.addEventListener('click', async () => {
    const review = reviewEl.value.trim();
  
    // on ferme le modal / nettoie l'UI
    cleanup();
  
    // Si onSubmit est fourni, on l'appelle et on attend sa résolution (si async)
    try {
      if (typeof onSubmit === 'function') {
        await Promise.resolve(onSubmit({ rating: currentRating, review, flagged: false }));
      }
    } catch (err) {
      console.error('Erreur dans onSubmit:', err);
      return;
    }
  
    // Préparer l'objet avis à transmettre à l'espace employé
    const avis = {
      id: reservationId || genId(),
      reservationId: typeof reservationId !== 'undefined' ? reservationId : null,
      pseudo: getCurrentUserPseudo(),
      note: currentRating,
      texte: review,
      date: new Date().toISOString()
    };
    
    // ✅ Sauvegarde directe dans localStorage pour persistance
    try {
      const stored = JSON.parse(localStorage.getItem('ecoride_avis') || '[]');
      stored.unshift(avis);
      localStorage.setItem('ecoride_avis', JSON.stringify(stored));
    } catch (e) {
      console.warn("Erreur stockage avis:", e);
    }
    
    // ✅ Émettre un événement global (utile si Espace Employé est déjà ouvert)
    window.dispatchEvent(new CustomEvent('ecoride:avisSubmitted', { detail: avis }));
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (document.body.contains(wrapper)) wrapper.remove();
  });
}

document.addEventListener('hidden.bs.modal', () => {
  // si un paneau “user-space-form” a été caché, on le réaffiche
  const active = document.querySelector('.user-space-form.active');
  if (active && active.style.display === 'none') {
    active.style.display = 'block';
  }
});

export function genId() {
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

  // 🚀 Auto-scroll & focus suivant dans les formulaires
  ['#trajet-form', '#vehicule-form'].forEach(selector => {
    const formEl = document.querySelector(selector);
    if (!formEl) return;

    const inputs = formEl.querySelectorAll('input, select, textarea');
    inputs.forEach((input, i) => {

      // appui sur Entrée → focus champ suivant
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = inputs[i + 1];
          if (next) {
            next.focus({ preventScroll: true });
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            formEl.requestSubmit?.();
          }
        }
      });

      // changement de valeur → focus champ suivant + scroll
      input.addEventListener('change', () => {
        const next = inputs[i + 1];
        if (next) {
          next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          next.focus({ preventScroll: true });
        }
      });

      // saisie complète (utile si maxlength)
      input.addEventListener('input', () => {
        if (input.maxLength && input.value.length >= input.maxLength) {
          const next = inputs[i + 1];
          if (next) {
            next.focus({ preventScroll: true });
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });
  });

  // Event listeners pour les boutons dynamiques
  document.addEventListener('click', handleTrajetActions);

  // ✅ Appel unique et sécurisé de renderHistorique
  onDomReady('.trajets-historique', (container) => {
    console.log('🟢 Container historique apparu dans le DOM');
    
    // ✅ Éviter double rendu
    if (container.dataset.rendered === '1') {
      console.log('⚪ Historique déjà rendu, skip');
      return;
    }
    container.dataset.rendered = '1';
  
    renderHistorique();
    renderTrajetsInProgress();
    populateVehiclesDatalist();
  });

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
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const histoContainer = document.querySelector('.trajets-historique');
    if (histoContainer) {
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
          const before = trajets.length;
          trajets = trajets.filter(t => t.status !== 'valide');
          const removed = before - trajets.length;

          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();

          console.log(`🧹 Historique vidé (dev). Trajets supprimés: ${removed}`);
        });

        histoContainer.parentNode.insertBefore(clearBtn, histoContainer.nextSibling);
      }
    }
  }
  window.addEventListener('ecoride:reservationAdded', (e) => {
    try {
      const reservation = e.detail;
  
      if (!trajets.find(r => r.id === reservation.id)) {
        trajets.push(reservation);
        saveTrajets();
        updatePlacesReservees();
        renderTrajetsInProgress();
      }
    } catch (err) {
      console.warn('Erreur lors du traitement de l\'événement reservationAdded', err);
    }
  });

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
    vehicle: selectedVehicle || null,
    places: (selectedVehicle && selectedVehicle.seats !== undefined && selectedVehicle.seats !== null)
      ? Number(selectedVehicle.seats)
      : (formData.get('places') ? Number(formData.get('places')) : 4),
    role: "chauffeur",
    status: 'ajoute'
  };

  // enrichir avec profil courant (pseudo/photo/rating) avant d'ajouter
  enrichTrajetWithCurrentUser(trajetData);

  if (!trajetData.depart || !trajetData.arrivee || !trajetData.date) {
    alert('Veuillez remplir les champs obligatoires (départ, arrivée, date)');
    return;
  }

  if (editingIndex !== null && trajets[editingIndex]) {
    trajetData.status = trajets[editingIndex].status; 
    trajets[editingIndex] = trajetData;
    console.log("✏️ Trajet modifié:", trajetData);
    editingIndex = null;
  } else {
    trajets.push(trajetData);
    console.log("➕ Nouveau trajet ajouté:", trajetData);
  }

  saveTrajets();
  ajouterAuCovoiturage(trajetData);
  updatePlacesReservees();
  renderTrajetsInProgress();
  renderHistorique();

  e.target.reset();
  document.querySelectorAll('input, select').forEach(input => {
    if (!input.value) input.classList.add('empty'); 
    else input.classList.remove('empty');
  });
}

// -------------------- Gestion des actions --------------------

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
          r.status = 'a_valider';
          updated = true;
        }
        return r;
      });
  
      console.log('Réservation avant mise à jour:', reservations);
      console.log('getCovoId pour chaque réservation:', reservations.map(r => getCovoId(r)));
  
      if (updated) {
        localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
        window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
  
        reservations.forEach(r => {
          const idx = trajets.findIndex(t => t.id === r.id);
          if (idx !== -1) {
            trajets[idx].status = r.status;
          }
        });
  
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
    e.preventDefault?.();
    e.stopPropagation?.();

    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);

    if (!trajet || trajet.role !== 'chauffeur') return;

    if (typeof switchToTab === 'function') {
      switchToTab('user-trajects-form');
      console.log('switchToTab called for user-trajects-form');
    }

    tryUntilExists(() => {
      return document.querySelector('#trajet-form') !== null;
    }, 12, 80).then(found => {
      if (!found) {
        console.warn('trajet-form introuvable après retries');
        return;
      }

      const form = document.querySelector('#trajet-form');
      if (!form) return;

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

      editingIndex = trajets.findIndex(t => t.id === id);
      console.log("✏️ Trajet prêt pour modification (index:", editingIndex, "):", trajet);

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

      setTimeout(() => {
        robustScrollTo(form);
        const first = form.querySelector('input, textarea, select, button');
        if (first) first.focus({ preventScroll: true });
      }, 40);
    });

    return;
  }

  // -------------------- trajet-signaler-btn --------------------
  if (target.classList.contains('trajet-signaler-btn')) {
    e.preventDefault();
    e.stopPropagation();

    const reservationId = target.dataset.id;
    const covoId = target.dataset.covoId;

    if (!reservationId) return;

    const trajet = trajets.find(t => t.id === reservationId);
    if (!trajet) {
      alert("Trajet introuvable.");
      return;
    }

    const description = prompt("Pourquoi voulez-vous signaler ce trajet ?\n(ex: retard, comportement inapproprié, fraude...)") || "";

    if (!description.trim()) {
      alert("Signalement annulé (aucune description fournie).");
      return;
    }

    let chauffeurPseudo = "Chauffeur inconnu";
    let chauffeurMail = "";
    try {
      const covos = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
      const covo = covos.find(c => c.id === covoId);
      if (covo && covo.chauffeur) {
        chauffeurPseudo = covo.chauffeur.pseudo || chauffeurPseudo;
        chauffeurMail = covo.chauffeur.email || covo.chauffeur.mail || "";
      }
    } catch (err) {
      console.warn("Erreur récupération infos chauffeur:", err);
    }

    const passagerPseudo = getCurrentUserPseudo();

    const signalement = {
      id: genId(),
      chauffeur: chauffeurPseudo,
      chauffeurMail,
      passager: passagerPseudo,
      passagerMail: "",
      dateDepart: `${formatDateJJMMAAAA(trajet.date)} ${trajet.heureDepart || ''}`.trim(),
      dateArrivee: trajet.heureArrivee || "",
      trajet: `${trajet.depart} → ${trajet.arrivee}`,
      description: description.trim(),
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    try {
      const stored = JSON.parse(localStorage.getItem('ecoride_trajets_signales') || '[]');
      stored.unshift(signalement);
      localStorage.setItem('ecoride_trajets_signales', JSON.stringify(stored));
    } catch (err) {
      console.error("Erreur sauvegarde signalement:", err);
      alert("⚠️ Erreur lors de l'enregistrement du signalement.");
      return;
    }

    window.dispatchEvent(new CustomEvent('ecoride:trajetSignale', { detail: signalement }));

    alert("✅ Trajet signalé. Il sera traité par l'équipe support.");
    console.log("🚨 Signalement créé:", signalement);

    return;
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
    let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const covoIndex = trajetsCovoiturage.findIndex(t => t.id === id);
    let removedCovo = null;
    if (covoIndex !== -1) {
      removedCovo = trajetsCovoiturage.splice(covoIndex, 1)[0];
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
      window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
      console.log("🚮 Covoiturage supprimé depuis nouveauxTrajets (ID:", id, ")");
    } else {
      console.log("ℹ️ Aucun covoiturage trouvé dans nouveauxTrajets pour l'ID:", id);
    }
  
    // 3) Marquer les réservations liées dans ecoride_trajets et créer notifications
    let userTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    let notifications = JSON.parse(localStorage.getItem('ecoride_notifications') || '[]');
  
    const beforeCount = userTrajets.length;
    let affected = 0;
  
    const getPassengerIdentifier = (res) => {
      return res.userId || res.passagerId || res.pseudo || (res.user && res.user.id) || (res.passager && res.passager.id) || null;
    };
  
    userTrajets = userTrajets.map(res => {
      const ref = getCovoId(res);
      if (ref === id) {
        affected++;
  
        res.status = 'annule_par_chauffeur';
        res.cancellationReason = res.cancellationReason || "Trajet annulé par le chauffeur";
        res.cancellationAt = new Date().toISOString();
        res.notified = false;
  
        const passengerId = getPassengerIdentifier(res);
        const notification = {
          id: genId ? genId() : ('notif_' + Date.now() + Math.random().toString(36).slice(2)),
          to: passengerId,
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
      window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
      localStorage.setItem('ecoride_notifications', JSON.stringify(notifications));
      window.dispatchEvent(new CustomEvent('ecoride:notificationsUpdated'));
      console.log(`🔔 ${affected} réservation(s) marquée(s) 'annule_par_chauffeur' et notifications créées.`);
    } else {
      console.log("ℹ️ Aucune réservation utilisateur liée trouvée.");
    }
  
    updatePlacesReservees();
  
    if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();
    if (typeof renderHistorique === 'function') renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('ecoride:notificationsUpdated'));
  
    alert(`Trajet supprimé. ${affected} réservation(s) ont été marquée(s) comme annulée(s) et les passagers ont été notifiés.`);
  }

  // -------------------- trajet-close-btn --------------------

  if (target.classList.contains('trajet-close-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'valide';
      saveTrajets();
      updatePlacesReservees();

      let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
      trajetsCovoiturage = trajetsCovoiturage.filter(t => t.id !== id);
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
      window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));

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

    const removed = trajets.splice(index, 1)[0];
    saveTrajets();
    console.log("🗑 Réservation supprimée de trajets (local) :", removed);

    let userReservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    userReservations = userReservations.filter(r => r.id !== id);
    localStorage.setItem('ecoride_trajets', JSON.stringify(userReservations));
    window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
    console.log("🔁 ecoride_trajets mis à jour, count:", userReservations.length);

    let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const refId = getCovoId(trajet);

    if (!refId) {
      console.warn("❌ Impossible de trouver l'ID du covoiturage pour la réservation :", trajet);
      return;
    }

    const covoIndex = trajetsCovoiturage.findIndex(t => t.id === refId);

    if (covoIndex === -1) {
      console.log("ℹ️ Aucun covoiturage trouvé pour la référence:", refId);
    } else {
      const covo = trajetsCovoiturage[covoIndex];

      let userPseudo = "Moi";
      try {
        const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
        if (me && me.pseudo) userPseudo = me.pseudo;
      } catch (e) { /* ignore */ }

      console.log("🔎 Annulation pour pseudo:", userPseudo, "avant passagers:", covo.passagers);

      covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
        .filter(p => {
          if (!p) return false;
          if (typeof p === 'object' && p.pseudo) return p.pseudo !== userPseudo;
          if (typeof p === 'string') {
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

      const totalOccupiedFromPassagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
        .reduce((sum, p) => sum + (Number(p.places) || 1), 0);

      const vehiclePlaces = covo.vehicle?.places ?? covo.vehicule?.places ?? null;
      covo.capacity = (typeof covo.capacity === 'number')
        ? covo.capacity
        : (vehiclePlaces !== null ? Number(vehiclePlaces) : (typeof covo.places === 'number' ? Number(covo.places) : 4));

      covo.places = Math.max(0, covo.capacity - totalOccupiedFromPassagers);

      trajetsCovoiturage[covoIndex] = covo;
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
      window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));

      console.log("🔄 Covoiturage mis à jour après annulation :", covo);
    }

    updatePlacesReservees();
    renderTrajetsInProgress();
    renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('ecoride:reservationCancelled', { detail: { id } }));

    const ongletMesTrajets = document.getElementById('tab-mes-trajets') || document.querySelector('.tab-mes-trajets');
    if (ongletMesTrajets) {
      ongletMesTrajets.classList.add('active');
      document.querySelectorAll('.tab').forEach(tab => {
        if (tab !== ongletMesTrajets) tab.classList.remove('active');
      });
    }

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
          window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
  
          const localIdx = trajets.findIndex(t => t.id === reservationId);
          if (localIdx !== -1) {
            trajets[localIdx] = { ...trajets[localIdx], ...reservations[idx] };
          } else {
            trajets = getTrajets();
          }
  
          let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          const reservation = reservations[idx];
          const covoId = getCovoId(reservation);
          const covoIndex = trajetsCovoiturage.findIndex(t => t.id === covoId);
          if (covoIndex !== -1) {
            const covo = trajetsCovoiturage[covoIndex];
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
                  return m ? { pseudo: p[1].trim(), places: Number(p[2]) } : { pseudo: p.trim(), places: 1 };
                }
                return null;
              }).filter(Boolean);
  
            const totalOccupied = covo.passagers.reduce((sum, p) => sum + (Number(p.places) || 1), 0);
            const capacity = typeof covo.capacity === 'number' ? covo.capacity : (covo.vehicle?.places ?? covo.places ?? 4);
            covo.places = Math.max(0, capacity - totalOccupied);
  
            trajetsCovoiturage[covoIndex] = covo;
            localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
            window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
          }
  
          const trajetChauffeurIndex = trajets.findIndex(t => t.id === covoId && t.role === 'chauffeur');
          if (trajetChauffeurIndex !== -1) {
            trajets[trajetChauffeurIndex].status = 'valide';
          }
  
          let trajetsCovoiturage2 = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          trajetsCovoiturage2 = trajetsCovoiturage2.filter(t => t.id !== covoId);
          localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage2));
          window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
  
          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();

          // ✅ Ouvre automatiquement l'onglet "Mes trajets" après réservation
          if (typeof switchToTab === 'function') {
            switchToTab('user-trajects-form'); // adapte si ton id diffère
          }

          // ✅ Scroll jusqu’à la section “Mes trajets en cours”
          const sectionMesTrajets = document.querySelector('#trajets-en-cours');
          if (sectionMesTrajets) {
            sectionMesTrajets.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
  
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

  container.innerHTML = '';

  const enCours = trajets.filter(t => t.status !== "valide");

  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  updatePlacesReservees();
  console.log("DEBUG — enCours après updatePlacesReservees:", enCours);

  enCours.forEach((trajet) => {
    let bgClass = "";
    let actionHtml = "";

    let dateToDisplay = formatDateJJMMAAAA(trajet.date) || '';
    if (trajet.role === 'passager') {
      const covoId = getCovoId(trajet);
      const trajetChauffeur = trajets.find(t => t.id === covoId && t.role === 'chauffeur');
      if (trajetChauffeur) {
        dateToDisplay = formatDateJJMMAAAA(trajetChauffeur.date) || dateToDisplay;
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
        `;
      }
    } else if (trajet.role === 'passager') {
      if (trajet.status === 'reserve') {
        bgClass = "trajet-card reserve";
        const refId = getCovoId(trajet);
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-cancel-btn" data-id="${trajet.id}">Annuler</button>
          <button class="btn-trajet trajet-signaler-btn" data-id="${trajet.id}" data-covo-id="${refId}">⚠ Signaler</button>
        `;
      } else if (trajet.status === 'a_valider') {
        bgClass = "trajet-card attente";
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${getCovoId(trajet)}">Détail</button>
          <button class="btn-trajet trajet-validate-btn" data-id="${trajet.id}">Valider</button>
          <button class="btn-trajet trajet-signaler-btn" data-id="${trajet.id}" data-covo-id="${getCovoId(trajet)}">⚠ Signaler</button>
        `;
      } else if (trajet.status === 'valide') {
        const refId = getCovoId(trajet);
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-signaler-btn" data-id="${trajet.id}" data-covo-id="${refId}">⚠ Signaler</button>
        `;
      } else {
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
        history.pushState({ id: covoId }, '', newPath);
        const pop = new PopStateEvent('popstate', { state: { id: covoId } });
        window.dispatchEvent(pop);
      } catch (err) {
        console.error('Erreur navigation détail:', err);
        window.location.href = newPath;
      }
    };

    btn._detailHandler = handler;
    btn.addEventListener('click', handler);
  });
}

// -------------------- Historique --------------------
export function renderHistorique() {
  console.log("[renderHistorique] Démarrage");

  // ✅ Vérifier qu'il n'y a qu'un seul conteneur
  const allContainers = document.querySelectorAll('.trajets-historique');
  if (allContainers.length > 1) {
    console.warn(`⚠️ ${allContainers.length} conteneurs .trajets-historique détectés, nettoyage...`);
    allContainers.forEach((el, i) => {
      if (i > 0) el.remove();
    });
  }

  const container = document.querySelector('.trajets-historique');
  if (!container) {
    console.warn("⚠️ Conteneur .trajets-historique introuvable");
    return;
  }

  // ✅ Éviter double rendu simultané
  if (container.dataset.rendering === '1') {
    console.log('⚪ renderHistorique déjà en cours, skip');
    return;
  }
  container.dataset.rendering = '1';

  // Réinitialise le contenu du conteneur
  container.innerHTML = `<h2>Mes trajets passés</h2>`;

  // ✅ Recharge toujours depuis le localStorage
  let allTrajets = [];
  try {
    allTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  } catch (e) {
    console.error('❌ Impossible de parser les trajets', e);
  }

  const passe = allTrajets.filter(t => t.status === "valide");
  console.log(`[renderHistorique] Trajets valides : ${passe.length}`);

  // 🧮 Trier les trajets du plus récent au plus ancien
  passe.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB - dateA; // tri décroissant : plus récent d'abord
  });

  if (passe.length === 0) {
    container.innerHTML += `<p>Aucun trajet terminé</p>`;
    return;
  }

  // 🧱 Construction du HTML directement dans container
  passe.forEach(trajet => {
    const placesReservees = trajet.placesReservees || 0;
    let cardClass = 'trajet-card valide';

    if (trajet.role === 'passager') {
      cardClass = 'trajet-card reserve';
      const covoId = getCovoId(trajet);
      const trajetChauffeur = allTrajets.find(t => t.id === covoId && t.role === 'chauffeur');
      if (trajetChauffeur && trajetChauffeur.date) {
        trajet.date = trajetChauffeur.date;
      }
    }

    container.innerHTML += `
      <div class="${cardClass}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${formatDateJJMMAAAA(trajet.date) || ""}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • 
              ${placesReservees} place${placesReservees > 1 ? 's' : ''} réservée${placesReservees > 1 ? 's' : ''}
            </span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
        </div>
      </div>
    `;
  });

  // ✅ Ne pas forcer le display : il est géré par les onglets
  console.log(`✅ Historique rendu (${passe.length} trajets affichés)`);

  // --- Gérer la visibilité du panneau Historique uniquement si l'onglet est actif ---
  const histContainer = document.querySelector('.trajets-historique');
  if (histContainer) {
    const parentPanel = histContainer.closest('.user-space-form');

    // détecte l’onglet actuellement actif
    const activeTab = document.querySelector('.tab.active, .nav-link.active');
    const isHistoriqueTabActive =
      activeTab &&
      (
        activeTab.id?.includes('historique') ||
        activeTab.dataset?.target === '#user-history-form' ||
        activeTab.href?.includes('#user-history-form')
      );

    if (parentPanel) {
      if (isHistoriqueTabActive) {
        console.log('🟢 Onglet Historique actif → on rend visible');
        parentPanel.style.display = 'block';
        parentPanel.style.visibility = 'visible';
        parentPanel.style.opacity = '1';
      } else {
        console.log('⚪ Onglet Historique inactif → on ne le rend pas visible');
        parentPanel.style.display = '';
        parentPanel.style.visibility = '';
        parentPanel.style.opacity = '';
      }
    }
  }
  // ✅ À la toute fin de la fonction
  delete container.dataset.rendering;
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

    window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
  } catch (err) {
    console.error("❌ Erreur sauvegarde trajets:", err);
  }
}


// -------------------- Injection dynamique véhicules --------------------

function populateVehiclesDatalist() {
  try {
    const stored = localStorage.getItem('ecoride_vehicles');
    const vehicles = stored ? JSON.parse(stored) : [];

    const select = document.querySelector('#vehicle');
    if (!select) return;

    select.innerHTML = '<option value="" selected hidden>-- Sélectionner un véhicule --</option>';

    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = v.plate;
      option.textContent = getVehicleLabel(v); 
      select.appendChild(option);

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

  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');

  const capacity = (trajetData.vehicle && trajetData.vehicle.seats !== undefined)
    ? Number(trajetData.vehicle.seats)
    : (trajetData.places !== undefined ? Number(trajetData.places) : 4);

  const baseTrajetCovoit = {
    id: trajetData.id,
    date: formatDateJJMMAAAA(trajetData.date),
    chauffeur: {
      pseudo: trajetData.chauffeur?.pseudo || "Moi",
      rating: trajetData.chauffeur?.rating || 0,
      photo: trajetData.chauffeur?.photo || "images/default-avatar.png"
    },
    type: getVehicleType(trajetData.vehicle),
    capacity,
    places: capacity,
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

  const idx = trajetsCovoiturage.findIndex(t => t.id === baseTrajetCovoit.id);

  if (idx !== -1) {
    const existing = trajetsCovoiturage[idx];

    const existingPassagers = normalizePassagers(Array.isArray(existing.passagers) ? existing.passagers : []);
    baseTrajetCovoit.passagers = existingPassagers.length > 0
      ? existingPassagers.slice()
      : baseTrajetCovoit.passagers;

    const totalOccupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      return sum + (Number(p.places) || 1);
    }, 0);

    const newCapacity = baseTrajetCovoit.capacity;
    baseTrajetCovoit.capacity = (typeof existing.capacity === 'number') ? existing.capacity : newCapacity;

    if (newCapacity !== baseTrajetCovoit.capacity) {
      baseTrajetCovoit.places = Math.max(0, newCapacity - totalOccupied);
    } else {
      baseTrajetCovoit.places = (typeof existing.places === 'number') ? existing.places : Math.max(0, newCapacity - totalOccupied);
    }

    trajetsCovoiturage[idx] = Object.assign({}, existing, baseTrajetCovoit);
    console.log("🔁 Trajet covoiturage mis à jour :", trajetsCovoiturage[idx]);
  } else {
    const occupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      return sum + (Number(p.places) || 1);
    }, 0);
    baseTrajetCovoit.places = Math.max(0, capacity - occupied);

    trajetsCovoiturage.push(baseTrajetCovoit);
    console.log("➕ Nouveau trajet covoiturage ajouté :", baseTrajetCovoit);
  }

  localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
}

// Fonction helper pour formater la date
export function formatDateJJMMAAAA(input) {
  if (!input) return '';
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d)) return '';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = d.getFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

// Fonction helper pour déduire le type de véhicule
function getVehicleType(vehicle) {
  if (!vehicle) return "Economique";

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

  if (typeof vehicle === "object") {
    if (vehicle.type) {
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