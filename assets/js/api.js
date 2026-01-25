// /assets/js/api.js

// Détermine automatiquement la base API en dev (frontend dev server :3000 -> backend :8000)
// En production, on garde les chemins relatifs (API_BASE = '') pour que le backend qui sert le front gère les routes.
export const API_BASE = (function() {
  try {
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === '127.0.0.1' || host === 'localhost') && port === '3000') {
      return 'http://127.0.0.1:8000';
    }
  } catch (e) {
    // safe fallback
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

// Expose temporairement pour tests console (utile pour debug dans Safari/Chrome)
window.apiFetch = apiFetch;