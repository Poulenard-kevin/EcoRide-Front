// assets/js/api-persist.js
(function () {
    const API_BASE = 'http://127.0.0.1:8000'; // adapte si besoin
  
    function getTokenFallback() {
        try {
          if (typeof window.getAuthToken === 'function') return window.getAuthToken();
          const tApi = localStorage.getItem('api_token');
          if (tApi) return tApi;
          const tLS = localStorage.getItem('ecoride_token');
          if (tLS) return tLS;
          const rawUser = localStorage.getItem('ecoride_user');
          if (rawUser) {
            const u = JSON.parse(rawUser);
            return u?.apiToken ?? u?.token ?? u?.access_token ?? null;
          }
        } catch (e) { console.warn('getTokenFallback error', e); }
        return null;
    }
  
    function getCurrentUserIdFallback() {
      try {
        if (typeof window.getCurrentUserId === 'function') return window.getCurrentUserId();
        const raw = localStorage.getItem('ecoride_user');
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u?.id ?? u?.userId ?? u?._id ?? null;
      } catch (e) { console.warn('getCurrentUserIdFallback error', e); return null; }
    }
  
    async function parseResponse(response) {
      const text = await response.text();
      try { return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, text }; }
      catch { return { ok: response.ok, status: response.status, data: null, text }; }
    }
  
    async function uploadAvatar(userId, file, token = null) {
      token = token ?? getTokenFallback();
      if (!userId) throw new Error('uploadAvatar: userId manquant');
      if (!file) throw new Error('uploadAvatar: file manquant');
  
      const fd = new FormData();
      fd.append('avatar', file);
  
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
  
      const res = await fetch(`${API_BASE}/api/users/${userId}/avatar`, { method: 'POST', headers, body: fd });
      const parsed = await parseResponse(res);
      if (!parsed.ok) throw new Error(`Upload failed: ${parsed.status}`);
      return parsed.data;
    }
  
    async function deleteAvatar(userId, token = null) {
      token = token ?? getTokenFallback();
      if (!userId) throw new Error('deleteAvatar: userId manquant');
  
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
  
      const res = await fetch(`${API_BASE}/api/users/${userId}/avatar`, { method: 'DELETE', headers });
      const parsed = await parseResponse(res);
      if (!parsed.ok) throw new Error(`Delete failed: ${parsed.status}`);
      return parsed.data;
    }
  
    async function saveAbout(userId, aboutText, token = null) {
      token = token ?? getTokenFallback();
      if (!userId) throw new Error('saveAbout: userId manquant');
    
      const headers = {
        'Content-Type': 'application/merge-patch+json',
        'Accept': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
    
      const res = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ about: aboutText })
      });
      const parsed = await parseResponse(res);
      if (!parsed.ok) throw new Error(`Save about failed: ${parsed.status}`);
      return parsed.data;
    }
  
    window.apiPersist = { uploadAvatar, deleteAvatar, saveAbout, getTokenFallback, getCurrentUserIdFallback, API_BASE };
  })();