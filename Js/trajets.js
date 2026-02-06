// trajets.js
import { apiFetch, API_BASE } from '/assets/js/api.js';
import { createCarIfNeeded, saveCarpoolApi, deleteCarpoolApi, carOwnedBy, updateBookingStatus } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey } from '/assets/js/type-utils.js';
import { addPendingReview, retryPendingReviews } from './pending-reviews.js';
import { saveReviewDoubleStorage, canCreateReview } from './reviews-mongo-api.js';

const departCandidates  = ['departureLocation', 'departure', 'depart', 'from', 'startLocation'];
const arriveeCandidates = ['arrivalLocation', 'arrival', 'arrivee', 'to', 'endLocation'];
const dateCandidates    = ['departureDate', 'date', 'jour', 'departure_at', 'departure'];

// === LocalStorage helper central pour les trajets ===
const LS_KEY = 'ecoride_trajets';
const LS_BC_CHANNEL = 'ecoride_trajets_channel';
const LS_KEY_TRAJETS = 'ecoride_trajets';
const LS_EVENT = 'ecoride:trajetsUpdated';

const LS = (function(){
  let bc = null;
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel(LS_BC_CHANNEL); } catch(e){ bc = null; }

  if (bc) {
    bc.addEventListener('message', ev => {
      try { window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated', { detail: ev.data })); } catch(e){/*ignore*/ }
    });
  } else {
    window.addEventListener('storage', (ev) => {
      if (ev.key === LS_KEY) {
        try {
          const parsed = ev.newValue ? JSON.parse(ev.newValue) : [];
          window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated', { detail: parsed }));
        } catch(e){}
      }
    });
  }

  function parseRaw(raw) {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      // si on stocke déjà un payload { metadata, items } -> retourner items
      if (v && typeof v === 'object' && Array.isArray(v.items)) return v.items;
      if (Array.isArray(v)) return v;
      return [];
    } catch (e) {
      console.warn('LS.parseRaw failed', e);
      return [];
    }
  }

  function get() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return parseRaw(raw);
    } catch (e) {
      console.warn('LS.get error', e);
      return [];
    }
  }

  function set(arr) {
    const payload = Array.isArray(arr) ? arr : [];
  
    // notify util
    function notify(savedPayload) {
      try { window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: savedPayload })); } catch(e){}
      if (bc) {
        try { bc.postMessage(savedPayload); } catch(e){}
      }
    }
  
    // 1) nettoyer d'abord
    const cleaned = cleanTrajetsForStorage(payload);
  
    // 2) sérialiser en protégeant contre structures circulaires
    let serialized;
    try {
      serialized = JSON.stringify(cleaned);
    } catch (jsonErr) {
      console.warn('LS.set: JSON.stringify failed (possibly circular). Attempting to stringify safe subset.', jsonErr);
      // fallback : essayer de stringify uniquement champs essentiels (déjà fait par clean, mais on reconfirme)
      try {
        const minimal = cleaned.map(t => ({ id: t.id, date: t.date, status: t.status }));
        serialized = JSON.stringify(minimal);
      } catch (e2) {
        console.error('LS.set: fallback stringify failed', e2);
        return null;
      }
    }
  
    // 3) log taille pour debug
    const bytes = new Blob([serialized]).size;
    console.debug(`LS.set — key=${LS_KEY} items=${cleaned.length} bytes=${bytes}`);
  
    // 4) tentative d'écriture simple
    if (trySetLocalStorage(LS_KEY, serialized)) {
      notify(cleaned);
      return cleaned;
    }
  
    // 5) purge candidates et réessai
    console.warn('LS.set error: QuotaExceeded — attempting purge of candidate keys');
    const candidatesToRemove = [
      'largeAvatarCache',
      'ecoride_trajets_backup',
      'ecoride_vehicles',
      'old_large_payload'
    ];
    candidatesToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });
  
    if (trySetLocalStorage(LS_KEY, serialized)) {
      notify(cleaned);
      console.info('LS.set: saved after removing candidate keys');
      return cleaned;
    }
  
    // 6) trim payload et réessai
    console.warn('LS.set: still failing after purge — trimming payload');
    const N = 50;
    const trimmed = Array.isArray(cleaned) ? cleaned.slice(-N) : [];
    let serializedTrimmed;
    try { serializedTrimmed = JSON.stringify(trimmed); } catch(e) { serializedTrimmed = JSON.stringify([]); }
    if (trySetLocalStorage(LS_KEY, serializedTrimmed)) {
      let trimmedParsed = trimmed;
      notify(trimmedParsed);
      console.info(`LS.set: saved trimmed payload (${trimmed.length} items)`);
      return trimmedParsed;
    }
  
    console.error('LS.set: final failure after purge and trim');
    return null;
  }

  return { get, set, bc };
})();

// place ce helper près du haut de /Js/trajets.js (avec tes autres fonctions utilitaires)
function formatApiTime(timeStr) {
  if (!timeStr) return '';
  if (typeof timeStr !== 'string') return timeStr;
  // Si c'est du format ISO 1970...
  if (timeStr.includes('T')) {
    return timeStr.split('T')[1].slice(0, 5); // Récupère "10:00"
  }
  return timeStr;
}

function markTrajetAsFinishedUI(id, serverResponse = {}, options = {}) {
  const idStr = String(id);
  const selector = `[data-carpool-id="${idStr}"], #carpool-${idStr}`;
  let cards = Array.from(document.querySelectorAll(selector));
  if (cards.length === 0) {
    // fallback : rechercher sur dataset.id / dataset.serverId
    const possible = Array.from(document.querySelectorAll('[data-server-id], [data-id], [data-covo-id]'));
    possible.forEach(el => {
      const sv = (el.dataset.serverId || el.dataset.id || el.dataset.covoId || '').toString();
      if (sv.endsWith(`/${idStr}`) || sv === idStr) cards.push(el);
    });
  }
  if (cards.length === 0) return;

  cards.forEach(card => {
    // Format times if available from serverResponse, otherwise try to format existing text if it's ISO
    const depEl = card.querySelector('.departure-time');
    const arrEl = card.querySelector('.arrival-time');
    if (serverResponse.departureTime && depEl) depEl.textContent = formatApiTime(serverResponse.departureTime);
    else if (depEl && typeof depEl.textContent === 'string' && depEl.textContent.includes('T')) depEl.textContent = formatApiTime(depEl.textContent);

    if (serverResponse.arrivalTime && arrEl) arrEl.textContent = formatApiTime(serverResponse.arrivalTime);
    else if (arrEl && typeof arrEl.textContent === 'string' && arrEl.textContent.includes('T')) arrEl.textContent = formatApiTime(arrEl.textContent);

    // Seats: only update text, don't mutate dataset (keep data model intact)
    const seatsEl = card.querySelector('.seats-info, .places-info');
    if (seatsEl && (serverResponse.nbPlacesTotal !== undefined || serverResponse.availableSeats !== undefined)) {
      const total = serverResponse.nbPlacesTotal !== undefined ? serverResponse.nbPlacesTotal : seatsEl.dataset.total || seatsEl.textContent;
      const avail = serverResponse.availableSeats !== undefined ? serverResponse.availableSeats : seatsEl.dataset.available || seatsEl.textContent;
      if (total !== undefined && avail !== undefined) seatsEl.textContent = `${avail} / ${total} place${(Number(total) > 1 ? 's' : '')}`;
    }

    // Replace the cancel/arrive button by a small validated badge (UI-only)
    const arriveBtn = card.querySelector('.trajet-validate-btn, .arrive-btn, button[data-action="arrive"]');
    if (arriveBtn) {
      // keep a visual indicator but do NOT mutate the underlying model
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'btn btn-success btn-validated';
      badge.textContent = 'Arrivée signalée';
      badge.disabled = true;
      arriveBtn.replaceWith(badge);
    } else {
      // alternatively, change the cancel button to "Validé"
      const cancelBtn = card.querySelector('.trajet-cancel-btn, .trajet-delete-btn');
      if (cancelBtn) {
        const badge2 = document.createElement('span');
        badge2.className = 'badge bg-success';
        badge2.textContent = 'Validé';
        cancelBtn.replaceWith(badge2);
      }
    }

    // Add small visual marker on card but don't change dataset/state
    card.classList.add('carpool-arrival-signaled');
  });
}

// declaration hoistée, doit être en haut pour éviter ReferenceError
async function getMe() {
  try {
    return await apiFetch('/me'); // ou '/api/me' selon ta config d'apiFetch
  } catch (err) {
    const local = localStorage.getItem('ecoride_user');
    return local ? JSON.parse(local) : null;
  }
}

// retourne l'IRI canonique '/api/carpools/123' ou la chaîne numérique '123'
function canonicalCarpoolId(v) {
  if (v == null) return '';
  const s = String(v).trim();
  // si forme IRI
  const m = s.match(/\/api\/carpools\/(\d+)$/);
  if (m) return `/api/carpools/${m[1]}`;
  const m2 = s.match(/(\d+)$/);
  if (m2) return `/api/carpools/${m2[1]}`;
  return s;
}

function getCurrentUserIdStr() {
  try {
    const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : (window.currentUser || null);
    if (!me) return null;
    const id = me.id ?? me['@id'] ?? me;
    return id ? String(id).split('/').pop() : null;
  } catch (e) { return null; }
}

// Rôle calculé en priorité : si l'utilisateur courant est présent dans bookings => "passager",
// sinon si le driver correspond à l'utilisateur courant => "chauffeur",
// sinon utiliser t.role ou detectRole fallback.
function roleForCurrentUser(t) {
  const meId = getCurrentUserIdStr();
  // check bookings
  const bookings = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
  if (meId && Array.isArray(bookings) && bookings.length) {
    for (const b of bookings) {
      const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? b.userId ?? null;
      if (!p) continue;
      const pid = (typeof p === 'object') ? (String(p.id ?? p['@id'] ?? '').split('/').pop()) : String(p).split('/').pop();
      if (pid === meId) return 'passager';
    }
  }
  // check driver
  const driver = t.driver ?? t.chauffeur ?? t.raw?.driver ?? t.raw?.chauffeur ?? t.driverIri ?? null;
  if (driver) {
    const did = (typeof driver === 'object') ? (String(driver.id ?? driver['@id'] ?? '').split('/').pop()) : String(driver).split('/').pop();
    if (did && did === meId) return 'chauffeur';
  }
  // explicit role field
  if (t.role) {
    const r = String(t.role).toLowerCase();
    if (r.includes('chauff')) return 'chauffeur';
    if (r.includes('pass')) return 'passager';
  }
  // fallback to existing detectRole if present
  if (typeof detectRole === 'function') {
    try {
      const dr = detectRole(t);
      if (dr) return String(dr).toLowerCase();
    } catch (e) { /* ignore */ }
  }
  return 'passager';
}

function pickFirst(obj, candidates = []) {
  if (!obj || !Array.isArray(candidates)) return undefined;
  for (const key of candidates) {
    // valeur directe
    const v1 = obj[key];
    if (v1 !== undefined && v1 !== null && v1 !== '') return v1;
    // champ dans raw (API hydra)
    if (obj.raw && obj.raw[key] !== undefined && obj.raw[key] !== null && obj.raw[key] !== '') return obj.raw[key];
    // champ dans bookings[0].carpool (parfois)
    if (Array.isArray(obj.bookings) && obj.bookings[0] && obj.bookings[0].carpool && obj.bookings[0].carpool[key] !== undefined && obj.bookings[0].carpool[key] !== null && obj.bookings[0].carpool[key] !== '') {
      return obj.bookings[0].carpool[key];
    }
    // champ dans nested carpool sur l'objet
    if (obj.carpool && obj.carpool[key] !== undefined && obj.carpool[key] !== null && obj.carpool[key] !== '') return obj.carpool[key];
  }
  return undefined;
}

async function fetchMissingCarpoolData(covoIdStr) {
  if (!covoIdStr) return null;

  // 1. Normalisation de l'ID (extraire le chiffre de l'IRI)
  let id = covoIdStr;
  if (typeof covoIdStr === 'string' && covoIdStr.includes('/api/')) {
    const parts = covoIdStr.split('/');
    id = parts.filter(Boolean).pop();
  }

  console.debug('fetchMissingCarpoolData via apiFetch', { id });

  try {
    // 2. Utiliser apiFetch au lieu de fetch brut
    // apiFetch ajoute automatiquement le header Authorization: Bearer ...
    const data = await apiFetch(`/carpools/${encodeURIComponent(id)}`, {
      method: 'GET'
    });

    if (data && typeof data === 'object') {
      console.debug('fetchMissingCarpoolData SUCCESS', { id });
      return data;
    }
    return null;
  } catch (err) {
    // Si apiFetch échoue (ex: 401), il jettera une erreur
    console.error('fetchMissingCarpoolData FAILED', { id, status: err.status, message: err.message });
    return null;
  }
}

