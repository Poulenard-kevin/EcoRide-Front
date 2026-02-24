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

  // Enregistre le token
  setToken(token);

  // Si la réponse login contient déjà l'objet user, on le sauvegarde immédiatement
  const possibleUser =
    body?.user ??
    body?.data?.user ??
    body?.me ??
    body?.data?.me ??
    null;

  if (possibleUser) {
    try {
      localStorage.setItem('ecoride_user', JSON.stringify(possibleUser));
      console.log('[auth-client] user saved from login response into localStorage');
    } catch (e) {
      console.warn('[auth-client] failed to save user in localStorage', e);
    }
  }

  // Forcer le refresh du profil pour remplir correctement localStorage et l'UI
  try {
    if (window.ecoAuth && typeof window.ecoAuth.refresh === 'function') {
      await window.ecoAuth.refresh();
      console.log('[auth-client] window.ecoAuth.refresh() done');
    } else if (window.ecoAuth && typeof window.ecoAuth.fetchMe === 'function') {
      await window.ecoAuth.fetchMe();
      console.log('[auth-client] window.ecoAuth.fetchMe() done');
    } else {
      console.warn('[auth-client] no ecoAuth.refresh/fetchMe available');
    }
  } catch (e) {
    console.warn('[auth-client] profile refresh after login failed', e);
  }

  return token;
}

export function logout() {
  setToken(null);
  try { localStorage.removeItem('ecoride_user'); } catch (e) {}
  try { localStorage.removeItem('ecoride_trajets_cache'); } catch (e) {}
  // Option : vider sessionStorage si tu y stockes quelque chose
  try { sessionStorage.clear(); } catch (e) {}
}