// trajets.js
import { apiFetch } from '/assets/js/api.js';
import { createCarIfNeeded, saveCarpoolApi, deleteCarpoolApi, carOwnedBy } from '/assets/js/trips-api.js';
console.log('apiFetch typeof =', typeof apiFetch);
// -------------------- Utilitaires & exports de base --------------------

const deleting = new Set();

export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function resolveAvatarSrc(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) return raw;
  return raw.startsWith('/') ? raw : '/' + raw;
}

export function getProfileAvatarFromStorage() {
  try {
    const rawUser = localStorage.getItem('ecoride_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && u.photo) return resolveAvatarSrc(u.photo);
    }
  } catch(e){}
  try {
    const raw = localStorage.getItem('ecoride_profileAvatar');
    if (raw) {
      const v = JSON.parse(raw);
      if (typeof v === 'string') return resolveAvatarSrc(v);
      if (v && v.dataURL) return resolveAvatarSrc(v.dataURL);
      if (v && v.url) return resolveAvatarSrc(v.url);
    }
  } catch(e){}
  return '/images/default-avatar.png';
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

export function formatDateJJMMAAAA(input) {
  if (!input) return '';
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d)) return '';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = d.getFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

// -------------------- Helpers non-exportés (internes) --------------------

function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

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

// Modal d'avis (utilisé par la validation)
function openRatingModal({ reservationId, onSubmit }) {
  const modalId = 'ratingModal';
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

  let currentRating = 5;
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
    cleanup();
    try {
      if (typeof onSubmit === 'function') {
        await Promise.resolve(onSubmit({ rating: currentRating, review, flagged: false }));
      }
    } catch (err) {
      console.error('Erreur dans onSubmit:', err);
      return;
    }

    const avis = {
      id: genId(),
      reservationId: reservationId ?? null,
      pseudo: getCurrentUserPseudo(),
      note: currentRating,
      texte: review,
      date: new Date().toISOString()
    };

    try {
      const stored = JSON.parse(localStorage.getItem('ecoride_avis') || '[]');
      stored.unshift(avis);
      localStorage.setItem('ecoride_avis', JSON.stringify(stored));
    } catch (e) {
      console.warn("Erreur stockage avis:", e);
    }

    window.dispatchEvent(new CustomEvent('ecoride:avisSubmitted', { detail: avis }));
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (document.body.contains(wrapper)) wrapper.remove();
  });
}

document.addEventListener('hidden.bs.modal', () => {
  const active = document.querySelector('.user-space-form.active');
  if (active && active.style.display === 'none') {
    active.style.display = 'block';
  }
});

// -------------------- State --------------------
let trajets = [];
let editingIndex = null;

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

export function saveTrajets(updated = null) {
  try {
    if (Array.isArray(updated)) {
      trajets = updated;
    }
    localStorage.setItem('ecoride_trajets', JSON.stringify(trajets));
    window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    console.log("💾 Trajets sauvegardés:", trajets.length);
  } catch (err) {
    console.error("❌ Erreur sauvegarde trajets:", err);
  }
}

// -------------------- Helpers suppression locale --------------------

export function removeLocalTrajetByServerId(serverId, localId = null) {
  if (!serverId && !localId) return;

  const normalize = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // cas où on stocke l'IRI complet (/api/carpools/12)
    const m = s.match(/\/api\/carpools\/(\d+)$/);
    if (m) return m[1];
    // retirer un éventuel préfixe /api/carpools/
    return s.replace(/^\/api\/carpools\//, '');
  };

  const sid = normalize(serverId);
  const lid = localId ? String(localId) : null;

  const removeFromKey = (key) => {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = list.filter(t => {
        // récupérer identifiants connus sur l'objet
        const tServerRaw = t.serverId ?? t['@id'] ?? t.carserverId ?? t.covoServerId ?? '';
        const tServer = normalize(tServerRaw);
        const tLocal = t._localId ?? t.id ?? t.detailId ?? t.covoId ?? null;

        if (lid && tLocal && String(tLocal) === lid) return false;
        if (sid && tServer && (tServer === sid || String(tServer).endsWith(String(sid)))) return false;

        return true;
      });
      if (filtered.length !== list.length) {
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    } catch (e) {
      console.warn('removeLocalTrajetByServerId: error handling key', key, e);
    }
  };

  // clés primaires à nettoyer
  removeFromKey('ecoride_trajets');
  removeFromKey('nouveauxTrajets');

  // notifier les autres vues
  window.dispatchEvent(new CustomEvent('ecoride:trajets-synced', { detail: { serverId: sid, localId: lid } }));
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
}

// -------------------- Init & helpers DOM --------------------