// Normalise le driver pour toujours retourner un objet { id, '@id' } si possible
function normalizeDriver(driver) {
  if (!driver) return null;
  if (typeof driver === 'object') {
    const id = driver.id ?? driver.userId ?? (driver['@id'] ? String(driver['@id']).split('/').pop() : null);
    const atId = driver['@id'] ?? (id ? `/api/users/${id}` : null);
    // ensure id is string when present
    return { ...driver, id: id != null ? String(id) : undefined, ['@id']: atId };
  }
  if (typeof driver === 'string') {
    const parts = driver.split('/');
    const id = parts[parts.length - 1] || null;
    return { id: id != null ? String(id) : undefined, ['@id']: driver };
  }
  return null;
}

function extractIdFromDriver(d) {
  const norm = normalizeDriver(d);
  if (!norm) return null;
  return norm.id ?? (norm['@id'] ? String(norm['@id']).split('/').pop() : null);
}
// ---------- loadAllUserTrajets (fusion carpools créés + bookings passager) ----------
let isLoadingTrajets = false;

export async function loadAllUserTrajets() {
  if (isLoadingTrajets) return [];
  isLoadingTrajets = true;

  try {
    const user = await getMe();
    if (!user || !user.id) {
      console.log("ℹ️ [loadAllUserTrajets] Utilisateur non connecté, skip.");
      return [];
    }

    const userId = String(user.id).split('/').pop();
    console.log("🔄 [loadAllUserTrajets] Chargement pour l'utilisateur:", userId);

    // --- Tentative 1 : utiliser loadTrajetsFromApi si disponible (unifie le mapping) ---
    let combined = [];
    if (typeof loadTrajetsFromApi === 'function') {
      try {
        console.debug('[loadAllUserTrajets] using loadTrajetsFromApi()');
        combined = await loadTrajetsFromApi({ modeAll: true });
        // loadTrajetsFromApi retourne la liste combinée (chauffeur + passager)
      } catch (err) {
        console.warn('[loadAllUserTrajets] loadTrajetsFromApi failed, fallback to manual fetch:', err);
        combined = [];
      }
    }

    // --- Fallback : si loadTrajetsFromApi indisponible ou renvoie vide, faire les deux appels séparés ---
    if (!combined || combined.length === 0) {
      console.debug('[loadAllUserTrajets] fallback to manual driver/bookings fetch');

      // Charger les trajets où l'utilisateur est CHAUFFEUR
      let driverEntries = [];
      try {
        const driverCarpools = await apiFetch(`/carpools?driver=${userId}`);
        const members = driverCarpools?.['hydra:member'] || (Array.isArray(driverCarpools) ? driverCarpools : []);
        driverEntries = members.map(c => ({
          ...c,
          role: 'chauffeur',
          serverId: c['@id'],
          id: String(c.id ?? (c['@id'] ? c['@id'].split('/').pop() : genId()))
        }));
        console.debug("[loadAllUserTrajets] driverEntries:", driverEntries.length);
      } catch (err) {
        console.warn("[loadAllUserTrajets] Erreur récupération carpools (chauffeur) :", err);
        driverEntries = [];
      }

      // Charger les réservations où l'utilisateur est PASSAGER
      let passengerEntries = [];
      try {
        const passengerBookings = await apiFetch(`/bookings?passenger=${userId}`);
        const bookings = passengerBookings?.['hydra:member'] || (Array.isArray(passengerBookings) ? passengerBookings : []);
        passengerEntries = bookings.map(b => {
          const covoiture = b.carpool || b.covoiturage || null;
          const hasDetails = covoiture && typeof covoiture === 'object';
          const serverId = hasDetails ? covoiture['@id'] : (typeof covoiture === 'string' ? covoiture : (b.carpoolIri || null));
          return {
            role: 'passager',
            bookingId: String(b.id ?? (b['@id'] ? b['@id'].split('/').pop() : genId())),
            serverId,
            covoId: serverId,
            status: normalizeStatus(b.status ?? b.statut ?? 'pending'),
            depart: hasDetails ? (covoiture.departureLocation || covoiture.depart) : '',
            arrivee: hasDetails ? (covoiture.arrivalLocation || covoiture.arrivee) : '',
            date: hasDetails ? (covoiture.departureDate || covoiture.date) : (b.date || null),
            heureDepart: hasDetails ? (covoiture.departureTime || '') : '',
            prix: hasDetails ? (covoiture.price ?? covoiture.pricePerSeat ?? 0) : 0,
            bookings: hasDetails ? (covoiture.bookings ?? []) : [b],
            raw: b,
            id: String(b.id ?? genId())
          };
        });
        console.debug("[loadAllUserTrajets] passengerEntries:", passengerEntries.length);
      } catch (err) {
        console.warn("[loadAllUserTrajets] Erreur récupération bookings (passager) :", err);
        passengerEntries = [];
      }

      combined = [...driverEntries, ...passengerEntries];
    }

    // --- Injection défensive depuis localStorage pour affichage immédiat des passagers ---
    try {
      const store = LS.get(); // retourne un tableau []
      if (Array.isArray(store) && store.length) {
        const existingServerIds = new Set((combined || []).map(c => String(c.serverId || c.covoId || c.id || '')));
        for (const s of store) {
          try {
            if (s && String(s.role).toLowerCase() === 'passager') {
              const sid = String(s.serverId || s.covoId || s.id || '');
              if (sid && !existingServerIds.has(sid)) {
                // injecter une version légère pour affichage immédiat
                combined.push(Object.assign({}, s, { _injectedFromLocalStorage: true }));
                existingServerIds.add(sid);
                console.debug('[loadAllUserTrajets] injected passenger from localStorage', sid);
              }
            }
          } catch (e) { /* ignore per-item */ }
        }
      }
    } catch (e) {
      console.warn('[loadAllUserTrajets] localStorage parse failed (inject skip)', e);
    }

    console.log(`[loadAllUserTrajets] combined count = ${combined.length}`);

    // Sauvegarde (écrase seulement si on a quelque chose)
    if (Array.isArray(combined) && combined.length > 0) {
      if (Array.isArray(trajets)) {
        trajets.splice(0, trajets.length, ...combined);
      } else {
        window.trajets = combined.slice();
      }
      try { saveTrajets(); } catch (e) { console.warn('[loadAllUserTrajets] saveTrajets failed', e); }
    } else {
      console.info("[loadAllUserTrajets] combined vide → skip saveTrajets()");
    }

    // Rendu immédiat (évite l'affichage incohérent)
    try {
      if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();
    } catch (e) { console.warn('[loadAllUserTrajets] renderTrajetsInProgress failed', e); }

    // renderHistorique ne prend pas d'argument dans ta version. Il lit localStorage,
    // donc on l'appelle sans argument pour qu'il se base sur saveTrajets()
    try {
      if (typeof renderHistorique === 'function') renderHistorique();
    } catch (e) { console.warn('[loadAllUserTrajets] renderHistorique failed', e); }

    console.log(`✅ [loadAllUserTrajets] ${combined.length} trajets chargés.`);
    return combined;
  } catch (err) {
    console.error("❌ Erreur loadAllUserTrajets:", err);
    return getTrajets();
  } finally {
    isLoadingTrajets = false;
  }
}

export default loadAllUserTrajets;

function extractServerId(s) {
  if (!s) return null;
  const str = String(s).trim();
  // Cas 1: IRI complète /api/carpools/123
  const m = str.match(/\/api\/carpools\/(\d+)$/);
  if (m) return m[1];
  // Cas 2: Juste le nombre à la fin (ex: "res-123" ou "123")
  const mm = str.match(/(\d+)$/);
  return mm ? mm[1] : null; 
}

// -------------------- Config debug polling --------------------
if (typeof window !== 'undefined' && window.__TRAJETS_POLLING_DEBUG === undefined) {
  window.__TRAJETS_POLLING_DEBUG = false; // par défaut pas de spam
}

const POLL_LOG = (...args) => {
  if (typeof window !== 'undefined' && window.__TRAJETS_POLLING_DEBUG === false) return;
  console.log(...args);
};
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

// Remplace l'actuelle export function getCurrentUser() par ceci :
export function getCurrentUser() {
  try {
    // priorité localStorage
    const rawUser = localStorage.getItem('ecoride_user') || localStorage.getItem('user_data') || localStorage.getItem('ecoride_me') || localStorage.getItem('ecoride_me_local');
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed && (parsed.id || parsed['@id'])) return parsed;
        // si c'est juste une string représentant l'IRI, normaliser en objet
        if (typeof parsed === 'string' && parsed.includes('/api/users')) {
          const id = parsed.split('/').pop();
          return { id, ['@id']: parsed };
        }
        return parsed;
      } catch(e) {
        // si c'est une string simple
        const s = rawUser;
        if (s && s.includes('/api/users')) {
          const id = s.split('/').pop();
          return { id, ['@id']: s };
        }
        return null;
      }
    }

    // fallback sessionStorage (Safari privé parfois)
    const rawSess = sessionStorage.getItem('ecoride_user') || sessionStorage.getItem('user_data');
    if (rawSess) {
      try {
        const parsed = JSON.parse(rawSess);
        if (parsed && (parsed.id || parsed['@id'])) return parsed;
      } catch(e) { /* ignore */ }
    }

    // fallback window.ecoAuth.user
    if (window.ecoAuth && window.ecoAuth.user) return window.ecoAuth.user;

    return null;
  } catch (e) {
    console.error('[getCurrentUser] Erreur parsing/storage', e);
    return null;
  }
}

// Ajoute ensuite (top-level helper) cette fonction detectRole :
export function detectRole(trajet) {
  if (!trajet) return null;
  const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!me || !me.id) return null;

  // On force l'ID actuel en string propre (ex: "1")
  const myId = String(me.id).split('/').pop().trim();
  
  // On récupère l'ID du chauffeur
  const driverData = trajet.driver ?? trajet.chauffeur ?? (trajet.raw ? trajet.raw.driver : null);
  let driverId = '';
  
  if (driverData) {
      driverId = (typeof driverData === 'object') 
          ? String(driverData.id ?? driverData.userId ?? '') 
          : String(driverData).split('/').pop();
  }

  if (driverId.trim() === myId) {
      return 'chauffeur';
  }

  // Si pas chauffeur, on vérifie si on est dans les bookings
  const bookings = trajet.bookings ?? (trajet.raw ? trajet.raw.bookings : []);
  if (Array.isArray(bookings)) {
      const isPass = bookings.some(b => {
          const p = b.passenger ?? b.user;
          if (!p) return false;
          const pId = (typeof p === 'object') ? String(p.id) : String(p).split('/').pop();
          return pId.trim() === myId;
      });
      if (isPass) return 'passager';
  }

  return null;
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

// -------------------- Polling auto-ajusté --------------------
let trajetsPollingTimeout = null;
let isPollingActive = false;
let pollingInterval = 5000; // intervalle par défaut (5s)
const MIN_POLLING_INTERVAL = 3000; // minimum 3s
const MAX_POLLING_INTERVAL = 30000; // maximum 30s

/**
 * Démarre le polling auto-ajusté des trajets
 * @param {number} intervalMs - Intervalle initial en ms (défaut: 5000)
 */
function startTrajetsPolling(intervalMs = 5000) {
  if (isPollingActive) {
    POLL_LOG("ℹ️ Polling déjà actif");
    return;
  }

  pollingInterval = Math.max(MIN_POLLING_INTERVAL, Math.min(intervalMs, MAX_POLLING_INTERVAL));
  isPollingActive = true;
  POLL_LOG(`🔄 Polling trajets démarré (intervalle: ${pollingInterval}ms)`);
  
  scheduleTrajetsPolling();
}

/**
 * Planifie le prochain cycle de polling
 */
function scheduleTrajetsPolling() {
  if (!isPollingActive) return;

  trajetsPollingTimeout = setTimeout(async () => {
    await executeTrajetsPolling();
    scheduleTrajetsPolling(); 
  }, pollingInterval);
}

/**
 * Exécute un cycle de polling
 */
