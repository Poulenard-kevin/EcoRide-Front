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
  const { jwtToken } = options;

  // Helpers locaux
  const padTimeParts = (t) => {
    if (!t) return '00:00:00';
    const parts = (''+t).split(':').map(p => p.padStart(2, '0'));
    while (parts.length < 3) parts.push('00');
    return `${parts[0]}:${parts[1]}:${parts[2]}`;
  };

  // Normalisation flexible des champs
  const departureDate = trajetData.departureDate || trajetData.date || null;
  const arrivalDate   = trajetData.arrivalDate   || trajetData.dateArrivee || null;
  const departureTime = trajetData.departureTime || trajetData.heureDepart || '';
  const arrivalTime   = trajetData.arrivalTime   || trajetData.heureArrivee || '';

  const departureLocation = trajetData.depart || trajetData.departure || trajetData.departureLocation || '';
  const arrivalLocation = trajetData.arrivee || trajetData.arrival || trajetData.arrivalLocation || '';

  const pricePerSeat = trajetData.pricePerSeat ?? trajetData.prix ?? trajetData.price ?? 0;
  const totalSeats = trajetData.totalSeats ?? trajetData.places ?? trajetData.totalSeats ?? 4;

  // Construire payload attendu par le backend
  const payload = {
    departureDate: departureDate,
    departureTime: padTimeParts(departureTime),
    departureLocation: departureLocation,
    arrivalDate: arrivalDate,
    arrivalTime: padTimeParts(arrivalTime),
    arrivalLocation: arrivalLocation,
    pricePerSeat: Number(pricePerSeat),
    totalSeats: Number(totalSeats)
  };

  // ajoute la voiture si tu as un carId
  if (trajetData.carId) {
    payload.car = `/api/cars/${trajetData.carId}`;
  }

  // supprimer les champs vides/null
  Object.keys(payload).forEach(k => {
    if (payload[k] === null || payload[k] === '' || payload[k] === undefined) delete payload[k];
  });

  console.log('createCarpoolApi payload:', JSON.stringify(payload, null, 2));

  // Envoi via apiFetch (gère token automatiquement)
  return await apiFetch('/carpools', {
    method: 'POST',
    body: payload
  });
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