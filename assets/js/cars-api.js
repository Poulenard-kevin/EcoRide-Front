// assets/js/cars-api.js
// Module autonome pour gérer les appels API /cars (ApiPlatform)
// Expose window.ecorideCarsApi
(function (global) {
  if (!global) return;
  if (global.ecorideCarsApi) return; // idempotent

  // Override possible via setApiBase
  let overrideBase = null;

  // Retourne la base runtime sans trailing slash, NE PAS inclure '/api' ici.
  function getApiBase() {
    try {
      // priorité : fonction exposée par d'autres modules
      if (typeof global.getApiBase === 'function') {
        return String(global.getApiBase() || '').replace(/\/+$/, '');
      }
    } catch (e) { /* ignore */ }

    // override programmatique
    if (overrideBase) return String(overrideBase).replace(/\/+$/, '');

    // ensuite variables globales connues
    try {
      const maybe = (typeof window !== 'undefined' && (window.__API_BASE || window.API_BASE));
      if (maybe) return String(maybe).replace(/\/+$/, '');
    } catch (e) { /* ignore */ }

    // fallback : chaîne vide -> urls relatives (/api/...)
    return '';
  }

  function setApiBase(url) {
    if (typeof url === 'string' && url.trim()) {
      overrideBase = url.replace(/\/+$/, '');
    } else {
      overrideBase = null;
    }
  }

  // Construit une URL vers l'API. `endpoint` commence par / (ex: '/cars' ou '/cars/1')
  function buildApiUrl(endpoint) {
    const base = getApiBase();
    const apiPrefix = '/api';
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (!base) return `${apiPrefix}${normalizedEndpoint}`;
    return `${base}${apiPrefix}${normalizedEndpoint}`;
  }

  // Auth helper (integrate with window.ecoAuth or window.getToken if available)
  async function getAuthToken() {
    try {
      if (global.ecoAuth && typeof global.ecoAuth.getToken === 'function') {
        const t = await global.ecoAuth.getToken();
        if (t) return t;
      }
    } catch (e) { /* ignore */ }

    try {
      if (typeof global.getToken === 'function') {
        const t = await global.getToken();
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
    const fuel = apiCar.fuelType ?? apiCar.type_energie ?? apiCar.type ?? apiCar.energyType ?? '';
    return {
      id: apiCar.id ?? null,
      plate: apiCar.registration ?? apiCar.immatriculation ?? '',
      firstRegistration: apiCar.firstRegistration ?? apiCar.registrationDate ?? apiCar.first_registration ?? null,
      marque: apiCar.brand ?? apiCar.marque ?? '',
      model: apiCar.model ?? apiCar.modele ?? '',
      color: apiCar.color ?? apiCar.couleur ?? '',
      type: fuel,
      seats: apiCar.seats ?? apiCar.nb_places ?? null,
      preferences: apiCar.driverPreferences ?? apiCar.preferences_chauffeur ?? [],
      other: apiCar.otherPreferences ?? apiCar.autres_preferences ?? '',
      rawApi: apiCar
    };
  }

  function vehicleToApiPayload(v) {
    const value = v.type ?? v.fuelType ?? '';
    const payload = {
      brand: v.marque ?? v.brand ?? '',
      model: v.model ?? v.modele ?? '',
      color: v.color ?? v.couleur ?? '',
      fuelType: value,
      type_energie: value,
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
    if (resp.status === 204 || resp.status === 205) return null;
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return resp.json();
    return resp.text();
  }

  // API functions
  async function apiGetCars() {
    const headers = { 'Accept': 'application/json', ...(await buildAuthHeaders()) };
    const url = buildApiUrl('/cars');
    const data = await fetchJson(url, { method: 'GET', headers, credentials: 'include' });
    if (Array.isArray(data)) return data.map(vehicleFromApi);
    if (data && data['hydra:member']) return data['hydra:member'].map(vehicleFromApi);
    if (data && typeof data === 'object') return [vehicleFromApi(data)];
    return [];
  }

  async function apiGetCar(id) {
    if (!id) throw new Error('apiGetCar: id required');
    const headers = { 'Accept': 'application/json', ...(await buildAuthHeaders()) };
    const url = buildApiUrl(`/cars/${encodeURIComponent(id)}`);
    const data = await fetchJson(url, { method: 'GET', headers, credentials: 'include' });
    return vehicleFromApi(data);
  }

  async function apiCreateCar(vehicle) {
    const headersBase = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(await buildAuthHeaders()) };
    const payload = vehicleToApiPayload(vehicle);
    const url = buildApiUrl('/cars');
    const data = await fetchJson(url, {
      method: 'POST',
      headers: headersBase,
      body: JSON.stringify(payload),
      credentials: 'include'
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

    const cleanServerData = (obj) => {
      const clone = Object.assign({}, obj);
      Object.keys(clone).forEach(k => {
        if (k.startsWith('@') || k.includes(':')) delete clone[k];
      });
      return clone;
    };

    // 1) GET current resource
    let serverData;
    try {
      const urlGet = buildApiUrl(`/cars/${encodeURIComponent(id)}`);
      serverData = await fetchJson(urlGet, {
        method: 'GET',
        headers: { 'Accept': 'application/json', ...(await buildAuthHeaders()) },
        credentials: 'include'
      });
    } catch (err) {
      console.error('apiUpdateCar: GET current resource failed', err);
      throw err;
    }

    // 2) merge
    const serverClean = cleanServerData(serverData);
    const merged = Object.assign({}, serverClean, payload);

    // 3) PUT merged representation
    try {
      const headers = await buildHeaders();
      const urlPut = buildApiUrl(`/cars/${encodeURIComponent(id)}`);
      const result = await fetchJson(urlPut, {
        method: 'PUT',
        headers,
        body: JSON.stringify(merged),
        credentials: 'include'
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
    const url = buildApiUrl(`/cars/${encodeURIComponent(id)}`);
    await fetchJson(url, { method: 'DELETE', headers, credentials: 'include' });
    return true;
  }

  // Simple sync helper: attempt to refresh local cache key
  async function refreshLocalCache(key = 'ecoride_vehicles') {
    try {
      const arr = await apiGetCars();
      try {
        localStorage.setItem(key, JSON.stringify(arr));
        notifyVehiclesChanged('refresh', null);
      } catch (e) {
        console.warn('refreshLocalCache: write fail', e);
      }
      return arr;
    } catch (e) {
      console.warn('refreshLocalCache failed', e);
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (err) { return []; }
    }
  }

  // Helper pour notifier les autres modules qu'un véhicule a changé
  function notifyVehiclesChanged(action = 'update', vehicle = null) {
    try {
      window.dispatchEvent(new CustomEvent('ecoride:vehicles-updated', {
        detail: { action, vehicle }
      }));
      console.log(`🚗 Event dispatched: ecoride:vehicles-updated (${action})`);
    } catch (e) {
      console.warn('notifyVehiclesChanged failed', e);
    }
  }

  // Expose API
  const api = {
    setApiBase,
    getApiBase,        // base sans '/api'
    getApiBaseUrl: () => buildApiUrl(''), // retourne base + '/api' ou '/api' si base vide
    getAuthToken,
    vehicleFromApi,
    vehicleToApiPayload,
    apiGetCars,
    apiGetCar,
    apiCreateCar,
    apiUpdateCar,
    apiDeleteCar,
    refreshLocalCache,
    notifyVehiclesChanged
  };

  // Attach to global
  global.ecorideCarsApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));