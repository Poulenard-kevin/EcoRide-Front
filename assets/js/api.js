// /assets/js/api.js

export const API_BASE = 'http://127.0.0.1:8000';
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
    try { body = text ? JSON.parse(text) : null; } catch(e) { body = text; }
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

export async function apiFetch(path, { method = 'GET', body, headers = {}, useApiKey = false } = {}) {
  // Normaliser le path : ajouter /api automatiquement si absent
  let normalizedPath = path;
  
  // Si le path ne commence pas par http et ne commence pas déjà par /api, on préfixe
  if (!path.startsWith('http') && !path.startsWith('/api')) {
    normalizedPath = `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  
  // Construire l'URL finale
  const url = normalizedPath.startsWith('http') 
    ? normalizedPath 
    : `${API_BASE}${normalizedPath}`;

  
  const h = { Accept: 'application/json', ...headers };

  // Si body est un objet JS, on le stringifie et on ajoute Content-Type
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

  // Mode credentials : par défaut 'same-origin'
  const credentials = 'include'; 

  const res = await fetch(url, {
    method,
    headers: h,
    body: finalBody,
    credentials
  });

  return handleResponse(res);
}

// Expose temporairement pour tests console
window.apiFetch = apiFetch;