async function executeTrajetsPolling() {
  if (!isPollingActive) return;

  const startTime = Date.now();
  
  try {
    POLL_LOG("🔄 Polling trajets...");
    await loadTrajetsFromApi();
    
    const duration = Date.now() - startTime;
    POLL_LOG(`✅ Polling terminé en ${duration}ms`);
    
    // ✅ Ajustement dynamique (optionnel)
    // Si la requête est rapide, on peut réduire l'intervalle
    if (duration < 500 && pollingInterval > MIN_POLLING_INTERVAL) {
      pollingInterval = Math.max(MIN_POLLING_INTERVAL, pollingInterval - 1000);
      POLL_LOG(`⚡ Intervalle réduit à ${pollingInterval}ms`);
    }
    
  } catch (error) {
    console.error("❌ Erreur polling trajets:", error);
    
    // ✅ Backoff en cas d'erreur
    if (pollingInterval < MAX_POLLING_INTERVAL) {
      pollingInterval = Math.min(MAX_POLLING_INTERVAL, pollingInterval + 2000);
      POLL_LOG(`⏱️ Intervalle augmenté à ${pollingInterval}ms (erreur)`);
    }
  }
}

/**
 * Arrête le polling des trajets
 */
function stopTrajetsPolling() {
  if (!isPollingActive) {
    POLL_LOG("ℹ️ Polling déjà arrêté");
    return false;
  }

  if (trajetsPollingTimeout) {
    clearTimeout(trajetsPollingTimeout);
    trajetsPollingTimeout = null;
  }

  isPollingActive = false;
  POLL_LOG("🛑 Polling trajets stoppé");
  return true;
}

/**
 * Redémarre le polling avec un nouvel intervalle
 * @param {number} intervalMs - Nouvel intervalle en ms
 */
function restartTrajetsPolling(intervalMs = 5000) {
  stopTrajetsPolling();
  startTrajetsPolling(intervalMs);
}

// -------------------- Pause automatique (onglet inactif) --------------------
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      POLL_LOG("👁️ Onglet inactif → pause polling");
      if (isPollingActive && trajetsPollingTimeout) {
        clearTimeout(trajetsPollingTimeout);
        trajetsPollingTimeout = null;
      }
    } else {
      POLL_LOG("👁️ Onglet actif → reprise polling");
      if (isPollingActive) {
        scheduleTrajetsPolling();
      }
    }
  });
}

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

// --- Pont entre tes statuts et les classes CSS ---
const STATUS_TO_CLASS = {
  // Chauffeur
  [STATUS.CHAUFFEUR.DRAFT]: 'status-draft',
  [STATUS.CHAUFFEUR.ACTIVE]: 'status-active',
  [STATUS.CHAUFFEUR.STARTED]: 'status-started',
  [STATUS.CHAUFFEUR.COMPLETED]: 'status-completed',
  [STATUS.CHAUFFEUR.CANCELLED]: 'status-cancelled',
  
  // Passager
  [STATUS.PASSAGER.RESERVED]: 'status-reserved',
  [STATUS.PASSAGER.PENDING]: 'status-pending',
  [STATUS.PASSAGER.A_VALIDATE]: 'status-pending',
  [STATUS.PASSAGER.VALIDATED]: 'status-valid'
};

// Optionnel : si ton code cherche aussi STATUS_LABELS pour le texte
const STATUS_LABELS = {
  [STATUS.CHAUFFEUR.DRAFT]: 'Ajouté',
  [STATUS.CHAUFFEUR.ACTIVE]: 'En cours',
  [STATUS.CHAUFFEUR.STARTED]: 'Démarré',
  [STATUS.CHAUFFEUR.COMPLETED]: 'Terminé',
  [STATUS.CHAUFFEUR.CANCELLED]: 'Annulé',
  [STATUS.PASSAGER.RESERVED]: 'Réservé',
  [STATUS.PASSAGER.PENDING]: 'En attente',
  [STATUS.PASSAGER.A_VALIDATE]: 'À valider',
  [STATUS.PASSAGER.VALIDATED]: 'Confirmé'
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

/**
 * Récupère les réservations de l'utilisateur connecté (passager)
 */
async function fetchReservationsForDriver() {
  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_auth_token') || '';
  if (!token) {
    console.log('ℹ️ Pas de token → skip fetchReservationsForDriver');
    return;
  }

  try {
    // Utilisation de apiFetch qui gère l'URL complète et les headers
    const bookings = await apiFetch('/carpools/bookings/me', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('✅ Réservations serveur récupérées:', bookings);
    syncBookingsWithLocalStorage(bookings);

  } catch (err) {
    console.error('❌ Erreur fetchReservationsForDriver:', err);
  }
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

/**
 * Recharge le tableau global `trajets` depuis le localStorage
 */
function reloadTrajetsFromLocalStorage() {
  try {
    const stored = LS.get();
    if (!Array.isArray(trajets)) trajets = [];
    trajets.splice(0, trajets.length, ...stored);
    console.log('🔄 trajets rechargés depuis localStorage:', trajets.length);
  } catch (e) {
    console.warn('reloadTrajetsFromLocalStorage failed', e);
  }
}

// ========================================
// UTILITAIRES LOCALSTORAGE
// ========================================

/**
 * Nettoie les vieux trajets du localStorage
 */
function cleanupOldTrajets() {
  const localKey = 'ecoride_trajets';
  let localBookings = JSON.parse(localStorage.getItem(localKey) || '[]');
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const filtered = localBookings.filter(b => {
    const trajetDate = new Date(b.date);
    return trajetDate > thirtyDaysAgo;
  });

  if (filtered.length !== localBookings.length) {
    localStorage.setItem(localKey, JSON.stringify(filtered));
    console.log(`🧹 Nettoyage : ${localBookings.length - filtered.length} vieux trajets supprimés.`);
  }
}

/**
 * Synchronise les réservations serveur avec localStorage (Version Allégée)
 */
function syncBookingsWithLocalStorage(serverBookings) {
  const localKey = 'ecoride_trajets';
  try {
    // existing list
    const existing = LS.get();

    // transform serverBookings -> lightBookings (comme tu as déjà)
    const lightBookings = serverBookings.map(b => ({
      id: b.id ? String(b.id) : genId(),
      status: normalizeStatus(b.status ?? b.statut ?? 'reserve'),
      date: b.carpool?.departureDate || b.date,
      depart: b.carpool?.departure || '',
      arrivee: b.carpool?.arrival || '',
      prix: b.carpool?.price ?? 0,
      heureDepart: b.carpool?.departureTime ? new Date(b.carpool.departureTime).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '',
      heureArrivee: b.carpool?.arrivalTime ? new Date(b.carpool.arrivalTime).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '',
      placesReservees: Number(b.seats ?? b.reservedSeats ?? 1),
      role: 'passager',
      serverId: b['@id'] || `/api/bookings/${b.id}`,
      covoId: b.carpool?.['@id'] || b.carpool?.id,
      bookings: [b],
      raw: b
    }));

    // remove existing passenger entries that correspond to same booking/serverId
    const cleaned = existing.filter(e => !(e && e.role === 'passager' && e.serverId && lightBookings.some(lb => String(lb.serverId) === String(e.serverId))));

    // merge: carpools remain, new light bookings appended (avoid duplicates)
    const merged = cleaned.concat(lightBookings.filter(lb => !cleaned.some(c => String(c.serverId) === String(lb.serverId))));

    LS.set(merged);
    // ré-hydrater état mémoire
    reloadTrajetsFromLocalStorage();
    normalizeAndPersistRoles();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated', { detail: { source: 'syncBookingsWithLocalStorage' } }));
    console.log(`✅ Sync terminée : ${lightBookings.length} trajets synchronisés (merge).`);
  } catch (e) {
    console.warn('syncBookingsWithLocalStorage error', e);
  }
}

// -------------------- Persistance --------------------
export function getTrajets() {
  try {
    return LS.get();
  } catch (err) {
    console.error("❌ Erreur lecture trajets localStorage:", err);
    return [];
  }
}

// utilitaire pour garder uniquement les champs essentiels
function cleanTrajetsForStorage(list) {
  if (!Array.isArray(list)) return [];
  return list.map(t => ({
    id: t.id || t.Id,
    status: t.status || t.statut || 'termine',
    date: t.date,
    depart: t.depart || t.villeDepart || 'Non précisé',
    arrivee: t.arrivee || t.villeArrivee || 'Non précisé',
    heureDepart: t.heureDepart || (t.departureTime ? new Date(t.departureTime).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''),
    heureArrivee: t.heureArrivee || (t.arrivalTime ? new Date(t.arrivalTime).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''),
    prix: t.prix ?? t.price ?? t.credits ?? 0, 
    myBookingStatus: t.myBookingStatus || (t.isPassenger ? 'confirmed' : undefined),
    placesReservees: t.placesReservees ?? 0,
    availableSeats: t.availableSeats ?? 0,
    covoId: t.covoId ?? null,
    role: t.role || (t.isDriver ? 'driver' : 'passenger')
  }));
}

function trySetLocalStorage(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    return true;
  } catch (e) {
    const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (!isQuota) {
      console.error('LS: unexpected localStorage error', e);
    }
    return false;
  }
}

export function saveTrajets(list) {
  try {
    const cleaned = cleanTrajetsForStorage(list);
    const serialized = JSON.stringify(cleaned);
    console.log('saveTrajets — items:', cleaned.length, 'bytes:', new Blob([serialized]).size);

    // tentative simple
    if (trySetLocalStorage(LS_KEY_TRAJETS, serialized)) {
      window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
      console.info('💾 Trajets sauvegardés (cleaned)');
      return true;
    }

    // purge candidates puis réessai
    console.warn('LS.set error: QuotaExceededError — tentative de purge');
    ['largeAvatarCache', 'ecoride_trajets_backup', 'old_large_payload', 'ecoride.avatars'].forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });

    if (trySetLocalStorage(LS_KEY_TRAJETS, serialized)) {
      window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
      console.info('LS.set: saved after removing candidate keys');
      return true;
    }

    // trim payload (garder derniers N items)
    const N = 50;
    const trimmed = Array.isArray(cleaned) ? cleaned.slice(-N) : [];
    if (trySetLocalStorage(LS_KEY_TRAJETS, JSON.stringify(trimmed))) {
      window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
      console.info(`LS.set: saved trimmed payload (${trimmed.length} items)`);
      return true;
    }

    console.error('LS.set: échec final après toutes tentatives (QuotaExceeded)');
    return false;
  } catch (err) {
    console.error('saveTrajets unexpected error', err);
    return false;
  }
}

// -------------------- Helpers suppression locale --------------------

