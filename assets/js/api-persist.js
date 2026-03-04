// assets/js/api-persist.js
(function () {
  // utilise d'abord une fonction runtime partagée si disponible (importée/exposée par api.js)
  function getApiBase() {
    try {
      if (typeof window !== 'undefined' && typeof window.getApiBase === 'function') {
        return String(window.getApiBase() || '').replace(/\/+$/, '');
      }
    } catch (e) { /* ignore */ }

    // ensuite essayer les variables globales connues (compat)
    try {
      const maybe = (typeof window !== 'undefined' && (window.__API_BASE || window.API_BASE));
      if (maybe) return String(maybe).replace(/\/+$/, '');
    } catch (e) { /* ignore */ }

    // dernier recours : ne pas forcer un host local en production, renvoyer chaîne vide
    return '';
  }

  // utilise window.getToken() si exposée par api.js, sinon fallback sur localStorage
  function getTokenFallback() {
    try {
      if (typeof window !== 'undefined' && typeof window.getToken === 'function') {
        return window.getToken();
      }
      if (typeof window !== 'undefined' && typeof window.getAuthToken === 'function') {
        return window.getAuthToken();
      }
      const tApi = localStorage.getItem('api_token');
      if (tApi) return tApi;
      const tLS = localStorage.getItem('ecoride_token');
      if (tLS) return tLS;
      const rawUser = localStorage.getItem('ecoride_user');
      if (rawUser) {
        const u = JSON.parse(rawUser || '{}');
        return u?.apiToken ?? u?.token ?? u?.access_token ?? null;
      }
    } catch (e) { console.warn('getTokenFallback error', e); }
    return null;
  }

  function getCurrentUserIdFallback() {
    try {
      if (typeof window !== 'undefined' && typeof window.getCurrentUserId === 'function') {
        return window.getCurrentUserId();
      }
      const raw = localStorage.getItem('ecoride_user');
      if (!raw) return null;
      const u = JSON.parse(raw || '{}');
      return u?.id ?? u?.userId ?? u?._id ?? null;
    } catch (e) { console.warn('getCurrentUserIdFallback error', e); return null; }
  }

  async function parseResponse(response) {
    const text = await response.text().catch(() => '');
    try {
      return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, text };
    } catch {
      return { ok: response.ok, status: response.status, data: null, text };
    }
  }

  // Upload avatar : n'ajoute pas Content-Type (FormData gère cela automatiquement)
  async function uploadAvatar(userId, file, token = null) {
    token = token ?? getTokenFallback();
    if (!userId) throw new Error('uploadAvatar: userId manquant');
    if (!file) throw new Error('uploadAvatar: file manquant');

    const fd = new FormData();
    fd.append('avatar', file);

    const opts = {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: {}
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${getApiBase() || ''}/api/users/${encodeURIComponent(userId)}/avatar`, opts);
    const parsed = await parseResponse(res);
    if (!parsed.ok) throw new Error(`Upload failed: ${parsed.status} ${parsed.text || ''}`);
    return parsed.data;
  }

  async function deleteAvatar(userId, token = null) {
    token = token ?? getTokenFallback();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${getApiBase() || ''}/api/users/${encodeURIComponent(userId)}/avatar`, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });
    const parsed = await parseResponse(res);
    if (!parsed.ok) throw new Error(`Delete failed: ${parsed.status} ${parsed.text || ''}`);
    return parsed.data;
  }

  async function saveAbout(userId, aboutText, token = null) {
    token = token ?? getTokenFallback();
    const headers = {
      'Content-Type': 'application/merge-patch+json',
      'Accept': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${getApiBase() || ''}/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ about: aboutText })
    });

    const parsed = await parseResponse(res);
    if (!parsed.ok) throw new Error(`Save about failed: ${parsed.status} ${parsed.text || ''}`);
    return parsed.data;
  }

  // Expose the helpers on window for reuse
  if (typeof window !== 'undefined') {
    window.apiPersist = {
      uploadAvatar,
      deleteAvatar,
      saveAbout,
      getTokenFallback,
      getCurrentUserIdFallback,
      getApiBase
    };
  }
})();