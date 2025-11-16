// /assets/js/auth-client.js
import { apiFetch, setToken } from './api.js';

export async function login(email, password) {
  const body = await apiFetch('/login', {
    method: 'POST',
    body: { username: email, password }
  });

  const token = body?.token || body?.access_token;
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