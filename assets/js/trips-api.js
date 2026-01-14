// assets/js/trips-api.js
import { apiFetch } from './api.js';
import { normalizeTypeKey } from './type-utils.js';

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

/**
 * Normalise un objet carpool de l'API vers le format front
 */
export function carpoolFromApi(apiItem) {
  if (!apiItem) return null;

  // ---------- Helpers ----------
  const toDateIso = (value) => {
    if (!value) return null;
    const s = String(value);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };

  const formatTime = (value) => {
    if (!value) return '';
    const s = String(value);

    // Extraire HH:MM depuis n'importe quel format (ISO, "10:00", "10:00:00")
    const m = s.match(/(\d{2}):(\d{2})(?::\d{2})?/);
    if (m) return `${m[1]}h${m[2]}`;

    // Fallback si pas de match
    return '';
  };

  // ---------- Driver ----------
  const rawDriver = apiItem.driver || apiItem.chauffeur || apiItem.user || {};

  let driverFirstName = null;
  let driverLastName  = null;
  let driverEmail     = null;
  let driverRating    = null;
  let driverAbout     = null;

  // cas normal : l'API renvoie un objet user
  if (typeof rawDriver === 'object' && rawDriver !== null) {
    driverFirstName = rawDriver.firstName || rawDriver.firstname || null;
    driverLastName  = rawDriver.lastName  || rawDriver.lastname  || null;
    driverEmail     = rawDriver.email || null;
    driverRating    = rawDriver.averageRating ?? rawDriver.rating ?? null;
    driverAbout     = rawDriver.about || rawDriver.bio || rawDriver.description || null;
  }

  let driverPseudo =
    rawDriver.pseudo ||
    rawDriver.name   ||
    null;

  // Si pas de pseudo explicite mais firstName/lastName dispo -> "Prénom Nom"
  if (!driverPseudo && (driverFirstName || driverLastName)) {
    driverPseudo = [driverFirstName, driverLastName].filter(Boolean).join(' ').trim();
  }

  // Fallback sur l'email si toujours rien
  if (!driverPseudo && driverEmail) {
    driverPseudo = String(driverEmail).split('@')[0];
  }

  // Fallback final
  if (!driverPseudo) {
    driverPseudo = 'Inconnu';
  }

  const chauffeur = {
    id: rawDriver.id || rawDriver.userId || null,
    email: driverEmail,
    pseudo: driverPseudo,
    photo: rawDriver.avatarUrl || rawDriver.avatar || rawDriver.photo || null,
    rating: driverRating ?? 0,
    about: driverAbout
  };

  // ---------- Dates / heures ----------
  // Champs possibles venant de l'API (adapter si besoin)
  const rawDepartureDate =
    apiItem.dateDepart ||
    apiItem.date_depart ||
    apiItem.departureDate ||
    apiItem.date ||
    null;

  const rawArrivalDate =
    apiItem.dateArrivee ||
    apiItem.date_arrivee ||
    apiItem.arrivalDate ||
    null;

  const departureDate = toDateIso(rawDepartureDate) || rawDepartureDate;
  const arrivalDate = toDateIso(rawArrivalDate) || rawArrivalDate;

  const departureTimeRaw =
    apiItem.heureDepart ||
    apiItem.heure_depart ||
    apiItem.departureTime ||
    rawDepartureDate || // si l'heure est incluse dans la date
    '';

  const arrivalTimeRaw =
    apiItem.heureArrivee ||
    apiItem.heure_arrivee ||
    apiItem.arrivalTime ||
    rawArrivalDate ||
    '';

  const departureTime = formatTime(departureTimeRaw);
  const arrivalTime = formatTime(arrivalTimeRaw);

  // ---------- Lieux ----------
  const depart =
    apiItem.lieuDepart ||
    apiItem.lieu_depart ||
    apiItem.departureLocation ||
    apiItem.depart ||
    apiItem.departure ||
    '';

  const arrivee =
    apiItem.lieuArrivee ||
    apiItem.lieu_arrivee ||
    apiItem.arrivalLocation ||
    apiItem.arrivee ||
    apiItem.arrival ||
    '';

  // ---------- Prix / places ----------
  const prix =
    apiItem.pricePerSeat ??
    apiItem.prixParPlace ??
    apiItem.prix ??
    apiItem.price ??
    0;

  const totalSeats =
    apiItem.nbPlacesTotal ??
    apiItem.nb_places_total ??
    apiItem.totalSeats ??
    apiItem.places ??
    4;

  const availableSeats =
    apiItem.nbPlacesAvailable ??
    apiItem.nb_places_dispo ??
    apiItem.availableSeats ??
    totalSeats;

  // ---------- Véhicule ----------
  const vehicle = apiItem.car || apiItem.vehicle || {};
  const vehicleTypeRaw = vehicle.fuelType || vehicle.type || vehicle.fuel || '';

  const vehicleNormalized = {
    marque: vehicle.brand || vehicle.marque || 'Non spécifié',
    model: vehicle.model || vehicle.modele || 'Non spécifié',
    color: vehicle.color || vehicle.couleur || 'Non spécifié',
    // normaliser le type via normalizeTypeKey -> 'electrique'|'thermique'|'hybride'|'non-specifie'
    type: normalizeTypeKey(vehicleTypeRaw || ''),
    places: vehicle.seats || vehicle.places || totalSeats,
    other: vehicle.other || vehicle.autre || ''
  };

  // ---------- Passagers ----------
  const passagers = Array.isArray(apiItem.bookings)
  ? apiItem.bookings.map((b) => {
      const u = b.user || {};
      const uFirst = u.firstName || u.firstname || null;
      const uLast  = u.lastName  || u.lastname  || null;

      let pPseudo = u.pseudo || null;

      if (!pPseudo && (uFirst || uLast)) {
        pPseudo = [uFirst, uLast].filter(Boolean).join(' ').trim();
      }
      if (!pPseudo && u.email) {
        pPseudo = String(u.email).split('@')[0];
      }
      if (!pPseudo) {
        pPseudo = 'Passager';
      }

      return {
        pseudo: pPseudo,
        places: b.seats || b.nbPlaces || 1
      };
    })
  : Array.isArray(apiItem.passagers)
  ? apiItem.passagers
  : [];

  // ---------- Retour normalisé ----------
  // Déterminer le "type" principal à partir de plusieurs sources, normalisé via normalizeTypeKey.
  const rawTypeCandidates = [
    apiItem.fuelType,
    apiItem.fuel_type,
    apiItem.type,
    apiItem.vehicle?.fuelType,
    apiItem.vehicle?.type,
    vehicleTypeRaw
  ];
  const chosenRawType = rawTypeCandidates.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
  const normalizedType = normalizeTypeKey(chosenRawType);

  return {
    id: apiItem.id || apiItem['@id']?.replace('/api/carpools/', ''),
    serverId: apiItem['@id'] || `/api/carpools/${apiItem.id}`,
    date: departureDate,
    heureDepart: departureTime,
    heureArrivee: arrivalTime,
    depart,
    arrivee,
    prix,
    places: availableSeats,
    capacity: totalSeats,
    // type stocké sous forme de clé normalisée : 'electrique'|'thermique'|'hybride'|'non-specifie'
    type: normalizedType,
    chauffeur,
    vehicle: vehicleNormalized,
    passagers,
    rating: chauffeur.rating
  };
}


