// assets/js/your-file-name.js
// Remplacement de l'ancien usage d'API_BASE par des helpers runtime

// Helper runtime pour récupérer la base API (sans '/api' final)
// Priorité : window.getApiBase() si exposée, puis window.__API_BASE / window.API_BASE,
// sinon chaîne vide (urls relatives).
function getApiBase() {
  try {
    if (typeof window !== 'undefined' && typeof window.getApiBase === 'function') {
      return String(window.getApiBase() || '').replace(/\/+$/, '').replace(/\/api$/i, '');
    }
  } catch (e) { /* ignore */ }

  try {
    const maybe = (typeof window !== 'undefined' && (window.__API_BASE || window.API_BASE));
    if (maybe) return String(maybe).replace(/\/+$/, '').replace(/\/api$/i, '');
  } catch (e) { /* ignore */ }

  return '';
}

// Construit une URL vers l'API en ajoutant '/api' et en évitant les doublons.
// endpoint peut être '/reviews' ou 'reviews' ou '/bookings/1'
function buildApiUrl(endpoint) {
  const base = getApiBase();
  const normalizedEndpoint = endpoint ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`) : '/';
  const apiPrefix = '/api';
  if (!base) return `${apiPrefix}${normalizedEndpoint}`;
  return `${base}${apiPrefix}${normalizedEndpoint}`;
}

// Récupération centralisée du token (priorité aux helpers exposés si disponibles)
function getToken() {
  try {
    if (typeof window !== 'undefined' && typeof window.getToken === 'function') {
      const t = window.getToken();
      if (t) return t;
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && typeof window.getAuthToken === 'function') {
      const t2 = window.getAuthToken();
      if (t2) return t2;
    }
  } catch (e) { /* ignore */ }

  try {
    return localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
  } catch (e) { return null; }
}

// fetch helper that tries to parse JSON error body
async function fetchWithJsonError(url, options = {}) {
  const opts = Object.assign({ credentials: 'include' }, options);
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    let errorBody = null;
    try { errorBody = await resp.json(); }
    catch (e) {
      try { errorBody = await resp.text(); } catch (e2) { errorBody = null; }
    }
    console.warn('fetchWithJsonError: API error', { url, status: resp.status, statusText: resp.statusText, body: errorBody });
    return { ok: false, resp, errorBody };
  }
  return { ok: true, resp };
}

export async function saveReviewDoubleStorage({
  rating,
  comment,
  bookingIri = null,
  carpoolIri = null,
  userId,
  reservationId = null,
  reservationObj = null,
  mongoId = null
} = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

  const buildIri = (type, v) => {
    if (!v) return null;
    const s = String(v);
    if (s.startsWith('/api/')) return s;
    const m = s.match(/(\d+)$/);
    const id = m ? m[1] : s;
    return `/api/${type}/${id}`;
  };

  console.log('saveReviewDoubleStorage: entry', { rating, comment, bookingIri, carpoolIri, userId, reservationId, reservationObj });

  // 1) Resolution initiale depuis reservationObj
  if (reservationObj) {
    bookingIri = bookingIri || reservationObj.serverBookingIri || reservationObj.bookingIri || reservationObj.serverId || reservationObj['@id'] || null;
    if (bookingIri && !String(bookingIri).startsWith('/api/')) bookingIri = buildIri('bookings', bookingIri);

    const covoRaw = reservationObj.covoId || reservationObj.carpoolId || reservationObj.covo || reservationObj.covoiturage || reservationObj.carpool || reservationObj.covoIdLocal || null;
    if (covoRaw) {
      carpoolIri = carpoolIri || (String(covoRaw).startsWith('/api/') ? String(covoRaw) : buildIri('carpools', covoRaw));
    }
  }

  // 2) Tentative depuis divers localStorage lists si carpoolIri manquant
  if (!carpoolIri) {
    try {
      const lists = ['nouveauxTrajets', 'ecoride_trajets', 'ecoride_trajets_signales'];
      for (const key of lists) {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(arr) || arr.length === 0) continue;
        let found = null;
        if (reservationId) {
          found = arr.find(x => String(x.id) === String(reservationId) || String(x._localId || '') === String(reservationId));
        }
        if (!found && reservationObj) {
          const cand = reservationObj.covoId || reservationObj.carpoolId || reservationObj.serverId || reservationObj.covo;
          if (cand) found = arr.find(x => String(x.id) === String(cand) || String(x.serverId || '') === String(cand) || String(x['@id'] || '').endsWith('/' + String(cand)));
        }
        if (!found) {
          const bid = reservationObj?.serverId || reservationObj?.bookingIri || bookingIri;
          if (bid) {
            const bn = String(bid).split('/').pop();
            found = arr.find(x => (x.bookings || []).some(b => String(b.id || b['@id'] || '').endsWith('/' + bn) || String(b.id || '') === String(bn)));
          }
        }
        if (found) {
          carpoolIri = carpoolIri || (found.serverId ? String(found.serverId) : (found.id ? `/api/carpools/${found.id}` : null));
          if (carpoolIri) break;
        }
      }
    } catch (e) {
      console.warn('saveReviewDoubleStorage: local lookup failed', e);
    }
  }

  // 3) Si on a bookingIri mais pas carpoolIri -> fetch booking pour extraire carpool
  if (!carpoolIri && bookingIri) {
    try {
      let bookingPath = String(bookingIri);
      if (bookingPath.startsWith('/api/')) bookingPath = bookingPath.replace(/^\/api/, '');
      if (!bookingPath.startsWith('/')) bookingPath = '/' + bookingPath.replace(/^\/+/, '');
      const url = `${getApiBase() || ''}${bookingPath}`;
      const { ok, resp } = await fetchWithJsonError(url, { headers });
      if (ok) {
        const booking = await resp.json();
        if (booking && booking.carpool) {
          carpoolIri = (typeof booking.carpool === 'string') ? booking.carpool : (booking.carpool['@id'] || (booking.carpool.id ? `/api/carpools/${booking.carpool.id}` : null));
        }
      }
    } catch (e) {
      console.warn('saveReviewDoubleStorage: fetch booking failed', e);
    }
  }

  // 4) Fallbacks simples
  if (!bookingIri && reservationId && /^\d+$/.test(String(reservationId))) {
    bookingIri = `/api/bookings/${String(reservationId)}`;
  }
  if (!carpoolIri && reservationObj?.covoId && /^\d+$/.test(String(reservationObj.covoId))) {
    carpoolIri = `/api/carpools/${String(reservationObj.covoId)}`;
  }

  // Forcing: fetch canonical booking -> carpool (après toutes les résolutions locales)
  if (reservationId && (!carpoolIri || String(carpoolIri).endsWith(`/${reservationId}`) || !/\/carpools\/\d+/.test(String(carpoolIri || '')))) {
    try {
      const rId = String(reservationId).replace(/^\/api\/bookings\//, '').split('/').pop();
      if (/^\d+$/.test(rId)) {
        const url = buildApiUrl(`/bookings/${rId}`);
        const { ok, resp } = await fetchWithJsonError(url, { headers });
        if (ok) {
          const bJson = await resp.json();
          if (bJson && bJson.carpool) {
            const candidate = (typeof bJson.carpool === 'string') ? bJson.carpool : (bJson.carpool['@id'] || (bJson.carpool.id ? `/api/carpools/${bJson.carpool.id}` : null));
            if (candidate) {
              console.log('saveReviewDoubleStorage: overriding carpoolIri from booking fetch ->', candidate);
              carpoolIri = candidate;
            }
          } else {
            console.warn('saveReviewDoubleStorage: booking fetch returned no carpool', bJson);
          }
        } else {
          console.warn('saveReviewDoubleStorage: booking fetch failed (forcing)', resp && resp.status);
        }
      }
    } catch (e) {
      console.warn('saveReviewDoubleStorage: booking fetch exception (forcing)', e);
    }
  }

  // 5) Correction : si bookingIri pointe par erreur vers un carpool -> corriger
  if (bookingIri && String(bookingIri).includes('/carpools/')) {
    console.warn('saveReviewDoubleStorage: bookingIri seems to be a carpool IRI — correction automatic', bookingIri);
    if (!carpoolIri) {
      carpoolIri = bookingIri;
    }
    bookingIri = null;
    if (reservationId && /^\d+$/.test(String(reservationId))) {
      bookingIri = `/api/bookings/${String(reservationId)}`;
      console.log('saveReviewDoubleStorage: re-built bookingIri from reservationId ->', bookingIri);
    }
  }

  if (!carpoolIri) {
    console.warn('saveReviewDoubleStorage: carpoolIri unresolved -> SQL POST skipped (will keep mongo), context:', { reservationId, reservationObj, bookingIri });
  }

  // 6) Préparer payload Mongo
  const mongoPayload = {
    note: Number(rating) || 0,
    comment: comment || '',
    userId: (() => {
      if (userId) return Number(userId);
      if (reservationObj?.userId) return Number(reservationObj.userId);
      try {
        const me = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || window.currentUser || null;
        if (me) {
          const id = me.id ?? String(me['@id'] ?? '').split('/').pop();
          if (id && !isNaN(Number(id))) return Number(id);
        }
      } catch (e) {}
      return undefined;
    })(),
    reservationId: reservationId ? String(reservationId) : (reservationObj?.id ? String(reservationObj.id) : undefined),
    carpoolId: carpoolIri ? String(carpoolIri).split('/').pop() : undefined
  };
  Object.keys(mongoPayload).forEach(k => mongoPayload[k] === undefined && delete mongoPayload[k]);

  console.log('saveReviewDoubleStorage: Mongo payload', mongoPayload);

  // 7) POST Mongo (toujours tenté)
  let mongoJson = null;
  let mongoResult = { ok: false };
  try {
    const url = buildApiUrl('/mongo/reviews');
    const { ok, resp, errorBody } = await fetchWithJsonError(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(mongoPayload)
    });

    if (ok) {
      mongoJson = await resp.json();
      mongoResult = { ok: true, json: mongoJson, status: resp.status };
    } else {
      mongoResult = { ok: false, error: errorBody, status: resp ? resp.status : null };
      console.warn('saveReviewDoubleStorage: mongo save failed, continuing to SQL', mongoResult);
    }
  } catch (e) {
    mongoResult = { ok: false, error: e && e.message ? e.message : String(e) };
    console.warn('saveReviewDoubleStorage: exception when saving mongo, continuing to SQL', e);
  }

  // 8) Préparer payload SQL (API Symfony)
  const sqlPayload = {
    rating: Number(rating) || 0,
    comment: comment || '',
    booking: bookingIri || undefined,
    carpool: carpoolIri || undefined,
    user: userId ? `/api/users/${userId}` : undefined,
    status: 'PENDING'
  };
  Object.keys(sqlPayload).forEach(k => sqlPayload[k] === undefined && delete sqlPayload[k]);

  console.log('saveReviewDoubleStorage: SQL payload', sqlPayload);
  console.log('saveReviewDoubleStorage: resolved', { bookingIri, carpoolIri, reservationId });

  // 9) Si carpool absent -> skip SQL
  if (!sqlPayload.carpool) {
    return {
      sql: { ok: false, skipped: true, reason: 'missing-carpool' },
      mongo: mongoResult
    };
  }

  // 10) POST SQL
  let sqlJson = null;
  {
    const url = buildApiUrl('/reviews');
    const { ok, resp, errorBody } = await fetchWithJsonError(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(sqlPayload)
    });
    if (!ok) {
      return {
        sql: { ok: false, status: resp.status, error: errorBody },
        mongo: mongoResult
      };
    }
    sqlJson = await resp.json();
  }

  // 11) Patch mongo pour lier l'ID SQL si possible
  try {
    const patchBody = { sqlId: sqlJson['@id'] || sqlJson.id || null };
    if (patchBody.sqlId && mongoJson && mongoJson.id) {
      const url = buildApiUrl(`/mongo/reviews/${mongoJson.id}`);
      const { ok, resp } = await fetchWithJsonError(url, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody)
      });
      if (!ok) {
        console.warn('saveReviewDoubleStorage: patch mongo with sqlId failed', resp.status);
      }
    }
  } catch (e) {
    console.warn('saveReviewDoubleStorage: error patching mongo', e);
  }

  console.log('saveReviewDoubleStorage: finished', { sqlJson, mongoResult });

  try {
    window.dispatchEvent(new CustomEvent('ecoride:review-saved', {
      detail: {
        bookingIri: bookingIri || null,
        carpoolIri: carpoolIri || null,
        sqlJson: sqlJson || null,
        mongoResult: mongoResult || null
      }
    }));
  } catch (e) {
    console.warn('dispatch review-saved failed', e);
  }

  return {
    sql: { ok: true, json: sqlJson },
    mongo: mongoResult
  };
}

export async function canCreateReview(bookingIri) {
  if (!bookingIri) return false;

  const token = getToken();
  const headers = { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

  const url = buildApiUrl(`/reviews?booking=${encodeURIComponent(bookingIri)}`);

  const extractId = (v) => {
    if (!v) return null;
    const s = String(v);
    if (s.includes('/')) {
      const parts = s.split('/').filter(Boolean);
      return parts.length ? parts.pop() : null;
    }
    const m = s.match(/(\d+)$/);
    return m ? m[1] : s;
  };
  const wantedBookingId = extractId(bookingIri);

  try {
    console.debug('canCreateReview: GET', url, { tokenPresent: !!token });
    const respFetch = await fetch(url, { headers, method: 'GET', credentials: 'include' });
    console.debug('canCreateReview: status', respFetch.status);

    if (respFetch.status === 401 || respFetch.status === 403) {
      console.warn('canCreateReview: auth issue (status)', respFetch.status);
      return true;
    }
    if (!respFetch.ok) {
      console.warn('canCreateReview: non-ok response', respFetch.status, await respFetch.text().catch(() => '<no-body>'));
      return true;
    }

    const body = await respFetch.json().catch(() => null);
    console.debug('canCreateReview: raw body', body);
    try { console.debug('canCreateReview: body stringify', JSON.stringify(body)); } catch (e) {}

    let candidates = [];
    if (Array.isArray(body)) candidates = body;
    else if (body && Array.isArray(body['hydra:member'])) candidates = body['hydra:member'];
    else if (body && Array.isArray(body.items)) candidates = body.items;
    else if (body && Array.isArray(body.data)) candidates = body.data;

    if (!Array.isArray(candidates)) {
      console.warn('canCreateReview: unknown response shape, allowing creation by default');
      return true;
    }

    if (candidates.length === 0) return true;

    const matchesBooking = (r) => {
      if (!r || typeof r !== 'object') return false;
      const bookingField = r.booking || r.bookingIri || r.booking_id || r.bookingId || r.reservation?.booking || null;
      if (bookingField) {
        const b = (typeof bookingField === 'string') ? bookingField : (bookingField['@id'] || bookingField.id || null);
        const bid = extractId(b);
        if (bid && wantedBookingId && String(bid) === String(wantedBookingId)) return true;
        if (String(b) === String(bookingIri)) return true;
        return false;
      }
      return false;
    };

    for (const item of candidates) {
      if (matchesBooking(item)) {
        console.warn('canCreateReview: found matching review candidate', item);
        return false;
      }
    }

    console.debug('canCreateReview: no matching review for this booking -> allow creation');
    return true;
  } catch (e) {
    console.warn('canCreateReview: fetch error', e);
    return true;
  }
}