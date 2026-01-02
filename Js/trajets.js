// trajets.js
import { apiFetch, API_BASE } from '/assets/js/api.js';
import { createCarIfNeeded, saveCarpoolApi, deleteCarpoolApi, carOwnedBy } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey } from '/assets/js/type-utils.js';


console.log('apiFetch typeof =', typeof apiFetch);
// -------------------- Utilitaires & exports de base --------------------

const deleting = new Set();

export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const DEFAULT_LOCAL_AVATAR = '/images/default-avatar.png';

export function resolveAvatarSrc(raw) {
  if (!raw) return DEFAULT_LOCAL_AVATAR;

  raw = String(raw).trim();
  if (!raw) return DEFAULT_LOCAL_AVATAR;

  // données déjà formatées (base64 / data URL)
  if (raw.startsWith('data:')) return raw;

  // URLs absolues — on les retourne telles quelles
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) return raw;

  // Si c'est un chemin relatif absolu commençant par /uploads (backend)
  // => prefixer avec API_BASE pour viser le backend sur le port 8000
  if (raw.startsWith('/uploads')) {
    return `${API_BASE}${raw}`;
  }

  // Si c'est /images/... (image de l'UI front, p.ex. default-avatar)
  // on retourne tel quel (servi par le serveur front)
  if (raw.startsWith('/images')) {
    return raw;
  }

  // Si c'est un chemin commençant par / (autre chemin backend), prefixer backend
  if (raw.startsWith('/')) {
    return `${API_BASE}${raw}`;
  }

  // Si c'est juste un nom de fichier ou 'uploads/avatars/xxx.jpg'
  // on suppose qu'il s'agit d'un upload côté backend et on construit l'URL complète
  if (raw.startsWith('uploads/')) {
    return `${API_BASE}/${raw}`;
  }

  // dernier recours — considérer comme un fichier dans uploads/avatars
  return `${API_BASE}/uploads/avatars/${raw}`;
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
  if (!me) return 'Inconnu';

  const first =
    me.firstName ||
    me.firstname ||
    me.prenom ||
    me.givenName ||
    null;

  const last =
    me.lastName ||
    me.lastname ||
    me.nom ||
    me.familyName ||
    null;

  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;

  // fallback: pseudo / username si existant
  return me.pseudo || me.username || 'Inconnu';
}

export function enrichTrajetWithCurrentUser(trajet = {}) {
  try {
    const me = getCurrentUser();
    if (!me) return trajet;

    if (!trajet.chauffeur || typeof trajet.chauffeur !== 'object') {
      trajet.chauffeur = {};
    }

    const displayName = getCurrentUserPseudo(); // utilise now prénom/nom

    trajet.chauffeur.pseudo = trajet.chauffeur.pseudo ?? displayName;

    const rawPhoto =
      trajet.chauffeur.photo ??
      me.photo ??
      'images/default-avatar.png';

    trajet.chauffeur.photo = resolveAvatarSrc(rawPhoto);
    trajet.chauffeur.rating = trajet.chauffeur.rating ?? me.rating ?? 0;
  } catch (e) {
    console.warn('enrichTrajetWithCurrentUser error', e);
  }
  return trajet;
}

export function formatDateJJMMAAAA(input) {
  if (!input) return '';

  // Si input est déjà au format YYYY-MM-DD ou commence par YYYY-MM-DDTHH...
  const s = String(input);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  }

  // fallback si on reçoit autre chose
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
let trajets = getTrajets(); // hydrate la référence depuis localStorage sans réassigner
let _trajetsInited = false;
// Initialise la logique (chargement API + rendu) une fois que le container de trajets est présent.
// onDomReady est déjà défini plus haut dans ce fichier.
onDomReady('#trajets-en-cours .trajets-list', () => {
  try {
    renderTrajetsInProgress(); // rendu local instantané
  } catch (e) { console.warn('renderTrajetsInProgress failed onDomReady', e); }
});

// DEBUG: exposer temporairement dans la console pour diagnostiquer
if (typeof window !== 'undefined') {
  window.trajets = trajets;
  window.loadTrajetsFromApi = loadTrajetsFromApi;
  window.renderTrajetsInProgress = renderTrajetsInProgress;
  window.updatePlacesReservees = updatePlacesReservees;
  window.debugTrajets = debugTrajets; // si défini plus bas
}

