// assets/js/trips-api.js
import { apiFetch } from './api.js';


const API_BASE = window.ecoConfig?.apiBase || 'http://localhost:8000';

/**
 * Helpers
 */
export function formatDateForApi(dateStrOrDate) {
  const d = (dateStrOrDate instanceof Date) ? dateStrOrDate : new Date(dateStrOrDate);
  if (isNaN(d)) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD
}

export function formatTimeForApi(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  while (parts.length < 3) parts.push('00');
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
}

// normalizeServerId si tu ne l'as pas encore
export function normalizeServerId(serverId) {
  if (!serverId) return null;
  const s = String(serverId);
  if (s.startsWith('/api/')) {
    return s.replace(/^\/api\/(carpools|cars)\//, '');
  }
  return s;
}

// Fonction delete tolerant
export async function deleteCarpoolApi(serverIdOrAtId) {
  if (!serverIdOrAtId) return { status: 'no-id' };

  const id = normalizeServerId(serverIdOrAtId);

  try {
    // apiFetch doit throw si !res.ok ; on catchera et normalisera
    const res = await apiFetch(`/carpools/${id}`, { method: 'DELETE' });
    // si handleResponse retourne un objet, on considère succès
    return { status: 204, body: res };
  } catch (err) {
    // Normaliser les différentes formes d'erreur/response
    const status = err?.status || err?.response?.status || (err?.body && err.body.status) || null;
    const body = err?.body || err?.response?.data || null;

    // Ressource non trouvée côté serveur -> on considère OK et renvoie 404
    if (status === 404) {
      return { status: 404, body };
    }

    // Si on a une erreur réseau/CORS (status null ou 0) on renvoie info pour debug
    return { status: status || 'error', body, raw: err };
  }
}

// En-têtes + stringify : PATCH (merge-patch) avec fallback sur PUT (json)
async function tryPatchOrPut(url, payload) {
  try {
    console.debug('[tryPatchOrPut] PATCH payload:', payload);
    return await apiFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: payload
    });
  } catch (err) {
    // Si le serveur refuse PATCH (405) on tente PUT
    if (err && err.status === 405) {
      console.warn('[tryPatchOrPut] PATCH 405 -> fallback PUT', url);
      return await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
    }
    throw err;
  }
}

