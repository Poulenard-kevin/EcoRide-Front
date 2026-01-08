// trajets.js
import { apiFetch, API_BASE } from '/assets/js/api.js';
import { createCarIfNeeded, saveCarpoolApi, deleteCarpoolApi, carOwnedBy, updateBookingStatus } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey } from '/assets/js/type-utils.js';
import { addPendingReview } from './pending-reviews.js';


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

let trajetsPollInterval = null;
export function startTrajetsPolling(intervalMs = 20000) {
  if (trajetsPollInterval) return;
  trajetsPollInterval = setInterval(async () => {
    try {
      await loadTrajetsFromApi();
    } catch (e) {
      console.warn('Polling trajets failed', e);
    }
  }, intervalMs);
}
export function stopTrajetsPolling() {
  if (!trajetsPollInterval) return;
  clearInterval(trajetsPollInterval);
  trajetsPollInterval = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // reload rapide quand l'onglet redevient visible
    loadTrajetsFromApi().catch(e => console.warn('visibility reload failed', e));
  }
});

// --- Normalisation des statuts (centralisée) ---
const STATUS = {
  CHAUFFEUR: {
    DRAFT: 'ajoute',
    ACTIVE: 'en_cours',
    STARTED: 'demarre',
    ONGOING: 'en_cours',
    COMPLETED: 'termine',
    CANCELLED: 'annule',
    ARCHIVED: 'archive'
  },
  PASSAGER: {
    RESERVED: 'reserve',
    PENDING: 'pending',         // si backend renvoie pending (english)
    A_VALIDATE: 'a_valider',
    VALIDATED: 'valide'
  }
};

// map backend -> UI canonical
const STATUS_MAP = {
  // carpool (backend english) -> ui french
  'draft': STATUS.CHAUFFEUR.DRAFT,
  'created': STATUS.CHAUFFEUR.DRAFT,
  'active': STATUS.CHAUFFEUR.ACTIVE,
  'started': STATUS.CHAUFFEUR.STARTED,
  'ongoing': STATUS.CHAUFFEUR.ONGOING,
  'completed': STATUS.CHAUFFEUR.COMPLETED,
  'cancelled': STATUS.CHAUFFEUR.CANCELLED,
  'archived': STATUS.CHAUFFEUR.ARCHIVED,
  'termine': STATUS.CHAUFFEUR.COMPLETED,
  'demarre': STATUS.CHAUFFEUR.STARTED,
  'ajoute': STATUS.CHAUFFEUR.DRAFT,
  'en_cours': STATUS.CHAUFFEUR.ACTIVE,
  'termine': STATUS.CHAUFFEUR.COMPLETED,

  // booking / reservation statuses
  'pending': STATUS.PASSAGER.PENDING,
  'pending_validation': STATUS.PASSAGER.PENDING,
  'awaiting_validation': STATUS.PASSAGER.A_VALIDATE,
  'awaiting': STATUS.PASSAGER.A_VALIDATE,
  'a_valider': STATUS.PASSAGER.A_VALIDATE,
  'reserve': STATUS.PASSAGER.RESERVED,
  'reserved': STATUS.PASSAGER.RESERVED,
  'confirmed': STATUS.PASSAGER.VALIDATED,
  'valide': STATUS.PASSAGER.VALIDATED,
  'validé': STATUS.PASSAGER.VALIDATED
};

// normalizeStatus: prend une chaîne quelconque et renvoie la valeur canonique (lowercase)
export function normalizeStatus(raw) {
  if (!raw && raw !== 0) return '';
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (STATUS_MAP[s]) return STATUS_MAP[s];
  // tente match partiel (ex: 'awaiting_validation' -> 'awaiting_validation')
  for (const k of Object.keys(STATUS_MAP)) {
    if (s === k) return STATUS_MAP[k];
  }
  // fallback: si contient 'term' => termine ; 'start' => demarre ; 'pend' => pending
  if (s.includes('term') || s.includes('completed') || s.includes('finish')) return STATUS.CHAUFFEUR.COMPLETED;
  if (s.includes('start') || s.includes('demarr') || s.includes('started')) return STATUS.CHAUFFEUR.STARTED;
  if (s.includes('pend')) return STATUS.PASSAGER.PENDING;
  if (s.includes('reserve') || s.includes('book') || s.includes('reser')) return STATUS.PASSAGER.RESERVED;
  // sinon retourner la valeur brute lowercased (peu probable)
  return s;
}