function onDomReady(selector, callback) {
  const el = document.querySelector(selector);
  if (el) return callback(el);

  const observer = new MutationObserver(() => {
    const node = document.querySelector(selector);
    if (node) {
      observer.disconnect();
      callback(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export async function initTrajets() {
  console.log("🚀 initTrajets");
  // Charger l'utilisateur courant si token présent mais pas de user en local
  if (localStorage.getItem('api_token') && !localStorage.getItem('ecoride_user')) {
    try {
      const me = await apiFetch('/me');
      if (me) {
        localStorage.setItem('ecoride_user', JSON.stringify(me));
        console.log('✅ Utilisateur courant récupéré et stocké');
      }
    } catch (e) {
      console.warn('⚠ Impossible de récupérer /me au démarrage :', e);
    }
  }
  // charger depuis storage
  trajets = getTrajets();
  updatePlacesReservees();
  populateVehiclesDatalist();

  const form = document.querySelector('#trajet-form');
  if (form) form.addEventListener('submit', handleTrajetSubmit);

  document.addEventListener('click', handleTrajetActions);

  onDomReady('.trajets-historique', (container) => {
    if (container.dataset.rendered === '1') return;
    container.dataset.rendered = '1';
    renderHistorique();
    renderTrajetsInProgress();
  });

  // placeholders date/time
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => {
      if (!input.value) input.classList.add('empty'); else input.classList.remove('empty');
    };
    toggleClass();
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });
}

// -------------------- Form submit handler --------------------

async function handleTrajetSubmit(e) {
  e.preventDefault();

  // === Désactiver le bouton pendant l'envoi ===
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.origText = submitBtn.textContent;
    submitBtn.textContent = 'Envoi en cours…';
  }
  const formData = new FormData(e.target);

  const prix = Number(formData.get('prix')) || 0;

  // Récupérer l'ID de la voiture sélectionnée
  // récupérer selectedVehicle déjà présent plus haut
  const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || "[]");
  const selectedPlate = formData.get('vehicle');
  const selectedVehicle = vehicles.find(v => v.plate === selectedPlate) || null;

  // ... ensuite dans trajetData :
  const trajetData = {
    id: (editingIndex !== null && trajets[editingIndex]) ? trajets[editingIndex].id : genId(),
    depart: formData.get('depart')?.trim() || '',
    arrivee: formData.get('arrivee')?.trim() || '',
    date: formData.get('date') || '',
    dateArrivee: formData.get('date-arrivee') || '',
    heureDepart: formData.get('heure-depart') || '',
    heureArrivee: formData.get('heure-arrivee') || '',
    prix: Number(formData.get('prix')) || 0,
    vehicle: selectedVehicle,
    // <-- important : ID serveur de la voiture (adapter la propriété selon ta structure)
    carId: selectedVehicle?.id || selectedVehicle?.serverId || selectedVehicle?._id || null,
    places: (selectedVehicle && selectedVehicle.seats !== undefined) ? Number(selectedVehicle.seats) : (formData.get('places') ? Number(formData.get('places')) : 4),
    totalSeats: (selectedVehicle && selectedVehicle.seats !== undefined) ? Number(selectedVehicle.seats) : (formData.get('places') ? Number(formData.get('places')) : 4),
    role: "chauffeur",
    status: 'ajoute'
  };

  if (!trajetData.date || !trajetData.dateArrivee || !trajetData.depart || !trajetData.arrivee || !trajetData.vehicle || prix < 5) {
    alert('Veuillez remplir tous les champs obligatoires correctement.');
    return;
  }

  enrichTrajetWithCurrentUser(trajetData);

  if (editingIndex !== null && trajets[editingIndex]) {
    // garder status, serverId et autres métadonnées existantes
    trajetData.status = trajets[editingIndex].status;
    trajetData.serverId = trajets[editingIndex].serverId ?? trajetData.serverId;
    trajetData.synced = trajets[editingIndex].synced ?? trajetData.synced;
    trajetData.syncError = trajets[editingIndex].syncError ?? trajetData.syncError;
    trajets[editingIndex] = trajetData;
    editingIndex = null;
  } else {
    trajets.push(trajetData);
  }

  // === Sauvegarde locale (optimistic) ===
  trajetData.synced = false;
  saveTrajets();
  ajouterAuCovoiturage(trajetData);
  updatePlacesReservees();
  renderTrajetsInProgress();
  renderHistorique();

  // si on a une voiture locale sans carId serveur -> créer ou récupérer son id serveur
  try {
    if (!trajetData.carId && trajetData.vehicle) {
      // createCarIfNeeded retourne l'id (ex: "12")
      const newCarId = await createCarIfNeeded(trajetData.vehicle, { useSession: true });
      if (newCarId) {
        trajetData.carId = newCarId;
        // mettre à jour la voiture locale pour éviter de recréer à l'avenir
        trajetData.vehicle.id = newCarId;
        // mettre à jour ecoride_vehicles dans localStorage si tu veux persister
        try {
          const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]');
          const idx = vehicles.findIndex(v => (v.plate && trajetData.vehicle.plate && v.plate === trajetData.vehicle.plate) || (v._tmpId && trajetData.vehicle._tmpId && v._tmpId === trajetData.vehicle._tmpId));
          if (idx !== -1) {
            vehicles[idx] = { ...vehicles[idx], ...trajetData.vehicle };
          } else {
            vehicles.push(trajetData.vehicle);
          }
          localStorage.setItem('ecoride_vehicles', JSON.stringify(vehicles));
        } catch (e) { console.warn('failed to update ecoride_vehicles', e); }
      }
    }
    } catch (err) {
    console.error('Erreur création voiture avant covoiturage:', err);
    // si échec de création voiture -> empêcher la création covoiturage côté serveur (DataPersister exige car)
    alert('Impossible d\'enregistrer la voiture sur le serveur. Le trajet sera sauvegardé localement.');
    trajetData.synced = false;
    trajetData.syncError = err.message || String(err);
    saveTrajets(trajets);
    return; // quitte la soumission distante
  }

  // === VALIDATION : vérifier que la voiture existe ET appartient bien à l'utilisateur ===
  try {
    if (!trajetData.carId) {
      throw new Error('Aucun id de voiture serveur disponible.');
    }

    // Normalise carId numeric/IRI
    const carIdNormalized = String(trajetData.carId).startsWith('/api/') 
      ? String(trajetData.carId).replace('/api/cars/', '') 
      : String(trajetData.carId);

    // Récupérer la voiture côté serveur (utilise apiFetch)
    let car;
    try {
      car = await apiFetch(`/cars/${carIdNormalized}`, { method: 'GET' });
    } catch (fetchErr) {
      const status = fetchErr?.status || (fetchErr?.response && fetchErr.response.status) || null;
      console.warn('fetch car error:', fetchErr);
      if (status === 404) {
        // rollback local optimistic ajout
        trajets = trajets.filter(t => t.id !== trajetData.id);
        saveTrajets(trajets);
        renderTrajetsInProgress();
        renderHistorique();
        alert('La voiture sélectionnée est introuvable sur le serveur.');
        return;
      }
      // réseau ou autre erreur : conserver le trajet local et informer l'utilisateur
      alert('Impossible de vérifier la voiture (réseau). Le trajet restera en local et sera retenté plus tard.');
      trajetData.synced = false;
      trajetData.syncError = fetchErr.message || String(fetchErr);
      saveTrajets(trajets);
      return;
    }

    // Récupérer l'utilisateur courant (doit être fait APRÈS la tentative réseau)
    const me = getCurrentUser();

    // DEBUG (temporaires) : affichez après l'initialisation de me et car
    console.log('DEBUG car fetched (raw or mapped):', car);
    console.log('DEBUG current user (me):', me);
    console.log('DEBUG local api token:', localStorage.getItem('api_token'));

    // Vérifier la propriété côté front (UX)
    if (!carOwnedBy(car, me)) {
      // rollback optimistic ajout
      trajets = trajets.filter(t => t.id !== trajetData.id);
      saveTrajets(trajets);
      renderTrajetsInProgress();
      renderHistorique();
      alert('La voiture sélectionnée ne vous appartient pas.');
      return;
    }
  } catch (err) {
    console.warn('Validation voiture avant création covoiturage échouée:', err);
    // err déjà traité plus haut; si on arrive ici pour d'autres raisons, garder le trajet en local
    if (!err.status) {
      alert('Erreur inattendue lors de la vérification de la voiture. Le trajet restera en local.');
      trajetData.synced = false;
      trajetData.syncError = err.message || String(err);
      saveTrajets(trajets);
    }
    return;
  }

  // === Envoi vers l'API (create ou update) ===
  try {
    // --- Construction du payload (champs envoyés au serveur) ---
    const payload = {
      departureDate: trajetData.date,
      departureTime: trajetData.heureDepart ? trajetData.heureDepart.padStart(5, '0') + ':00' : '00:00:00',
      departureLocation: trajetData.depart,
      arrivalDate: trajetData.dateArrivee,
      arrivalTime: trajetData.heureArrivee ? trajetData.heureArrivee.padStart(5, '0') + ':00' : '00:00:00',
      arrivalLocation: trajetData.arrivee,
      pricePerSeat: Number(trajetData.prix) || 0,
      nbPlacesTotal: Number(trajetData.totalSeats ?? trajetData.places ?? 4)
    };

    if (trajetData.carId) {
      const id = String(trajetData.carId).startsWith('/api/')
        ? trajetData.carId
        : `/api/cars/${trajetData.carId}`;
      payload.car = id;
    }

    // --- Envoi au serveur : PATCH (update) ou POST (create) ---
    let serverObj;
    const serverIdRaw = trajetData.serverId || trajetData['@id'] || null;

    if (serverIdRaw) {
      // === Mise à jour (PATCH) ===
      const id = String(serverIdRaw).startsWith('/api/')
        ? String(serverIdRaw).replace(/^\/api\/carpools\//, '')
        : String(serverIdRaw);

      serverObj = await apiFetch(`/carpools/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify(payload)
      });
    } else {
      // === Création (POST) ===
      serverObj = await apiFetch('/carpools', {
        method: 'POST',
        body: payload
      });
    }

    // === Mise à jour de l'ID serveur local ===
  const newServerId = serverObj?.['@id'] || serverObj?.id || null;

  if (newServerId) {
    trajetData.serverId = newServerId;
    trajetData.synced = true;
    delete trajetData.syncError;

    // Mettre à jour dans le tableau trajets
    const idx = trajets.findIndex(x => x.id === trajetData.id);
    if (idx !== -1) {
      trajets[idx] = { ...trajets[idx], ...trajetData };
    }

    saveTrajets(trajets);
    console.log('✅ Trajet synchronisé avec le serveur :', trajetData.serverId);
  } else if (serverObj && serverObj.status === 204) {
    trajetData.synced = true;
    delete trajetData.syncError;

    const idx = trajets.findIndex(x => x.id === trajetData.id);
    if (idx !== -1) {
      trajets[idx] = { ...trajets[idx], ...trajetData };
    }

    saveTrajets(trajets);
    console.log('✅ Trajet synchronisé (204 No Content) :', trajetData.serverId);
  } else {
    trajetData.synced = false;
    trajetData.syncError = 'Aucun identifiant serveur retourné';

    const idx = trajets.findIndex(x => x.id === trajetData.id);
    if (idx !== -1) {
      trajets[idx] = { ...trajets[idx], ...trajetData };
    }

    saveTrajets(trajets);
    console.warn('⚠️ Aucun identifiant serveur retourné, trajet non synchronisé');
  }

  } catch (err) {
    trajetData.synced = false;
    trajetData.syncError = err.message || String(err);
    saveTrajets(trajets);
    console.warn('⚠️ Synchronisation échouée — trajet mis en file d\'attente', err);
    alert('Trajet enregistré localement. Synchronisation serveur en attente.');
  } finally {
    // === Réactiver le bouton ===
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.origText || 'Publier';
    }

    // Reset du formulaire
    e.target.reset();
  }
}

// -------------------- Actions globales --------------------

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

async function handleTrajetActions(e) {
  const target = e.target;
  if (!target) return;

  // start
  if (target.classList.contains('trajet-start-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === "chauffeur") {
      trajet.status = "demarre";
      saveTrajets();
      updatePlacesReservees();
      renderTrajetsInProgress();
    }
  }

  // arrive
  if (target.classList.contains('trajet-arrive-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'termine';
      saveTrajets();
      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
    }

    // mettre à jour réservations liées
    try {
      const covoId = id;
      let reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
      let updated = false;
      reservations = reservations.map(r => {
        if (getCovoId(r) === covoId && r.role === 'passager' && r.status === 'reserve') {
          r.status = 'a_valider';
          updated = true;
        }
        return r;
      });

      if (updated) {
        localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
        window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
        updatePlacesReservees();
        renderTrajetsInProgress();
        renderHistorique();
        window.dispatchEvent(new CustomEvent('ecoride:reservationsAwaitingValidation', { detail: { covoId } }));
      }
    } catch (err) {
      console.error('Erreur lors du marquage a_valider :', err);
    }
  }

  // edit
  if (target.classList.contains('trajet-edit-btn')) {
    e.preventDefault?.();
    e.stopPropagation?.();
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (!trajet || trajet.role !== 'chauffeur') return;

    tryUntilExists(() => document.querySelector('#trajet-form') !== null, 12, 80).then(found => {
      if (!found) return;
      const form = document.querySelector('#trajet-form');
      if (!form) return;

      const setIf = (selector, value) => {
        const el = form.querySelector(selector);
        if (el) el.value = value || '';
      };

      setIf('[name="depart"]', trajet.depart);
      setIf('[name="arrivee"]', trajet.arrivee);
      setIf('[name="date"]', trajet.date);
      setIf('[name="date-arrivee"]', trajet.dateArrivee);
      setIf('[name="heure-depart"]', trajet.heureDepart);
      setIf('[name="heure-arrivee"]', trajet.heureArrivee);
      setIf('[name="prix"]', trajet.prix);
      setIf('[name="vehicle"]', trajet.vehicle ? trajet.vehicle.plate : '');

      document.querySelectorAll('#trajet-form input, #trajet-form select').forEach(input => {
        if (!input.value) input.classList.add('empty'); else input.classList.remove('empty');
      });

      editingIndex = trajets.findIndex(t => t.id === id);
      setTimeout(() => {
        const first = form.querySelector('input, textarea, select, button');
        if (first) first.focus({ preventScroll: true });
      }, 40);
    });
    return;
  }

  // signaler
  if (target.classList.contains('trajet-signaler-btn')) {
    e.preventDefault();
    e.stopPropagation();
    const reservationId = target.dataset.id;
    const covoId = target.dataset.covoId;
    if (!reservationId) return;

    const trajet = trajets.find(t => t.id === reservationId);
    if (!trajet) { alert("Trajet introuvable."); return; }

    const description = prompt("Pourquoi voulez-vous signaler ce trajet ?") || "";
    if (!description.trim()) { alert("Signalement annulé (aucune description)."); return; }

    let chauffeurPseudo = "Chauffeur inconnu";
    let chauffeurMail = "";
    try {
      const covos = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
      const covo = covos.find(c => c.id === covoId);
      if (covo && covo.chauffeur) {
        chauffeurPseudo = covo.chauffeur.pseudo || chauffeurPseudo;
        chauffeurMail = covo.chauffeur.email || covo.chauffeur.mail || "";
      }
    } catch (err) { console.warn(err); }

    const signalement = {
      id: genId(),
      chauffeur: chauffeurPseudo,
      chauffeurMail,
      passager: getCurrentUserPseudo(),
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
      alert("Erreur lors de l'enregistrement.");
      return;
    }

    window.dispatchEvent(new CustomEvent('ecoride:trajetSignale', { detail: signalement }));
    alert("Trajet signalé. Merci.");
    return;
  }

  // suppression : appeler depuis handleTrajetActions -> trajet-delete-btn
  if (target.classList.contains('trajet-delete-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index === -1) return;

    const removed = trajets[index];
    const serverId = removed?.serverId || removed?.['@id'] || null;
    const deleteKey = serverId || id;

    // protège contre double-click / requêtes concurrentes
    if (deleting.has(deleteKey)) {
      console.debug('[delete] suppression déjà en cours pour', deleteKey);
      return;
    }
    deleting.add(deleteKey);

    // disable + visual feedback
    target.disabled = true;
    target.classList.add('is-loading');

    if (!confirm("Supprimer ce trajet ?")) {
      deleting.delete(deleteKey);
      target.disabled = false;
      target.classList.remove('is-loading');
      return;
    }

    if (!serverId) {
      // suppression locale immédiate
      trajets.splice(index, 1);
      saveTrajets(trajets);
      renderTrajetsInProgress();
      renderHistorique();

      // aussi supprimer dans 'nouveauxTrajets' si présent
      try {
        const key = 'nouveauxTrajets';
        let covos = JSON.parse(localStorage.getItem(key) || '[]');
        covos = covos.filter(c => String(c.id) !== String(id));
        localStorage.setItem(key, JSON.stringify(covos));
        window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
      } catch (e) { /* ignore */ }

      window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { localId: id, serverId: null } }));
      deleting.delete(deleteKey);
      target.disabled = false;
      target.classList.remove('is-loading');
      return;
    }

    try {
      const res = await deleteCarpoolApi(serverId);
      console.debug('[delete] response', res);

      if (res && (res.status === 204 || res.status === 200 || res.status === 404)) {
        // nettoyer le localStorage (ecoride_trajets et nouveauxTrajets)
        try {
          removeLocalTrajetByServerId(serverId, id);
        } catch (e) {
          console.warn('removeLocalTrajetByServerId failed', e);
        }
    
        // mettre à jour l'état en mémoire et sauvegarder
        const idx = trajets.findIndex(t => t.id === id);
        if (idx !== -1) {
          trajets.splice(idx, 1);
          saveTrajets(trajets);
          renderTrajetsInProgress();
          renderHistorique();
        }
    
        // notifier les autres vues (la fonction removeLocalTrajetByServerId a déjà dispatché 'ecoride:trajetsUpdated',
        // mais on redemande un event ciblé 'carpool-deleted' pour compatibilité)
        window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { serverId, localId: id } }));
        console.log('Suppression appliquée localement et serveur OK', serverId);
      } else {
        console.warn('Suppression serveur inattendue', res);
        // logique fallback (forcer suppression locale si l'utilisateur le souhaite)
        if (confirm(`La suppression côté serveur a échoué (statut: ${res?.status}). Forcer suppression locale ?`)) {
          // nettoyage local identique
          try { removeLocalTrajetByServerId(serverId, id); } catch (e) { console.warn(e); }
          const idx = trajets.findIndex(t => t.id === id);
          if (idx !== -1) { trajets.splice(idx, 1); saveTrajets(trajets); renderTrajetsInProgress(); renderHistorique(); }
          window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { serverId, localId: id } }));
        }
      }
    } catch (err) {
      console.error('Erreur lors du traitement de la suppression:', err);
      alert('Erreur lors de la suppression. Vérifie la console / Network.');
    } finally {
      deleting.delete(deleteKey);
      target.disabled = false;
      target.classList.remove('is-loading');
    }
  }

  // close (valide)
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
    }
  }

  // cancel (passager)
  if (target.classList.contains('trajet-cancel-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index === -1) return;
    const trajet = trajets[index];
    if (!trajet || trajet.role !== 'passager') return;
    if (!confirm("Voulez-vous annuler cette réservation ?")) return;

    trajets.splice(index, 1);
    saveTrajets();

    let userReservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    userReservations = userReservations.filter(r => r.id !== id);
    localStorage.setItem('ecoride_trajets', JSON.stringify(userReservations));
    window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));

    // mise à jour du covo
    let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const refId = getCovoId(trajet);
    if (refId) {
      const covoIndex = trajetsCovoiturage.findIndex(t => t.id === refId);
      if (covoIndex !== -1) {
        const covo = trajetsCovoiturage[covoIndex];
        const mePseudo = getCurrentUserPseudo();

        covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
          .filter(p => {
            if (!p) return false;
            if (typeof p === 'object' && p.pseudo) return p.pseudo !== mePseudo;
            if (typeof p === 'string') return !(p.startsWith(mePseudo) || p.startsWith('Moi'));
            return true;
          }).map(p => {
            if (typeof p === 'object' && p.pseudo) return { pseudo: p.pseudo, places: Number(p.places || 1) };
            if (typeof p === 'string') {
              const m = p.match(/^(.+?)\s*x(\d+)$/i);
              return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
            }
            return null;
          }).filter(Boolean);

        const occupied = covo.passagers.reduce((s, p) => s + (Number(p.places) || 1), 0);
        const capacity = Number(covo.capacity ?? covo.vehicle?.places ?? covo.places ?? 4);
        covo.places = Math.max(0, capacity - occupied);

        trajetsCovoiturage[covoIndex] = covo;
        localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
        window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
      }
    }

    updatePlacesReservees();
    renderTrajetsInProgress();
    renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:reservationCancelled', { detail: { id } }));
    alert("Réservation annulée.");
  }

  // validate (passager valide son trajet)
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
          if (idx === -1) { alert('Réservation introuvable.'); return; }

          reservations[idx].status = 'valide';
          reservations[idx].rating = rating;
          reservations[idx].review = review;
          reservations[idx].validatedAt = new Date().toISOString();
          reservations[idx].reviewModeration = {
            status: 'pending',
            flagged: !!flagged,
            submittedAt: new Date().toISOString()
          };

          localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
          window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));

          const localIdx = trajets.findIndex(t => t.id === reservationId);
          if (localIdx !== -1) trajets[localIdx] = { ...trajets[localIdx], ...reservations[idx] };

          // mise à jour covo
          let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          const covoId = getCovoId(reservations[idx]);
          const covoIndex = trajetsCovoiturage.findIndex(t => t.id === covoId);
          if (covoIndex !== -1) {
            const covo = trajetsCovoiturage[covoIndex];
            const mePseudo = getCurrentUserPseudo();
            covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
              .filter(p => {
                if (!p) return false;
                if (typeof p === 'object' && p.pseudo) return p.pseudo !== mePseudo;
                if (typeof p === 'string') return !(p.startsWith(mePseudo) || p.startsWith('Moi'));
                return true;
              }).map(p => {
                if (typeof p === 'object' && p.pseudo) return { pseudo: p.pseudo, places: Number(p.places || 1) };
                if (typeof p === 'string') {
                  const m = p.match(/^(.+?)\s*x(\d+)$/i);
                  return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
                }
                return null;
              }).filter(Boolean);

            const occupied = covo.passagers.reduce((s, p) => s + (Number(p.places) || 1), 0);
            const capacity = Number(covo.capacity ?? covo.vehicle?.places ?? covo.places ?? 4);
            covo.places = Math.max(0, capacity - occupied);
            trajetsCovoiturage[covoIndex] = covo;
            localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
            window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
          }

          // déplacer covo dans historique si nécessaire
          trajets = getTrajets();
          saveTrajets();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();

          alert('Validation enregistrée. Merci !');
        } catch (err) {
          console.error('Erreur validation trajet :', err);
          alert('Erreur lors de l’enregistrement.');
        }
      }
    });
    return;
  }
}

// -------------------- Rendu en cours --------------------

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

export function renderTrajetsInProgress() {
  const container = document.querySelector('#trajets-en-cours .trajets-list');
  if (!container) return;
  container.innerHTML = '';

  const enCours = trajets.filter(t => t.status !== "valide");
  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  updatePlacesReservees();

  enCours.forEach((trajet) => {
    let bgClass = "";
    let actionHtml = "";
    let dateToDisplay = formatDateJJMMAAAA(trajet.date) || '';

    if (trajet.role === "chauffeur") {
      if (trajet.status === "ajoute") {
        bgClass = "trajet-card actif";
        actionHtml = `
          <button class="btn-trajet trajet-edit-btn" data-id="${trajet.id}">Modifier</button>
          <button class="btn-trajet trajet-delete-btn" data-id="${trajet.id}">Supprimer</button>
          <button class="btn-trajet trajet-start-btn" data-id="${trajet.id}">Démarrer</button>
        `;
      } else if (trajet.status === "demarre") {
        bgClass = "trajet-card termine";
        actionHtml = `<button class="btn-trajet trajet-arrive-btn" data-id="${trajet.id}">Arrivée</button>`;
      } else if (trajet.status === "termine") {
        bgClass = "trajet-card attente";
        actionHtml = `<span class="trajet-status">En attente de validation</span>`;
      }
    } else if (trajet.role === "passager") {
      if (trajet.status === "reserve") {
        bgClass = "trajet-card reserve";
        const refId = getCovoId(trajet);
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-cancel-btn" data-id="${trajet.id}">Annuler</button>
          <button class="btn-trajet trajet-signaler-btn" data-id="${trajet.id}" data-covo-id="${refId}">⚠ Signaler</button>
        `;
      } else if (trajet.status === "a_valider") {
        bgClass = "trajet-card attente";
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${getCovoId(trajet)}">Détail</button>
          <button class="btn-trajet trajet-validate-btn" data-id="${trajet.id}">Valider</button>
        `;
      } else if (trajet.status === "valide") {
        actionHtml = `<button class="btn-trajet trajet-detail-btn" data-covo-id="${getCovoId(trajet)}">Détail</button>`;
      }
    }

    container.innerHTML += `
      <div class="${bgClass}" data-id="${trajet.id}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${dateToDisplay}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${trajet.placesReservees} place${trajet.placesReservees > 1 ? 's' : ''} réservée${trajet.placesReservees > 1 ? 's' : ''}</span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
          ${actionHtml}
        </div>
      </div>
    `;
  });

  container.querySelectorAll('.trajet-detail-btn').forEach(btn => {
    if (btn._detailHandler) btn.removeEventListener('click', btn._detailHandler);
    const handler = (ev) => {
      ev.preventDefault?.();
      const covoId = btn.dataset.covoId;
      if (!covoId) return;
      const newPath = `/detail/${encodeURIComponent(covoId)}`;
      try {
        history.pushState({ id: covoId }, '', newPath);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { id: covoId } }));
      } catch (err) {
        window.location.href = newPath;
      }
    };
    btn._detailHandler = handler;
    btn.addEventListener('click', handler);
  });
}

// -------------------- Historique --------------------
export function renderHistorique() {
  const allContainers = document.querySelectorAll('.trajets-historique');
  if (allContainers.length > 1) {
    allContainers.forEach((el, i) => { if (i>0) el.remove(); });
  }
  const container = document.querySelector('.trajets-historique');
  if (!container) return;
  if (container.dataset.rendering === '1') return;
  container.dataset.rendering = '1';

  container.innerHTML = `<h2>Mes trajets passés</h2>`;

  let allTrajets = [];
  try { allTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]'); } catch(e){}

  const passe = allTrajets.filter(t => t.status === "valide");
  passe.sort((a,b) => new Date(b.date) - new Date(a.date));

  if (passe.length === 0) {
    container.innerHTML += `<p>Aucun trajet terminé</p>`;
    delete container.dataset.rendering;
    return;
  }

  passe.forEach(trajet => {
    const placesReservees = trajet.placesReservees || 0;
    let cardClass = 'trajet-card valide';
    if (trajet.role === 'passager') cardClass = 'trajet-card reserve';
    container.innerHTML += `
      <div class="${cardClass}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${formatDateJJMMAAAA(trajet.date) || ""}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${placesReservees} place${placesReservees > 1 ? 's' : ''} réservée${placesReservees > 1 ? 's' : ''}</span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
        </div>
      </div>
    `;
  });

  delete container.dataset.rendering;
}

// -------------------- Ajout au covoiturage --------------------
function ajouterAuCovoiturage(trajetData) {
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
    type: (trajetData.vehicle ? (trajetData.vehicle.type || '') : ''),
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
    baseTrajetCovoit.passagers = existingPassagers.length > 0 ? existingPassagers.slice() : baseTrajetCovoit.passagers;

    const totalOccupied = baseTrajetCovoit.passagers.reduce((sum, p) => sum + (Number(p.places) || 1), 0);
    const newCapacity = baseTrajetCovoit.capacity;
    baseTrajetCovoit.capacity = (typeof existing.capacity === 'number') ? existing.capacity : newCapacity;
    if (newCapacity !== baseTrajetCovoit.capacity) {
      baseTrajetCovoit.places = Math.max(0, newCapacity - totalOccupied);
    } else {
      baseTrajetCovoit.places = (typeof existing.places === 'number') ? existing.places : Math.max(0, newCapacity - totalOccupied);
    }

    trajetsCovoiturage[idx] = Object.assign({}, existing, baseTrajetCovoit);
  } else {
    const occupied = baseTrajetCovoit.passagers.reduce((sum, p) => sum + (Number(p.places) || 1), 0);
    baseTrajetCovoit.places = Math.max(0, capacity - occupied);
    trajetsCovoiturage.push(baseTrajetCovoit);
  }

  localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
}

// -------------------- Vehicles datalist --------------------

function populateVehiclesDatalist() {
  try {
    const stored = localStorage.getItem('ecoride_vehicles');
    const vehicles = stored ? JSON.parse(stored) : [];
    const select = document.querySelector('#vehicle');
    if (!select) return;
    select.innerHTML = '<option value="" selected hidden>-- Sélectionner un véhicule --</option>';
    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = v.plate || v.immatriculation || v.licencePlate || '';
      option.textContent = getVehicleLabel(v);
      select.appendChild(option);
      v.seats = Number(v.seats ?? v.places ?? 4);
    });
  } catch (err) {
    console.error("Erreur chargement véhicules:", err);
  }
}

// -------------------- Debug --------------------
export function debugTrajets() {
  console.log("🔍 Etat trajets:", trajets);
  return trajets;
}
window.debugTrajets = debugTrajets;

// Worker de retry toutes les 1 minute
const SYNC_RETRY_INTERVAL_MS = 1000 * 60 * 1; // 1 minute

async function retryPendingSyncs() {
  const list = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  const pending = list.filter(t => t.synced === false);
  if (pending.length === 0) return;

  for (const t of pending) {
    try {
      // s'assurer d'avoir un carId avant de poster (créer la voiture si besoin)
      if (!t.carId && t.vehicle) {
        try {
          const newCarId = await createCarIfNeeded(t.vehicle);
          if (newCarId) {
            t.carId = newCarId;
            t.vehicle.id = newCarId;

            // Mettre à jour ecoride_vehicles si tu veux persister l'id serveur
            try {
              const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]');
              const idx = vehicles.findIndex(v =>
                (v.plate && t.vehicle.plate && v.plate === t.vehicle.plate) ||
                (v._tmpId && t.vehicle._tmpId && v._tmpId === t.vehicle._tmpId)
              );
              if (idx !== -1) {
                vehicles[idx] = { ...vehicles[idx], ...t.vehicle };
              } else {
                vehicles.push(t.vehicle);
              }
              localStorage.setItem('ecoride_vehicles', JSON.stringify(vehicles));
            } catch (e) {
              console.warn('retryPendingSyncs: erreur mise à jour ecoride_vehicles', e);
            }
          }
        } catch (err) {
          console.warn('retry: impossible de créer la voiture pour', t.id, err);
          t.syncError = `Erreur création voiture : ${err.message || String(err)}`;
          continue; // skip ce trajet pour l'instant
        }
      }

      const serverIdRaw = t.serverId || t['@id'] || null;

      try {
        const serverObj = await saveCarpoolApi(t);
        console.log('DEBUG saveCarpoolApi result for', t.id, serverObj);

        // Accepter plusieurs formes de réponse :
        const newServerId = serverObj?.['@id'] || serverObj?.id || null;

        // Si l'API a répondu 204 (No Content) et qu'on avait déjà un serverId, on considère OK
        const isNoContent = serverObj && serverObj.status === 204;

        if (newServerId) {
          t.serverId = newServerId;
          t.synced = true;
          delete t.syncError;
          console.log('🔁 Retry sync OK pour', t.id, '->', t.serverId);
        } else if (isNoContent && serverIdRaw) {
          // pas d'id renvoyé mais suppression/ack possible — conserver l'ancien id
          t.synced = true;
          delete t.syncError;
          console.log('🔁 Retry sync OK (204) pour', t.id, 'conserve serverId=', serverIdRaw);
        } else {
          // Pas d'id renvoyé — ne pas écraser serverId ; marquer erreur
          throw new Error('Aucun identifiant serveur retourné par saveCarpoolApi');
        }
      } catch (err) {
        // ❌ Ne jamais faire de POST si serverId existe
        if (serverIdRaw) {
          console.warn('🔁 Échec mise à jour (PATCH) pour', t.id, '. On ne recrée pas.', err.message || err);
          t.syncError = `update-failed: ${err.message || String(err)}`;
          // Optionnel : si 404, marquer comme "stale"
          if (err.status === 404) {
            t.syncError = 'stale-serverid';
          }
        } else {
          // Si c’est une création échouée, on peut retenter plus tard
          t.syncError = `create-failed: ${err.message || String(err)}`;
          console.warn('🔁 Échec création (POST) pour', t.id, err.message || err);
        }
      }
    } catch (err) {
      t.syncError = err.message || String(err);
      console.warn('🔁 Retry échoué pour', t.id, err.message || err);
    }
  }

  localStorage.setItem('ecoride_trajets', JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
}

// Lancer au démarrage et périodiquement
retryPendingSyncs().catch(() => {});
setInterval(retryPendingSyncs, SYNC_RETRY_INTERVAL_MS);