export async function saveCarpoolApi(trajetData, options = {}) {
  const padTimeParts = (t) => {
    if (!t) return '00:00:00';
    const parts = (''+t).split(':').map(p => p.padStart(2, '0'));
    while (parts.length < 3) parts.push('00');
    return `${parts[0]}:${parts[1]}:${parts[2]}`;
  };

  const departureDate = trajetData.departureDate || trajetData.date || null;
  const arrivalDate   = trajetData.arrivalDate   || trajetData.dateArrivee || null;
  const departureTime = trajetData.departureTime || trajetData.heureDepart || '';
  const arrivalTime   = trajetData.arrivalTime   || trajetData.heureArrivee || '';

  const departureLocation = trajetData.depart || trajetData.departure || trajetData.departureLocation || '';
  const arrivalLocation = trajetData.arrivee || trajetData.arrival || trajetData.arrivalLocation || '';

  const pricePerSeat = trajetData.pricePerSeat ?? trajetData.prix ?? trajetData.price ?? 0;
  const totalSeats = trajetData.totalSeats ?? trajetData.places ?? trajetData.nbPlacesTotal ?? 4;

  const payload = {
    departureDate: departureDate,
    departureTime: padTimeParts(departureTime),
    departureLocation: departureLocation,
    arrivalDate: arrivalDate,
    arrivalTime: padTimeParts(arrivalTime),
    arrivalLocation: arrivalLocation,
    pricePerSeat: Number(pricePerSeat),
    nbPlacesTotal: Number(totalSeats)
  };

  if (trajetData.carId) {
    const id = String(trajetData.carId).startsWith('/api/') ? String(trajetData.carId).replace('/api/cars/', '') : String(trajetData.carId);
    payload.car = `/api/cars/${id}`;
  }

  Object.keys(payload).forEach(k => {
    if (payload[k] === null || payload[k] === '' || payload[k] === undefined) delete payload[k];
  });

  // --- Logique création ou mise à jour ---
  const serverIdRaw = trajetData.serverId || trajetData['@id'] || null;

  if (serverIdRaw) {
    const id = normalizeServerId(serverIdRaw);
    const patchedUrl = `/carpools/${id}`;
    console.debug('[saveCarpoolApi] attempt update', { patchedUrl, payload });
    try {
      const res = await tryPatchOrPut(patchedUrl, payload);
      console.debug('[saveCarpoolApi] update response', res);
      return res;
    } catch (err) {
      console.error('[saveCarpoolApi] update failed', err);
      // NE PAS faire de POST ici : marquer en erreur et renvoyer l'erreur au caller
      const message = err?.body?.['hydra:description'] || err?.body?.message || err?.message || 'Erreur mise à jour covoiturage';
      const e = new Error(message);
      e.status = err.status;
      e.body = err.body;
      throw e;
    }
  } else {
    // === Création (POST) ===
    try {
      console.debug('[saveCarpoolApi] POST /carpools payload=', payload);
      const res = await apiFetch('/carpools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.debug('[saveCarpoolApi] POST response=', res);
      return res;
    } catch (err) {
      const message = err?.body?.['hydra:description'] || err?.body?.message || err?.message || 'Erreur création covoiturage';
      const e = new Error(message);
      e.status = err.status;
      e.body = err.body;
      throw e;
    }
  }
}

// Normalize owner check (owner can be IRI string or object)
export function carOwnedBy(carJson, currentUser) {
  if (!carJson || !currentUser) return false;

  // Normalize current user id/IRI
  const userIdNum = currentUser.id ?? null;
  const userIri = currentUser['@id'] ?? (userIdNum ? `/api/users/${userIdNum}` : null);

  const owner = carJson.owner ?? carJson.user ?? carJson.ownerId ?? null;
  if (!owner) return false;

  if (typeof owner === 'string') {
    // owner is an IRI string like "/api/users/33"
    if (userIri && owner === userIri) return true;
    if (userIdNum && owner.endsWith(`/users/${userIdNum}`)) return true;
    return false;
  }

  if (typeof owner === 'object') {
    if ('id' in owner && userIdNum) return Number(owner.id) === Number(userIdNum);
    if ('@id' in owner && userIri) return owner['@id'] === userIri;
  }

  return false;
}

/**
 * Join / Leave (améliorés)
 */
export async function joinTrip(tripId, seats = 1, options = {}) {
  return await apiFetch(`/carpools/${tripId}/join`, {
    method: 'POST',
    body: { seats }
  });
}

export async function leaveTrip(tripId, options = {}) {
  return await apiFetch(`/carpools/${tripId}/leave`, {
    method: 'POST'
  });
}

export async function createCarIfNeeded(vehicle, options = {}) {
  const { jwtToken } = options;
  if (!vehicle) return null;

  // Si on a déjà un id ou @id connu côté serveur -> retourner l'id
  const existing = vehicle.id || vehicle.serverId || vehicle._id || vehicle['@id'];
  if (existing) {
    if (String(existing).startsWith('/api/')) {
      return String(existing).replace(/^\/api\/cars\//, '');
    }
    return existing;
  }

  // Construire payload minimal pour créer une voiture
  const payload = {
    plate: vehicle.plate || vehicle.immatriculation || vehicle.licencePlate || undefined,
    brand: vehicle.brand || vehicle.marque || undefined,
    model: vehicle.model || vehicle.modele || undefined,
    seats: Number(vehicle.seats ?? vehicle.places ?? 4)
  };

  // supprimer champs undefined
  Object.keys(payload).forEach(k => {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') delete payload[k];
  });

  // Envoi via apiFetch
  const res = await apiFetch('/cars', {
    method: 'POST',
    body: payload
  });

  // ApiPlatform retourne souvent @id (ex: "/api/cars/12")
  if (res && res['@id']) {
    return String(res['@id']).replace('/api/cars/', '');
  }
  return res?.id ?? null;
}
