import { apiFetch } from '/assets/js/api.js';

export async function createBooking(carpoolId, seats = 1) {
    if (!carpoolId) throw new Error('carpoolId manquant');
  
    const payload = {
      seats: Number(seats) || 1,
      carpool: `/api/carpools/${carpoolId}`
    };
  
    // récupérer le token (adapte la clé si tu utilises autre chose)
    const token = localStorage.getItem('api_token') || sessionStorage.getItem('api_token');
  
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  
    try {
      const base = (typeof window !== 'undefined' && (window.__API_BASE || window.API_BASE)) ? String((window.__API_BASE || window.API_BASE)).replace(/\/+$/, '') : '';
      const url = base ? `${base}/api/bookings` : '/api/bookings';

      const res = await fetch(url, {
        method: 'POST',
        headers,
        // décommente si tu utilises cookie-based sessions
        // credentials: 'include',
        body: JSON.stringify(payload)
      });
  
      // parse as json when possible
      const contentType = res.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await res.json() : await res.text();
  
      if (!res.ok) {
        // status 401 -> redirection / message de login
        if (res.status === 401) {
          return { ok: false, status: 401, unauthorized: true, body };
        }
        console.error('[createBooking] HTTP', res.status, body);
        return { ok: false, status: res.status, body };
      }
  
      return { ok: true, data: body };
    } catch (err) {
      console.error('[createBooking] network error', err);
      return { ok: false, error: err };
    }
  }
  
/**
 * Recharge un covoiturage depuis l'API et renvoie l'objet normalisé.
 * Util utile pour mettre à jour l'affichage après création de réservation.
 */
export async function reloadCarpoolAndNotify(carpoolId) {
    if (!carpoolId) return null;
  
    try {
      const data = await apiFetch(`/carpools/${carpoolId}`);
  
      // Tentatives de conversion en "trajet" : priorité à la fonction existante si présente
      let trajet = null;
  
      if (typeof carpoolFromApiAsync === 'function') {
        trajet = await carpoolFromApiAsync(data);
      } else if (typeof window.carpoolFromApiAsync === 'function') {
        trajet = await window.carpoolFromApiAsync(data);
      } else {
        // Fallback : normalisation minimale (utilisable pour l'affichage de debug)
        trajet = {
          id: data.id ?? (data['@id'] ? data['@id'].split('/').pop() : null),
          serverId: data['@id'] ?? null,
          date: data.date ?? null,
          depart: data.depart ?? null,
          arrivee: data.arrivee ?? null,
          places: data.places ?? data.capacity ?? (data.vehicle?.places ?? null),
          passagers: Array.isArray(data.passagers) ? data.passagers : (data.bookings ?? []),
          ...data
        };
      }
  
      window.dispatchEvent(new CustomEvent('ecoride:covoiturageReloaded', { detail: { trajet } }));
      return trajet;
    } catch (e) {
      console.warn('[reloadCarpoolAndNotify] failed –', e);
      return null;
    }
  }