export async function carpoolFromApiAsync(apiItem) {
  const trip = carpoolFromApi(apiItem); // ton mapping actuel minimal

  // helper pour formatage heure ISO -> "10h00"
  function formatTime(isoString) {
    try {
      const d = new Date(isoString);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}h${m}`;
    } catch {
      return '';
    }
  }

  // Récupération/normalisation du car object (peut être string -> fetch ou objet)
  let carObj = null;
  const carRef = apiItem?.car;

  if (!carRef) {
    carObj = null;
  } else if (typeof carRef === 'string' && carRef.startsWith('/api/')) {
    try {
      carObj = await apiFetch(carRef.replace('/api', '')); // "/cars/1"
    } catch (e) {
      console.warn('[carpoolFromApiAsync] impossible de charger le véhicule', carRef, e);
      carObj = null;
    }
  } else if (typeof carRef === 'object') {
    carObj = carRef;
  }

  // Récupérer fuelType en cherchant dans plusieurs clés possibles
  const fuelTypeRaw = (carObj && (carObj.fuelType || carObj.fuel_type || carObj.type))
    || apiItem.fuelType || apiItem.fuel_type || apiItem.type || '';

  const normalizedType = fuelTypeRaw ? normalizeTypeKey(fuelTypeRaw) : normalizeTypeKey(trip.type || (trip.vehicle && trip.vehicle.type) || '');

  // Construire l'objet "car" (nouveau) et "vehicle" (compat)
  const carData = {
    marque: (carObj && (carObj.brand || carObj.marque)) || carObj?.brand || carObj?.marque || trip.vehicle?.marque || '',
    model: (carObj && (carObj.model || carObj.modele)) || trip.vehicle?.model || '',
    color: (carObj && (carObj.color || carObj.couleur)) || trip.vehicle?.color || '',
    type: normalizedType,
    places: (carObj && (carObj.seats || carObj.places)) || apiItem.availableSeats || apiItem.nbPlacesTotal || trip.capacity || trip.places || 4,
    other: (carObj && (carObj.otherPreferences || carObj.other || carObj.autre)) || apiItem.otherPreferences || apiItem.otherPreferences || '',
    driverPreferences: (carObj && (carObj.driverPreferences || carObj.driver_preferences)) || apiItem.driverPreferences || apiItem.driver_preferences || []
  };

  // s'assurer que driverPreferences est tableau
  if (!Array.isArray(carData.driverPreferences) && typeof carData.driverPreferences === 'string' && carData.driverPreferences.trim()) {
    // si c'est une string, on tente de scinder par virgule
    carData.driverPreferences = carData.driverPreferences.split(',').map(s => s.trim()).filter(Boolean);
  } else if (!Array.isArray(carData.driverPreferences)) {
    carData.driverPreferences = [];
  }

  // Appliquer sur trip pour compat (vehicle + car)
  trip.car = carData;
  trip.vehicle = trip.vehicle ? { ...trip.vehicle, ...carData } : { ...carData };

  // Normaliser type sur trip.type aussi (pour affichage)
  trip.type = normalizedType;

  // Places / capacity
  trip.places = Number(apiItem.availableSeats ?? apiItem.nbPlacesTotal ?? carData.places ?? trip.places ?? 0);
  trip.capacity = trip.places;

  // Prix
  trip.prix = Number(apiItem.pricePerSeat ?? apiItem.pricePerSeat ?? apiItem.price ?? trip.prix ?? 0);

  // Driver mapping (compatibilité driver / chauffeur)
  const driverRaw = apiItem.driver || apiItem.chauffeur || apiItem.user || apiItem.owner || null;
  const driver = {
    id: driverRaw?.id ?? apiItem.driverId ?? null,
    email: driverRaw?.email || driverRaw?.mail || '',
    pseudo: driverRaw?.pseudo || driverRaw?.firstName || driverRaw?.first_name || driverRaw?.name || `${driverRaw?.firstName || ''} ${driverRaw?.lastName || ''}`.trim(),
    photo: driverRaw?.avatar || driverRaw?.photo || driverRaw?.profilePicture || '',
    about: driverRaw?.about || driverRaw?.bio || '',
    rating: driverRaw?.rating ?? (driverRaw && driverRaw.receivedReviews ? driverRaw.receivedReviews.length : 0),
    reviews: driverRaw?.receivedReviews || driverRaw?.reviews || []
  };
  trip.driver = driver;
  trip.chauffeur = driver; // compat

  // Preferences globaux
  trip.preferences = Array.isArray(apiItem.preferences) ? apiItem.preferences
    : (Array.isArray(apiItem.driverPreferences) ? apiItem.driverPreferences
      : (trip.car.driverPreferences && trip.car.driverPreferences.length ? trip.car.driverPreferences : undefined));

  // autres prefs textuelles
  trip.otherPreferences = trip.car.other || apiItem.otherPreferences || apiItem.other_preferences || '';

  // Dates / heures formatées (conserver champs originaux si besoin)
  try {
    trip.date = apiItem.departureDate ? apiItem.departureDate.slice(0, 10) : trip.date || '';
  } catch (e) { /* ignore */ }
  if (!trip.heureDepart) trip.heureDepart = apiItem.departureTime ? formatTime(apiItem.departureTime) : trip.heureDepart || '';
  if (!trip.heureArrivee) trip.heureArrivee = apiItem.arrivalTime ? formatTime(apiItem.arrivalTime) : trip.heureArrivee || '';

  // ---------- Status normalisé (exposé pour le front) ----------
  const rawStatus = apiItem.status ?? apiItem.statut ?? apiItem.state ?? apiItem.progress ?? apiItem.statusRaw ?? (apiItem.raw && apiItem.raw.status) ?? null;
  const statusNormalized = rawStatus ? String(rawStatus).toLowerCase().trim() : '';

  trip.status = statusNormalized;
  trip.rawStatus = rawStatus;

  // Expose quelques logs utiles pour debug (tu peux les retirer plus tard)
  console.debug('[carpoolFromApiAsync] carData:', carData);
  console.debug('[carpoolFromApiAsync] driver:', driver);
  console.debug('[carpoolFromApiAsync] preferences resolved:', trip.preferences, 'otherPreferences:', trip.otherPreferences);
  console.debug('[carpoolFromApiAsync] status:', trip.status);

  // Exposer les bookings bruts si l'API les fournit (utile pour actions serveur)
  trip.bookings = Array.isArray(apiItem.bookings) ? apiItem.bookings
  : Array.isArray(apiItem.reservations) ? apiItem.reservations
  : Array.isArray(apiItem.bookingsHydra) ? apiItem.bookingsHydra
  : [];

  // Garde aussi une référence brute si nécessaire
  trip.rawBookings = apiItem.bookings ?? apiItem.reservations ?? apiItem.bookingsHydra ?? null;

  return trip;
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
  const userIdNum = currentUser.id ?? null;
  const userIri = currentUser['@id'] ?? (userIdNum ? `/api/users/${userIdNum}` : null);
  const owner = carJson.owner ?? carJson.user ?? carJson.ownerId ?? null;
  console.log('carOwnedBy check:', { owner, userIdNum, userIri });
  if (!owner) return false;
  if (typeof owner === 'string') {
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

// dans trips-api.js (remplacer l'actuelle updateBookingStatus)
export async function updateBookingStatus(bookingId, newStatus) {
  if (!bookingId) throw new Error('bookingId requis');

  // construire le chemin attendu par apiFetch
  const path = String(bookingId).startsWith('/api/') ? bookingId.replace(/^\/api/, '') : `/bookings/${String(bookingId).replace(/^\/api\/bookings\//, '')}`;

  try {
    const res = await apiFetch(`/api${path}`.replace('//','/'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify({ status: newStatus })
    });
    return res;
  } catch (err) {
    console.error('updateBookingStatus failed', err);
    throw err;
  }
}