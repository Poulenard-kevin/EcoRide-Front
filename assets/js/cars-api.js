// assets/js/cars-api.js
// Module autonome pour gérer les appels API /cars (ApiPlatform)
// Expose window.ecorideCarsApi
(function (global) {
    if (!global) return;
    if (global.ecorideCarsApi) return; // idempotent
  
    // Config
    const DEFAULT_API_BASE = 'http://127.0.0.1:8000/api';
    let API_BASE = DEFAULT_API_BASE;
  
    function setApiBase(url) {
      if (typeof url === 'string' && url.trim()) API_BASE = url.replace(/\/+$/, '');
    }
  
    // Auth helper (integrate with window.ecoAuth if available)
    async function getAuthToken() {
      try {
        if (global.ecoAuth && typeof global.ecoAuth.getToken === 'function') {
          const t = await global.ecoAuth.getToken();
          if (t) return t;
        }
      } catch (e) { /* ignore */ }
      try {
        return localStorage.getItem('api_token') || localStorage.getItem('ecoride_token') || null;
      } catch (e) { return null; }
    }
  
    async function buildAuthHeaders() {
      const token = await getAuthToken();
      return token ? { 'Authorization': 'Bearer ' + token } : {};
    }
  
    // Mapping helpers
    function vehicleFromApi(apiCar) {
      if (!apiCar) return null;
      return {
        id: apiCar.id ?? null,
        plate: apiCar.registration ?? '',
        firstRegistration: apiCar.firstRegistration ?? apiCar.registrationDate ?? null,
        marque: apiCar.brand ?? '',
        model: apiCar.model ?? '',
        color: apiCar.color ?? '',
        type: apiCar.fuelType ?? '',
        seats: apiCar.seats ?? null,
        preferences: apiCar.driverPreferences ?? [],
        other: apiCar.otherPreferences ?? '',
        rawApi: apiCar
      };
    }
  
    // Mapping helpers
    function vehicleFromApi(apiCar) {
        if (!apiCar) return null;
        return {
          id: apiCar.id ?? null,
          plate: apiCar.registration ?? '',
          firstRegistration: apiCar.firstRegistration ?? apiCar.registrationDate ?? null,
          marque: apiCar.brand ?? '',
          model: apiCar.model ?? '',
          color: apiCar.color ?? '',
          type: apiCar.fuelType ?? '',
          seats: apiCar.seats ?? null,
          preferences: apiCar.driverPreferences ?? [],
          other: apiCar.otherPreferences ?? '',
          rawApi: apiCar
        };
      }
    
      function vehicleToApiPayload(v) {
        const payload = {
          brand: v.marque ?? v.brand ?? '',
          model: v.model ?? '',
          color: v.color ?? '',
          fuelType: v.type ?? v.fuelType ?? '',
          registration: v.plate ?? v.registration ?? '',
          seats: v.seats ? Number(v.seats) : null,
          driverPreferences: Array.isArray(v.preferences) ? v.preferences : (v.driverPreferences || []),
          otherPreferences: v.other ?? v.otherPreferences ?? ''
        };
      
        if (v.firstRegistration !== undefined && v.firstRegistration !== null && v.firstRegistration !== '') {
          payload.firstRegistration = v.firstRegistration;
        }
      
        return payload;
      }
        
  
    // Generic fetch wrapper (throws on non-ok)
    async function fetchJson(url, opts = {}) {
      const resp = await fetch(url, opts);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        const err = new Error(`HTTP ${resp.status} ${resp.statusText} - ${txt}`);
        err.status = resp.status;
        err.responseText = txt;
        throw err;
      }
      // no content
      if (resp.status === 204 || resp.status === 205) return null;
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return resp.json();
      return resp.text();
    }
  
    // API functions
    async function apiGetCars() {
      const headers = { 'Accept': 'application/json', ...(await buildAuthHeaders()) };
      const data = await fetchJson(`${API_BASE}/cars`, { method: 'GET', headers, credentials: 'same-origin' });
      if (Array.isArray(data)) return data.map(vehicleFromApi);
      if (data && data['hydra:member']) return data['hydra:member'].map(vehicleFromApi);
      if (data && typeof data === 'object') return [vehicleFromApi(data)];
      return [];
    }
  
    async function apiGetCar(id) {
      if (!id) throw new Error('apiGetCar: id required');
      const headers = { 'Accept': 'application/json', ...(await buildAuthHeaders()) };
      const data = await fetchJson(`${API_BASE}/cars/${id}`, { method: 'GET', headers, credentials: 'same-origin' });
      return vehicleFromApi(data);
    }
  
    async function apiCreateCar(vehicle) {
      const headersBase = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(await buildAuthHeaders()) };
      const payload = vehicleToApiPayload(vehicle);
      const data = await fetchJson(`${API_BASE}/cars`, {
        method: 'POST',
        headers: headersBase,
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
      return vehicleFromApi(data);
    }
  
    // SAFE PUT : GET -> merge -> PUT
    async function apiUpdateCar(id, vehicle) {
        if (!id) throw new Error('apiUpdateCar: id required');
    
        const buildHeaders = async () => ({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(await buildAuthHeaders())
        });
    
        const payload = vehicleToApiPayload(vehicle);
    
        // Nettoie clés JSON-LD/Hydra avant PUT
        const cleanServerData = (obj) => {
        const clone = Object.assign({}, obj);
        Object.keys(clone).forEach(k => {
            if (k.startsWith('@') || k.includes(':')) delete clone[k];
        });
        return clone;
        };
    
        // 1) Récupérer l'état courant côté serveur
        let serverData;
        try {
        serverData = await fetchJson(`${API_BASE}/cars/${id}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json', ...(await buildAuthHeaders()) },
            credentials: 'same-origin'
        });
        } catch (err) {
        console.error('apiUpdateCar: GET current resource failed', err);
        throw err;
        }
    
        // 2) Clean + merge (shallow merge : payload remplace serverData)
        const serverClean = cleanServerData(serverData);
        const merged = Object.assign({}, serverClean, payload);
    
        // 3) PUT merged representation (full update)
        try {
        const headers = await buildHeaders();
        const result = await fetchJson(`${API_BASE}/cars/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(merged),
            credentials: 'same-origin'
        });
        return vehicleFromApi(result);
        } catch (err) {
        console.error('apiUpdateCar: PUT failed', err);
        throw err;
        }
    }
  
    async function apiDeleteCar(id) {
      if (!id) throw new Error('apiDeleteCar: id required');
      const headers = { ...(await buildAuthHeaders()) };
      await fetchJson(`${API_BASE}/cars/${id}`, { method: 'DELETE', headers, credentials: 'same-origin' });
      return true;
    }
  
    // Simple sync helper: attempt to refresh local cache key
    async function refreshLocalCache(key = 'ecoride_vehicles') {
      try {
        const arr = await apiGetCars();
        try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { console.warn('refreshLocalCache: write fail', e); }
        return arr;
      } catch (e) {
        console.warn('refreshLocalCache failed', e);
        // fallback read LS
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (err) { return []; }
      }
    }
  
    // Expose API
    const api = {
      setApiBase,
      getApiBase: () => API_BASE,
      getAuthToken,
      vehicleFromApi,
      vehicleToApiPayload,
      apiGetCars,
      apiGetCar,
      apiCreateCar,
      apiUpdateCar,
      apiDeleteCar,
      refreshLocalCache
    };
  
    // Attach to global
    global.ecorideCarsApi = api;
    // CommonJS/AMD compatibility (minimal)
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
  
  })(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));