// /assets/js/api.js

// Détermine automatiquement la base API en dev (frontend dev server :3000 -> backend :8000)
// En production, on garde les chemins relatifs (API_BASE = '') pour que le backend qui sert le front gère les routes.
export const API_BASE = (function() {
  const h = window.location.hostname;
  const p = window.location.port;
  // Si on est sur le port 3000 (Front), on vise le 8000 (Back)
  if (p === '3000') {
    return `http://${h}:8000`; // Utilise le même hostname (localhost ou 127.0.0.1)
  }
  return '';
})();

const API_PREFIX = '/api'; // préfixe automatique pour toutes les routes API Platform

export function setToken(token) {
  if (token) localStorage.setItem('api_token', token);
  else localStorage.removeItem('api_token');
}

export function getToken() {
  return localStorage.getItem('api_token');
}

export async function handleResponse(res) {
  const status = res.status;
  let body = null;
  if (status !== 204) {
    const text = await res.text().catch(() => '');
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      // si ce n'est pas du JSON, on laisse le texte brut
      body = text;
    }
  }

  if (!res.ok) {
    console.error('API error response:', status, body);
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * apiFetch
 * - path : chemin relatif (ex: '/carpools' ou 'carpools') ou URL absolue (commençant par http)
 * - options : { method = 'GET', body, headers = {}, useApiKey = false }
 *
 * Comportement :
 * - Si path ne commence pas par 'http' et ne commence pas par '/api', on préfixe automatiquement avec API_PREFIX.
 * - Construit l'URL finale en préfixant par API_BASE si défini (dev). Si API_BASE est vide, on utilise le path relatif.
 * - Injecte le token (Bearer ou X-AUTH-TOKEN selon useApiKey).
 * - Gère JSON stringify / Content-Type automatiquement.
 */
export async function apiFetch(path, { method = 'GET', body, headers = {}, useApiKey = false } = {}) {
  // Normaliser le path : ajouter /api automatiquement si absent
  let normalizedPath = path;

  if (!path.startsWith('http') && !path.startsWith('/api')) {
    normalizedPath = `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  // Construire l'URL finale
  const url = normalizedPath.startsWith('http')
    ? normalizedPath
    : (API_BASE ? `${API_BASE}${normalizedPath}` : normalizedPath);

  const h = { Accept: 'application/json', ...headers };

  // Si body est un objet JS, on le stringifie et on ajoute Content-Type si absent
  let finalBody = body;
  const isObject = body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob);
  const hasContentType = Object.keys(h).some(k => k.toLowerCase() === 'content-type');

  if (isObject && !hasContentType) {
    h['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  // Ajouter le token
  const token = getToken();
  if (token) {
    h[useApiKey ? 'X-AUTH-TOKEN' : 'Authorization'] = useApiKey ? token : `Bearer ${token}`;
  }

  // Par défaut inclure les cookies (utile si vous utilisez des sessions côté backend)
  const credentials = 'include';

  const res = await fetch(url, {
    method,
    headers: h,
    body: finalBody,
    credentials
  });

  return handleResponse(res);
}

export function initReviewsCleanup({ backendBaseOverride = null, intervalMinutes = 60, useCredentials = false } = {}) {
  if (typeof window === 'undefined') return; // SSR safe

  const DEFAULT_BACKEND_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/,'') : '';
  function getToken() { return localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null; }
  function buildBackendBase(override) {
    if (override) return override.replace(/\/+$/,'');
    if (DEFAULT_BACKEND_BASE) return DEFAULT_BACKEND_BASE;
    return window.location.origin;
  }

  async function resourceExists(backendBase, iri, { token, useCredentials } = {}) {
    if (!iri) return true;
    let path = String(iri);
    if (!path.startsWith('/')) path = '/' + path;
    const url = backendBase.replace(/\/+$/,'') + path;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(token && !useCredentials ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(useCredentials ? { credentials: 'include' } : {})
      });
      return res.status === 200;
    } catch (e) { console.warn('resourceExists fetch failed', url, e); return false; }
  }

  async function normalizeAndPurgeKey(key, backendBase, options) {
    const raw = localStorage.getItem(key);
    if (!raw) return { kept: 0, removed: 0 };
    let arr;
    try { arr = JSON.parse(raw || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr) || arr.length === 0) return { kept: 0, removed: 0 };
    const token = getToken();
    const kept = [];
    let removed = 0;
    for (const item of arr) {
      const data = item.pending || item;
      const carpoolIri = data.carpoolIri || data.carpool || (data.reservationObj && (data.reservationObj.carpoolIri || data.reservationObj.covo || data.reservationObj.covoId)) || null;
      const bookingIri = data.bookingIri || data.booking || (data.reservationObj && (data.reservationObj.bookingIri || data.reservationObj.serverId)) || null;
      const norm = (iri, type) => {
        if (!iri) return null;
        const s = String(iri);
        if (s.startsWith('/api/')) return s;
        const m = s.match(/^(\d+)$/);
        if (m) return `/api/${type}/${m[1]}`;
        return s.startsWith('/') ? s : `/${s}`;
      };
      const carpoolNorm = norm(carpoolIri, 'carpools');
      const bookingNorm = norm(bookingIri, 'bookings');
      const needCarpoolCheck = !!carpoolNorm;
      const needBookingCheck = !!bookingNorm;
      let carpoolOk = true, bookingOk = true;
      if (needCarpoolCheck) carpoolOk = await resourceExists(backendBase, carpoolNorm, { token, useCredentials });
      if (needBookingCheck) bookingOk = await resourceExists(backendBase, bookingNorm, { token, useCredentials });
      const keep = (!needCarpoolCheck && !needBookingCheck) ? false
        : ((needCarpoolCheck && needBookingCheck) ? (carpoolOk && bookingOk)
        : (needCarpoolCheck ? carpoolOk : bookingOk));
      if (keep) kept.push(item);
      else { removed++; console.info('[reviews-cleanup] removed orphan', { item, carpoolNorm, bookingNorm, carpoolOk, bookingOk }); }
    }
    localStorage.setItem(key, JSON.stringify(kept));
    return { kept: kept.length, removed };
  }

  async function runCleanupOnce({ backendBaseOverride = null, useCredentials: uc = useCredentials } = {}) {
    const backendBase = buildBackendBase(backendBaseOverride);
    try {
      const keys = ['ecoride_reviews_pending', 'ecoride_reviews_failed'];
      let totalKept = 0, totalRemoved = 0;
      for (const key of keys) {
        const res = await normalizeAndPurgeKey(key, backendBase, { useCredentials: uc });
        totalKept += res.kept; totalRemoved += res.removed;
      }
      console.log(`[reviews-cleanup] done. kept=${totalKept} removed=${totalRemoved}`);
    } catch (e) { console.error('[reviews-cleanup] erreur', e); }
  }

  function scheduleCleanup({ intervalMinutes: im = intervalMinutes, backendBaseOverride = null, useCredentials: uc = useCredentials } = {}) {
    runCleanupOnce({ backendBaseOverride, useCredentials: uc });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runCleanupOnce({ backendBaseOverride, useCredentials: uc });
    });
    const ms = Math.max(1, im) * 60 * 1000;
    setInterval(() => runCleanupOnce({ backendBaseOverride, useCredentials: uc }), ms);
  }

  // Expose helpers
  window.ecoride_cleanup_reviews = { run: runCleanupOnce, schedule: scheduleCleanup };

  // Start scheduling with provided options
  scheduleCleanup({ intervalMinutes, backendBaseOverride, useCredentials });
}

// Expose temporairement pour tests console (utile pour debug dans Safari/Chrome)
window.apiFetch = apiFetch;