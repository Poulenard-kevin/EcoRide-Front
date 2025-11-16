// /assets/js/api.js
const API_BASE = 'http://127.0.0.1:8000/api';

export function setToken(token) {
  if (token) localStorage.setItem('api_token', token);
  else localStorage.removeItem('api_token');
}

export function getToken() {
  return localStorage.getItem('api_token');
}

async function handleResponse(res) {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') && text ? JSON.parse(text) : text;
  if (!res.ok) {
    const err = new Error(body?.message || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiFetch(path, { method = 'GET', body, headers = {}, useApiKey = false } = {}) {
  const token = getToken();
  const h = { Accept: 'application/json', ...headers };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  if (token) {
    h[useApiKey ? 'X-AUTH-TOKEN' : 'Authorization'] = useApiKey ? token : `Bearer ${token}`;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers: h,
    body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
  });
  return handleResponse(res);
}