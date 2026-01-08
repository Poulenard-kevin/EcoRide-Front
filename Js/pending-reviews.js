// pending-reviews.js
// Gestion centralisée des "pending reviews" (stockage local + retry)
// Indépendant de detail.js / trajets.js pour éviter imports circulaires.
// Exporte : addPendingReview, getPendingReviewsSorted, retryPendingReviews, migratePendingReviews, getStoredMessages, storeMessages

const PENDING_REVIEWS_KEY = 'ecoride_reviews_pending';
const PENDING_REVIEWS_SEQ_KEY = 'ecoride_reviews_seq';
const FAILED_REVIEWS_KEY = 'ecoride_reviews_failed';
const MAX_STORED = 10; // garder un peu plus que 3 au cas où (detail UI affichera top 3)

/* ---------- utilitaires de stockage ---------- */
export function getStoredMessages() {
  try {
    const s = localStorage.getItem(PENDING_REVIEWS_KEY);
    if (!s) return [];
    return JSON.parse(s) || [];
  } catch (e) {
    console.warn('pending-reviews.getStoredMessages parse failed', e);
    return [];
  }
}

export function storeMessages(messages = []) {
  try {
    localStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify(Array.isArray(messages) ? messages : []));
  } catch (e) {
    console.warn('pending-reviews.storeMessages failed', e);
  }
}

function nextSeq() {
  try {
    const cur = Number(localStorage.getItem(PENDING_REVIEWS_SEQ_KEY) || '0');
    const next = cur + 1;
    localStorage.setItem(PENDING_REVIEWS_SEQ_KEY, String(next));
    return next;
  } catch (e) {
    return Date.now();
  }
}

/* ---------- API de création d'avis (fallback robuste) ---------- */
async function doCreateReview({ reservationObj, rating, comment }) {
  // Utilise window.createReviewApi si défini (tu l'as dans trajets.js), sinon tente appel direct vers /api/reviews
  if (typeof window.createReviewApi === 'function') {
    return window.createReviewApi({ reservationObj, rating, comment });
  }

  // fallback direct
  const payload = {
    rating: Number(rating) || 0,
    comment: comment || null,
  };

  // tenter inférence des relations depuis reservationObj si présent
  if (reservationObj) {
    if (reservationObj.bookingIri) payload.booking = reservationObj.bookingIri;
    if (reservationObj.carpool || reservationObj.carpoolIri || reservationObj.covoiturage) {
      payload.carpool = reservationObj.carpool || reservationObj.carpoolIri || reservationObj.covoiturage;
    } else if (reservationObj.covoId || reservationObj.covo) {
      const cov = String(reservationObj.covoId || reservationObj.covo);
      payload.carpool = cov.includes('/api/') ? cov : `/api/carpools/${cov}`; // best-effort
    }
  }

  // supprimer clés nulles
  Object.keys(payload).forEach(k => payload[k] == null && delete payload[k]);

  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || '';
  const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

  const url = API_BASE ? `${API_BASE}/api/reviews` : '/api/reviews';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  try { return JSON.parse(text); } catch (e) { return text; }
}

/* ---------- public API ---------- */

/**
 * addPendingReview(newReview)
 * newReview: objet contenant au moins : rating, comment (optionnel), reservationObj or reservationId/carpool reference
 * stocke et garde un historique borné. Ajoute métadonnées _ts et _seq.
 */
export function addPendingReview(newReview = {}) {
  try {
    const r = Object.assign({}, newReview);
    if (!r._ts) r._ts = Date.now();
    if (!r._seq) r._seq = nextSeq();

    let messages = getStoredMessages();
    if (!Array.isArray(messages)) messages = [];

    // dédup basique : si id identique, remplacer
    if (r.id) messages = messages.filter(m => m.id !== r.id);

    messages.push(r);

    // tri par date puis seq (plus récent first)
    messages.sort((a, b) => {
      const ta = Number(a._ts || 0), tb = Number(b._ts || 0);
      if (tb !== ta) return tb - ta;
      return (Number(b._seq || 0) - Number(a._seq || 0));
    });

    // limiter
    messages = messages.slice(0, MAX_STORED);

    storeMessages(messages);
    // event pour debug / UI
    try { window.dispatchEvent(new CustomEvent('ecoride:pending-reviews-changed', { detail: { count: messages.length } })); } catch (e) {}
    return messages;
  } catch (e) {
    console.error('pending-reviews.addPendingReview error', e);
    return null;
  }
}