// Réagir lorsqu'une réservation est créée depuis une autre page (ex: detail.js)
window.addEventListener('ecoride:reservationCreated', (ev) => {
  try {
    const reservation = ev?.detail?.reservation;
    // Si aucune reservation fournie dans l'event, on relit la dernière entrée du localStorage
    let toAdd = reservation;
    if (!toAdd) {
      const stored = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
      toAdd = stored && stored.length ? stored[stored.length - 1] : null;
    }
    if (!toAdd) return;

    // S'assurer que c'est bien un passager
    if (!toAdd.role) toAdd.role = 'passager';
    if (!toAdd.status) toAdd.status = 'reserve';

    // Ajouter en mémoire et persister 
    trajets.push(toAdd);
    saveTrajets(trajets);

    // Mettre à jour l'affichage
    updatePlacesReservees();
    renderTrajetsInProgress();
    renderHistorique();

    console.log('[trajets.js] reservation ajoutée via event ecoride:reservationCreated', toAdd);
  } catch (err) {
    console.warn('Erreur handling ecoride:reservationCreated dans trajets.js', err);
  }
});

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
      trajets.splice(0, trajets.length, ...updated)
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
  if (_trajetsInited) {
    console.debug('initTrajets appelé mais déjà initialisé, skip');
    return;
  }
  _trajetsInited = true;
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
  // charger depuis l'API ; la fonction mutera déjà le tableau `trajets`
  await loadTrajetsFromApi();

  updatePlacesReservees();
  populateVehiclesDatalist();

  // 🚗 Écouter les mises à jour de véhicules et recharger la liste
  window.addEventListener('ecoride:vehicles-updated', (event) => {
    console.log('🚗 Véhicules mis à jour, rechargement de la liste...', event.detail);
    populateVehiclesDatalist(); // recharger le <select>
  });

  const form = document.querySelector('#trajet-form');
  if (form) form.addEventListener('submit', handleTrajetSubmit);

  document.addEventListener('click', handleTrajetActions);

  onDomReady('.trajets-historique', (container) => {
    if (container.dataset.rendered === '1') return;
    container.dataset.rendered = '1';
    renderHistorique();
    renderTrajetsInProgress();
    window.addEventListener('trajets:changed', (e) => {
      console.log('📍 trajets:changed reçu', e.detail);
      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
    });
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

/**
 * Charge les carpools depuis l'API et les fusionne avec les données locales
 * @returns {Promise<Array>} Liste des trajets (chauffeur + passager)
 */
export async function loadTrajetsFromApi({ modeAll = true } = {}) {
  const me = getCurrentUser();

  try {
    const raw = await apiFetch('/carpools');

    console.log('Réponse brute apiFetch /carpools:', raw);

    // Accepter les deux formats : array direct (curl) ou hydra:member
    let items = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray(raw['hydra:member'])) {
      items = raw['hydra:member'];
    } else {
      console.warn('[loadTrajetsFromApi] réponse API inattendue, fallback local :', raw);
      return getTrajets();
    }

    console.log('[loadTrajetsFromApi] raw carpools count =', items.length);

    // Mapper tous (ou filtrer si nécessaire)
    let carpools = items;

    if (!modeAll) {
      // modeAll=false -> conserver uniquement les carpools où je suis chauffeur
      if (!me || !me.id) {
        console.warn('[loadTrajetsFromApi] modeAll=false mais utilisateur non connecté, fallback local');
        return getTrajets();
      }
      carpools = items.filter(c => {
        const driver = c?.driver;
        // driver peut être objet {id:..} ou IRI '/api/users/1'
        const driverId = driver && typeof driver === 'object' ? driver.id : driver;
        return String(driverId) === String(me.id) || String(driverId) === `/api/users/${me.id}`;
      });
    }

    // Normalisation commune
    const mapped = carpools.map(c => {
      // serverId -> toujours IRI si disponible
      const serverId = c['@id'] ?? (c.id ? `/api/carpools/${c.id}` : null);
      // idLocal -> number or string (préférer number quand possible)
      const numericId = c.id ?? (serverId ? parseInt(String(serverId).split('/').pop(), 10) : null);
      const id = numericId != null && !Number.isNaN(numericId) ? String(numericId) : (serverId ?? null);

      // bookings normalisés si présents
      const bookings = Array.isArray(c.bookings) ? c.bookings.map(b => ({
        id: b.id ?? null,
        seats: b.reservedSeats ?? b.nb_places_reservees ?? b.seats ?? 1,
        status: b.status ?? b.statut ?? null,
        passenger: b.passenger ?? b.user ?? null,
        carpoolIri: (typeof b.carpool === 'string') ? b.carpool : (b.carpool?.['@id'] ?? null)
      })) : [];

      const carIri = (c.car && typeof c.car === 'string') ? c.car : (c.car?.['@id'] ?? null);
      const carObj = (c.car && typeof c.car === 'object') ? c.car : null;

      return {
        id,
        serverId,
        depart: c.departureLocation || c.departure || c.depart || '',
        arrivee: c.arrivalLocation || c.arrival || c.arrivee || '',
        date: (c.departureDate || c.date) ? String(c.departureDate || c.date).split('T')[0] : null,
        heureDepart: (c.departureTime || c.time || c.heureDepart) ? String(c.departureTime || c.time || c.heureDepart).slice(11,16) : '',
        heureArrivee: (c.arrivalTime || c.heureArrivee) ? String(c.arrivalTime || c.heureArrivee).slice(11,16) : '',
        prix: c.pricePerSeat ?? c.prix_par_place ?? c.prix ?? 0,
        places: c.nbPlacesTotal ?? c.totalSeats ?? c.nb_places_total ?? c.places ?? (carObj?.seats ?? 4),
        totalSeats: c.nbPlacesTotal ?? c.totalSeats ?? c.places ?? (carObj?.seats ?? 4),
        availableSeats: c.availableSeats ?? c.nb_places_dispo ?? c.available ?? null,
        driver: c.driver ? (typeof c.driver === 'object' ? c.driver : { id: c.driver }) : null,
        bookings,
        carIri,
        vehicle: carObj ? {
          id: carObj.id ?? (carIri ? parseInt(carIri.split('/').pop(),10) : null),
          marque: carObj.brand || carObj.marque || '',
          model: carObj.model || carObj.modele || '',
          seats: carObj.seats ?? carObj.places ?? 4,
          type: carObj.fuelType ?? carObj.type ?? ''
        } : null,
        raw: c,
      
        role: 'chauffeur',                              // tous les carpools API sont des trajets de chauffeur
        status: (c.status || c.statut || 'ajoute'),     // normaliser si API renvoie status, sinon 'ajoute'
        placesReservees: bookings.reduce((s,b) => s + (Number(b.seats ?? b.reservedSeats ?? b.nb_places_reservees) || 0), 0)
      };
    });


    // --- Générer aussi des entrées "passager" à partir des bookings si je suis passager ---
    const passengerEntries = [];
    try {
      mapped.forEach((poolMapped, idx) => {
        const originalPool = carpools[idx]; // l'objet brut renvoyé par l'API
        if (!originalPool || !Array.isArray(originalPool.bookings)) return;

        originalPool.bookings.forEach(b => {
          // identifier le passager dans la réservation
          const pass = b.passenger ?? b.user ?? b.passengerIri ?? null;
          let isMe = false;
          if (pass && me) {
            if (typeof pass === 'object' && pass.id) isMe = String(pass.id) === String(me.id);
            else if (typeof pass === 'string') {
              isMe = (pass === `/api/users/${me.id}`) || pass.endsWith('/' + me.id);
            } else {
              isMe = String(pass) === String(me.id);
            }
          }
          if (!isMe) return;

          // construire un id local stable pour la réservation
          const resLocalId = b.id ? `res-${b.id}` : genId();
          const covoId = poolMapped.serverId ?? poolMapped.id ?? (poolMapped.serverId || null);

          // éviter doublons : si mapped contient déjà un élément avec ce id -> skip
          const exists = mapped.some(m => String(m.id) === String(resLocalId) || String(m.serverId) === String(b['@id'] || b.serverId || ''));
          if (exists) return;

          passengerEntries.push({
            id: resLocalId,
            serverId: b['@id'] ?? (b.id ? `/api/bookings/${b.id}` : null),
            covoId: covoId,
            depart: poolMapped.depart,
            arrivee: poolMapped.arrivee,
            date: poolMapped.date,
            heureDepart: poolMapped.heureDepart,
            heureArrivee: poolMapped.heureArrivee,
            prix: poolMapped.prix,
            // places réservées selon la réservation
            placesReservees: Number(b.reservedSeats ?? b.nb_places_reservees ?? b.seats ?? 1),
            role: 'passager',
            status: (b.status || b.statut || 'reserve'),
            // garder la réservation brute pour permettre computePlacesReservees/findMyBooking
            bookings: [b],
            raw: b
          });
        });
      });
    } catch (e) {
      console.warn('[loadTrajetsFromApi] erreur génération entrées passager :', e);
    }

    // fusionner chauffeurs + passagers (les passagers après pour recherche plus simple)
    const combined = mapped.concat(passengerEntries);

    // muter le tableau global et persister
    trajets.splice(0, trajets.length, ...combined);
    saveTrajets();

    // Debug : détecter bookings orphelines (référence à un covo absent)
    const allServerIds = new Set(trajets.map(t => String(t.serverId)));
    const orphans = [];
    trajets.forEach(t => {
      (t.bookings || []).forEach(b => {
        const ref = b.carpoolIri || b.carpool || null;
        if (ref && !allServerIds.has(String(ref))) {
          orphans.push({ booking: b, parentCarpoolServerId: ref, hostTrajetId: t.id });
        }
      });
    });

    if (orphans.length > 0) {
      console.warn('[loadTrajetsFromApi] bookings référencent des carpools absents:', orphans);
      // optionnel : charger les carpools manquants ici si tu veux
    } else {
      console.log('[loadTrajetsFromApi] aucune réservation orpheline détectée');
    }

    console.log('[loadTrajetsFromApi] trajets count =', trajets.length, 'exemple:', trajets.slice(0,2));
    return trajets;
  } catch (err) {
    console.error('[loadTrajetsFromApi] erreur', err);
    return getTrajets();
  }
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
    trajetData.status = trajets[editingIndex].status;
    trajetData.serverId = trajets[editingIndex].serverId ?? trajetData.serverId;
    trajetData.synced = trajets[editingIndex].synced ?? trajetData.synced;
    trajetData.syncError = trajets[editingIndex].syncError ?? trajetData.syncError;
    trajets[editingIndex] = trajetData;
    editingIndex = null;
  } else {
    trajets.push(trajetData);
  }

  trajetData.synced = false;
  
  // Persiste immédiatement l'ajout pour que loadTrajetsFromApi (ou d'autres logiques)
  // qui lisent localStorage voient le trajet optimiste.
  saveTrajets(trajets);
  
  // Mettre à jour la vue "mes trajets" et la carte LOCALement (optimistic UI)
  ajouterAuCovoiturage(trajetData);
  updatePlacesReservees();
  renderTrajetsInProgress();
  renderHistorique();
  
  // Maintenant on peut tenter de recharger depuis l'API si nécessaire, mais
  // NE PAS écraser le trajet optimiste avant d'avoir persité.
  // await loadTrajetsFromApi();  // <-- supprimer / déplacer après la synchro serveur si vraiment nécessaire

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
    ajouterAuCovoiturage(trajetData);
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('trajets:changed', {
      detail: { source: serverIdRaw ? 'edit' : 'create', trajetId: trajetData.serverId || trajetData.id }
    }));
  } else if (serverObj && serverObj.status === 204) {
    trajetData.synced = true;
    delete trajetData.syncError;

    const idx = trajets.findIndex(x => x.id === trajetData.id);
    if (idx !== -1) {
      trajets[idx] = { ...trajets[idx], ...trajetData };
    }

    saveTrajets(trajets);
    console.log('✅ Trajet synchronisé (204 No Content) :', trajetData.serverId);
    window.dispatchEvent(new CustomEvent('trajets:changed', {
      detail: { source: 'edit', trajetId: trajetData.serverId || trajetData.id }
    }));
  } else {
    trajetData.synced = false;
    trajetData.syncError = 'Aucun identifiant serveur retourné';

    const idx = trajets.findIndex(x => x.id === trajetData.id);
    if (idx !== -1) {
      trajets[idx] = { ...trajets[idx], ...trajetData };
    }

    saveTrajets(trajets);
    window.dispatchEvent(new CustomEvent('trajets:changed', {
      detail: { source: 'local', trajetId: trajetData.id }
    }));
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

// -------------------- Reservation (appel API + update local) --------------------

/**
 * Réserver des places pour un covoiturage (POST vers API puis mise à jour locale)
 * Exportée au besoin pour être appelée depuis d'autres modules/UI.
 */
export async function reserverPlace(trajetId, placesDemandees = 1) {
  try {
    // appel via apiFetch (gère token). apiFetch doit renvoyer l'objet JSON directement
    let responseOrJson;
    try {
      responseOrJson = await apiFetch(`/carpools/${encodeURIComponent(trajetId)}/book`, {
        method: 'POST',
        body: { places: Number(placesDemandees) || 1 }
      });
    } catch (err) {
      // fallback fetch (garde comportement précédent mais mieux parser)
      const token = localStorage.getItem('api_token') || null;
      const fallbackRes = await fetch(`${API_BASE}/carpools/${encodeURIComponent(trajetId)}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ places: Number(placesDemandees) || 1 })
      });

      if (!fallbackRes.ok) {
        const txt = await fallbackRes.text().catch(() => '');
        const err = new Error(`HTTP ${fallbackRes.status} ${txt}`);
        err.status = fallbackRes.status;
        throw err;
      }
      responseOrJson = await fallbackRes.json().catch(() => null);
    }

    // Normaliser la "data" : si apiFetch renvoie Response ou JSON, s'assurer d'avoir l'objet JS
    let data;
    if (responseOrJson && typeof responseOrJson === 'object' && typeof responseOrJson.json === 'function') {
      // improbable si apiFetch est bien implémenté, mais au cas où
      data = await responseOrJson.json().catch(() => null);
    } else {
      data = responseOrJson;
    }

    // Construire l'objet réservation
    const reservationObj = {
      id: data?.id || data?.reservationId || genId(),
      covoId: trajetId,
      placesReservees: Number(placesDemandees) || 1,
      userId: getCurrentUser()?.id || null,
      role: 'passager',
      status: 'reserve',
      createdAt: new Date().toISOString()
    };

    // Mettre à jour ecoride_trajets (localStorage)
    try {
      const stored = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
      stored.push(reservationObj);
      localStorage.setItem('ecoride_trajets', JSON.stringify(stored));
    } catch (e) {
      console.warn('reserverPlace: impossible de mettre à jour localStorage', e);
    }

    // Synchroniser variable globale trajets + saveTrajets
    trajets.push(reservationObj);
    saveTrajets(trajets);

    // Mettre à jour nouveauxTrajets si nécessaire
    try {
      const key = 'nouveauxTrajets';
      const covos = JSON.parse(localStorage.getItem(key) || '[]');
      const covoIndex = covos.findIndex(c => String(getCovoId(c)) === String(trajetId) || String(c.id) === String(trajetId));
      if (covoIndex !== -1) {
        const covo = covos[covoIndex];
        covo.passagers = Array.isArray(covo.passagers) ? covo.passagers : [];
        covo.passagers.push({ pseudo: getCurrentUserPseudo(), places: Number(placesDemandees) || 1 });
        const occupied = covo.passagers.reduce((s,p) => s + (Number(p.places)||1), 0);
        const capacity = Number(covo.capacity ?? covo.vehicle?.places ?? covo.places ?? 4);
        covo.places = Math.max(0, capacity - occupied);
        covos[covoIndex] = covo;
        localStorage.setItem(key, JSON.stringify(covos));
        window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated', { detail: { trajetId } }));
      }
    } catch (e) {
      console.warn('reserverPlace: mise à jour nouveauxTrajets échouée', e);
    }

    // Recalcule et rerender local
    try {
      updatePlacesReservees();
      renderTrajetsInProgress();
      window.dispatchEvent(new CustomEvent('ecoride:reservationCreated', { detail: { trajetId } }));
    } catch (e) { console.warn('reserverPlace: refresh UI failed', e); }

    return { ok: true, data };
  } catch (err) {
    console.error('Erreur réseau réservation', err);
    return { ok: false, error: err };
  }
}

// Ajoute ceci près de reserverPlace / helpers API
async function deleteBookingApi(bookingOrIri, covoId = null) {
  if (!bookingOrIri && !covoId) throw new Error('No booking id or covoId provided');

  const token = localStorage.getItem('api_token') || '';

  // helper pour extraire uniquement le numéro d'un string (res-23, /api/bookings/23, 23, etc.)
  const extractNum = (s) => {
    if (!s) return null;
    const m = String(s).match(/(\d+)$/);
    return m ? m[1] : null;
  };

  const candidateIds = new Set();

  // Si bookingOrIri ressemble à une IRI /api/bookings/NN
  if (typeof bookingOrIri === 'string') {
    if (bookingOrIri.includes('/api/bookings')) {
      candidateIds.add({ type: 'iri', url: bookingOrIri });
    }
    const num = extractNum(bookingOrIri);
    if (num) candidateIds.add({ type: 'id', id: num });
  }

  // si on a covoId et booking id, essayer endpoint carpool-specific
  const covoNum = extractNum(covoId);
  if (covoNum) {
    // si bookingOrIri contient un id
    const bnum = extractNum(bookingOrIri);
    if (bnum) candidateIds.add({ type: 'covo-book', covoId: covoNum, bookingId: bnum });
  }

  // si on n'a rien d'autre, mais bookingOrIri est numérique, ajouter it
  const plainNum = extractNum(bookingOrIri);
  if (plainNum) candidateIds.add({ type: 'id', id: plainNum });

  // ordre d'essai: IRI /api/bookings/{id} -> /api/bookings/{id} (full url) -> /api/carpools/{covo}/book/{booking} -> fallback numeric /api/bookings/{id}
  const tried = [];
  for (const c of candidateIds) {
    try {
      let url;
      if (c.type === 'iri') {
        url = c.url;
      } else if (c.type === 'id') {
        url = `/api/bookings/${c.id}`;
      } else if (c.type === 'covo-book') {
        url = `/api/carpools/${c.covoId}/book/${c.bookingId}`;
      } else {
        continue;
      }

      // Construire URL complète
      const fullUrl = url.startsWith('/api/') ? `${API_BASE}${url}` : (url.startsWith('http') ? url : `${API_BASE}/${url.replace(/^\//,'')}`);

      console.log('[deleteBookingApi] trying DELETE', fullUrl);

      // essayer apiFetch si disponible (gère token & erreurs)
      try {
        const r = await apiFetch(url, { method: 'DELETE' });
        // si apiFetch ne jette pas, on considère réussi (souvent undefined ou objet)
        console.log('[deleteBookingApi] apiFetch OK for', url, r);
        return { status: 204, ok: true, via: 'apiFetch', url, raw: r };
      } catch (err) {
        // apiFetch peut renvoyer une erreur object avec status
        console.warn('[deleteBookingApi] apiFetch failed for', url, err);
        if (err && err.status && (err.status === 204 || err.status === 200 || err.status === 404)) {
          return { status: err.status, ok: err.status === 200 || err.status === 204, via: 'apiFetch-error', url, raw: err };
        }
        // sinon on tentera fetch
      }

      // fallback direct fetch (plus verbeux)
      const res = await fetch(fullUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      const text = await res.text().catch(() => '');
      console.log('[deleteBookingApi] fetch result', fullUrl, res.status, text);

      if (res.ok || res.status === 204 || res.status === 404) {
        return { status: res.status, ok: res.ok || res.status === 204, via: 'fetch', url: fullUrl, body: text };
      } else {
        const err = new Error(`HTTP ${res.status} ${text}`);
        err.status = res.status;
        throw err;
      }
    } catch (e) {
      tried.push({ candidate: c, error: (e && (e.message || e.status)) || e });
      // essayer le suivant
    }
  }

  // si on arrive ici, tout a échoué
  const err = new Error('All endpoints tried and failed: ' + JSON.stringify(tried));
  err.tried = tried;
  throw err;
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

    const rawId = target.dataset.id;

    const trajet =
      trajets.find(x => String(x.serverId) === String(rawId)) ||
      trajets.find(x => String(x.id) === String(rawId)) ||
      trajets.find(x => String(x.serverId) === `/api/carpools/${rawId}`);

    if (!trajet || trajet.role !== 'chauffeur') return;

    // helper: date input expects YYYY-MM-DD
    const toYMD = (val) => {
      if (!val) return '';
      // si c'est déjà YYYY-MM-DD, on garde
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) return String(val);
      const d = new Date(val);
      if (isNaN(d)) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    tryUntilExists(() => document.querySelector('#trajet-form') !== null, 12, 80).then(() => {
      const form = document.querySelector('#trajet-form');
      if (!form) return;

      const setIf = (selector, value) => {
        const el = form.querySelector(selector);
        if (!el) return;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // ✅ champs texte / time / price
      setIf('[name="depart"]', trajet.depart);
      setIf('[name="arrivee"]', trajet.arrivee);

      // ✅ dates au bon format
      setIf('[name="date"]', toYMD(trajet.date));
      setIf('[name="date-arrivee"]', toYMD(trajet.dateArrivee));

      setIf('[name="heure-depart"]', trajet.heureDepart);
      setIf('[name="heure-arrivee"]', trajet.heureArrivee);
      setIf('[name="prix"]', trajet.prix);

      // ✅ véhicule : ton select utilise la plaque comme value
      const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]');

      const carId = trajet.carId || (trajet.carIri ? Number(String(trajet.carIri).split('/').pop()) : null);

      const matched = vehicles.find(v => {
        const vId = v.id ?? v.serverId ?? null;
        return carId && vId && Number(vId) === Number(carId);
      }) || null;

      const plate = matched?.plate || matched?.immatriculation || matched?.licencePlate || '';

      // ton champ s'appelle "vehicle" et l'id est "#vehicle"
      setIf('[name="vehicle"]', plate);

      // placeholders "empty"
      form.querySelectorAll('input[type="date"], input[type="time"], input, select').forEach(input => {
        if (!input.value) input.classList.add('empty');
        else input.classList.remove('empty');
      });

      // ✅ important : on passe en mode édition
      editingIndex = trajets.findIndex(x =>
        String(x.serverId) === String(rawId) ||
        String(x.id) === String(rawId) ||
        String(x.serverId) === `/api/carpools/${rawId}`
      );

      // focus
      setTimeout(() => {
        const first = form.querySelector('input, textarea, select, button');
        if (first) first.focus({ preventScroll: true });
      }, 40);

      // scroll vers le formulaire
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (target.closest && target.closest('.trajet-delete-btn')) {
    const btn = target.closest('.trajet-delete-btn');
    e.preventDefault();
    e.stopPropagation();

    const id = btn.dataset.id;
    console.log('[delete] suppression déclenchée pour id:', id);

    // chercher l'index en acceptant serverId, id ou IRI
    const index = trajets.findIndex(t =>
      String(t.id) === String(id) ||
      String(t.serverId) === String(id) ||
      String(t.serverId) === `/api/carpools/${String(id).replace(/^\/api\/carpools\//, '')}`
    );

    if (index === -1) {
      console.warn('[delete] trajet non trouvé pour id:', id);
      return;
    }

    const removed = trajets[index];
    const serverId = removed?.serverId || removed?.['@id'] || null;
    const deleteKey = serverId || id;

    // protège contre double-click / requêtes concurrentes
    console.log('[delete] deleting set contient:', Array.from(deleting));
    if (deleting.has(deleteKey)) {
      console.debug('[delete] suppression déjà en cours pour', deleteKey);
      return;
    }
    deleting.add(deleteKey);

    // disable + feedback visuel
    btn.disabled = true;
    btn.classList.add('is-loading');

    const confirmed = confirm("Supprimer ce trajet ?");
    console.log('[delete] confirmation:', confirmed);
    if (!confirmed) {
      deleting.delete(deleteKey);
      btn.disabled = false;
      btn.classList.remove('is-loading');
      return;
    }

    try {
      if (!serverId) {
        // suppression locale seulement (pas d'ID serveur)
        try {
          // supprimer localement
          trajets.splice(index, 1);
          saveTrajets(trajets);
          renderTrajetsInProgress();
          renderHistorique();

          // aussi supprimer dans 'nouveauxTrajets' si présent
          const key = 'nouveauxTrajets';
          let covos = JSON.parse(localStorage.getItem(key) || '[]');
          covos = covos.filter(c => String(c.id) !== String(id));
          localStorage.setItem(key, JSON.stringify(covos));
          window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
          window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { localId: id, serverId: null } }));
        } catch (err) {
          console.warn('[delete] erreur suppression locale:', err);
        } finally {
          deleting.delete(deleteKey);
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
        return;
      }

      console.log('[delete] appel deleteCarpoolApi avec serverId:', serverId);
      const res = await deleteCarpoolApi(serverId);
      console.log('[delete] réponse deleteCarpoolApi:', res);

      if (res && (res.status === 204 || res.status === 200 || res.status === 404)) {
        try { removeLocalTrajetByServerId(serverId, id); } catch (e) { console.warn('removeLocalTrajetByServerId failed', e); }

        // retirer du tableau en mémoire
        const idx = trajets.findIndex(t => String(t.id) === String(id) || String(t.serverId) === String(serverId));
        if (idx !== -1) {
          trajets.splice(idx, 1);
          saveTrajets(trajets);
          renderTrajetsInProgress();
          renderHistorique();
        }

        window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { serverId, localId: id } }));
        console.log('Suppression appliquée localement et serveur OK', serverId);
      } else {
        console.warn('Suppression serveur inattendue', res);
        if (confirm(`La suppression côté serveur a échoué (statut: ${res?.status}). Forcer suppression locale ?`)) {
          try { removeLocalTrajetByServerId(serverId, id); } catch (e) { console.warn(e); }
          const idx = trajets.findIndex(t => String(t.id) === String(id) || String(t.serverId) === String(serverId));
          if (idx !== -1) { trajets.splice(idx, 1); saveTrajets(trajets); renderTrajetsInProgress(); renderHistorique(); }
          window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { serverId, localId: id } }));
        }
      }
    } catch (err) {
      console.error('[delete] erreur deleteCarpoolApi:', err);
      alert('Erreur lors de la suppression. Voir console.');
    } finally {
      deleting.delete(deleteKey);
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  // cancel (passager)
  if (target.classList.contains('trajet-cancel-btn')) {
    e.preventDefault();
    e.stopPropagation();
    
    const id = target.dataset.id;
    const index = trajets.findIndex(t => String(t.id) === String(id) || String(t.serverId) === String(id));
    if (index === -1) return;
    const trajet = trajets[index];
    if (!trajet || trajet.role !== 'passager') return;
    if (!confirm("Voulez-vous annuler cette réservation ?")) return;

    // récupérer booking server IRI ou booking id depuis l'objet
    const bookingCandidate =
      trajet.serverId
      || (Array.isArray(trajet.bookings) && trajet.bookings[0] && (trajet.bookings[0]['@id'] || (trajet.bookings[0].id ? `/api/bookings/${trajet.bookings[0].id}` : null)))
      || (trajet.raw && Array.isArray(trajet.raw.bookings) && trajet.raw.bookings[0] && (trajet.raw.bookings[0]['@id'] || trajet.raw.bookings[0].id))
      || null;

    const covoId = getCovoId(trajet) || trajet.covoId || trajet.detailId || null;

    const doLocalRemoval = () => {
      trajets.splice(index, 1);
      saveTrajets();

      let userReservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
      userReservations = userReservations.filter(r => String(r.id) !== String(id));
      localStorage.setItem('ecoride_trajets', JSON.stringify(userReservations));
      window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));

      try {
        let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
        const refId = getCovoId(trajet);
        if (refId) {
          const covoIndex = trajetsCovoiturage.findIndex(t => String(t.id) === String(refId));
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
      } catch (err) {
        console.warn('Erreur mise à jour nouveauxTrajets lors suppression locale', err);
      }

      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
      window.dispatchEvent(new CustomEvent('ecoride:reservationCancelled', { detail: { id } }));
      alert("Réservation annulée.");
    };

    // si pas d'info serveur => suppression locale
    if (!bookingCandidate && !covoId) {
      doLocalRemoval();
      return;
    }

    try {
      const res = await deleteBookingApi(bookingCandidate || '', covoId);
      console.log('[handle cancel] deleteBookingApi returned', res);

      // accepter 200/204/404 comme OK
      if (res && (res.status === 200 || res.status === 204 || res.status === 404)) {
        try { removeLocalTrajetByServerId(bookingCandidate || covoId || id, id); } catch (e) { console.warn('removeLocalTrajetByServerId failed', e); }
        doLocalRemoval();
        return;
      }

      // sinon fallback: proposer suppression locale
      throw new Error('Suppression serveur non confirmée: ' + JSON.stringify(res));
    } catch (err) {
      console.error('[handle cancel] deletion failed', err);
      if (confirm('Impossible d\'annuler côté serveur (' + (err.status || err.message || '') + '). Supprimer localement quand même ?')) {
        try { removeLocalTrajetByServerId(bookingCandidate || covoId || id, id); } catch (e) { console.warn(e); }
        doLocalRemoval();
      } else {
        alert('Annulation abandonnée. La réservation est toujours active sur le serveur.');
      }
    }
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
          const stored = getTrajets();
          trajets.splice(0, trajets.length, ...stored);
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
  try {
    // Récupérer toutes les entrées sauvegardées (carpools + réservations)
    const allStored = Array.isArray(trajets) && trajets.length ? trajets : JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');

    // Extraire réservations locales (role 'passager')
    const localReservations = (allStored || []).filter(r => r && r.role === 'passager');

    // Agréger par covoId (getCovoId compatible)
    const reservedByCovo = {};
    localReservations.forEach(r => {
      const covoId = getCovoId(r) || (r.covoId ?? r.detailId ?? r.serverId ?? r.id) || null;
      const places = Number(r.placesReservees ?? r.places ?? r.seats ?? 1) || 1;
      if (!covoId) return;
      reservedByCovo[covoId] = (reservedByCovo[covoId] || 0) + places;
      // garantir la prop sur la réservation elle-même
      r.placesReservees = places;
    });

    // Mettre à jour chaque trajet (chauffeur) présent dans trajets
    if (!Array.isArray(trajets) || trajets.length === 0) {
      trajets.splice(0, trajets.length, ...(Array.isArray(allStored) ? allStored : []));
    }

    console.log('updatePlacesReservees - trajets:', trajets);

    trajets.forEach(t => {
      console.log(`Trajet ${t.id} - placesReservees: ${t.placesReservees}, availableSeats: ${t.availableSeats}`);
      // id stable du covo
      const covoId = getCovoId(t) || (t.serverId ?? t.id ?? '');
      // capacité : pref vehicle.seats, sinon t.places / t.totalSeats / fallback 4
      const capacity = Number(t.vehicle?.seats ?? t.totalSeats ?? t.places ?? t.capacity ?? 4) || 4;
      const reserved = reservedByCovo[covoId] !== undefined ? reservedByCovo[covoId] : (Number(t.placesReservees) || 0);

      // assurer valeur minimale pour une réservation passager (1)
      if (t.role === 'passager' && (reserved === 0 || reserved === null)) {
        t.placesReservees = 1;
      } else {
        t.placesReservees = Number(reserved || 0);
      }

      // places disponibles calculées (surtout utile pour la page détail)
      t.availableSeats = Math.max(0, capacity - Number(t.placesReservees || 0));
    });

    // Persister si on a modifié (ne pas écraser autres clés)
    localStorage.setItem('ecoride_trajets', JSON.stringify(trajets));
  } catch (err) {
    console.warn('updatePlacesReservees error', err);
  }
}

console.log('Trajets après réservation:', trajets);

export function renderTrajetsInProgress() {
  if (typeof window !== 'undefined') {
    window.loadTrajetsFromApi = loadTrajetsFromApi;
    window.renderTrajetsInProgress = renderTrajetsInProgress;
  }
  const container = document.querySelector('#trajets-en-cours .trajets-list');
  if (!container) return;

  const enCours = Array.isArray(trajets) ? trajets.filter(t => t.status !== "valide") : [];
  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  updatePlacesReservees();

  // --- Fonction helper pour vérifier si le trajet appartient à l'utilisateur connecté ---
  function isUserDriverOf(trajet) {
    try {
      const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!me) return false;
      const driver = trajet.driver ?? (trajet.raw && trajet.raw.driver) ?? null;
      if (!driver) return false;
      if (typeof driver === 'object' && driver.id) return String(driver.id) === String(me.id);
      if (typeof driver === 'string') {
        return driver === `/api/users/${me.id}` || driver.endsWith('/' + me.id) || driver === String(me.id);
      }
      return String(driver) === String(me.id);
    } catch (e) {
      return false;
    }
  }

  // --- Filtrage : n'afficher la carte chauffeur QUE pour le chauffeur connecté ---
  const filteredEnCours = enCours.filter((t) => {
    const role = String(t.role || '').toLowerCase().trim();

    if (role === 'chauffeur') {
      return isUserDriverOf(t);
    }

    if (role === 'passager') {
      const covoId = t.covoId || t.detailId || t.serverId || t.id || null;
      if (!covoId) return false;
      const covoIdStr = String(covoId);
      const trajetChauffeur = trajets.find(tr =>
        String(tr.serverId) === covoIdStr ||
        String(tr.id) === covoIdStr ||
        (tr.serverId && tr.serverId.endsWith('/' + covoIdStr))
      );
      return !!trajetChauffeur;
    }

    return true;
  });

  let html = '';

  console.log('renderTrajetsInProgress — filteredEnCours:', filteredEnCours);

  function pickFirst(obj, keys) {
    for (const k of keys) {
      if (!k) continue;
      const parts = k.split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur == null) { cur = undefined; break; }
        cur = cur[p];
      }
      if (cur !== undefined && cur !== null && String(cur).trim() !== '') {
        return cur;
      }
    }
    return undefined;
  }

  function safeFormatDate(val) {
    if (!val) return '';
    if (typeof formatDateJJMMAAAA === 'function') {
      try {
        const formatted = formatDateJJMMAAAA(val);
        if (formatted) return formatted;
      } catch (e) { /* ignore and fallback */ }
    }
    const d = new Date(val);
    if (!isNaN(d)) {
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    return String(val);
  }

  const departCandidates = [ 'depart', 'departLieu', 'departVille', 'villeDepart', 'from', 'from.city', 'from.name', 'route.from', 'route.from.city', 'origin', 'origin.city' ];
  const arriveeCandidates = [ 'arrivee', 'arriveeLieu', 'arriveeVille', 'villeArrivee', 'to', 'to.city', 'to.name', 'route.to', 'route.to.city', 'destination', 'destination.city' ];
  const dateCandidates = [ 'date', 'dateDepart', 'departureDate', 'date_depart', 'startDate', 'start_at', 'departure_at', 'jour' ];

  function extractId(val) {
    if (val == null) return '';
    const s = String(val);
    const m = s.match(/(\d+)$/);
    return m ? m[1] : s;
  }

  // Helper pour calculer places réservées
  function getBookingSeatsFromBooking(b) {
    if (!b) return 0;
    return Number(b.seats ?? b.reservedSeats ?? b.nb_places_reservees ?? 0) || 0;
  }

  function findMyBookingOnTrajet(trajetRef, passengerIdOrIri) {
    if (!trajetRef || !Array.isArray(trajetRef.bookings)) return null;
    return trajetRef.bookings.find(b => {
      const pass = b.passenger ?? b.user ?? b.passengerIri ?? null;
      if (!pass) return false;
      if (typeof pass === 'object' && pass.id) return String(pass.id) === String(passengerIdOrIri);
      if (typeof pass === 'string') return pass === passengerIdOrIri || pass.endsWith('/' + passengerIdOrIri);
      return String(pass) === String(passengerIdOrIri);
    }) || null;
  }

  const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const myIdOrIri = me ? (me.id ?? `/api/users/${me.id}`) : null;

  function computePlacesReservees(t, trajetRef) {
    if (t.placesReservees != null) {
      return Number(t.placesReservees) || 0;
    }
    if (t.seats != null) {
      return Number(t.seats) || 0;
    }
    if (t.reservedSeats != null) {
      return Number(t.reservedSeats) || 0;
    }

    if (t.role === 'chauffeur' || (trajetRef && t.role !== 'passager')) {
      const bList = trajetRef?.bookings ?? [];
      return bList.reduce((sum, b) => sum + getBookingSeatsFromBooking(b), 0);
    }

    if (t.role === 'passager') {
      if (Array.isArray(t.bookings) && t.bookings.length > 0) {
        return getBookingSeatsFromBooking(t.bookings[0]);
      }
      const found = myIdOrIri ? findMyBookingOnTrajet(trajetRef, myIdOrIri) : null;
      if (found) {
        return getBookingSeatsFromBooking(found);
      }
      return 1;
    }

    return 0;
  }

  filteredEnCours.forEach((t, i) => {
    if (!t) {
      console.warn('Rendu trajet: trajet non défini, index =', i);
      return;
    }

    let bgClass = "trajet-card";
    let actionHtml = "";

    // Pour passager, récupérer les infos du trajet chauffeur lié
    let trajetRef = t;
    if (t.role === 'passager') {
      const covoId = t.covoId || t.detailId || t.serverId || t.id || null;
      if (covoId) {
        const covoIdStr = String(covoId);
        const trajetChauffeur = trajets.find(tr => String(tr.serverId) === covoIdStr || String(tr.id) === covoIdStr || (tr.serverId && tr.serverId.endsWith('/' + covoIdStr)));
        if (trajetChauffeur) {
          trajetRef = trajetChauffeur;
        } else {
          console.warn('Passager: covoId référencé mais trajet chauffeur introuvable', covoId, 'reservation id=', t.id);
        }
      }
    }

    const rawDepart = pickFirst(trajetRef, departCandidates);
    const rawArrivee = pickFirst(trajetRef, arriveeCandidates);
    const rawDate = pickFirst(trajetRef, dateCandidates);

    const depart = rawDepart ? String(rawDepart).trim() : '';
    const arrivee = rawArrivee ? String(rawArrivee).trim() : '';
    const dateToDisplay = safeFormatDate(rawDate) || '';

    const stableIdRaw = t.serverId ?? t.id ?? t['@id'] ?? '';
    const stableId = extractId(stableIdRaw);
    const dataIdForAttr = (t.id ?? t.serverId ?? stableIdRaw);

    const heureDepart = t.heureDepart || trajetRef.heureDepart || '';
    const heureArrivee = t.heureArrivee || trajetRef.heureArrivee || '';
    const prix = t.prix ?? trajetRef.prix ?? 0;

    const placesReservees = computePlacesReservees(t, trajetRef);

    const role = String(t.role || '').toLowerCase().trim() || (t.driver ? 'chauffeur' : (t.role === undefined && t.covoId ? 'passager' : 'chauffeur'));
    const status = String(t.status || t.raw?.status || t.raw?.statut || 'ajoute').toLowerCase().trim();

    if (role === "chauffeur") {
      if (status === "ajoute") {
        bgClass += " actif";
        actionHtml = `
          <button class="btn-trajet trajet-edit-btn" data-id="${stableId}">Modifier</button>
          <button class="btn-trajet trajet-delete-btn" data-id="${stableId}">Supprimer</button>
          <button class="btn-trajet trajet-start-btn" data-id="${stableId}">Démarrer</button>
        `;
      } else if (status === "demarre") {
        bgClass += " termine";
        actionHtml = `<button class="btn-trajet trajet-arrive-btn" data-id="${stableId}">Arrivée</button>`;
      } else if (status === "termine") {
        bgClass += " attente";
        actionHtml = `<span class="trajet-status">En attente de validation</span>`;
      }
    } else if (role === "passager") {
      if (status === "reserve") {
        bgClass += " reserve";
        const refId = getCovoId(t) || t.covoId || t.detailId || '';
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-cancel-btn" data-id="${dataIdForAttr}">Annuler</button>
          <button class="btn-trajet trajet-signaler-btn" data-id="${dataIdForAttr}" data-covo-id="${refId}">⚠ Signaler</button>
        `;
      } else if (status === "a_valider") {
        bgClass += " attente";
        const refId = getCovoId(t);
        actionHtml = `
          <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
          <button class="btn-trajet trajet-validate-btn" data-id="${stableId}">Valider</button>
        `;
      }
    }

    const placeLabel = placesReservees > 1 ? 'places réservées' : 'place réservée';
    html += `
      <div class="${bgClass}" data-id="${stableId}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${dateToDisplay}) : <br>${depart || '—'} → ${arrivee || '—'}</strong>
            ${t.synced === false ? '<span style="color:orange;font-size:0.9em;">⚠ Non synchronisé</span>' : ''}
            <span class="details">${heureDepart} → ${heureArrivee} • ${placesReservees} ${placeLabel}</span>
          </div>
          <div class="trajet-price">${prix} crédits</div>
          ${actionHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  if (!container.dataset.boundTrajets) {
    container.dataset.boundTrajets = "1";
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.trajet-edit-btn');
      if (editBtn) {
        const rawId = editBtn.dataset.id;
        const foundTrajet =
          trajets.find(x => String(x.serverId) === String(rawId)) ||
          trajets.find(x => String(x.id) === String(rawId)) ||
          trajets.find(x => String(x.serverId) === `/api/carpools/${rawId}`);
        if (!foundTrajet) return;
        if (typeof openEditTrajetForm === 'function') openEditTrajetForm(foundTrajet);
        return;
      }
      const detailBtn = e.target.closest('.trajet-detail-btn');
      if (detailBtn) {
        const covoId = detailBtn.dataset.covoId;
        if (!covoId) return;
        const newPath = `/detail/${encodeURIComponent(covoId)}`;
        try {
          history.pushState({ id: covoId }, '', newPath);
          window.dispatchEvent(new PopStateEvent('popstate', { state: { id: covoId } }));
        } catch (err) {
          window.location.href = newPath;
        }
        return;
      }
    });
  }
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
      pseudo: trajetData.chauffeur?.pseudo || getCurrentUserPseudo(),
      rating: trajetData.chauffeur?.rating || 0,
      photo: trajetData.chauffeur?.photo || "images/default-avatar.png"
    },
    type: normalizeTypeKey(trajetData.vehicle?.type || trajetData.type || ''),
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

  // recalcul + render pour s'assurer que la carte/UI soit cohérente
  try {
    updatePlacesReservees();
    renderTrajetsInProgress();
  } catch (e) {
    console.warn('ajouterAuCovoiturage: erreurs lors du refresh', e);
  }

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