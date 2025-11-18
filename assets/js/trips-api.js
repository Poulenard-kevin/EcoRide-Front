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

export async function createCarpoolApi(trajetData, options = {}) {
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

  try {
    // apiFetch attend le path relatif (api.js a API_BASE '/api' intégré)
    const res = await apiFetch('/carpools', { method: 'POST', body: payload });
    return res;
  } catch (err) {
    // normalize error for callers
    const message = err?.body?.['hydra:description'] || err?.body?.message || err?.message || 'Erreur création covoiturage';
    const e = new Error(message);
    e.status = err.status;
    e.body = err.body;
    throw e;
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

export async function deleteCarpoolApi(serverIdOrAtId) {
  if (!serverIdOrAtId) return { status: 'no-id' };

  let id = String(serverIdOrAtId);
  if (id.startsWith('/api/')) {
    id = id.replace(/^\/api\/carpools\//, '');
  }

  try {
    await apiFetch(`/carpools/${id}`, { method: 'DELETE' });
    return { status: 204 };
  } catch (err) {
    const status = err?.status || (err?.response && err.response.status) || null;
    if (status === 404) {
      return { status: 404 };
    }
    throw err;
  }
}