export function removeLocalTrajetByServerId(serverId, localId = null) {
  if (!serverId && !localId) return;
  try {
    const list = LS.get();
    const sidNorm = serverId ? (String(serverId).replace(/^\/api\/carpools\//,'').split('/').pop()) : null;
    const lidNorm = localId ? String(localId) : null;

    const filtered = list.filter(t => {
      const tServer = extractServerId(t.serverId ?? t['@id'] ?? t.carserverId ?? t.covoServerId ?? '');
      const tLocal = t._localId ?? t.id ?? t.detailId ?? t.covoId ?? null;
      if (lidNorm && tLocal && String(tLocal) === String(lidNorm)) return false;
      if (sidNorm && tServer && String(tServer) === String(sidNorm)) return false;
      return true;
    });

    LS.set(filtered);
    // notifier
    window.dispatchEvent(new CustomEvent('ecoride:trajets-synced', { detail: { serverId: sidNorm, localId: lidNorm } }));
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
  } catch (e) {
    console.warn('removeLocalTrajetByServerId failed', e);
  }
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

  // ✅ 0. NETTOYAGE AUTOMATIQUE DU LOCALSTORAGE
  cleanupOldTrajets();

  // ✅ 1. CHARGER L'UTILISATEUR COURANT (Version Sécurisée)
  const token = localStorage.getItem('api_token');
  
  if (token) {
    try {
      // On appelle TOUJOURS /api/me au démarrage pour être certain de l'identité
      // Le cache ne sert que de fallback si le serveur est injoignable
      const me = await apiFetch('/me'); 
      
      if (me && me.id) {
        const serverId = String(me.id).split('/').pop();
        localStorage.setItem('ecoride_user', JSON.stringify(me));
        localStorage.setItem('ecoride_user_ts', Date.now());
        console.log('✅ Identité confirmée par le serveur. ID:', serverId);
      }
    } catch (e) {
      console.warn('⚠ Serveur injoignable, utilisation du cache local');
    }
  } else {
    // Si pas de token, on vide TOUT le cache utilisateur pour éviter les mélanges
    localStorage.removeItem('ecoride_user');
    localStorage.removeItem('ecoride_user_ts');
    console.warn('⚠️ Aucun token : Cache utilisateur vidé.');
  }

  // ✅ 2. SYNCHRONISATION AVEC LE SERVEUR (carpools + mes réservations)
  await loadAllUserTrajets();

  // activer polling si l'utilisateur a des trajets en cours (économie de requêtes)
  try {
    const hasEnCours = trajets.some(t => {
      const s = normalizeStatus(t.status || '');
      return [STATUS.CHAUFFEUR.STARTED, STATUS.CHAUFFEUR.COMPLETED, STATUS.PASSAGER.RESERVED, STATUS.PASSAGER.A_VALIDATE, STATUS.CHAUFFEUR.DRAFT].includes(s);
    });
    if (hasEnCours && !isPollingActive) { // ← AJOUT de la condition
      startTrajetsPolling(20000);
    }
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

  // relancer les pending reviews après une connexion réussie
  window.addEventListener('ecoride:login-success', () => {
    if (typeof retryPendingReviews === 'function') {
      retryPendingReviews({ delayBetween: 500 }).catch(e => console.warn('retry on login failed', e));
    }
  });

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

  // --- relancer les pending reviews au démarrage et périodiquement ---
  if (typeof retryPendingReviews === 'function') {
    (async () => {
      try {
        await retryPendingReviews({
          delayBetween: 500,
          onSuccess: (r) => console.log('pending review sent', r),
          onFail: (r, e) => console.warn('pending send fail', r, e)
        });
      } catch (e) {
        console.warn('initRetryPendingReviews error', e);
      }

      // relance périodique toutes les 2 minutes (ajuste si nécessaire)
      // on conserve l'id pour pouvoir l'annuler si nécessaire
      try {
        window._ecoride_retryPendingIntervalId = setInterval(() => {
          retryPendingReviews({ delayBetween: 500 })
            .catch(err => console.warn('retryPendingReviews error', err));
        }, 2 * 60 * 1000);
      } catch (e) {
        console.warn('failed to start retryPendingReviews interval', e);
      }
    })();
  }
}

// ✅ Variable globale pour éviter les reloads inutiles
let lastTrajetsHash = null;

/**
 * Charge les carpools depuis l'API et les fusionne avec les données locales
 * @param {Object} options
 * @param {boolean} options.modeAll - Si false, ne charge que les carpools où l'utilisateur est chauffeur
 * @returns {Promise<Array>} Liste des trajets (chauffeur + passager)
 */
export async function loadTrajetsFromApi({ modeAll = true } = {}) {
  const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

  try {
    const raw = await apiFetch('/carpools');

    // === Guard hydra/member avant hash ===
    let membersForHash = [];
    if (Array.isArray(raw)) {
      membersForHash = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray(raw['hydra:member'])) {
      membersForHash = raw['hydra:member'];
    } else {
      membersForHash = [];
    }
    const newHash = JSON.stringify(membersForHash.map(r => r && r.id ? r.id : '').sort());

    if (newHash === lastTrajetsHash) {
      console.debug('⏭️ [loadTrajetsFromApi] skip (aucun changement détecté)');
      return getTrajets();
    }

    lastTrajetsHash = newHash;
    console.debug('🔄 [loadTrajetsFromApi] nouvelles données détectées, rechargement...');

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

    console.debug('[loadTrajetsFromApi] raw carpools count =', items.length);

    // Mapper tous (ou filtrer si nécessaire)
    let carpools = items;

    if (!modeAll) {
      if (!me || !me.id) {
        console.warn('[loadTrajetsFromApi] modeAll=false mais utilisateur non connecté, fallback local');
        return getTrajets();
      }
      carpools = items.filter(c => {
        const driver = c?.driver;
        const driverId = driver && typeof driver === 'object' ? driver.id : driver;
        return String(driverId) === String(me.id) || String(driverId) === `/api/users/${me.id}`;
      });
    }

    // Normalisation commune
    const mapped = carpools.map(c => {
      const serverId = c['@id'] ?? (c.id ? `/api/carpools/${c.id}` : null);
      const numericId = c.id ?? (serverId ? parseInt(String(serverId).split('/').pop(), 10) : null);
      const id = numericId != null && !Number.isNaN(numericId) ? String(numericId) : (serverId ?? null);

      const bookings = Array.isArray(c.bookings) ? c.bookings.map(b => ({
        id: b.id ?? null,
        '@id': b['@id'] ?? (b.id ? `/api/bookings/${b.id}` : null),
        seats: b.reservedSeats ?? b.nb_places_reservees ?? b.seats ?? 1,
        status: normalizeStatus(b.status ?? b.statut ?? null),
        passenger: b.passenger ?? b.user ?? null,
        carpoolIri: (typeof b.carpool === 'string') ? b.carpool : (b.carpool?.['@id'] ?? serverId)
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
        // normaliser driver (toujours un objet si possible)
        driver: normalizeDriver(c.driver ?? c.raw?.driver ?? null),
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

    // --- Générer des entrées "passager" à partir des bookings normalisés ---
    const passengerEntries = [];
    for (const pool of (mapped || [])) {
      for (const b of (pool.bookings || [])) {
        try {
          const pass = b.passenger ?? b.user ?? b.passengerIri ?? null;
          let isMe = false;
          if (pass && me) {
            if (typeof pass === 'object' && pass.id) isMe = String(pass.id) === String(me.id);
            else if (typeof pass === 'string') isMe = (pass === `/api/users/${me.id}`) || pass.endsWith('/' + me.id);
            else isMe = String(pass) === String(me.id);
          }
          if (!isMe) continue;

          // bookingServerId separate, serverId MUST refer to carpool IRI (pool.serverId)
          const bookingServerId = b['@id'] ?? (b.id ? `/api/bookings/${b.id}` : null);
          const resLocalId = b.id ? String(b.id) : genId();

          // éviter doublons par booking
          const bookingNorm = extractServerId(bookingServerId) || (b.id ? String(b.id) : null);
          const already = passengerEntries.some(pe => {
            const peBooking = extractServerId(pe.bookingServerId || pe.serverId || pe.id || '') || pe.id;
            return peBooking && bookingNorm && String(peBooking) === String(bookingNorm);
          });
          if (already) continue;

          passengerEntries.push({
            id: resLocalId,
            serverId: pool.serverId || pool.id || pool.covoId || null,
            covoId: pool.serverId || pool.id || pool.covoId || null,
            bookingServerId: bookingServerId,
            bookingId: b.id ?? null,
            depart: pool.depart || '',
            arrivee: pool.arrivee || pool.arrival || pool.arrivalLocation || '',
            date: pool.date || null,
            heureDepart: pool.heureDepart || pool.departureTime || '',
            heureArrivee: pool.heureArrivee || pool.arrivalTime || '',
            prix: pool.prix ?? pool.pricePerSeat ?? 0,
            placesReservees: Number(b.seats ?? b.reservedSeats ?? b.nb_places_reservees ?? 1),
            role: 'passager',
            status: normalizeStatus(b.status ?? b.statut ?? 'pending'),
            bookings: [b],
            // normaliser driver : toujours un objet { id, '@id' } si possible
            driver: normalizeDriver(pool.driver ?? pool.raw?.driver ?? null),
            raw: b
          });
        } catch (err) {
          console.warn('[loadTrajetsFromApi] skip booking build', err);
        }
      }
    }

    // Construire un Set des IDs déjà présents dans mapped
    const mappedIds = new Set((mapped || []).map(t => extractServerId(t.serverId ?? t.id ?? '')));

    // Filtrer passengerEntries pour exclure les doublons
    const filteredPassengerEntries = passengerEntries.filter(pe => {
      const peId = extractServerId(pe.serverId ?? pe.id ?? '');
      const peCovoId = extractServerId(pe.covoId ?? '');
      if (peId && mappedIds.has(peId)) return false;
      if (peCovoId && mappedIds.has(peCovoId)) return false;
      return true;
    });

    // Fusionner avec les entrées filtrées
    const combined = (mapped || []).concat(filteredPassengerEntries);

    // Mettre à jour trajets et rendre
    if (Array.isArray(trajets)) {
      trajets.splice(0, trajets.length, ...combined);
    } else {
      // créer si absent
      window.trajets = combined.slice();
    }
    saveTrajets();
    if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();

    // --- Debug / détection bookings orphelines (à exécuter AVANT le return) ---
    const allServerIds = new Set((trajets || []).map(t => String(t.serverId)));
    const orphans = [];
    (trajets || []).forEach(t => {
      (t.bookings || []).forEach(b => {
        const ref = b.carpoolIri || b.carpool || null;
        if (ref && !allServerIds.has(String(ref))) {
          orphans.push({ booking: b, parentCarpoolServerId: ref, hostTrajetId: t.id });
        }
      });
    });
    if (orphans.length > 0) {
      console.warn('[loadTrajetsFromApi] bookings référencent des carpools absents:', orphans);
    } else {
      console.debug('[loadTrajetsFromApi] aucune réservation orpheline détectée');
    }

    if (typeof normalizeAndPersistRoles === 'function') {
      normalizeAndPersistRoles();
    }

    console.debug('[loadTrajetsFromApi] combined count =', combined.length, 'drivers=', (mapped || []).length, 'passengers=', passengerEntries.length);

    return combined;
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
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.origText || 'Publier';
    }
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
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.origText || 'Publier';
      }
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
      const stored = LS.get();
      stored.push(reservationObj);
      LS.set(stored);
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
    // match last numeric segment if present, otherwise use whole string
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

  // Valider rating proprement
  const parsedRating = (rating === null || rating === undefined) ? undefined : Number(rating);
  const ratingIsValid = typeof parsedRating === 'number' && isFinite(parsedRating);

  const payload = {
    ...(ratingIsValid ? { rating: parsedRating } : {}),
    ...(comment ? { comment } : {}),
    ...(bookingIri ? { booking: bookingIri } : {}),
    ...(carpoolIri ? { carpool: carpoolIri } : {})
    // IMPORTANT: on n'ajoute PAS `target` par défaut — backend infère la cible depuis le carpool
  };

  // Debug : afficher le payload juste avant l'envoi
  console.debug('createReviewApi -> payload', payload);

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

/**
 * Active l'onglet "Mon historique"
 */
function activateHistoryTab() {
  const historyLink = document.querySelector('a.nav-link[href="#user-history-form"]');

  if (!historyLink) {
    console.warn('⚠️ Lien "Mon historique" introuvable');
    return;
  }

  // Désactive tous les onglets
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });

  // Active l'onglet historique
  historyLink.classList.add('active');

  // Déclenche la navigation SPA
  historyLink.click();

  console.log('✅ Onglet "Mon historique" activé');

  stopTrajetsPolling();
}

async function handleTrajetActions(e) {
  const target = e.target;
  if (!target) return;

  // start
  if (target.classList.contains('trajet-start-btn')) {
    const idAttr = target.dataset.id;
    const dataServerId = target.dataset.serverId || target.getAttribute('data-server-id') || null;

    // trouver le trajet local (priorité serverId puis id) - on normalise avec extractServerId
    const trajet = trajets.find(t =>
      extractServerId(t.serverId ?? t['@id'] ?? t.id) === extractServerId(dataServerId ?? idAttr)
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
        // récupérer et normaliser l'id serveur sous forme de string numérique
        const serverNumStr = extractServerId(dataServerId || trajet.serverId || trajet['@id'] || idAttr);
        const serverNum = (serverNumStr !== null && serverNumStr !== '') ? parseInt(serverNumStr, 10) : null;

        if (serverNum === null || Number.isNaN(serverNum)) {
          // pas d'ID serveur : garder l'état local et marquer non-synchronisé
          trajet.synced = false;
          trajet.syncError = 'no-server-id';
          saveTrajets();
          console.warn('trajet-start: aucun server id détecté, mise à jour locale seulement');
          return;
        }

        const payload = { status: 'demarre' };

        console.log('[trajet-start] PATCH /carpools/' + serverNum, payload);

        const resp = await apiFetch(`/carpools/${serverNum}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/merge-patch+json',
            'Accept': 'application/json'
            // Authorization: `Bearer ${token}` // si nécessaire et si apiFetch ne le gère pas
          },
          body: JSON.stringify(payload)
        });

        // gérer response non-ok
        if (!resp || (typeof resp.ok !== 'undefined' && !resp.ok)) {
          // tenter de lire un message d'erreur pour debug
          let errText = null;
          try { errText = await resp.text(); } catch (e) { /* ignore */ }

          trajet.synced = false;
          trajet.syncError = resp && resp.status ? `http:${resp.status}` : 'http:error';
          saveTrajets();
          console.warn(`[trajet-start] PATCH failed ${resp && resp.status}`, errText);
          return;
        }

        // essayer d'extraire un JSON si renvoyé
        let updatedTrajet = null;
        try {
          // certains apiFetch renvoient déjà l'objet JSON ; d'autres une Response
          if (resp && typeof resp.json === 'function') {
            updatedTrajet = await resp.json();
          } else {
            updatedTrajet = resp;
          }
        } catch (e) {
          // pas de JSON
          updatedTrajet = null;
        }

        if (updatedTrajet && typeof updatedTrajet === 'object') {
          // normaliser serverId depuis la réponse
          const serverIdFromResp = updatedTrajet['@id'] ?? (updatedTrajet.id ? `/api/carpools/${updatedTrajet.id}` : null);

          // remplacer/mettre à jour l'élément local correspondant
          const idx = trajets.findIndex(t =>
            extractServerId(t.serverId ?? t['@id'] ?? t.id) === extractServerId(serverIdFromResp ?? trajet.serverId ?? trajet.id)
          );

          if (idx !== -1) {
            const kept = { ...trajets[idx] };
            trajets[idx] = Object.assign(kept, updatedTrajet);
            // garantir champs essentiels
            trajets[idx].synced = true;
            delete trajets[idx].syncError;
          } else {
            // pas trouvé -> insérer en tête
            const itemToInsert = Object.assign({}, updatedTrajet, { synced: true });
            trajets.unshift(itemToInsert);
          }

          saveTrajets();
          // optional: recharger depuis l'API pour bookings si nécessaire
          try { await loadTrajetsFromApi(); } catch (e) { /* non critique */ }
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
          return;
        }

        // cas 204 / pas de JSON retourné : forcer un reload depuis l'API (approche conservative)
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
        if (trajet) {
          trajet.synced = false;
          trajet.syncError = err && err.message ? err.message : String(err);
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

        const backendStatus = 'a_valider';
        const payload = JSON.stringify({ status: backendStatus });

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
    trajets.find(x => extractServerId(x.serverId) === extractServerId(rawId)) ||
    trajets.find(x => extractServerId(x.id) === extractServerId(rawId));

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
      extractServerId(t.id) === extractServerId(id) ||
      extractServerId(t.serverId) === extractServerId(id)
    );

    if (index === -1) {
      console.warn('[delete] trajet non trouvé pour id:', id);
      return;
    }

    const removed = trajets[index];
    const serverId = removed?.serverId || removed?.['@id'] || null;
    const deleteKey = extractServerId(serverId) || extractServerId(id) || String(id);

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

      // Remplace la logique de recherche/retour après suppression serveur
      if (res && (res.status === 204 || res.status === 200 || res.status === 404)) {
        try {
          // fonction utilitaire pour supprimer côté local (à ajuster selon ton implémentation)
          removeLocalTrajetByServerId(serverId, id);
        } catch (e) {
          console.warn('removeLocalTrajetByServerId failed', e);
        }

        // Retirer du tableau en mémoire (rechercher par id local ou serverId)
        const idx = trajets.findIndex(t =>
          String(t.id) === String(id) ||
          String(t.serverId) === String(serverId) ||
          // helper d'extraction si tu stockes "@id" ou "serverId" différemment
          (typeof extractServerId === 'function' && extractServerId(t.serverId || t['@id'] || t.id) === extractServerId(serverId))
        );
        if (idx !== -1) {
          trajets.splice(idx, 1);
          LS.set(trajets);              // sauvegarde harmonisée
          renderTrajetsInProgress();    // re-render
          renderHistorique();
        }

        window.dispatchEvent(new CustomEvent('ecoride:carpool-deleted', { detail: { serverId, localId: id } }));
        console.log('Suppression appliquée localement et serveur OK', serverId);
      } else {
        // rollback / message d'erreur éventuel
        console.warn('Suppression serveur échouée', res);
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
    LS.set(trajets);
  } catch (err) {
    console.warn('updatePlacesReservees error', err);
  }
}

console.log('Trajets après réservation:', trajets);

async function ensureCarpoolIriFromBooking(t) {
  if (!t) return null;

  // 1) Si l'objet contient déjà le carpool (sous plusieurs formes possibles)
  const maybeCp = t.carpool || t.raw?.carpool || t.covoiturage || t.raw?.covoiturage;
  if (maybeCp) {
    if (typeof maybeCp === 'string') return maybeCp;
    if (maybeCp['@id']) return maybeCp['@id'];
    if (maybeCp.id) return `/api/carpools/${maybeCp.id}`;
    // sinon on continue (improbable)
  }

  // 2) Construire une IRI/chemin pour la réservation (booking)
  const bookingIriCandidates = [
    t.bookingServerId,
    t.bookingIri,
    t.booking,
    t.serverId,
    t['@id'],
    t.id ? `/api/bookings/${t.id}` : null,
    t.bookingId ? `/api/bookings/${t.bookingId}` : null
  ].filter(Boolean);

  if (bookingIriCandidates.length === 0) return null;

  // On prend la première candidate valide
  let bookingIriRaw = String(bookingIriCandidates[0]);

  // Normaliser : enlever le host si présent, retirer /api prefix pour passer à apiFetch
  bookingIriRaw = bookingIriRaw.replace(/^https?:\/\/[^/]+\/api/, '');
  bookingIriRaw = bookingIriRaw.replace(/^\/api/, '');
  if (!bookingIriRaw.startsWith('/')) bookingIriRaw = '/' + bookingIriRaw;

  // bookingKey unique (id numérique ou path)
  const bookingId = String(t.bookingId || t.id || bookingIriRaw).split('/').pop();
  const bookingKey = `booking:${bookingId}`;

  // 3) cache des promesses en vol pour éviter les fetchs concurrents
  window._bookingFetchPromises = window._bookingFetchPromises || new Map();
  if (window._bookingFetchPromises.has(bookingKey)) {
    return window._bookingFetchPromises.get(bookingKey);
  }

  const promise = (async () => {
    try {
      // On délègue les headers/token à apiFetch (ton apiFetch injecte getToken())
      // On demande JSON-LD si tu veux les relations complètes
      const headers = { Accept: 'application/ld+json' };

      // Appel : apiFetch attend un path sans host ni /api prefix (ton apiFetch normalise)
      // bookingIriRaw ici commence par '/bookings/22' -> ok
      const fullBooking = await apiFetch(bookingIriRaw, { headers, method: 'GET' });

      // Chercher la relation carpool dans plusieurs clés possibles
      const bcp = fullBooking?.carpool || fullBooking?.covoiturage || fullBooking?.carPool || fullBooking?.ride || null;
      if (!bcp) {
        console.debug('ensureCarpoolIriFromBooking: booking chargé mais carpool absent', bookingIriRaw);
        return null;
      }

      if (typeof bcp === 'string') return bcp;
      if (bcp['@id']) return bcp['@id'];
      if (bcp.id) return `/api/carpools/${bcp.id}`;

      return null;
    } catch (err) {
      console.warn('ensureCarpoolIriFromBooking: erreur fetch', bookingIriRaw, err);
      return null;
    } finally {
      window._bookingFetchPromises.delete(bookingKey);
    }
  })();

  window._bookingFetchPromises.set(bookingKey, promise);
  return promise;
}

// Ajoute un flag global pour éviter les appels concurrents
window._renderTrajetsInProgressRunning = false;


function isTrajetHistorique(t) {
  const status = (t.status || t.statut || "").toLowerCase();
  const me = (typeof getCurrentUser === 'function' ? getCurrentUser() : window.currentUser) || null;
  const meId = me ? String(me.id ?? me['@id'] ?? me).split('/').pop() : null;

  // 1. Si le trajet global est marqué comme fini
  const isGlobalFinished = ['completed', 'validated', 'termine', 'valide'].includes(status);
  
  // 2. Si c'est un passager et qu'IL a validé sa réservation
  const bookings = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
  const myBooking = bookings.find(b => {
    const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? null;
    const pid = (typeof p === 'object') ? String(p.id ?? p['@id'] ?? '').split('/').pop() : String(p).split('/').pop();
    return pid === meId;
  });
  const myBookingValidated = myBooking && ['validated', 'valide', 'confirmed'].includes(normalizeStatus(myBooking.status || ''));

  // 3. Si la date est passée
  const datePassee = new Date(t.date_depart || t.dateDepart || t.date || t.raw?.date) < new Date();

  return isGlobalFinished || myBookingValidated || datePassee;
}

export function renderTrajetsInProgress() {
  const inProgress = trajets.filter(t => !isTrajetHistorique(t));
  if ((!Array.isArray(trajets) || trajets.length === 0) && typeof loadTrajetsFromApi === 'function') {
    try {
      if (!window._loadingTrajets) {
        loadTrajetsFromApi().catch(e => { console.warn('loadTrajetsFromApi prefetch failed', e); });
      }
    } catch (e) {
      console.warn('Erreur préfetch', e);
    }
    return;
  }

  if (typeof window !== 'undefined') {
    window.loadTrajetsFromApi = loadTrajetsFromApi;
    window.renderTrajetsInProgress = renderTrajetsInProgress;
  }

  const container = document.querySelector('#trajets-en-cours .trajets-list');
  if (!container) return;

  if (window._renderTrajetsInProgressRunning) {
    window._renderTrajetsInProgressCallQueued = true;
    return;
  }
  window._renderTrajetsInProgressRunning = true;

  const allActive = Array.isArray(trajets) ? trajets : [];

  // ----------------------
  // Helpers: ID canonical, user id, role resolution
  // ----------------------

  function canonicalCarpoolNum(v) {
    const iri = canonicalCarpoolId(v);
    const m = String(iri).match(/(\d+)$/);
    return m ? m[1] : String(iri);
  }
  function getCurrentUserIdStr() {
    try {
      const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : (window.currentUser || null);
      if (!me) return null;
      const id = me.id ?? me['@id'] ?? me;
      return id ? String(id).split('/').pop() : null;
    } catch (e) { return null; }
  }

  function roleForCurrentUser(t) {
    const meId = getCurrentUserIdStr();
    const bookings = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
    if (meId && Array.isArray(bookings) && bookings.length) {
      for (const b of bookings) {
        const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? b.userId ?? null;
        if (!p) continue;
        const pid = (typeof p === 'object') ? (String(p.id ?? p['@id'] ?? '').split('/').pop()) : String(p).split('/').pop();
        if (pid === meId) return 'passager';
      }
    }
    const driver = t.driver ?? t.chauffeur ?? t.raw?.driver ?? t.raw?.chauffeur ?? t.driverIri ?? null;
    if (driver) {
      const did = (typeof driver === 'object') ? (String(driver.id ?? driver['@id'] ?? '').split('/').pop()) : String(driver).split('/').pop();
      if (did && did === meId) return 'chauffeur';
    }
    if (t.role) {
      const r = String(t.role).toLowerCase();
      if (r.includes('chauff')) return 'chauffeur';
      if (r.includes('pass')) return 'passager';
    }
    if (typeof detectRole === 'function') {
      try {
        const dr = detectRole(t);
        if (dr) return String(dr).toLowerCase();
      } catch (e) { /* ignore */ }
    }
    return 'passager';
  }

  const extractId = (val) => {
    if (val == null) return '';
    const s = String(val);
    const m = s.match(/(\d+)$/);
    return m ? m[1] : s;
  };
  const extractServerId = (val) => extractId(val);

  // ----------------------
  // Dé-duplication
  // ----------------------
  const dedupMap = new Map();
  const meId = getCurrentUserIdStr();

  for (const t of allActive) {
    const keyNum = canonicalCarpoolNum(t.serverId ?? t['@id'] ?? t.covoId ?? t.id ?? t.covoId);
    const key = keyNum || (typeof genId === 'function' ? genId() : JSON.stringify(t));
    const existing = dedupMap.get(key);
    const roleThis = roleForCurrentUser(t);

    if (!existing) {
      dedupMap.set(key, Object.assign({}, t, { _resolvedRole: roleThis }));
      continue;
    }

    const roleExisting = existing._resolvedRole || roleForCurrentUser(existing);
    const existingHasBookings = Array.isArray(existing.bookings) && existing.bookings.length > 0;
    const newHasBookings = Array.isArray(t.bookings) && t.bookings.length > 0;
    if (newHasBookings && !existingHasBookings) {
      dedupMap.set(key, Object.assign({}, t, { _resolvedRole: roleThis }));
      continue;
    }
    if (existingHasBookings && !newHasBookings) {
      continue;
    }

    if (roleThis === 'passager' && roleExisting !== 'passager') {
      dedupMap.set(key, Object.assign({}, t, { _resolvedRole: roleThis }));
      continue;
    }
    if (roleExisting === 'passager' && roleThis !== 'passager') {
      continue;
    }

    if (roleThis === 'chauffeur' && roleExisting !== 'chauffeur') {
      dedupMap.set(key, Object.assign({}, t, { _resolvedRole: roleThis }));
      continue;
    }
    if (roleExisting === 'chauffeur' && roleThis !== 'chauffeur') {
      continue;
    }

    dedupMap.set(key, Object.assign({}, t, { _resolvedRole: roleThis }));
  }

  const deDupedList = Array.from(dedupMap.values());

  // quick: si le trajet n'a pas de bookings mais l'ancien localStore a une réservation correspondante, 
  // fusionne-la pour affichage immédiat
  try {
    const store = LS.get(); // retourne un tableau []
    if (Array.isArray(store) && store.length) {
      for (const s of store) {
        // si s.role === 'passager' et covoId présent et pas déjà dans trajets
        const sid = extractServerId(s.serverId || s.covoId || s.id);
        if (!sid) continue;
        if (!deDupedList.some(d => extractServerId(d.serverId || d.id) === sid)) {
          // push une version light pour affichage rapide
          deDupedList.push(Object.assign({}, s, { _resolvedRole: 'passager', _enriched: true }));
        }
      }
    }
  } catch (e) { /* ignore */ }

  // ----------------------
  // Filtrage : on retire seulement les réservations déjà validées (passager)
  // ----------------------
  const enCours = deDupedList.filter(t => {
    const s = normalizeStatus(t.status ?? t.raw?.status ?? '');
    // on garde les trajets 'finished' pour permettre au passager de valider
    if (s === (STATUS?.PASSAGER?.VALIDATED ?? 'validated')) return false;
    return true;
  });

  if (typeof updatePlacesReservees === 'function') updatePlacesReservees();

  // ----------------------
  // Recherche maître
  // ----------------------
  const findMasterTrajetByCovoId = (covoIdStr) => {
    if (!covoIdStr) return null;
    const target = extractServerId(covoIdStr);

    const matchFn = (tr) => {
      const sid = extractServerId(tr.serverId) || extractServerId(tr.id) || '';
      return sid === target;
    };

    let found = deDupedList.find(tr => matchFn(tr) && Array.isArray(tr.bookings) && tr.bookings.length > 0);
    if (found) return found;
    found = deDupedList.find(tr => matchFn(tr));
    if (found) return found;

    if (Array.isArray(trajets) && trajets.length > 0) {
      found = trajets.find(tr => matchFn(tr) && Array.isArray(tr.bookings) && tr.bookings.length > 0);
      if (found) return found;
      found = trajets.find(tr => matchFn(tr));
      if (found) return found;
    }

    try {
      const store = LS.get(); // retourne un tableau []
      if (Array.isArray(store) && store.length) {
        found = store.find(tr => {
          const sid = extractServerId(tr.serverId) || extractServerId(tr.id) || '';
          return sid === target;
        });
        if (found) return found;
      }
    } catch (e) {
      // ignore parse errors
    }

    return null;
  };

  // ----------------------
  // computePlacesReservees (inchangé)
  // ----------------------
  function computePlacesReservees(t, trajetRef, currentUser) {
    const me = currentUser ?? ((typeof getCurrentUser === 'function') ? getCurrentUser() : null);
    const myIdStr = me && me.id ? String(me.id).split('/').pop().trim() : null;

    const seatsFromBooking = (b) => {
      if (!b) return 0;
      const candidates = [
        b.seats,
        b.reservedSeats,
        b.nb_places_reservees,
        b.quantity,
        b.count,
        b.nbPlaces,
        b.nb_places
      ];
      for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') {
          const n = Number(c);
          if (!isNaN(n)) return n;
        }
      }
      return 0;
    };

    const src = trajetRef || t || {};
    const bookings = Array.isArray(src.bookings) ? src.bookings : (Array.isArray(src.raw?.bookings) ? src.raw.bookings : []);

    if (Array.isArray(bookings) && bookings.length > 0) {
      const total = bookings.reduce((sum, b) => sum + seatsFromBooking(b), 0);
      return Number(total) || 0;
    }

    const tryFindMyBooking = () => {
      const searchLists = [];
      if (Array.isArray(trajetRef?.bookings)) searchLists.push(trajetRef.bookings);
      if (Array.isArray(t?.bookings)) searchLists.push(t.bookings);
      if (Array.isArray(t?.raw?.bookings)) searchLists.push(t.raw.bookings);

      for (const list of searchLists) {
        const found = list.find(b => {
          const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? null;
          if (!p) return false;
          if (typeof p === 'object' && (p.id || p['@id'])) {
            const pid = String(p.id ?? p['@id']).split('/').pop();
            return myIdStr ? pid === myIdStr : false;
          }
          const pidStr = String(p).split('/').pop();
          return myIdStr ? pidStr === myIdStr : false;
        });
        if (found) return seatsFromBooking(found);
      }
      return null;
    };

    const myBookingSeats = tryFindMyBooking();
    if (myBookingSeats !== null) {
      return myBookingSeats;
    }

    const explicitCandidates = [
      t?.placesReservees,
      t?.reservedSeats,
      t?.nb_places_reservees,
      t?.places_reserved,
      t?.reserved_count
    ];
    for (const val of explicitCandidates) {
      if (val !== undefined && val !== null && val !== '') {
        const n = Number(val);
        if (!isNaN(n)) {
          return n;
        }
      }
    }

    return 0;
  }

  // ----------------------
  // Filtrage final selon rôle et status (utilise roleForCurrentUser)
  // NOTE: on n'exclut plus les 'finished' pour le passager — il les verra et pourra valider
  // ----------------------
  const filteredEnCours = enCours.filter(t => {
    const roleNorm = roleForCurrentUser(t);
    const statusNorm = normalizeStatus(t.status ?? (t.raw ? t.raw.status : ''));
    const meId = getCurrentUserIdStr();

    if (['archive', 'annule', 'archived', 'cancelled'].includes(statusNorm)) return false;

    // --- LOGIQUE CHAUFFEUR ---
    if (roleNorm === 'chauffeur') {
      if (['finished', 'termine', 'completed', 'done'].includes(statusNorm)) {
        // On ne le garde que si des passagers doivent encore valider
        if (typeof allPassengersValidated === 'function') {
          return !allPassengersValidated(t); 
        }
        return true; 
      }
      return true; // actif / demarre
    }

    // --- LOGIQUE PASSAGER ---
    if (roleNorm === 'passager') {
      const bookings = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
    
      const myBooking = bookings.find(b => {
        const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? null;
        if (!p) return false;
        const pid = (typeof p === 'object') ? (String(p.id ?? p['@id'] ?? '').split('/').pop()) : String(p).split('/').pop();
        return pid === meId;
      });

      if (!myBooking) return false;

      const myBookingId = extractId(myBooking.id || myBooking['@id']);
      t._myBookingId = myBookingId;


      const bStatus = normalizeStatus(myBooking.status || '');
      const tStatus = normalizeStatus(t.status || '');

      // On cache la carte si :
      // 1. La réservation est validée (validated ou valide)
      // 2. OU si le trajet global est terminé (termine ou completed)
      const isFinished = [
        'validated', 'valide', 'confirmed', 
        'termine', 'completed', 'finished'
      ].includes(bStatus) || [
        'termine', 'completed', 'finished'
      ].includes(tStatus);

      if (isFinished) return false; 
      // ----------------------

      return true;
    }

    return false;
  });

  container.innerHTML = '';

  window._fetchingCarpools = window._fetchingCarpools || new Set();
  const enrichPromises = [];

  function safeAssign(target, source, allowedKeys = []) {
    allowedKeys.forEach(k => {
      if (source && source[k] !== undefined) target[k] = source[k];
    });
  }

  let html = '';

  function mapStatusToCssClass(role, normalizedStatus) {
    if (role === 'chauffeur') {
      if ([
        STATUS.CHAUFFEUR.DRAFT,
        'active', 'actif', 'published', 'open', 'created', 'enabled', 'available', 'ajoute'
      ].includes(normalizedStatus)) {
        return 'actif';
      }
      if ([
        STATUS.CHAUFFEUR.STARTED,
        'started', 'in_progress', 'demarre', 'active_drive', 'ongoing', 'running'
      ].includes(normalizedStatus)) {
        return 'demarre';
      }
      if ([
        STATUS.CHAUFFEUR.COMPLETED,
        'finished', 'completed', 'termine', 'done',
        STATUS.PASSAGER.A_VALIDATE,
        STATUS.PASSAGER.PENDING
      ].includes(normalizedStatus)) {
        return 'attente';
      }
      return 'attente';
    }

    return 'reserve';
  }

  // helper pour formater les heures ISO en HH:MM
  function formatApiTime(timeStr) {
    if (!timeStr) return '';
    if (typeof timeStr !== 'string') return timeStr;
    if (timeStr.includes('T')) {
      return timeStr.split('T')[1].slice(0,5);
    }
    // si déjà "HH:MM:ss" ou autre
    return String(timeStr).substring(0,5);
  }

  filteredEnCours.forEach((t, i) => {
    try {
      if (!t) return;

      const role = roleForCurrentUser(t);

      const covoData = t.raw?.carpool || t.carpool || null;
      let source = (role === 'passager' && covoData) ? covoData : t;

      const covoIdStr = extractServerId(t.covoId || t.serverId);
      if (covoIdStr) {
        const found = findMasterTrajetByCovoId(covoIdStr);
        if (found) source = found;
      }

      window._alreadyEnriched = window._alreadyEnriched || new Set();

      const needsEnrich = (Number(t.nbPlacesTotal) === 0 || !Array.isArray(t.bookings) || (Array.isArray(t.bookings) && t.bookings.length === 0));
      const alreadyDone = window._alreadyEnriched.has(covoIdStr);

      if (covoIdStr && !alreadyDone && needsEnrich) {
        window._alreadyEnriched.add(covoIdStr);

        window._fetchingCarpools = window._fetchingCarpools || new Set();
        const fetchKey = `cp:${covoIdStr}`;

        if (!window._fetchingCarpools.has(fetchKey)) {
          window._fetchingCarpools.add(fetchKey);

          const p = (async () => {
            try {
              const full = await fetchMissingCarpoolData(covoIdStr);
              if (full) {
                const target = (source && source !== t) ? source : t;

                const derivedNbPlaces = Number(full.nbPlacesTotal ?? full.car?.nbPlaces ?? 0);

                safeAssign(target, {
                  nbPlacesTotal: derivedNbPlaces,
                  bookings: full.bookings ?? [],
                  driver: full.driver ?? target.driver,
                  car: full.car ?? target.car
                }, ['nbPlacesTotal', 'bookings', 'driver', 'car']);

                const globalMatch = trajets.find(x => extractServerId(x.id || x.serverId) === covoIdStr);
                if (globalMatch) {
                  globalMatch.nbPlacesTotal = derivedNbPlaces;
                  globalMatch.bookings = full.bookings ?? [];
                  globalMatch._enriched = true;
                }

                if (!window._renderTimeout) {
                  window._renderTimeout = setTimeout(() => {
                    window._renderTimeout = null;
                    renderTrajetsInProgress();
                  }, 200);
                }
              }
            } catch (e) {
              console.warn('Enrich failed', e);
            } finally {
              window._fetchingCarpools.delete(fetchKey);
            }
          })();
          enrichPromises.push(p);
        }
      }

      // --- extraction pour affichage ---
      const depart = t.depart || source.departureLocation || source.depart || '—';
      const arrivee = t.arrivee || source.arrivalLocation || source.arrivee || '—';
      const prix = (t.prix ?? source.price ?? source.prix ?? 0);
      const rawDate = source.departureDate || source.date || t.date;
      const dateText = safeFormatDate(rawDate) || '';

      // formatage des heures via helper (évite ISO brut)
      const hD = formatApiTime(source.departureTime || source.heureDepart || '');
      const hA = formatApiTime(source.arrivalTime || source.heureArrivee || '');
      const horaireText = (hD && hA) ? `${hD} → ${hA}` : (hD || hA || '');

      const placesOccupees = t.placesReservees ?? computePlacesReservees(t, source) ?? 0;
      const placesTotales = Number(
        t.places ?? 
        t.totalSeats ?? 
        t.nbPlacesTotal ?? 
        source.places ?? 
        source.totalSeats ?? 
        source.vehicle?.seats ?? 
        0
      );

      const passengerReserved = Number(computePlacesReservees(t, source, (typeof getCurrentUser === 'function' ? getCurrentUser() : null)) || 0);

      const placesLabelText = (role === 'chauffeur')
        ? `${placesOccupees} / ${placesTotales}`
        : String(passengerReserved);

      const placesWord = (role === 'chauffeur')
        ? (placesOccupees <= 1 ? 'place réservée' : 'places réservées')
        : (passengerReserved <= 1 ? 'place réservée' : 'places réservées');

      const rawStatusSource = role === 'passager' ? (t.status ?? t.raw?.status ?? t.raw?.statut) : (source.status ?? source.raw?.status ?? t.status);
      const status = normalizeStatus(rawStatusSource ?? 'ajoute');
      const mappedCssClass = mapStatusToCssClass(role, status);
      const bgClass = `trajet-card ${mappedCssClass}`;

      const stableId = extractId(t.serverId ?? t.id ?? '') || '';

      if (window.__TRAJETS_POLLING_DEBUG) {
        console.debug('renderTrajetsInProgress trace', {
          index: i,
          id: stableId,
          role,
          rawStatus: rawStatusSource,
          normalizedStatus: status,
          mappedCssClass,
          bookings: (Array.isArray(source?.bookings) ? source.bookings : (Array.isArray(t.bookings) ? t.bookings : [])).map(b => ({
            id: b?.id ?? b?.['@id'],
            raw: b?.status ?? b?.statut,
            normalized: normalizeStatus(b?.status ?? b?.statut ?? '')
          }))
        });
      }

      let buttonsHtml = '';

      if (role === 'chauffeur') {
        if (mappedCssClass === 'demarre') {
          buttonsHtml = `<button class="btn-trajet trajet-validate-btn" data-id="${stableId}">Arrivée à destination</button>`;
        } else if (mappedCssClass === 'attente') {
          buttonsHtml = `<span class="trajet-status">En attente de validation passager</span>`;
        } else if (mappedCssClass === 'actif') {
          buttonsHtml = `
            <button class="btn-trajet trajet-edit-btn" data-id="${stableId}">Modifier</button>
            <button class="btn-trajet trajet-delete-btn" data-id="${stableId}">Supprimer</button>
            <button class="btn-trajet trajet-start-btn" data-id="${stableId}">Démarrer</button>
          `;
        } else if (mappedCssClass === 'termine') {
          buttonsHtml = `<span class="trajet-status">Terminé</span>`;
        }
      } else {
        const refId = t.covoId || (t.raw?.carpool?.['@id']) || '';
        const isParentFinished = (
          status === STATUS.CHAUFFEUR.COMPLETED ||
          status === STATUS.PASSAGER.A_VALIDATE ||
          status === STATUS.PASSAGER.PENDING 
        );

        if (isParentFinished) {
          buttonsHtml = `
            <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
            <button class="btn-trajet trajet-validate-passager-btn" data-id="${t._myBookingId}">Valider</button>
            <button class="btn-trajet trajet-signaler-btn" data-id="${t._myBookingId}">⚠ Signaler</button>
          `;
        } else {
          buttonsHtml = `
            <button class="btn-trajet trajet-detail-btn" data-covo-id="${refId}">Détail</button>
            <button class="btn-trajet trajet-cancel-btn" data-id="${stableId}">Annuler</button>
            <button class="btn-trajet trajet-signaler-btn" data-id="${stableId}">⚠ Signaler</button>
          `;
        }
      }

      html += `
        <div class="${bgClass.trim()}" data-id="${stableId}" data-role="${role}">
          <div class="trajet-body">
            <div class="trajet-info">
              <strong>Covoiturage ${dateText ? `(${dateText})` : ''} : <br>${escapeHtml(depart)} → ${escapeHtml(arrivee)}</strong>
              <span class="details">${escapeHtml(horaireText)}${horaireText ? ' • ' : ''}${placesLabelText} ${placesWord}</span>
            </div>
            <div class="trajet-price">${Number(prix || 0).toLocaleString('fr-FR')} crédits</div>
            ${buttonsHtml}
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Erreur rendu trajet:', err);
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
  }

  container.innerHTML = html;

  if (enrichPromises.length > 0) {
    Promise.all(enrichPromises.map(p => p.catch(() => null))).then(() => {
      try { renderTrajetsInProgress(); } catch (e) { console.warn('Rerender after enrich failed', e); }
    }).catch(() => {
      try { renderTrajetsInProgress(); } catch (e) { console.warn('Rerender after enrich failed', e); }
    });
  }

  if (!container.dataset.boundTrajets) {
    container.dataset.boundTrajets = "1";
    container.addEventListener('click', async (e) => {
      // Trouver l'élément actionnable le plus proche (bouton, lien ou élément marqué data-action)
      const target = e.target.closest('button, a, [data-action]');
      if (!target || !container.contains(target)) return;
  
      // --- UTILS ---
      const getId = (el) => {
        if (!el) return null;
        return el.dataset?.id ?? el.getAttribute('data-id') ?? null;
      };
  
      // 1) GESTION DU BOUTON VALIDER (PASSAGER) -> ouvre la modal d'avis
      if (target.classList.contains('trajet-validate-passager-btn')) {
        e.preventDefault();
        e.stopPropagation();
  
        const reservationId = getId(target);
        if (!reservationId) {
          console.warn('No reservationId on validate button', target);
          return;
        }
        console.log('👉 Clic Valider Passager pour la réservation:', reservationId);
  
        openRatingModal({
          reservationId,
          onSubmit: async ({ rating, review, flagged }) => {
            try {
              // 1) Update status de la RÉSERVATION côté serveur
              await updateBookingStatus(reservationId, 'confirmed');

              // 2) Mise à jour locale de la réservation
              let reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
              const idx = reservations.findIndex(r => String(r.id) === String(reservationId));
              
              let currentTrajet = (idx !== -1 ? reservations[idx] : { id: reservationId });

              if (idx !== -1) {
                reservations[idx].status = 'valide';
                reservations[idx].rating = rating;
                reservations[idx].review = review;
                reservations[idx].validatedAt = new Date().toISOString();
                localStorage.setItem('ecoride_trajets', JSON.stringify(reservations));
              }

              // --- RÉCUPÉRATION ROBUSTE DES IRIs ---
              const extractIdNumber = (v) => {
                if (v == null) return null;
                const s = String(v);
                const m = s.match(/(\d+)$/);
                return m ? m[1] : s;
              };

              // On définit carpoolIri ici pour corriger la ReferenceError
              let carpoolIri = currentTrajet?.carpoolIri ?? currentTrajet?.covoId ?? currentTrajet?.serverId ?? null;
              if (carpoolIri && !String(carpoolIri).startsWith('/api/')) {
                carpoolIri = `/api/carpools/${extractIdNumber(carpoolIri)}`;
              }

              // 3) CLÔTURE DU TRAJET CHAUFFEUR (Si c'est le passager qui valide)
              if (carpoolIri) {
                const carpoolId = extractIdNumber(carpoolIri);
                console.log("🏁 Tentative de clôture du carpool:", carpoolId);
                
                // On utilise apiFetch pour être sûr d'avoir le token
                apiFetch(`/carpools/${carpoolId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/merge-patch+json' },
                    body: JSON.stringify({ status: 'termine' }) // On force le passage en historique
                }).then(() => console.log("✅ Carpool marqué comme termine"))
                  .catch(e => console.warn("Échec clôture carpool", e));
              }
      
              // 4) Sauvegarde de l'avis (Review)
              try {
                const me = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser || null;
                const userId = extractIdNumber(me?.id ?? me?.['@id'] ?? null);
                let bookingIri = currentTrajet?.serverId ?? currentTrajet?.['@id'] ?? `/api/bookings/${reservationId}`;

                await saveReviewDoubleStorage({
                  rating: Number(rating) || 0,
                  comment: review || '',
                  bookingIri,
                  carpoolIri,
                  userId,
                  reservationId,
                  reservationObj: currentTrajet
                });
              } catch (err) {
                console.warn('Erreur saveReviewDoubleStorage', err);
              }
      
              // 5) Rafraîchir l'UI et changer d'onglet
              alert('Validation enregistrée. Merci !');
              
              if (typeof loadTrajetsFromApi === 'function') {
                await loadTrajetsFromApi();
              }
              
              renderTrajetsInProgress();
              renderHistorique();
              
              if (typeof activateHistoryTab === 'function') {
                activateHistoryTab();
              }

            } catch (err) {
              console.error('Erreur validation via modal:', err);
              alert('Erreur lors de l\'enregistrement.');
            }
          }
        });
  
        return;
      }
  
      // 2) GESTION DU BOUTON ARRIVÉE (CHAUFFEUR)
      if (target.classList.contains('trajet-validate-btn')) {
        e.preventDefault();
        e.stopPropagation();

        const stableId = getId(target);
        if (!stableId) return;

        if (!confirm('Confirmez-vous l\'arrivée à destination ?')) return;

        try {
          console.log('🏁 Déclenchement arrivée pour le covoiturage:', stableId);

          // envoi d'un statut intermédiaire : le covoiturage est terminé côté chauffeur
          // mais en attente de validation par les passagers.
          // Choix de la valeur : soit 'pending_validation' (EN) soit 'a_valider' (FR) — backend doit accepter.
          const backendStatus = 'a_valider'; // ou 'pending_validation' si ton API préfère l'anglais
          const payload = JSON.stringify({ status: backendStatus });
          const opts = {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: payload
          };

          let res;
          if (typeof apiFetch === 'function') {
            // apiFetch devrait accepter headers et body ; si apiFetch modifie Content-Type, utilise fetch natif
            res = await apiFetch(`/api/carpools/${stableId}`, opts);
          } else {
            const r = await fetch(`/api/carpools/${stableId}`, opts);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            res = await r.json().catch(() => null);
          }

          // Mise à jour locale / refresh UI
          if (Array.isArray(trajets)) {
            const t = trajets.find(x => String(x.id) === String(stableId) || String(x.serverId) === String(stableId));
            if (t) t.status = 'termine';
          }
          alert('Trajet marqué comme terminé !');
          if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();
          if (typeof renderHistorique === 'function') renderHistorique();

        } catch (err) {
          console.error('Erreur lors de la clôture du trajet:', err);
          // Si c'est un 415, log plus d'infos utiles
          if (err?.message && err.message.includes('415')) {
            alert('Erreur: type de contenu non supporté (415). Vérifie l\'en-tête Content-Type envoyé.');
          } else {
            alert('Erreur technique lors de la clôture du trajet. Voir console.');
          }
        }

        return;
      }
  
      // 3) GESTION DU BOUTON DÉTAIL
      if (target.classList.contains('trajet-detail-btn')) {
        e.preventDefault();
        e.stopPropagation();
  
        const covoId = target.dataset?.covoId ?? target.getAttribute('data-covo-id');
        if (covoId) {
          console.log('Ouvrir détail:', covoId);
          // Exemple d'action : ouvrir l'onglet détail
          // window.location.hash = `#carpool:${covoId}`;
          // ou appeler ta fonction d'ouverture de détail si elle existe
          if (typeof openCarpoolDetail === 'function') {
            try { openCarpoolDetail(covoId); } catch (err) { console.warn('openCarpoolDetail failed', err); }
          }
        }
        return;
      }
  
      // 4) AUTRES ACTIONS (Annuler, Signaler, Edit, Delete, Start, etc.)
      if (target.classList.contains('trajet-cancel-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const bookingId = getId(target);
        if (!bookingId) return;
        // implémenter la logique d'annulation...
        if (typeof handleCancelBooking === 'function') {
          try { await handleCancelBooking(bookingId, target); } catch (err) { console.error(err); }
        }
        return;
      }
  
      if (target.classList.contains('trajet-edit-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const carpoolId = getId(target);
        if (!carpoolId) return;
        if (typeof handleEditCarpool === 'function') {
          try { handleEditCarpool(carpoolId); } catch (err) { console.warn('handleEditCarpool failed', err); }
        }
        return;
      }
  
      if (target.classList.contains('trajet-delete-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const carpoolId = getId(target);
        if (!carpoolId) return;
        if (typeof handleDeleteCarpool === 'function') {
          try { await handleDeleteCarpool(carpoolId, target); } catch (err) { console.error(err); }
        }
        return;
      }
  
      // ... ajoute d'autres handlers si nécessaire ...
    });
  }

  setTimeout(() => {
    try {
      window._renderTrajetsInProgressRunning = false;
      if (window._renderTrajetsInProgressCallQueued) {
        window._renderTrajetsInProgressCallQueued = false;
        try { renderTrajetsInProgress(); } catch(e) { console.warn('Rerender queued failed', e); }
      }
    } catch (e) {
      console.warn('Erreur clear guard', e);
    }
  }, 0);

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
}


// -------------------- Historique --------------------

// utilitaire, si tu ne l'as pas déjà
function waitForElement(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error('waitForElement timeout ' + selector)); }, timeout);
  });
}

function allPassengersValidated(trajet) {
  const bookings = Array.isArray(trajet.bookings)
    ? trajet.bookings
    : (Array.isArray(trajet.raw?.bookings) ? trajet.raw.bookings : []);
  if (!Array.isArray(bookings) || bookings.length === 0) return true;

  const accepted = new Set([
    'validated','valide','confirmed','accepted','approve','approved','a_valider','termine','completed'
  ].map(s => s.toLowerCase()));

  for (const b of bookings) {
    const raw = b.status ?? b.statut ?? b.state ?? '';
    const st = (typeof normalizeStatus === 'function') ? (normalizeStatus(raw) || '').toString().toLowerCase().trim() : String(raw || '').toLowerCase().trim();
    if (!st) return false;
    if (st.includes('cancel') || st.includes('annul')) return false;
    if (!accepted.has(st)) return false;
  }
  return true;
}

// -------------------- Historique --------------------
export async function renderHistorique() {
  const historique = trajets.filter(t => isTrajetHistorique(t));
  console.log("[renderHistorique] Démarrage");

  const container = document.querySelector('.trajets-historique');
  if (!container) return;

  if (container.dataset.rendering === '1') return;
  container.dataset.rendering = '1';

  container.innerHTML = `<h2>Mes trajets passés</h2>`;

  let allTrajets = [];
  try {
    allTrajets = LS.get();
  } catch (e) {
    console.error('❌ Erreur localStorage', e);
  }

  const now = new Date();
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const passe = allTrajets.filter(t => {
    try {
      const id = t.id || t.serverId || t.raw?.id || '(no-id)';
      const roleRaw = (t.role || t.raw?.role || '').toString().toLowerCase();
      const role = roleRaw;
      const rawStatus = t.status ?? t.statut ?? t.raw?.status ?? '';
      const status = normalizeStatus(rawStatus);
      const dateTrajetRaw = t.date || t.raw?.departureDate || t.raw?.date || null;
      const dateTrajet = dateTrajetRaw ? new Date(dateTrajetRaw) : null;
      const dateTrajetOnly = dateTrajet && !isNaN(dateTrajet.getTime())
        ? new Date(dateTrajet.getFullYear(), dateTrajet.getMonth(), dateTrajet.getDate())
        : null;

      if (window.__TRAJETS_LOG) {
        const bookingsArr = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
        console.debug('[renderHistorique] checking trajet', {
          id,
          role,
          rawStatus,
          normalizedStatus: status,
          dateTrajetRaw,
          dateTrajetOnly,
          bookings: bookingsArr.map(b => ({
            id: b?.id ?? b?.['@id'] ?? '(no-id)',
            raw: b?.status ?? b?.statut ?? b?.state ?? '',
            normalized: normalizeStatus(b?.status ?? b?.statut ?? b?.state ?? '')
          }))
        });
      }

      if (!dateTrajet) { console.debug('[renderHistorique][skip] no date', id, t); return false; }
      if (status.includes('cancel') || status.includes('annul')) { console.debug('[renderHistorique][skip] cancelled', id, status); return false; }

      // Chauffeur
      if (role === 'chauffeur' || role === 'driver') {
        // 1) si status carpool indique déjà "terminé" (ou équivalent), l'afficher
        if (status === (STATUS?.CHAUFFEUR?.COMPLETED ?? 'termine') || status === 'termine' || status === 'completed') {
          console.debug('[renderHistorique][keep] driver completed (status)', id);
          return true;
        }

        // 2) si la date est déjà passée -> considérer historique (optionnel, pratique)
        if (dateTrajetOnly && dateTrajetOnly.getTime() < nowOnly.getTime()) {
          console.debug('[renderHistorique][keep] driver date past', id);
          return true;
        }

        // 3) fallback strict : si tous les passagers ont validé, on considère aussi historique
        if (typeof allPassengersValidated === 'function' && allPassengersValidated(t)) {
          console.debug('[renderHistorique][keep] driver all passengers validated (fallback)', id);
          return true;
        }

        console.debug('[renderHistorique][skip] driver not finalized', id, status, dateTrajetOnly);
        return false;
      }

      // Passager
      if (role === 'passager' || role === 'passenger') {
        const bookings = Array.isArray(t.bookings) ? t.bookings : (Array.isArray(t.raw?.bookings) ? t.raw.bookings : []);
        
        // 1. Récupération de l'ID utilisateur (plus robuste)
        const me = (typeof getCurrentUser === 'function' ? getCurrentUser() : window.currentUser) || null;
        // On extrait l'ID que ce soit un objet, un IRI ou un nombre
        const meId = me ? String(me.id ?? me['@id'] ?? me).split('/').pop() : null;

        let myBooking = null;
        if (Array.isArray(bookings) && meId) {
          myBooking = bookings.find(b => {
            const p = b.passenger ?? b.user ?? b.passengerIri ?? b.userIri ?? null;
            if (!p) return false;
            const pid = (typeof p === 'object') ? String(p.id ?? p['@id'] ?? '').split('/').pop() : String(p).split('/').pop();
            return pid === meId;
          }) || null;
        }

        // 2. Si on a trouvé ma réservation, on vérifie si elle est "historique"
        if (myBooking) {
          const rawB = myBooking.status ?? myBooking.statut ?? myBooking.state ?? '';
          const bStatus = (typeof normalizeStatus === 'function') ? (normalizeStatus(rawB) || '') : String(rawB || '');
          const bStatusNorm = bStatus.toLowerCase().trim();

          const acceptedStatus = [
            'confirmed', 'valide', 'validated', 'accepted', 'confirmé',
            'termine', 'completed', 'approved'
          ];
          if (STATUS?.PASSAGER?.VALIDATED) acceptedStatus.push(String(STATUS.PASSAGER.VALIDATED));

          const acceptedSet = new Set(acceptedStatus.map(s => s.toLowerCase()));

          if (acceptedSet.has(bStatusNorm)) {
            console.debug('[renderHistorique][keep] passenger booking confirmed/done', id);
            return true;
          }
        }

        // 3. CRITÈRE DE SECOURS : Si la date est passée, on l'affiche TOUJOURS en historique
        // Même si la réservation est restée en "a_valider", si le jour est fini, c'est du passé.
        if (dateTrajetOnly && dateTrajetOnly.getTime() < nowOnly.getTime()) {
          console.debug('[renderHistorique][keep] passenger date past (fallback)', id);
          return true;
        }

        console.debug('[renderHistorique][skip] passenger not confirmed and not past', id, {status, myBookingStatus: myBooking?.status});
        return false;
      }

      console.debug('[renderHistorique][skip] unknown role', id, role);
      return false;

    } catch (err) {
      console.warn('[renderHistorique] filter error', err, t);
      return false;
    }
  });

  console.log(`[renderHistorique] Trajets affichés : ${passe.length}`);

  // Tri par date décroissante
  passe.sort((a, b) => {
    const dateA = new Date(a.date || a.raw?.departureDate || 0);
    const dateB = new Date(b.date || b.raw?.departureDate || 0);
    return dateB - dateA;
  });

  if (passe.length === 0) {
    container.innerHTML += `<p>Aucun trajet enregistré</p>`;
    container.removeAttribute('data-rendering');
    return;
  }

  // Construire HTML en une seule passe (meilleure perf)
  const htmlParts = [];
  for (const trajet of passe) {
    const depart = trajet.depart || trajet.raw?.departureLocation || 'Inconnu';
    const arrivee = trajet.arrivee || trajet.raw?.arrivalLocation || 'Inconnu';
    const dateRaw = trajet.date || trajet.raw?.departureDate || '';
    const prix = trajet.prix ?? trajet.raw?.pricePerPlace ?? 0;
    const role = (trajet.role || '').toString().toLowerCase();
    const places = Number(trajet.placesReservees ?? trajet.places ?? (Array.isArray(trajet.raw?.bookings) ? trajet.raw.bookings.length : 0)) || 0;

    let cardClass = 'trajet-card valide';
    if (role === 'passager' || role === 'passenger') cardClass = 'trajet-card reserve';
    else if (role === 'chauffeur' || role === 'driver') cardClass = 'trajet-card chauffeur-historique';

    const dateDisplay = (typeof formatDateJJMMAAAA === 'function') ? formatDateJJMMAAAA(dateRaw) : dateRaw;

    htmlParts.push(`
      <div class="${cardClass}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${dateDisplay}) : <br>${depart} → ${arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • 
              ${places} place${places > 1 ? 's' : ''}
            </span>
          </div>
          <div class="trajet-price">${prix} crédits</div>
        </div>
      </div>
    `);
  }

  container.innerHTML += htmlParts.join('');
  container.removeAttribute('data-rendering');
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
      // 1. S'assurer d'avoir un carId avant de poster
      if (!t.carId && t.vehicle) {
        try {
          const newCarId = await createCarIfNeeded(t.vehicle);
          if (newCarId) {
            t.carId = newCarId;
            t.vehicle.id = newCarId;
            // Mise à jour ecoride_vehicles
            const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]');
            const idx = vehicles.findIndex(v => 
              (v.plate && t.vehicle.plate && v.plate === t.vehicle.plate) || 
              (v._tmpId && t.vehicle._tmpId && v._tmpId === t.vehicle._tmpId)
            );
            if (idx !== -1) vehicles[idx] = { ...vehicles[idx], ...t.vehicle };
            else vehicles.push(t.vehicle);
            localStorage.setItem('ecoride_vehicles', JSON.stringify(vehicles));
          }
        } catch (err) {
          t.syncError = `Erreur voiture: ${err.message || String(err)}`;
          continue;
        }
      }

      const serverIdRaw = t.serverId || t['@id'] || null;

      try {
        const serverObj = await saveCarpoolApi(t);
        
        // Extraction de l'ID depuis la réponse (objet ou IRI)
        const newServerId = serverObj?.['@id'] || serverObj?.id || null;
        const isNoContent = serverObj && serverObj.status === 204;

        if (newServerId) {
          // Correction ici : on utilise newServerId (et non newServerIdRaw qui n'existe pas)
          t.serverId = (String(newServerId).startsWith('/api/') ? newServerId : `/api/carpools/${newServerId}`);
          t.synced = true;
          delete t.syncError;
          console.log('🔁 Retry sync SUCCESS pour', t.id, '->', t.serverId);
        } else if (isNoContent && serverIdRaw) {
          // Le serveur a validé sans renvoyer de corps (cas classique du PATCH 204)
          t.synced = true;
          delete t.syncError;
          console.log('🔁 Retry sync OK (204) pour', t.id);
        } else {
          throw new Error('Aucun identifiant serveur retourné');
        }
      } catch (err) {
        if (serverIdRaw) {
          t.syncError = `update-failed: ${err.message || String(err)}`;
          if (err.status === 404) t.syncError = 'stale-serverid';
        } else {
          t.syncError = `create-failed: ${err.message || String(err)}`;
        }
        console.warn('🔁 Retry échoué pour', t.id, err.message || err);
      }
    } catch (err) {
      t.syncError = err.message || String(err);
    }
  }

  // Persist after attempts
  try {
    LS.set(list);
    window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
  } catch (e) {
    console.warn('retryPendingSyncs persist failed', e);
  }
}

function normalizeAndPersistRoles() {
  try {
    const me = getCurrentUser();
    trajets.forEach(t => {
      try {
        // recalcule via detectRole si existant, sinon fallback à 'passager'
        const r = (typeof detectRole === 'function') ? detectRole(t) : (t.role || 'passager');
        t.role = r || 'passager';
      } catch (e) {
        t.role = t.role || 'passager';
      }
    });
    // sauvegarde cohérente (utilise ta fonction de persistance existante)
    LS.set(trajets);
    saveTrajets(trajets);
  } catch (e) {
    console.warn('normalizeAndPersistRoles error', e);
  }
}

// -------------------- Exposition globale (debug) --------------------
if (typeof window !== 'undefined') {
  window.startTrajetsPolling = startTrajetsPolling;
  window.stopTrajetsPolling = stopTrajetsPolling;
  window.restartTrajetsPolling = restartTrajetsPolling;
  window.loadTrajetsFromApi = loadTrajetsFromApi;
  window.debugTrajets = debugTrajets;
}

// Lancer au démarrage et périodiquement
retryPendingSyncs().catch(() => {});
setInterval(retryPendingSyncs, SYNC_RETRY_INTERVAL_MS);

// -------------------- Démarrage automatique sécurisé --------------------
if (typeof window !== 'undefined') {
  // On ne démarre le polling QUE si on est sur la page des trajets
  const shouldStartPolling = () => {
    return !!document.querySelector('#trajets-en-cours') || !!document.querySelector('.trajets-list');
  };

  const initSafePolling = () => {
    stopTrajetsPolling(); // On arrête toute instance précédente
    if (shouldStartPolling()) {
      // On démarre avec un intervalle plus long (10s au lieu de 5s) pour tester
      startTrajetsPolling(10000); 
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSafePolling);
  } else {
    initSafePolling();
  }

  // Arrêt propre
  window.addEventListener('beforeunload', stopTrajetsPolling);
}

try { renderHistorique(); } catch(e) { /* ignore si pas le bon moment */ }

// À ajouter tout en bas de trajets.js
window.loadAllUserTrajets = loadAllUserTrajets;
window.reserverPlace = reserverPlace;
window.apiFetch = apiFetch; // Utile pour tes tests
window.ensureCarpoolIriFromBooking = ensureCarpoolIriFromBooking;

export { LS };