async function fetchReservationsForDriver() {
  try {
    const token = localStorage.getItem('ecoride_token');
    console.log('[fetchReservationsForDriver] token:', token ? 'OK' : 'absent');

    const resp = await fetch('/api/driver/reservations', {
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });

    console.log('[fetchReservationsForDriver] status:', resp.status, 'content-type:', resp.headers.get('content-type'));

    if (!resp.ok) {
      // lire le corps pour plus de détails
      const txt = await resp.text().catch(() => '<no body>');
      console.error('Erreur fetchReservationsForDriver', resp.status, txt);
      return;
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    let list;
    if (contentType.includes('application/json')) {
      try {
        list = await resp.json();
      } catch (err) {
        // JSON invalide — logue le texte brut
        const text = await resp.text().catch(() => '<no body>');
        console.error('JSON parse failed, raw body:', text, err);
        return;
      }
    } else {
      // réponse non JSON (debug)
      const text = await resp.text().catch(() => '<no body>');
      console.warn('fetchReservationsForDriver: expected JSON, got:', contentType, text);
      return;
    }

    console.log('Données chauffeur mises à jour:', list);

    // Eviter erreur si list n'est pas sérialisable (circular ref) :
    let serialized;
    try {
      serialized = JSON.stringify(list);
    } catch (err) {
      console.error('JSON.stringify failed (circular?)', err);
      return;
    }

    // Utiliser une clé qui inclut l'id utilisateur/role si besoin pour éviter override inter-pages
    const userId = localStorage.getItem('ecoride_user_id') || 'anon';
    const key = `ecoride_trajets_driver_${userId}`;
    localStorage.setItem(key, serialized);

    // Dispatch local uniquement — attention : cela n'affecte pas les autres onglets
    window.dispatchEvent(new CustomEvent('ecoride:driver-reservations-updated', { detail: list }));
  } catch (e) {
    console.error('fetchReservationsForDriver error', e);
  }
}

function allPassengersValidated(trip) {
  if (!trip.bookings || !Array.isArray(trip.bookings)) return false;
  return trip.bookings.every(b => {
    const status = normalizeStatus(b.status ?? b.statut ?? '');
    return status === STATUS.PASSAGER.VALIDATED;
  });
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
      alert('Erreur lors de l\'enregistrement.');
      return;
    }
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

  // activer polling si l'utilisateur a des trajets en cours (économie de requêtes)
  try {
    const hasEnCours = trajets.some(t => {
      const s = normalizeStatus(t.status || '');
      return [STATUS.CHAUFFEUR.STARTED, STATUS.CHAUFFEUR.COMPLETED, STATUS.PASSAGER.RESERVED, STATUS.PASSAGER.A_VALIDATE, STATUS.CHAUFFEUR.DRAFT].includes(s);
    });
    if (hasEnCours) startTrajetsPolling(20000); // 20s ou 15s selon besoin
  } catch(e) { /* ignore */ }

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
        status: normalizeStatus(b.status ?? b.statut ?? null),
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
      
        role: 'chauffeur',                             
        status: normalizeStatus(c.status ?? c.statut ?? 'ajoute'),   
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
          const resLocalId = b.id ? String(b.id) : genId();
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
            status: normalizeStatus(b.status ?? b.statut ?? 'reserve'),
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

  const me = getCurrentUser();

  if (me) {
    trajetData.driver = trajetData.driver || { id: me.id };
  }

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

// fallback safe pour showToast — utilise la fonction existante si elle est définie,
// sinon affiche dans la console / via alert (ou dispatch d'un event custom)
const safeShowToast = (msg) => {
  try {
    if (typeof showToast === 'function') return showToast(msg);
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') return window.showToast(msg);
  } catch (e) {
    // ignore
  }
  // fallback minimal
  if (typeof console !== 'undefined') console.log('TOAST:', msg);
  try { alert(msg); } catch (e) { /* no-op */ }
};

// crée un avis côté backend en essayant plusieurs fallbacks pour trouver les IRIs nécessaires
async function createReviewApi({ reservationObj, rating, comment } = {}) {
  const buildIri = (type, idOrIri) => {
    if (!idOrIri) return null;
    const s = String(idOrIri);
    if (s.startsWith('/api/')) return s;
    const m = s.match(/(\d+)$/);
    const id = m ? m[1] : s;
    return `/api/${type}/${id}`;
  };

  let bookingIri = reservationObj?.serverId || reservationObj?.bookingIri || reservationObj?.['@id'] || null;
  if (bookingIri && !String(bookingIri).startsWith('/api/')) bookingIri = buildIri('bookings', bookingIri);

  const covoRaw = reservationObj?.covoId || reservationObj?.covo || reservationObj?.serverId || reservationObj?.covoIdLocal || null;
  let carpoolIri = null;
  if (covoRaw) {
    if (String(covoRaw).includes('/api/carpools')) carpoolIri = String(covoRaw);
    else carpoolIri = buildIri('carpools', covoRaw);
  }

  let targetIri = null;
  try {
    const allCarpools = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const found = Array.isArray(allCarpools) && allCarpools.find(c => String(c.id) === String(covoRaw) || String(c.serverId || '') === String(covoRaw));
    if (found && found.chauffeur) {
      if (found.chauffeur.id) targetIri = buildIri('users', found.chauffeur.id);
      else if (found.chauffeur.userId) targetIri = buildIri('users', found.chauffeur.userId);
    }

    if (!targetIri) {
      const globalTrajets = (typeof window !== 'undefined' && Array.isArray(window.trajets)) ? window.trajets : [];
      if (Array.isArray(globalTrajets)) {
        const t = globalTrajets.find(x => {
          return String(x.serverId || x.id || x.covoId || x.detailId) === String(covoRaw) ||
                 (x.serverId && x.serverId.endsWith('/' + covoRaw));
        });
        if (t && t.driver) {
          if (typeof t.driver === 'object' && t.driver.id) targetIri = buildIri('users', t.driver.id);
          else if (typeof t.driver === 'string') targetIri = (String(t.driver).startsWith('/api/users') ? t.driver : buildIri('users', t.driver));
        } else if (t && t.chauffeur && t.chauffeur.id) {
          targetIri = buildIri('users', t.chauffeur.id);
        }
      }
    }
  } catch (e) {
    console.warn('createReviewApi: erreur recherche chauffeur local', e);
  }

  // Si nécessaire, fetch booking pour extraire relations
  if ((!targetIri || !carpoolIri) && bookingIri) {
    try {
      // normaliser pour apiFetch : enlever leading /api si apiFetch attend '/resource'
      let bookingPath = String(bookingIri);
      if (bookingPath.startsWith('/api/')) bookingPath = bookingPath.replace(/^\/api/, '');
      if (!bookingPath.startsWith('/')) bookingPath = '/' + bookingPath.replace(/^\/+/, '');

      const booking = await apiFetch(bookingPath); // ex: '/bookings/123'
      if (!carpoolIri && booking?.carpool) {
        carpoolIri = (typeof booking.carpool === 'string') ? booking.carpool : (booking.carpool['@id'] || (booking.carpool.id ? `/api/carpools/${booking.carpool.id}` : null));
      }
      if (!targetIri) {
        if (booking?.carpool && booking.carpool?.driver) {
          const d = booking.carpool.driver;
          targetIri = (typeof d === 'string') ? d : (d['@id'] || (d.id ? `/api/users/${d.id}` : null));
        }
      }
    } catch (e) {
      console.warn('createReviewApi: impossible de fetch booking pour extraire carpool/driver', e);
    }
  }

  if (!carpoolIri && covoRaw) carpoolIri = buildIri('carpools', covoRaw);

  const payload = {
    rating: Number(rating) || 0,
    comment: comment || null,
    booking: bookingIri || null,
    carpool: carpoolIri || null,
    target: targetIri || null
  };
  Object.keys(payload).forEach(k => payload[k] === null && delete payload[k]);

  try {
    const created = await apiFetch('/reviews', {
      method: 'POST',
      body: payload
    });
    return created;
  } catch (err) {
    console.warn('createReviewApi apiFetch failed, fallback fetch', err);
    const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
    const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/,'') : '';
    const fullUrl = API_BASE ? `${API_BASE}/api/reviews` : '/api/reviews';

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const err2 = new Error('HTTP ' + res.status + ' ' + text);
      err2.status = res.status;
      err2.body = text;
      throw err2;
    }
    try { return JSON.parse(text); } catch (e) { return text; }
  }
}

