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
async function doCreateReview({ reservationObj, rating, comment } = {}) {
  // 1. Préparation du payload selon l'entité Review.php
  const payload = {
    rating: Number(rating),
    comment: comment || null,
    // IMPORTANT : Utiliser "carpool" et "booking" (noms des propriétés PHP)
    carpool: reservationObj.carpoolIri || reservationObj.carpool || null,
    booking: reservationObj.bookingIri || reservationObj.booking || null
  };

  // 2. Sécurité : carpool est requis par l'entité (JoinColumn nullable=false)
  if (!payload.carpool) {
     throw new Error("doCreateReview: Le champ carpool est obligatoire.");
  }

  const token = localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || '';
  const headers = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log('🚀 Retry Review Payload:', payload);

  const res = await fetch('/api/reviews', { 
    method: 'POST', 
    headers, 
    body: JSON.stringify(payload) 
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return JSON.parse(text);
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
 * options: { delayBetween: ms, onSuccess: fn(review), onFail: fn(review, err), maxAttempts: number }
 * renvoie la liste restante après tentative
 */
export async function retryPendingReviews(options = {}) {
  const messages = getStoredMessages();
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const remaining = [];
  const failedInvalid = JSON.parse(localStorage.getItem(FAILED_REVIEWS_KEY) || '[]');

  const maxAttempts = typeof options.maxAttempts === 'number' ? options.maxAttempts : 3;

  for (const m of messages) {
    // validité minimale : doit avoir un carpool reference (pour éviter boucle infinie)
    const hasCarpool = !!(
      m.carpool ||
      m.carpoolIri ||
      m.carpoolId ||
      (m.reservationObj && (m.reservationObj.carpool || m.reservationObj.covoiturage || m.reservationObj.covoId))
    );
    if (!hasCarpool) {
      // archiver en invalid
      failedInvalid.push({ pending: m, error: 'missing carpool', when: new Date().toISOString() });
      continue;
    }

    // increment local attempt counter (non-destructive)
    m.attemptCount = (m.attemptCount || 0) + 1;

    try {
      // --- build a reservationObj fallback from pending record if not present
      const reservationObjForRetry = (m.reservationObj || m.reservation) ? { ...(m.reservationObj || m.reservation) } : {};

      // prefer bookingIri/carpoolIri top-level fields if present
      if (!reservationObjForRetry.bookingIri && (m.bookingIri || m.booking)) {
        reservationObjForRetry.bookingIri = m.bookingIri || m.booking;
      }
      if (!reservationObjForRetry.carpoolIri && (m.carpoolIri || m.carpool || m.covo || m.covoId)) {
        reservationObjForRetry.carpoolIri = m.carpoolIri || m.carpool || m.covo || m.covoId;
      }
      // also keep a simple covoId/covo field if present (used by many helpers)
      if (!reservationObjForRetry.covoId && (m.covoId || m.covo)) {
        reservationObjForRetry.covoId = m.covoId || m.covo;
      }

      console.log('retryPendingReviews: attempting send pending review', {
        seq: m._seq, id: m.id, attempt: m.attemptCount, reservationObj: reservationObjForRetry, bookingIri: m.bookingIri, carpoolIri: m.carpoolIri
      });

      // Défensif : passe aussi bookingIri / carpoolIri au cas où doCreateReview les accepte
      await doCreateReview({
        reservationObj: reservationObjForRetry,
        rating: m.rating,
        comment: m.comment,
        bookingIri: reservationObjForRetry.bookingIri || m.bookingIri,
        carpoolIri: reservationObjForRetry.carpoolIri || m.carpoolIri
      });

      // succès : appeler callback et ne pas remettre dans remaining
      if (options.onSuccess) {
        try { options.onSuccess(m); } catch (e) { console.warn('pending-reviews.onSuccess failed', e); }
      }

      // dispatch global pour synchroniser l'UI
      try {
        const bookingIri = m.bookingIri || (m.reservationObj && (m.reservationObj.bookingIri || m.reservationObj.serverBookingIri)) || null;
        const carpoolIri = m.carpoolIri || m.carpool || (m.reservationObj && (m.reservationObj.carpoolIri || m.reservationObj.covoId)) || null;
        window.dispatchEvent(new CustomEvent('ecoride:review-saved', { detail: { bookingIri, carpoolIri, pending: m } }));
      } catch (e) {
        console.warn('retryPendingReviews: dispatch review-saved failed', e);
      }

      if (options.delayBetween) await new Promise(r => setTimeout(r, options.delayBetween));
    } catch (err) {
      // extraire un status/body si possible (fetch/axios custom)
      const status = err && (err.status || (err.response && err.response.status)) ? (err.status || err.response.status) : null;
      const body = err && (err.body || (err.response && err.response.data) || err.message) ? (err.body || (err.response && err.response.data) || err.message) : String(err);

      console.warn('retryPendingReviews: error sending', { id: m.id, attempt: m.attemptCount, status, body });

      // si erreur 400 => invalide, archiver
      if (status === 400) {
        failedInvalid.push({ pending: m, error: body || '400 Bad Request', when: new Date().toISOString() });
        if (options.onFail) try { options.onFail(m, err); } catch (e) { console.warn('pending-reviews.onFail failed', e); }
        continue;
      }

      // si dépassement du nombre max de tentatives => archiver pour inspection
      if (m.attemptCount >= maxAttempts) {
        failedInvalid.push({ pending: m, error: `max attempts reached (${m.attemptCount})`, lastError: body, when: new Date().toISOString() });
        if (options.onFail) try { options.onFail(m, err); } catch (e) { console.warn('pending-reviews.onFail failed', e); }
        continue;
      }

      // autres erreurs -> garder pour retenter plus tard
      // enrichir l'objet pending avec lastError pour debug futur
      m.lastError = body;
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