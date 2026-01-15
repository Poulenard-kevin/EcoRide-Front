const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : 'http://127.0.0.1:8000';

async function fetchWithJsonError(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    // essaie de parser le JSON d'erreur, sinon récupère le texte brut
    let errorBody = null;
    try {
      errorBody = await resp.json();
    } catch (e) {
      try { errorBody = await resp.text(); } catch (e2) { errorBody = null; }
    }
    console.warn('fetchWithJsonError: API error', { url, status: resp.status, statusText: resp.statusText, body: errorBody });
    return { ok: false, resp, errorBody };
  }
  return { ok: true, resp };
}

export async function saveReviewDoubleStorage({ rating, comment, bookingIri = null, carpoolIri = null, userId, reservationId = null, reservationObj = null, mongoId = null } = {}) {
  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

  const buildIri = (type, v) => {
    if (!v) return null;
    const s = String(v);
    if (s.startsWith('/api/')) return s;
    const m = s.match(/(\d+)$/);
    const id = m ? m[1] : s;
    return `/api/${type}/${id}`;
  };

  // Résolution bookingIri & carpoolIri
  if (reservationObj) {
    bookingIri = bookingIri || reservationObj.serverId || reservationObj.bookingIri || reservationObj['@id'] || null;
    if (bookingIri && !String(bookingIri).startsWith('/api/')) bookingIri = buildIri('bookings', bookingIri);

    const covoRaw = reservationObj.covoId || reservationObj.carpoolId || reservationObj.covo || reservationObj.covoiturage || reservationObj.carpool || reservationObj.covoIdLocal || null;
    if (covoRaw) {
      carpoolIri = carpoolIri || (String(covoRaw).startsWith('/api/') ? String(covoRaw) : buildIri('carpools', covoRaw));
    }
  }

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
    } catch (e) { console.warn('saveReviewDoubleStorage: local lookup failed', e); }
  }

  if (!carpoolIri && bookingIri) {
    try {
      let bookingPath = String(bookingIri);
      if (bookingPath.startsWith('/api/')) bookingPath = bookingPath.replace(/^\/api/, '');
      if (!bookingPath.startsWith('/')) bookingPath = '/' + bookingPath.replace(/^\/+/, '');
      const { ok, resp } = await fetchWithJsonError(`${API_BASE}${bookingPath}`, { headers });
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

  if (!bookingIri && reservationId && /^\d+$/.test(String(reservationId))) {
    bookingIri = bookingIri || `/api/bookings/${String(reservationId)}`;
  }
  if (!carpoolIri && reservationObj?.covoId && /^\d+$/.test(String(reservationObj.covoId))) {
    carpoolIri = `/api/carpools/${String(reservationObj.covoId)}`;
  }

  if (!carpoolIri) {
    console.warn('saveReviewDoubleStorage: carpoolIri unresolved -> SQL POST skipped, will return mongo create result or error for pending save', { reservationId, reservationObj, bookingIri });
  }

  const mongoPayload = {
    note: Number(rating) || 0,
    comment: comment || '',
    userId: userId ? Number(userId) : (reservationObj?.userId ? Number(reservationObj.userId) : undefined),
    reservationId: reservationId ? String(reservationId) : (reservationObj?.id ? String(reservationObj.id) : undefined),
    carpoolId: carpoolIri ? String(carpoolIri).split('/').pop() : undefined
  };
  Object.keys(mongoPayload).forEach(k => mongoPayload[k] === undefined && delete mongoPayload[k]);

  console.log('saveReviewDoubleStorage: Mongo payload', mongoPayload);
  let mongoJson = null;
  {
    const { ok, resp, errorBody } = await fetchWithJsonError(`${API_BASE}/api/review_mongos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mongoPayload)
    });
    if (!ok) {
      return { sql: null, mongo: { ok: false, error: errorBody, status: resp.status } };
    }
    mongoJson = await resp.json();
  }

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

  let sqlJson = null;
  if (!sqlPayload.carpool) {
    return { sql: { ok: false, skipped: true, reason: 'missing-carpool' }, mongo: { ok: true, json: mongoJson } };
  }

  {
    const { ok, resp, errorBody } = await fetchWithJsonError(`${API_BASE}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sqlPayload)
    });
    if (!ok) {
      return { sql: { ok: false, status: resp.status, error: errorBody }, mongo: { ok: true, json: mongoJson } };
    }
    sqlJson = await resp.json();
  }

  try {
    const patchBody = { sqlId: sqlJson['@id'] || sqlJson.id || null };
    if (patchBody.sqlId) {
      const { ok, resp } = await fetchWithJsonError(`${API_BASE}/api/review_mongos/${mongoJson.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify(patchBody)
      });
      if (!ok) {
        console.warn('saveReviewDoubleStorage: patch mongo with sqlId failed', resp.status);
      }
    }
  } catch (e) {
    console.warn('saveReviewDoubleStorage: error patching mongo', e);
  }

  return { sql: { ok: true, json: sqlJson }, mongo: { ok: true, json: mongoJson } };
}