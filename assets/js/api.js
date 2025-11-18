// /assets/js/api.js
const API_BASE = 'http://127.0.0.1:8000/api';

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
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    err.body = body;
    throw err;
  }

  // Si le body contient déjà l'IRI ou id, le retourner
  if (body && (body['@id'] || body.id)) return body;

  // Sinon essayer de récupérer l'IRI depuis les headers Location / Content-Location
  const loc = res.headers.get('content-location') || res.headers.get('location');
  if (loc) {
    // Normaliser en IRI (ex: "/api/carpools/65")
    return { '@id': loc, status };
  }

  // No Content
  if (status === 204) return { status: 204 };

  // fallback
  return body;
}

// assets/js/api.js
export async function apiFetch(path, { method = 'GET', body, headers = {}, useApiKey = false } = {}) {
  const token = getToken();

  // Merge headers et garder la casse d'origine si l'appelant a fourni Content-Type
  const h = { Accept: 'application/json', ...headers };

  // Détecter s'il y a déjà un Content-Type (insensible à la casse)
  const ctKey = Object.keys(h).find(k => k.toLowerCase() === 'content-type');
  const hasContentType = Boolean(ctKey);

  // Préparer le body final : stringifier uniquement si c'est un objet (et pas FormData/Blob)
  let finalBody = body;
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    if (!hasContentType) {
      // Par défaut JSON si l'appelant n'a pas précisé
      h['Content-Type'] = 'application/json';
    }
    finalBody = JSON.stringify(body);
  } else {
    // si l'appelant avait déjà stringifié (string) ou pas d'objet -> on laisse tel quel
    finalBody = body;
  }

  // Ajouter le token après la résolution des headers
  if (token) {
    h[useApiKey ? 'X-AUTH-TOKEN' : 'Authorization'] = useApiKey ? token : `Bearer ${token}`;
  }

  // Déterminer le mode credentials
  const credentialsMode = token && !useApiKey ? 'omit' : 'include';

  // Appel fetch
  const res = await fetch(API_BASE + path, {
    method,
    headers: h,
    body: finalBody,
    credentials: credentialsMode
  });

  return handleResponse(res);
}

// Expose temporairement pour tests console
window.apiFetch = apiFetch;
