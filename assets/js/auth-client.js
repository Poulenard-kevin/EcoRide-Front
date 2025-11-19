// /assets/js/auth-client.js
import { apiFetch, setToken } from './api.js';

export async function login(email, password) {
  console.log('[auth-client] login called for', email);

  const body = await apiFetch('/api/login', {
    method: 'POST',
    body: { email, password }
  });

  console.log('[auth-client] raw response body =', body);

  const token =
    body?.apiToken ??
    body?.token ??
    body?.access_token ??
    body?.data?.apiToken ??
    body?.data?.token ??
    body?.data?.access_token;

  console.log('[auth-client] extracted token =', token);

  if (!token) {
    const err = new Error(body?.message || 'Aucun token reçu');
    err.body = body;
    throw err;
  }

  setToken(token);
  return token;
}

export function logout() {
  setToken(null);
}