window.createReviewApi = createReviewApi;

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
    const idAttr = target.dataset.id;
    const dataServerId = target.dataset.serverId || target.getAttribute('data-server-id') || null;

    // trouver le trajet local (priorité serverId puis id)
    const trajet = trajets.find(t =>
      (t.serverId && String(t.serverId) === String(dataServerId)) ||
      String(t.serverId) === `/api/carpools/${String(idAttr)}` ||
      String(t.id) === String(idAttr) ||
      String(t.id) === String(dataServerId)
    );

    if (!trajet || trajet.role !== 'chauffeur') return;

    // mise à jour locale optimiste
    trajet.status = 'demarre';
    saveTrajets();
    updatePlacesReservees();
    renderTrajetsInProgress();

    // UI feedback / protection contre double clic
    const btn = target;
    try { btn.disabled = true; btn.classList.add('is-loading'); } catch (e) {}

    (async () => {
      try {
        // helper extract last numeric id from IRI or string
        const extractNum = (s) => {
          if (!s) return null;
          const m = String(s).match(/(\d+)$/);
          return m ? m[1] : null;
        };

        const serverNum = extractNum(dataServerId || trajet.serverId || trajet['@id'] || idAttr);
        if (!serverNum) {
          // pas d'ID serveur : garder l'état local et marquer non-synchronisé
          trajet.synced = false;
          trajet.syncError = 'no-server-id';
          saveTrajets();
          console.warn('trajet-start: aucun server id détecté, mise à jour locale seulement');
          return;
        }

        const payload = JSON.stringify({ status: 'demarre' });

        console.log('[trajet-start] PATCH /carpools/' + serverNum, payload);

        // Appel API (merge-patch utilisé ailleurs)
        const resp = await apiFetch(`/carpools/${serverNum}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/merge-patch+json' },
          body: payload
        });

        // apiFetch peut retourner l'objet JSON directement, ou Response-like.
        let updatedTrajet = null;
        if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
          // improbable si apiFetch renvoie déjà JSON mais on tente
          try { updatedTrajet = await resp.json(); } catch(e){ updatedTrajet = resp; }
        } else {
          updatedTrajet = resp;
        }

        // Si on a un JSON contenant le covoiturage mis à jour, remplacer localement
        if (updatedTrajet && typeof updatedTrajet === 'object') {
          // Normaliser le format (si backend renvoie @id/id, on garde ce qu'on a)
          const serverIdFromResp = updatedTrajet['@id'] ?? (updatedTrajet.id ? `/api/carpools/${updatedTrajet.id}` : null);
          // construire un objet compatible avec ta structure locale si nécessaire
          // => nous remplaçons l'élément local par l'objet renvoyé (ou une version adaptée)
          const idx = trajets.findIndex(t => String(t.id) === String(trajet.id) || String(t.serverId) === String(serverIdFromResp) || String(t.serverId) === String(trajet.serverId));
          if (idx !== -1) {
            // si le backend renvoie la ressource complète (hydra/member) tu devras mapper comme dans loadTrajetsFromApi
            // pour simplicité, on conserve les champs essentiels si absents côté serveur
            const kept = { ...trajets[idx] };
            trajets[idx] = Object.assign(kept, updatedTrajet);
          } else {
            // pas trouvé -> insérer en tête
            trajets.unshift(updatedTrajet);
          }
          // marquer sync ok
          trajets.forEach(t => { if (String(t.id) === String(trajet.id)) { t.synced = true; delete t.syncError; } });
          saveTrajets(trajets);
          // recharger de l'API pour être sûr d'avoir les bookings/passagers synchronisés (optionnel)
          try { await loadTrajetsFromApi(); } catch(e){ /* non critique */ }
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
          return;
        }

        // Cas où apiFetch retourne 204 / pas de JSON : forcer un reload centralisé
        console.log('[trajet-start] réponse sans JSON (204 ?) - rechargement depuis l\'API');
        try {
          await loadTrajetsFromApi();
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
        } catch (e) {
          console.warn('trajet-start: reload after 204 failed', e);
        }

      } catch (err) {
        console.warn('Erreur sync start -> serveur :', err);
        // conserver l'update locale et marquer syncError si besoin
        if (trajet) {
          trajet.synced = false;
          trajet.syncError = err.message || String(err);
          saveTrajets();
        }
      } finally {
        try { btn.disabled = false; btn.classList.remove('is-loading'); } catch (e) {}
      }
    })();

    return;
  }

  // arrive
  if (target.classList.contains('trajet-arrive-btn')) {
    const dataServerId = target.dataset.serverId || target.getAttribute('data-server-id') || null;
    const idAttr = target.dataset.id || null;

    // trouver le trajet local (priorité serverId)
    const trajet = trajets.find(t =>
      (t.serverId && String(t.serverId) === String(dataServerId)) ||
      String(t.serverId) === `/api/carpools/${String(idAttr)}` ||
      String(t.id) === String(idAttr) ||
      String(t.id) === String(dataServerId)
    );

    // mise à jour locale optimiste
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'termine';

      try {
        // récupère l'ID serveur du covoiturage courant (fonction utilitaire que tu as déjà)
        const covoId = getCovoId(trajet) || trajet.serverId || trajet['@id'] || `/api/carpools/${trajet.id}`;
      
        // mettre à jour tous les trajets locaux qui correspondent à ce covo (côté passagers)
        trajets.forEach(t => {
          const tCovoId = getCovoId(t) || t.serverId || t['@id'] || `/api/carpools/${t.id}`;
          if (String(tCovoId) === String(covoId)) {
            if (t.role === 'passager') {
              t.status = 'a_valider'; // ou autre status attendu par ton rendu
              t.synced = false;
            }
          }
        });
      } catch (e) {
        console.warn('Erreur lors de la propagation aux passagers :', e);
      }
      
      saveTrajets();
      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
    }

    // capture le bouton pour l'état visuel
    const btn = target;
    (async () => {
      // proteger contre double-click
      try {
        btn.disabled = true;
        btn.classList.add('is-loading');
      } catch (e) {}

      try {
        const extractNum = (s) => {
          if (!s) return null;
          const m = String(s).match(/(\d+)$/);
          return m ? m[1] : null;
        };
        const serverNum = extractNum(dataServerId || trajet?.serverId || trajet?.['@id'] || idAttr);
        if (!serverNum) {
          console.warn('trajet-arrive: aucun server id détecté, mise à jour locale seulement');
          return;
        }

        const payload = JSON.stringify({ status: 'termine' });

        console.log('[trajet-arrive] PATCH /carpools/' + serverNum, payload);

        // Envoi PATCH avec Content-Type correct (merge-patch pour API Platform)
        await apiFetch(`/carpools/${serverNum}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/merge-patch+json' },
          body: payload
        });

        // reload centralisé depuis l'API : mettra à jour chauffeurs + entrées passager
        await loadTrajetsFromApi();

        // re-render local (loadTrajetsFromApi appelle saveTrajets)
        updatePlacesReservees();
        renderTrajetsInProgress();
        renderHistorique();
        window.dispatchEvent(new CustomEvent('ecoride:trajet-arrived', { detail: { serverId: serverNum } }));
      } catch (err) {
        console.warn('Erreur sync arrive -> serveur :', err);
        // conserver l'update locale et marquer syncError si besoin
        if (trajet) {
          trajet.synced = false;
          trajet.syncError = err.message || String(err);
          saveTrajets();
        }
      } finally {
        try {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        } catch (e) {}
      }
    })();

    return;
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
        if (!el) {
          console.warn('setIf: élément introuvable pour', selector);
          return;
        }
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // ✅ champs texte / time / price
      setIf('[name="depart"]', trajet.depart);
      setIf('[name="arrivee"]', trajet.arrivee);

      // ✅ dates au bon format (IMPORTANT : utiliser les bonnes propriétés)
      setIf('[name="date"]', toYMD(trajet.date));
      
      // ✅ FIX : date d'arrivée (chercher dans plusieurs propriétés possibles)
      setIf('[name="date-arrivee"]', toYMD(trajet.date || ''));

      setIf('[name="heure-depart"]', trajet.heureDepart);
      setIf('[name="heure-arrivee"]', trajet.heureArrivee);
      setIf('[name="prix"]', trajet.prix);

      // ✅ FIX : véhicule (améliorer le matching)
      const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]');

      // Récupérer l'ID de la voiture depuis plusieurs sources possibles
      const carId = trajet.carId 
        || (trajet.vehicle?.id) 
        || (trajet.vehicle?.serverId)
        || (trajet.carIri ? Number(String(trajet.carIri).split('/').pop()) : null)
        || (trajet.raw?.car?.id)
        || null;

      console.log('🚗 Recherche véhicule pour carId:', carId, 'dans', vehicles);

      // Chercher le véhicule correspondant
      const matched = vehicles.find(v => {
        const vId = v.id ?? v.serverId ?? null;
        const vPlate = v.plate || v.immatriculation || v.licencePlate || '';
        
        // Match par ID
        if (carId && vId && Number(vId) === Number(carId)) return true;
        
        // Match par plaque si disponible dans trajet.vehicle
        if (trajet.vehicle?.plate && vPlate && vPlate === trajet.vehicle.plate) return true;
        
        return false;
      }) || null;

      const plate = matched?.plate || matched?.immatriculation || matched?.licencePlate || '';

      console.log('🚗 Véhicule trouvé:', matched, 'plaque:', plate);

      // Pré-remplir le select
      setIf('[name="vehicle"]', plate);
      
      // Si le véhicule n'est pas trouvé, afficher un warning
      if (!plate && carId) {
        console.warn('⚠️ Véhicule non trouvé dans la liste pour carId:', carId);
      }

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
          // 1) Appeler updateBookingStatus pour changer le statut côté serveur
          await updateBookingStatus(reservationId, 'confirmed'); // ou 'valide' selon ta logique
      
          // 2) Mettre à jour localStorage et UI comme tu le fais déjà
          let reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
          const idx = reservations.findIndex(r => String(r.id) === String(reservationId));
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
      
          // Persist local optimistically
          localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
          window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
      
          // 3) Créer l'avis côté backend (essayer), en fournissant l'objet reservation pour construire IRIs
          try {
            // createReviewApi lève en cas d'erreur HTTP
            const created = await createReviewApi({ reservationObj: reservations[idx], rating, comment: review });
            console.log('Avis créé côté serveur :', created);
          
            // Mettre à jour la reservation locale avec l'IRI ou l'id retourné par le serveur
            reservations[idx].reviewServer = created?.['@id'] || created?.id || null;
            // Marque localement que l'avis a bien été envoyé
            reservations[idx].reviewLocal = {
              rating,
              comment: review,
              pending: false,
              sentAt: new Date().toISOString(),
              serverRef: reservations[idx].reviewServer
            };
          
            localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
            window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
            safeShowToast('Merci — ton avis a bien été envoyé et est en attente de validation.');
          } catch (err) {
            console.warn('createReviewApi failed', err);
          
            // Construire l'objet pending review (garder uniquement les champs nécessaires)
            const pending = {
              reservationId: reservations[idx]?.id || reservations[idx]?.reservationId || null,
              reservationObjSnapshot: {
                // évite de stocker trop de données : id, covoiturage, conducteur, date...
                id: reservations[idx]?.id,
                covoiturage: reservations[idx]?.covoiturage || reservations[idx]?.carpoolId,
                date: reservations[idx]?.date
              },
              rating,
              comment: review,
              flagged: !!flagged,
              dateCreated: new Date().toISOString(),
              lastAttempt: new Date().toISOString(),
              attemptCount: 1
            };
          
            // Si addPendingReview existe, utilise-la (importée depuis ton util), sinon fallback vers localStorage
            try {
              if (typeof addPendingReview === 'function') {
                addPendingReview(pending);
              } else {
                // fallback : empiler dans localStorage sous ecoride_reviews_pending
                const key = 'ecoride_reviews_pending';
                const existing = JSON.parse(localStorage.getItem(key) || '[]');
                existing.push(pending);
                localStorage.setItem(key, JSON.stringify(existing));
                console.log('Pending review saved to localStorage under', key);
              }
            } catch (saveErr) {
              console.error('Failed to save pending review', saveErr);
            }
          
            // Mettre à jour la reservation locale pour montrer visuellement que l'avis est "en attente"
            reservations[idx].reviewLocal = {
              rating,
              comment: review,
              pending: true,
              savedAt: new Date().toISOString()
            };
            localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
            window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
          
            safeShowToast('Ton avis a bien été pris en compte localement, l’envoi au serveur a échoué. Il sera retenté plus tard.');
          }
      
          // ... le reste de ton code de mise à jour UI (trajets, covo, etc.) reste identique ...
          // mise à jour variable globale trajets etc.
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

          await fetchReservationsForDriver();

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

  const enCours = Array.isArray(trajets) ? trajets.filter(t => normalizeStatus(t.status ?? t.raw?.status ?? '') !== STATUS.PASSAGER.VALIDATED) : [];
  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  updatePlacesReservees();

  // Mapping status -> classe CSS (centralisé)
  const STATUS_TO_CLASS = {
    'ajoute': 'actif',
    'en_cours': 'actif',
    'demarre': 'demarre',
    'termine': 'termine',
    'annule': 'attente',
    'archive': 'archive',
    'reserve': 'reserve',
    'reserved': 'reserve',
    'a_valider': 'attente',
    'pending': 'reserve',     
    'valide': 'valide'
  };

  function isUserDriverOf(trajet) {
    try {
      const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!me) return false;
      const driver = trajet.driver ?? trajet.chauffeur ?? (trajet.raw && trajet.raw.driver) ?? null;
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

  // Filtrage
  console.log('DEBUG renderTrajetsInProgress — tous trajets (count):', trajets.length);
  trajets.forEach(t => console.log('  ->', t.id, 'role=', t.role, 'status=', t.status, 'serverId=', t.serverId, 'covoId=', getCovoId(t)));

  const validStatuses = {
    chauffeur: [STATUS.CHAUFFEUR.DRAFT, STATUS.CHAUFFEUR.ACTIVE, STATUS.CHAUFFEUR.STARTED, STATUS.CHAUFFEUR.COMPLETED],
    passager: [STATUS.PASSAGER.RESERVED, STATUS.PASSAGER.PENDING, STATUS.PASSAGER.A_VALIDATE]
  };

  const filteredEnCours = enCours.filter(t => {
    const roleNorm = String(t.role || '').toLowerCase().trim() || (t.driver ? 'chauffeur' : (t.role === undefined && t.covoId ? 'passager' : 'chauffeur'));
    const statusNorm = normalizeStatus(t.status ?? t.raw?.status ?? t.raw?.statut ?? '');
  
    if (roleNorm === 'chauffeur') {
      // Exclure les trajets terminés avec tous passagers validés
      if (statusNorm === STATUS.CHAUFFEUR.COMPLETED && allPassengersValidated(t)) {
        return false; // ne pas afficher dans la liste en cours
      }
      return isUserDriverOf(t);
    }
    if (roleNorm === 'passager') {
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
    return false;
  });

  console.log('DEBUG filteredEnCours:', filteredEnCours.map(t => ({ id: t.id, role: t.role, status: t.status })));

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
      if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
    }
    return undefined;
  }

  function safeFormatDate(val) {
    if (!val) return '';
    if (typeof formatDateJJMMAAAA === 'function') {
      try {
        const formatted = formatDateJJMMAAAA(val);
        if (formatted) return formatted;
      } catch (e) { /* ignore */ }
    }
    const d = new Date(val);
    if (!isNaN(d)) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
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
    if (t.placesReservees != null) return Number(t.placesReservees) || 0;
    if (t.seats != null) return Number(t.seats) || 0;
    if (t.reservedSeats != null) return Number(t.reservedSeats) || 0;

    if (t.role === 'chauffeur' || (trajetRef && t.role !== 'passager')) {
      const bList = trajetRef?.bookings ?? [];
      return bList.reduce((sum, b) => sum + getBookingSeatsFromBooking(b), 0);
    }

    if (t.role === 'passager') {
      if (Array.isArray(t.bookings) && t.bookings.length > 0) return getBookingSeatsFromBooking(t.bookings[0]);
      const found = myIdOrIri ? findMyBookingOnTrajet(trajetRef, myIdOrIri) : null;
      if (found) return getBookingSeatsFromBooking(found);
      return 1;
    }

    return 0;
  }

  filteredEnCours.forEach((t, i) => {
    try {
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
          const trajetChauffeur = trajets.find(tr =>
            String(tr.serverId) === covoIdStr ||
            String(tr.id) === covoIdStr ||
            (tr.serverId && tr.serverId.endsWith('/' + covoIdStr))
          );
          if (trajetChauffeur) trajetRef = trajetChauffeur;
          else console.warn('Passager: covoId référencé mais trajet chauffeur introuvable', covoId, 'reservation id=', t.id);
        }
      }

      // Extraction des infos principales
      const rawDepart = pickFirst(trajetRef, departCandidates);
      const rawArrivee = pickFirst(trajetRef, arriveeCandidates);
      const rawDate = pickFirst(trajetRef, dateCandidates);

      const depart = rawDepart ? String(rawDepart).trim() : '';
      const arrivee = rawArrivee ? String(rawArrivee).trim() : '';
      const dateToDisplay = safeFormatDate(rawDate) || '';

      const stableIdRaw = t.serverId ?? t.id ?? t['@id'] ?? '';
      const stableId = extractId(stableIdRaw);
      const dataIdForAttr = t.id ?? t.serverId ?? stableIdRaw;

      const heureDepart = t.heureDepart || trajetRef.heureDepart || '';
      const heureArrivee = t.heureArrivee || trajetRef.heureArrivee || '';
      const prix = t.prix ?? trajetRef.prix ?? 0;

      const placesReservees = computePlacesReservees(t, trajetRef);

      // Normalisation rôle / statut
      const role = String(t.role || '').toLowerCase().trim() || (t.driver ? 'chauffeur' : (t.role === undefined && t.covoId ? 'passager' : 'chauffeur'));
      const status = normalizeStatus(t.status ?? t.raw?.status ?? t.raw?.statut ?? 'ajoute');

      // mappedClass (utilisé pour apply CSS by default)
      const mappedClass = STATUS_TO_CLASS[status] ?? status;
      // par défaut on applique mappedClass (ex: reserve, actif, demarre, attente...)
      bgClass += mappedClass ? ` ${mappedClass}` : '';

      // Actions selon rôle/statu (on privilégie mappedClass pour la logique passager)
      if (role === "chauffeur") {
        if (status === STATUS.CHAUFFEUR.DRAFT || status === 'ajoute') {
          bgClass = 'trajet-card actif';
          actionHtml = `
            <button class="btn-trajet trajet-edit-btn" data-id="${stableId}" data-server-id="${stableIdRaw}">Modifier</button>
            <button class="btn-trajet trajet-delete-btn" data-id="${stableId}" data-server-id="${stableIdRaw}">Supprimer</button>
            <button class="btn-trajet trajet-start-btn" data-id="${stableId}" data-server-id="${stableIdRaw}">Démarrer</button>
          `;
        } else if (status === STATUS.CHAUFFEUR.STARTED || status === 'demarre') {
          bgClass = 'trajet-card demarre';
          actionHtml = `<button class="btn-trajet trajet-arrive-btn" data-id="${stableId}" data-server-id="${stableIdRaw}">Arrivée à destination</button>`;
        } else if (status === STATUS.CHAUFFEUR.COMPLETED || status === 'termine') {
          // Détecter s'il reste des réservations en attente pour ce covo
          const hasPendingBookings = Array.isArray(trajetRef.bookings) && trajetRef.bookings.some(b => {
            const bs = normalizeStatus(b.status ?? b.statut ?? '');
            return bs === STATUS.PASSAGER.A_VALIDATE || bs === STATUS.PASSAGER.PENDING;
          });

          if (hasPendingBookings) {
            bgClass = 'trajet-card attente';
            actionHtml = `<span class="trajet-status">En attente de validation</span>`;
          } else {
            // aucun passager en attente -> on le considère comme terminé / historique
            bgClass = 'trajet-card termine-ok';
            actionHtml = `<span class="trajet-status">Terminé</span>`;
            // si tu veux enlever le trajet de la liste en cours et le placer en historique automatiquement,
            // appelle ici renderHistorique() ou fais la logique de déplacement.
          }
        } else {
          // fallback: keep mapped class and no special actions
        }
      } else if (role === "passager") {
        // on considère comme "reserve" si mappedClass === 'reserve' ou status équivalent
        if (mappedClass === 'reserve' || status === STATUS.PASSAGER.RESERVED || status === STATUS.PASSAGER.PENDING) {
          // s'assurer que la classe "reserve" est présente
          if (!bgClass.includes('reserve')) bgClass += ' reserve';
          const refId = getCovoId(t) || t.covoId || t.detailId || '';
          actionHtml = `
            <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
            <button class="btn-trajet trajet-cancel-btn" data-id="${dataIdForAttr}" data-server-id="${stableIdRaw}">Annuler</button>
            <button class="btn-trajet trajet-signaler-btn" data-id="${dataIdForAttr}" data-covo-id="${refId}">⚠ Signaler</button>
          `;
        } else if (mappedClass === 'attente' || status === STATUS.PASSAGER.A_VALIDATE) {
          if (!bgClass.includes('attente')) bgClass += ' attente';
          const refId = getCovoId(t);
          actionHtml = `
            <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
            <button class="btn-trajet trajet-validate-btn" data-id="${stableId}" data-server-id="${stableIdRaw}">Valider</button>
          `;
        } else {
          // fallback: keep mapped class
        }
      }

      // Label pluriel/singulier
      const placeLabel = placesReservees > 1 ? 'places réservées' : 'place réservée';

      // Construction HTML du bloc
      html += `
        <div class="${bgClass.trim()}" data-id="${stableId}" data-server-id="${stableIdRaw}">
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
    } catch (err) {
      console.warn('Erreur lors du rendu d\'un trajet (continue):', err);
    }
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
          window.history.pushState({}, '', newPath);
          LoadContentPage();
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
    allContainers.forEach((el, i) => { if (i > 0) el.remove(); });
  }
  const container = document.querySelector('.trajets-historique');
  if (!container) return;
  if (container.dataset.rendering === '1') return;
  container.dataset.rendering = '1';

  try {
    container.innerHTML = `<h2>Mes trajets passés</h2>`;

    let allTrajets = [];
    try {
      allTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    } catch (e) {
      console.warn('parse localStorage ecoride_trajets failed', e);
    }

    function allPassengersValidated(trip) {
      if (!trip || !Array.isArray(trip.bookings)) return false;
      return trip.bookings.length > 0 && trip.bookings.every(b => {
        const st = normalizeStatus(b.status ?? b.statut ?? b.rawStatus ?? '');
        return st === STATUS.PASSAGER.VALIDATED;
      });
    }

    // séparer carpools et bookings
    const carpools = [];
    const bookings = [];
    const extractId = s => {
      if (!s) return null;
      const str = String(s);
      const m = str.match(/\/(\d+)(?:$|\/)/);
      if (m) return m[1];
      const parts = str.split('/');
      return parts[parts.length - 1] || null;
    };

    for (const t of allTrajets) {
      const sid = String(t.serverId || t.server || t['@id'] || '');
      if (sid.includes('/api/bookings') || (t.covoId && String(t.covoId).includes('/api/carpools')) || t.type === 'booking') {
        bookings.push(t);
      } else if (sid.includes('/api/carpools') || t.type === 'carpool' || (t.serverId && String(t.serverId).includes('/api/carpools'))) {
        carpools.push(t);
      } else {
        // heuristique : s'il a covoId -> booking, sinon carpool
        if (t.covoId) bookings.push(t); else carpools.push(t);
      }
    }

    // Build bookingsByCovo keys: numeric id as string
    const bookingsByCovo = new Map();
    for (const b of bookings) {
      const covoKey = extractId(b.covoId || b.covo || b.covo_id || b.server || b.serverId);
      if (!covoKey) continue;
      if (!bookingsByCovo.has(covoKey)) bookingsByCovo.set(covoKey, []);
      bookingsByCovo.get(covoKey).push(b);
    }
    console.debug('bookingsByCovo keys:', Array.from(bookingsByCovo.keys()));

    // current user id
    let currentUserId = null;
    try {
      const me = JSON.parse(localStorage.getItem('ecoride_me') || localStorage.getItem('ecoride_user') || 'null');
      if (me) currentUserId = me.id || (me['@id'] ? extractId(me['@id']) : null) || me.username || null;
    } catch (e) { /* ignore */ }
    console.debug('currentUserId:', currentUserId);

    function bookingBelongsToCurrentUser(booking) {
      if (!currentUserId) return true;
    
      // Cas classique : id direct dans certains champs
      const candidates = [
        booking.user,
        booking.userId,
        booking.passenger,
        booking.passengerId,
        booking.owner,
        booking.user_id,
      ];
    
      for (const c of candidates) {
        if (!c) continue;
        if (String(c) === String(currentUserId)) return true;
        const cid = extractId(c);
        if (cid && String(cid) === String(currentUserId)) return true;
      }
    
      // Cas spécifique : raw.passenger.id
      if (booking.raw && booking.raw.passenger && booking.raw.passenger.id) {
        if (String(booking.raw.passenger.id) === String(currentUserId)) return true;
      }
    
      return false;
    }

    // Construire filteredTrajets : on parcourt d'abord les carpools et on remplace par booking user si existant
    const filteredTrajets = [];

    for (const cp of carpools) {
      const cpId = extractId(cp.serverId || cp['@id'] || cp.id || cp.server || cp.covoId);
      const related = cpId ? (bookingsByCovo.get(cpId) || []) : [];

      const userBook = related.find(b => bookingBelongsToCurrentUser(b));

      if (userBook) {
        filteredTrajets.push(Object.assign({}, userBook, { role: 'passager' }));
        continue; // ne pas ajouter le carpool correspondant
      }

      // add carpool with normalized role
      const roleStr = (cp.role || (cp.driver ? 'chauffeur' : '')).toString().toLowerCase();
      filteredTrajets.push(Object.assign({}, cp, { role: roleStr }));
    }

    // Ajouter bookings orphelines : seulement celles dont on n'a pas déjà ajouté le covo
    for (const b of bookings) {
      const covoId = extractId(b.covoId || b.covo || b.covo_id || b.server || b.serverId);
      if (covoId && filteredTrajets.some(t => extractId(t.covoId || t.serverId || t['@id'] || t.covo || t.id) === covoId)) {
        continue;
      }
      if (bookingBelongsToCurrentUser(b)) {
        filteredTrajets.push(Object.assign({}, b, { role: 'passager' }));
      }
    }

    console.debug('filteredTrajets (pre-dedupe):', filteredTrajets.map(t => ({
      covo: extractId(t.covoId || t.serverId || t['@id'] || t.covo || t.id),
      id: t.id || extractId(t.serverId),
      typeGuess: t.serverId && String(t.serverId).includes('/api/bookings') ? 'booking' : 'carpool',
      role: (t.role || '').toLowerCase(),
      status: t.status
    })));

    // Déduplication simple : garder une seule entrée par covoId, priorité à passager
    const dedupedMap = new Map();
    for (const t of filteredTrajets) {
      const key = extractId(t.covoId || t.serverId || t['@id'] || t.covo || t.id) || (`__noid_${Math.random().toString(36).slice(2)}`);
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, t);
        continue;
      }
      const existingRole = (existing.role || '').toLowerCase();
      const newRole = (t.role || '').toLowerCase();
      if (existingRole === 'passager') continue;
      if (newRole === 'passager') dedupedMap.set(key, t);
      // sinon on garde existing
    }

    const filteredUnique = Array.from(dedupedMap.values());

    console.debug('filteredUnique (post-dedupe):', filteredUnique.map(t => ({
      covo: extractId(t.covoId || t.serverId || t['@id'] || t.covo || t.id),
      role: (t.role || '').toLowerCase(),
      status: t.status,
      id: t.id || extractId(t.serverId)
    })));

    // Appliquer le filtrage final (statuts / role)
    const historique = filteredUnique.filter(t => {
      const roleNorm = String(t.role || '').toLowerCase().trim() ||
        (t.driver ? 'chauffeur' : (t.role === undefined && t.covoId ? 'passager' : 'chauffeur'));
      const statusNorm = normalizeStatus(t.status ?? t.raw?.status ?? t.raw?.statut ?? '');

      if (roleNorm === 'chauffeur') {
        if (statusNorm !== STATUS.CHAUFFEUR.COMPLETED) return false;
        return allPassengersValidated(t);
      }

      t.role = roleNorm;
      if (roleNorm === 'passager') {
        return statusNorm === STATUS.PASSAGER.VALIDATED;
      }

      return false;
    });

    // Tri par date (du plus récent au plus ancien)
    historique.sort((a, b) => {
      const da = a && a.date ? new Date(a.date) : new Date(0);
      const db = b && b.date ? new Date(b.date) : new Date(0);
      return db - da;
    });

    if (historique.length === 0) {
      container.innerHTML += `<p>Aucun trajet terminé</p>`;
      return;
    }

    historique.forEach(trajet => {
      const placesReservees = Number(trajet.placesReservees || trajet.places || 0);
      const role = (trajet.role || '').toLowerCase();

      let cardClass = 'trajet-card valide';
      if (role === 'passager') cardClass = 'trajet-card reserve';
      else if (role === 'chauffeur') cardClass = 'trajet-card chauffeur-historique';

      container.innerHTML += `
        <div class="${cardClass}">
          <div class="trajet-body">
            <div class="trajet-info">
              <strong>Covoiturage (${formatDateJJMMAAAA(trajet.date) || ""}) : <br>${trajet.depart || ''} → ${trajet.arrivee || ''}</strong>
              <span class="details">${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${placesReservees} place${placesReservees > 1 ? 's' : ''} réservée${placesReservees > 1 ? 's' : ''}</span>
            </div>
            <div class="trajet-price">${trajet.prix ?? 0} crédits</div>
          </div>
        </div>
      `;
    });

  } catch (err) {
    console.error('renderHistorique error', err);
    container.innerHTML += `<p>Erreur lors du rendu de l'historique.</p>`;
  } finally {
    delete container.dataset.rendering;
  }
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