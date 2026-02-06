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

  // ----- LOG D'ENTRÉE -----
  console.log('saveReviewDoubleStorage: entry', { rating, comment, bookingIri, carpoolIri, userId, reservationId, reservationObj });

  // 1) Résolution initiale depuis reservationObj
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

  // 4) Fallbacks simples
  if (!bookingIri && reservationId && /^\d+$/.test(String(reservationId))) {
    bookingIri = `/api/bookings/${String(reservationId)}`;
  }
  if (!carpoolIri && reservationObj?.covoId && /^\d+$/.test(String(reservationObj.covoId))) {
    carpoolIri = `/api/carpools/${String(reservationObj.covoId)}`;
  }

  // ----- FORCING: fetch canonical booking -> carpool (après toutes les résolutions locales) -----
  if (reservationId && (!carpoolIri || String(carpoolIri).endsWith(`/${reservationId}`) || !/\/carpools\/\d+/.test(String(carpoolIri || '')))) {
    try {
      // normaliser reservationId en nombre / id
      const rId = String(reservationId).replace(/^\/api\/bookings\//, '').split('/').pop();
      if (/^\d+$/.test(rId)) {
        const { ok, resp } = await fetchWithJsonError(`${API_BASE}/api/bookings/${rId}`, { headers });
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

  // 5) CORRECTION CRUCIALE : si bookingIri pointe par erreur vers un carpool -> corriger
  if (bookingIri && String(bookingIri).includes('/carpools/')) {
    console.warn('saveReviewDoubleStorage: bookingIri semble être une IRI de carpool — correction automatique', bookingIri);
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
    userId: userId ? Number(userId) : (reservationObj?.userId ? Number(reservationObj.userId) : undefined),
    reservationId: reservationId ? String(reservationId) : (reservationObj?.id ? String(reservationObj.id) : undefined),
    carpoolId: carpoolIri ? String(carpoolIri).split('/').pop() : undefined
  };
  Object.keys(mongoPayload).forEach(k => mongoPayload[k] === undefined && delete mongoPayload[k]);

  console.log('saveReviewDoubleStorage: Mongo payload', mongoPayload);

  // 7) POST Mongo (toujours tenté) -> mais ne bloque plus la suite si fail
  let mongoJson = null;
  let mongoResult = { ok: false };
  try {
    const { ok, resp, errorBody } = await fetchWithJsonError(`${API_BASE}/api/review_mongos`, {
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

  // ----- LOG RÉSOLU (avant décision SQL) -----
  console.log('saveReviewDoubleStorage: resolved', { bookingIri, carpoolIri, reservationId });

  // 9) Si carpool absent -> skip SQL (on renvoie le résultat mongo)
  if (!sqlPayload.carpool) {
    return {
      sql: { ok: false, skipped: true, reason: 'missing-carpool' },
      mongo: mongoResult
    };
  }

  // 10) POST SQL
  let sqlJson = null;
  {
    const { ok, resp, errorBody } = await fetchWithJsonError(`${API_BASE}/api/reviews`, {
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

  // ----- LOG FINAL AVANT RETOUR -----
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

  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}/api/reviews?booking=${encodeURIComponent(bookingIri)}`;

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
    const resp = await fetch(url, { headers, method: 'GET' });
    console.debug('canCreateReview: status', resp.status);

    if (resp.status === 401 || resp.status === 403) {
      console.warn('canCreateReview: auth issue (status)', resp.status);
      return true;
    }
    if (!resp.ok) {
      console.warn('canCreateReview: non-ok response', resp.status, await resp.text().catch(() => '<no-body>'));
      return true;
    }

    const body = await resp.json().catch(() => null);
    console.debug('canCreateReview: raw body', body);
    try { console.debug('canCreateReview: body stringify', JSON.stringify(body)); } catch (e) {}

    // normalize candidate array
    let candidates = [];
    if (Array.isArray(body)) candidates = body;
    else if (body && Array.isArray(body['hydra:member'])) candidates = body['hydra:member'];
    else if (body && Array.isArray(body.items)) candidates = body.items;
    else if (body && Array.isArray(body.data)) candidates = body.data;

    // if nothing array-like found, be permissive but log
    if (!Array.isArray(candidates)) {
      console.warn('canCreateReview: unknown response shape, allowing creation by default');
      return true;
    }

    if (candidates.length === 0) return true; // no reviews returned

    // ONLY consider a returned item a duplicate if its booking matches the requested booking
    const matchesBooking = (r) => {
      if (!r || typeof r !== 'object') return false;
      // prefer an explicit booking field
      const bookingField = r.booking || r.bookingIri || r.booking_id || r.bookingId || r.reservation?.booking || null;
      if (bookingField) {
        const b = (typeof bookingField === 'string') ? bookingField : (bookingField['@id'] || bookingField.id || null);
        const bid = extractId(b);
        if (bid && wantedBookingId && String(bid) === String(wantedBookingId)) return true;
        if (String(b) === String(bookingIri)) return true;
        return false;
      }
      // If item has no booking info, do NOT assume it's a match (avoid false positives)
      return false;
    };

    for (const item of candidates) {
      if (matchesBooking(item)) {
        console.warn('canCreateReview: found matching review candidate', item);
        return false; // duplicate found for this booking
      }
    }

    console.debug('canCreateReview: no matching review for this booking -> allow creation');
    return true;
  } catch (e) {
    console.warn('canCreateReview: fetch error', e);
    return true;
  }
}