/**
 * getPendingReviewsSorted(desc = true) -> retourne la liste triée (desc par défaut)
 */
export function getPendingReviewsSorted(desc = true) {
  const msgs = getStoredMessages();
  msgs.sort((a, b) => {
    const ta = Number(a._ts || 0), tb = Number(b._ts || 0);
    if (tb !== ta) return tb - ta;
    return (Number(b._seq || 0) - Number(a._seq || 0));
  });
  return desc ? msgs : msgs.reverse();
}

/**
 * retryPendingReviews(options)
 * options: { delayBetween: ms, onSuccess: fn(review), onFail: fn(review, err) }
 * renvoie la liste restante après tentative
 */
export async function retryPendingReviews(options = {}) {
  const messages = getStoredMessages();
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const remaining = [];
  const failedInvalid = JSON.parse(localStorage.getItem(FAILED_REVIEWS_KEY) || '[]');

  for (const m of messages) {
    // validité minimale : doit avoir un carpool reference (pour éviter boucle infinie)
    const hasCarpool = !!(m.carpool || m.carpoolIri || m.carpoolId || (m.reservationObj && (m.reservationObj.carpool || m.reservationObj.covoiturage || m.reservationObj.covoId)));
    if (!hasCarpool) {
      // archiver en invalid
      failedInvalid.push({ pending: m, error: 'missing carpool', when: new Date().toISOString() });
      continue;
    }

    try {
      await doCreateReview({ reservationObj: m.reservationObj || m.reservation || null, rating: m.rating, comment: m.comment });
      if (options.onSuccess) try { options.onSuccess(m); } catch (e) { console.warn('pending-reviews.onSuccess failed', e); }
      if (options.delayBetween) await new Promise(r => setTimeout(r, options.delayBetween));
    } catch (err) {
      const status = err && err.status ? err.status : null;
      if (status === 400) {
        // invalide -> archiver
        failedInvalid.push({ pending: m, error: err.body || err.message || String(err), when: new Date().toISOString() });
        if (options.onFail) try { options.onFail(m, err); } catch (e) {}
        continue;
      }
      // autres erreurs -> garder pour retenter plus tard
      remaining.push(m);
      if (options.onFail) try { options.onFail(m, err); } catch (e) { console.warn('pending-reviews.onFail failed', e); }
    }
  }

  try {
    localStorage.setItem(FAILED_REVIEWS_KEY, JSON.stringify(failedInvalid));
  } catch (e) { console.warn('pending-reviews: cannot write failed list', e); }

  storeMessages(remaining);
  try { window.dispatchEvent(new CustomEvent('ecoride:pending-reviews-changed', { detail: { count: remaining.length } })); } catch (e) {}
  return remaining;
}

/**
 * migratePendingReviews()
 * migration utility to transform legacy snapshots into fields expected by retry logic.
 */
export function migratePendingReviews() {
  const msgs = getStoredMessages();
  if (!Array.isArray(msgs) || msgs.length === 0) return { migrated: 0, total: 0 };

  let migrated = 0;
  const out = msgs.map(m => {
    const copy = Object.assign({}, m);
    // cas legacy où reservationObjSnapshot.covoiturage existait
    const snap = copy.reservationObjSnapshot || copy.reservationSnapshot || null;
    if (snap && snap.covoiturage && !copy.carpool) {
      copy.carpool = snap.covoiturage;
      migrated++;
    }
    // autres heuristiques : if covoId present but not carpoolIri -> set carpool
    if (!copy.carpool && (copy.covoId || copy.covo)) {
      const raw = copy.covoId || copy.covo;
      copy.carpool = (String(raw).includes('/api/')) ? String(raw) : `/api/carpools/${raw}`;
      migrated++;
    }
    return copy;
  });

  storeMessages(out);
  return { migrated, total: msgs.length };
}

/* ---------- Expose for debug/compat ---------- */
export default {
  addPendingReview,
  getPendingReviewsSorted,
  retryPendingReviews,
  migratePendingReviews,
  getStoredMessages,
  storeMessages
};