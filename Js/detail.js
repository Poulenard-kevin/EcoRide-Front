import { resolveAvatarSrc, getProfileAvatarFromStorage } from './trajets.js';
import { carpoolFromApiAsync } from '/assets/js/trips-api.js';
import { updatePlacesFromVehicle, renderPreferences, applyVehicleTypeToElement, normalizeTypeKey, labelFromTypeKey, slugifyForClass } from '/assets/js/type-utils.js';
import { createBooking, reloadCarpoolAndNotify } from '/assets/js/bookings-api.js';
import { apiFetch, getToken } from '/assets/js/api.js';
import { addPendingReview, retryPendingReviews, getPendingReviewsSorted, migratePendingReviews } from './pending-reviews.js';

console.log("🔍 detail.js chargé !");

let trajet = null;

// =================== Helpers ===================

if (!window.location.pathname.startsWith('/detail')) {
  // Ne rien faire si on n'est pas sur la page détail
  console.log('Page non détail, skip driver-about-text');
} else {
  // Appeler ensureAboutEl() et autres fonctions liées
  updateDriverAboutDom();
}

// --- ensureAboutEl : défini au niveau module, accessible à toutes les fonctions du fichier
function ensureAboutEl() {
  if (!window.location.pathname.startsWith('/detail')) {
    return null; // ne rien faire hors page détail
  }
  let el = document.getElementById('driver-about-text');
  if (!el) {
    const container = document.querySelector('.detail-container') || document.querySelector('main') || document.body;
    const h1 = container ? (container.querySelector('h1') || container.querySelector('header h1')) : null;
    el = document.createElement('p');
    el.id = 'driver-about-text';
    el.className = 'driver-about-text text-muted';
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(el, h1.nextSibling);
    else if (container) container.prepend(el);
  }
  return el;
}

// Optionnel : exposer pour test rapide depuis la console
window.ensureAboutEl = ensureAboutEl;

// Renvoie la description de profil (legacy ou canonical)
function getProfileAboutFromStorage() {
  try {
    // legacy key peut être une string JSON { text: "...", ... } ou une simple string
    const legacyRaw = localStorage.getItem('ecoride.profileAbout');
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw);
        if (parsed) {
          if (typeof parsed === 'object' && parsed.text && String(parsed.text).trim()) return String(parsed.text).trim();
          // parfois stocké { about: '...' }
          if (typeof parsed === 'object' && parsed.about && String(parsed.about).trim()) return String(parsed.about).trim();
        }
      } catch (e) {
        // pas JSON -> peut être une string brute
        if (typeof legacyRaw === 'string' && legacyRaw.trim()) return legacyRaw.trim();
      }
    }

    // fallback canonical user
    const raw = localStorage.getItem('ecoride_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user && user.about && String(user.about).trim()) return String(user.about).trim();

    return null;
  } catch (err) {
    console.error('getProfileAboutFromStorage error', err);
    return null;
  }
}


// update DOM pour le texte "À propos"
function updateDriverAboutDom() {
  const el = ensureAboutEl();
  if (!el) return;

  // Si le DOM contient déjà une description non vide et différente du message par défaut,
  // on ne l'écrase pas.
  const current = el.textContent ? String(el.textContent).trim() : '';
  const NO_DESCRIPTION_MSG = 'Aucune description fournie.';
  if (current && current !== NO_DESCRIPTION_MSG) {
    console.log('updateDriverAboutDom: contenu existant détecté, on n\'écrase pas ->', current);
    return;
  }

  const about = getProfileAboutFromStorage();
  const output = about && about.trim() ? about.trim() : NO_DESCRIPTION_MSG;
  el.textContent = output;
  if (output === NO_DESCRIPTION_MSG) el.classList.add('text-muted');
  else el.classList.remove('text-muted');
}

if (!window.__ecoride_about_listeners_installed) {
  window.addEventListener('ecoride:userUpdated', updateDriverAboutDom);
  window.addEventListener('userUpdated', updateDriverAboutDom);
  window.__ecoride_about_listeners_installed = true;
}

// --- Gestion de l'avatar ---
const DEFAULT_AVATAR = '/images/default-avatar.png'; // <-- Adapte ce chemin si ton avatar par défaut est ailleurs

function handleAvatarUpdateEvent(ev) {
  const avatar = ev?.detail?.avatar || getProfileAvatarFromStorage();
  const photoElement = document.getElementById("detail-photo");
  if (photoElement) {
    photoElement.src = avatar || DEFAULT_AVATAR;
    // Ajout d'un gestionnaire d'erreur pour les images cassées
    photoElement.onerror = () => {
      photoElement.onerror = null; // Évite les boucles infinies
      photoElement.src = DEFAULT_AVATAR;
    };
  }
}

if (!window.__ecoride_avatar_listeners_installed) {
  window.addEventListener('userUpdated', handleAvatarUpdateEvent);
  window.addEventListener('ecoride:userUpdated', handleAvatarUpdateEvent);
  window.__ecoride_avatar_listeners_installed = true;
}

function getCovoId(item) {
  return item?.detailId || item?.covoiturageId || item?.id || null;
}

function getUserReservationForCovoiturage(covoiturageId) {
  const reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  return reservations.find(r => getCovoId(r) === covoiturageId && r.role === 'passager' && r.status === 'reserve') || null;
}

// expose pour debug si besoin
window.addPendingReview = addPendingReview;
window.retryPendingReviews = retryPendingReviews;

// Installer retry automatique : au chargement de la page et au retour online
document.addEventListener('pageContentLoaded', () => {
  // Attendre quelques secondes pour laisser la stack réseau / auth se stabiliser
  setTimeout(() => {
    retryPendingReviews({ delayBetween: 400 }).catch(e => console.warn('retryPendingReviews init failed', e));
  }, 2000);
});

// Retenter quand l'utilisateur revient en ligne
window.addEventListener('online', () => {
  console.info('navigator.onLine: online — retry pending reviews');
  retryPendingReviews({ delayBetween: 400 }).catch(e => console.warn('retryPendingReviews online failed', e));
});

// helper local : normalise un identifiant / IRI en id numérique ou chaine courte
function normalizeCovoId(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  const m = s.match(/\/api\/carpools\/(\d+)$/);
  if (m) return m[1];
  const m2 = s.match(/\/api\/carpools\/(.+)$/);
  if (m2) return m2[1];
  return s.replace(/^\/api\/carpools\//, '').replace(/^\/+/, '');
}

function getCapacity(trajet) {
  // Retourne le nombre total de places (tel que fourni par l'API dans vehicle)
  // Ne PAS utiliser trajet.places qui peut contenir les places restantes.
  return Number(
    trajet?.vehicle?.places ??
    trajet?.vehicle?.seats ??
    trajet?.totalSeats ??
    trajet?.capacity ??
    4
  ) || 4;
}

function getOccupiedFromPassagersArray(trajet) {
  if (!Array.isArray(trajet?.passagers) || trajet.passagers.length === 0) return 0;
  return trajet.passagers.reduce((s, p) => s + (Number(p.places) || 1), 0);
}

function computeRemaining(trajetObj) {
  try {
    if (!trajetObj) return 0;

    const capacity = getCapacity(trajetObj);

    const passagersArray = Array.isArray(trajetObj.passagers) ? trajetObj.passagers : [];
    const occupiedFromPassagers = passagersArray.reduce((s, p) => s + (Number(p.places ?? p.seats) || 1), 0);

    let occupiedFromBookings = 0;
    if (Array.isArray(trajetObj.bookings) && trajetObj.bookings.length > 0) {
      occupiedFromBookings = trajetObj.bookings.reduce((s, b) => s + (Number(b.seats ?? b.reservedSeats ?? b.nb_places_reservees) || 1), 0);
    }

    const occupiedBase = Math.max(occupiedFromPassagers, occupiedFromBookings);

    // On ignore occupiedLocal car pas de réservations locales à gérer
    const occupied = occupiedBase;

    const remaining = Math.max(0, capacity - occupied);

    console.debug('[computeRemaining] capacity, occupiedFromPassagers, occupiedFromBookings, occupied, remaining', {
      capacity, occupiedFromPassagers, occupiedFromBookings, occupied, remaining, trajetId: trajetObj.id
    });

    return remaining;
  } catch (err) {
    console.warn('computeRemaining error', err);
    return 0;
  }
}

function renderPlaces(trajetObj) {
  const placesElement = document.getElementById("detail-places");
  if (!placesElement) return;

  const remaining = computeRemaining(trajetObj);
  const pluriel = remaining > 1 ? "s" : "";
  placesElement.textContent = `Place${pluriel} disponible${pluriel} : ${remaining}`;
}

function cancelReservationById(reservationId) {
  if (!reservationId) return false;

  // 1️⃣ Retirer la réservation de trajets globaux
  let trajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  const beforeLen = trajets.length;
  trajets = trajets.filter(t => t.id !== reservationId);
  localStorage.setItem('ecoride_trajets', JSON.stringify(trajets));
  window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));

  if (trajets.length === beforeLen) {
    console.warn("Aucune réservation trouvée à supprimer (cancelReservationById)");
    return false;
  }

  // 2️⃣ Retirer le passager du covoiturage dans nouveauxTrajets
  let userPseudo = "Moi";
  try {
    const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
    if (me && me.pseudo) userPseudo = me.pseudo;
  } catch (e) {}

  let nouveaux = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
  nouveaux = nouveaux.map(covo => {
    covo.passagers = (Array.isArray(covo.passagers) ? covo.passagers : [])
      .filter(p => {
        if (typeof p === 'object' && p.pseudo) return p.pseudo !== userPseudo;
        if (typeof p === 'string') return !(p.startsWith(userPseudo) || p.startsWith('Moi'));
        return true;
      })
      .map(p => {
        if (typeof p === 'object' && p.pseudo) return p;
        if (typeof p === 'string') {
          const m = p.match(/^(.+?)\s*x(\d+)$/i);
          return m ? { pseudo: m[1].trim(), places: Number(m[2]) } : { pseudo: p.trim(), places: 1 };
        }
        return null;
      })
      .filter(Boolean);

    // Recalcul places disponibles
    const totalOccupied = covo.passagers.reduce((sum, p) => sum + (Number(p.places) || 1), 0);
    const capacity = typeof covo.capacity === 'number'
      ? covo.capacity
      : (covo.vehicle?.places ?? covo.places ?? 4);
    covo.places = Math.max(0, capacity - totalOccupied);

    return covo;
  });

  localStorage.setItem('nouveauxTrajets', JSON.stringify(nouveaux));
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));

  // 3️⃣ Notifier l'annulation
  window.dispatchEvent(new CustomEvent('ecoride:reservationCancelled', { detail: { id: reservationId } }));

  // ✅ BONUS : notifier clairement la suppression pour l’espace utilisateur
  window.dispatchEvent(new CustomEvent('ecoride:reservationRemoved', { detail: { id: reservationId } }));

  // 👉 cet event peut être capté dans user-space.js :
  // window.addEventListener('ecoride:reservationRemoved', () => { renderHistorique(); });

  // ✅ Redirection vers "Espace utilisateur" directement sur l'onglet Mes trajets
  window.location.href = "/espace-utilisateur?tab=trajets";

  return true;
}

function isCurrentUserDriver(trajet) {
  try {
    const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
    const driver = trajet?.chauffeur || trajet?.driver || null;

    console.log('[isCurrentUserDriver] me =', me, 'driver =', driver);

    if (!me || !driver) return false;

    // 1) Comparaison par id (le plus fiable)
    if (me.id && driver.id && String(me.id) === String(driver.id)) {
      console.log('[isCurrentUserDriver] match par id');
      return true;
    }

    // 2) Comparaison par email
    if (me.email && driver.email && me.email === driver.email) {
      console.log('[isCurrentUserDriver] match par email');
      return true;
    }

    // 3) Fallback par pseudo si dispo
    if (me.pseudo && driver.pseudo && me.pseudo === driver.pseudo) {
      console.log('[isCurrentUserDriver] match par pseudo');
      return true;
    }

    console.log('[isCurrentUserDriver] pas le conducteur');
    return false;
  } catch (e) {
    console.warn('isCurrentUserDriver error', e);
    return false;
  }
}

// ---------- Helpers : détecter réservation serveur ----------
function extractIdFromAny(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  const m = s.match(/\/(\d+)$/);
  return m ? m[1] : s;
}

function findMyBooking(trajetObj) {
  try {
    const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
    if (!me || !trajetObj) return null;

    const myId = me.id ? String(me.id) : null;
    const myPseudo = (me.pseudo || '').toString().trim();

    // Collecte candidates depuis plusieurs clés possibles
    const candidates = []
      .concat(Array.isArray(trajetObj.bookings) ? trajetObj.bookings : [])
      .concat(Array.isArray(trajetObj.rawBookings) ? trajetObj.rawBookings : [])
      .concat(Array.isArray(trajetObj.reservations) ? trajetObj.reservations : []);

    // 1) Tentative par passenger.id / passenger['@id']
    for (const b of candidates) {
      if (!b) continue;
      const passenger = b.passenger ?? b.user ?? b.passager ?? null;
      if (!passenger) continue;
      const pid = extractIdFromAny(passenger.id ?? passenger['@id'] ?? passenger);
      if (pid && myId && String(pid) === String(myId)) return b;
    }

    // 2) Fallback : recherche dans passagers (array simple) par pseudo / places
    if (Array.isArray(trajetObj.passagers) && myPseudo) {
      const found = trajetObj.passagers.find(p => {
        if (!p) return false;
        // p peut être un objet {pseudo, places} ou une string "Pseudo x2"
        if (typeof p === 'object') {
          if (p.pseudo && String(p.pseudo).trim() === myPseudo) return true;
          // parfois user id stocké
          if (p.id && String(p.id) === myId) return true;
        }
        if (typeof p === 'string') {
          if (p.startsWith(myPseudo) || p.startsWith('Moi')) return true;
        }
        return false;
      });
      if (found) {
        // Normaliser un petit objet booking pour usage côté UI
        return {
          id: found.id ?? null,
          passenger: { id: myId },
          seats: found.places ?? found.seats ?? 1,
          _inferredFromPassagers: true,
          raw: found
        };
      }
    }

    // 3) Rien trouvé
    return null;
  } catch (err) {
    console.warn('findMyBooking error', err);
    return null;
  }
}

// helper util pour extraire id numérique / id simple depuis IRI ou objet
function normalizeEntityId(raw) {
  if (!raw && raw !== 0) return null;
  const s = String(raw);
  const m = s.match(/\/(\d+)$/);
  if (m) return m[1];
  return s;
}

function renderActionButton(trajet) {
  try {
    console.log('--- renderActionButton debug ---');
    console.log('trajet (id):', trajet?.id);
    console.log('trajet.bookings:', trajet.bookings);
    console.log('trajet.rawBookings:', trajet.rawBookings);
    console.log('trajet.passagers:', trajet.passagers);
  } catch (e) {
    console.warn('renderActionButton debug failed', e);
  }
  const localReservation = getUserReservationForCovoiturage(trajet.id);
  console.log('trajet.bookings:', trajet.bookings);
  const serverBooking = findMyBooking(trajet);
  const reservation = localReservation || serverBooking;
  const actionsContainer = document.querySelector('.actions');
  if (!actionsContainer) {
    console.warn('Conteneur .actions introuvable');
    return;
  }

  console.log('Insertion bouton dans container:', actionsContainer);

  // Supprimer d'éventuels boutons existants
  const oldReserve = actionsContainer.querySelector('#detail-reserver');
  const oldCancel = actionsContainer.querySelector('#cancel-reservation-btn');
  if (oldReserve) oldReserve.remove();
  if (oldCancel) oldCancel.remove();

  const typeEl = document.getElementById('detail-type');
  const isDriver = isCurrentUserDriver(trajet);
  console.log('[renderActionButton] reservation =', reservation, 'isDriver =', isDriver);

  if (reservation) {
    // ----- Cas où l'utilisateur est déjà passager -----
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-reservation-btn';
    cancelBtn.className = 'btn btn-danger';
    cancelBtn.textContent = 'Annuler ma réservation';
    cancelBtn.dataset.reservationId = reservation.id;

    if (typeEl && typeEl.parentNode === actionsContainer) {
      actionsContainer.insertBefore(cancelBtn, typeEl);
    } else {
      actionsContainer.prepend(cancelBtn);
    }

    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.setProperty('background-color', '#dc3545', 'important');
      cancelBtn.style.setProperty('color', '#fff', 'important');
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.removeProperty('background-color');
      cancelBtn.style.removeProperty('color');
    });

    cancelBtn.addEventListener('click', async () => {
      if (!confirm("Voulez-vous vraiment annuler cette réservation ?")) return;
    
      // Extraire id de réservation (déjà présent dans ton code)
      const raw = serverBooking.id ?? serverBooking['@id'] ?? serverBooking.id ?? serverBooking['@id'] ?? null;
      const bookingId = normalizeEntityId(raw);
      if (!bookingId) {
        alert("Impossible d'identifier la réservation à annuler.");
        return;
      }
    
      // Désactiver bouton et afficher feedback
      cancelBtn.disabled = true;
      const originalText = cancelBtn.textContent;
      cancelBtn.textContent = 'Annulation en cours...';
    
      try {
        // Appel DELETE via apiFetch (ton utilitaire)
        await apiFetch(`/bookings/${bookingId}`, { method: 'DELETE' });
    
        // Si on arrive ici, suppression côté serveur OK (204 ou 200)
        try {
          const updated = await reloadCarpoolAndNotify(trajet.id);
          if (updated) {
            trajet = { ...trajet, ...updated };
            window.__debug_trajet = trajet;
          }
        } catch (e) {
          console.warn('reloadCarpoolAndNotify failed after delete', e);
          // continue, on fera les mises à jour locales ci-dessous
        }
    
        // Mettre à jour localStorage / UI
        cancelReservationById(bookingId);
        alert('✅ Réservation annulée.');
        renderPlaces(trajet);
        renderActionButton(trajet);
        // Redirection optionnelle
        window.location.href = "/espace-utilisateur?tab=trajets";
        return;
      } catch (err) {
        // apiFetch devrait throw ; on inspecte les erreurs courantes
        const status = err?.status || err?.response?.status || (err?.body && err.body.status) || null;
        console.error('Erreur suppression réservation', { err, status });
    
        if (status === 404) {
          // Déjà supprimé côté serveur — faire cleanup local et informer
          cancelReservationById(bookingId);
          alert('La réservation était déjà supprimée côté serveur. Nettoyage local effectué.');
          renderPlaces(trajet);
          renderActionButton(trajet);
          return;
        }
    
        if (status === 401 || status === 403) {
          alert('Échec : vous n\'êtes pas autorisé(e) à annuler cette réservation. Vérifiez votre connexion.');
          // option : rediriger vers login
          // window.location.href = '/connexion';
          cancelBtn.disabled = false;
          cancelBtn.textContent = originalText;
          return;
        }
    
        // cas générique d'erreur réseau / serveur
        let msg = 'Échec de l\'annulation (erreur serveur). Réessayez plus tard.';
        if (err?.body?.detail) msg = err.body.detail;
        if (err?.body?.['hydra:description']) msg = err.body['hydra:description'];
    
        alert(msg);
        cancelBtn.disabled = false;
        cancelBtn.textContent = originalText;
        return;
      } finally {
        // re-enable if still in DOM and not already redirected
        if (document.body.contains(cancelBtn) && !cancelBtn.disabled) {
          cancelBtn.disabled = false;
          cancelBtn.textContent = originalText;
        }
      }
    });

  } else if (isDriver) {
    // ----- Cas chauffeur : pas de bouton Réserver -----
    const info = document.createElement('span');
    info.className = 'driver-info-message';
    info.textContent = "Vous êtes le conducteur de ce trajet. Vous ne pouvez pas réserver de place.";
    if (typeEl && typeEl.parentNode === actionsContainer) {
      actionsContainer.insertBefore(info, typeEl);
    } else {
      actionsContainer.prepend(info);
    }

  } else {
    // ----- Cas passager potentiel : bouton Réserver -----
    const reserveBtn = document.createElement('button');
    reserveBtn.id = 'detail-reserver';
    reserveBtn.className = 'search-btn reserve-btn';
    reserveBtn.textContent = 'Réserver';

    if (typeEl && typeEl.parentNode === actionsContainer) {
      actionsContainer.insertBefore(reserveBtn, typeEl);
    } else {
      actionsContainer.prepend(reserveBtn);
    }

    reserveBtn.addEventListener('click', async () => {
      const remaining = computeRemaining(trajet);
      if (remaining <= 0) {
        alert("❌ Aucune place disponible.");
        return;
      }
      const seats = await showSeatSelector(remaining);
      if (!seats) return;
      if (confirm(`Confirmer la réservation de ${seats} place${seats > 1 ? 's' : ''} ?`)) {
        reserverPlace(trajet, seats);
      }
    });
  }
}

// =================== Main ===================

document.addEventListener("pageContentLoaded", async () => {
  const path = window.location.pathname || '';
  const qs = window.location.search || '';

  const looksLikeDetailPath = /^\/detail(\/|$)/.test(path);
  const hasIdQuery = /\bid=/.test(qs);

  if (!looksLikeDetailPath && !hasIdQuery) {
    // silent return (inutile d'afficher un warning ici)
    return;
  }

  console.log("🎯 pageContentLoaded dans detail.js");

  function getCarpoolIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get('id');
    if (queryId && queryId.trim()) {
      // Nettoyer l'ID s'il contient une URI
      const cleanId = queryId.trim().replace(/^.*\/(\d+)$/, '$1');
      console.log('ID extrait de query string:', cleanId);
      return cleanId;
    }
  
    const path = window.location.pathname || '';
    const pathParts = path.split('/').filter(Boolean);

    const detailContainer = document.querySelector('.detail-container');
    if (detailContainer) {
      detailContainer.classList.add('loaded');
      setTimeout(() => {
        const targetPosition = detailContainer.offsetTop - 20; // 20px de marge
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        const duration = 1000; // 1 seconde
        let start = null;

        function animation(currentTime) {
          if (start === null) start = currentTime;
          const timeElapsed = currentTime - start;
          const run = ease(timeElapsed, startPosition, distance, duration);
          window.scrollTo(0, run);
          if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        function ease(t, b, c, d) {
          t /= d / 2;
          if (t < 1) return c / 2 * t * t + b;
          t--;
          return -c / 2 * (t * (t - 2) - 1) + b;
        }

        requestAnimationFrame(animation);
      }, 500);
    }
    
    if (pathParts.length >= 2 && pathParts[0] === 'detail' && pathParts[1]) {
      try {
        const decoded = decodeURIComponent(pathParts[1]);
        console.log('ID extrait du pathname:', decoded);
        
        // Extraire l'ID numérique de n'importe quel format
        const idMatch = decoded.match(/(?:\/|^)(\d+)(?:\/|$)/);
        if (idMatch) {
          return idMatch[1];
        }
        
        return decoded;
      } catch (e) {
        console.log('ID extrait du pathname (pas décodé):', pathParts[1]);
        // Extraire l'ID numérique même en cas d'erreur
        const idMatch = pathParts[1].match(/(?:\/|^)(\d+)(?:\/|$)/);
        return idMatch ? idMatch[1] : pathParts[1];
      }
    }
  
    console.log('Aucun ID trouvé');
    return null;
  }

  const id = getCarpoolIdFromLocation();
  console.log("🟢 ID récupéré dans detail.js:", id);

  // 🚫 Ne plus faire de history.push/replace/popstate ici
  if (!id) {
    console.debug('Aucun ID trouvé — handler detail ignoré');
    return;
  }

  // =================== Récupération des trajets ===================


  // Charger le trajet depuis l'API
  try {
    // 🔹 Utilise apiFetch pour bénéficier du token / cookie
    const data = await apiFetch(`/carpools/${id}`);
    console.log('Réponse API brute:', data);

    // Normaliser / enrichir
    trajet = await carpoolFromApiAsync(data);

    // --- Chargement des avis : fallback immédiat + refresh asynchrone depuis l'API
    (async () => {
      const container = document.getElementById('driver-reviews');
      if (!container) {
        console.debug('Pas de container #driver-reviews, skip chargement avis');
        return;
      }

      // Fallback immédiat : utiliser éventuels avis déjà fournis dans trajet.reviews
      try {
        const local = Array.isArray(trajet?.reviews) ? trajet.reviews.slice(-3).reverse() : null;
        if (local && local.length > 0) {
          for (let i = 0; i < 3; i++) {
            const el = container.querySelector(`#detail-review${i + 1}`);
            if (!el) continue;
            // supporte soit un string soit un objet { review/comment/... }
            const rv = local[i];
            const txt = rv
              ? (typeof rv === 'string' ? rv : (rv.review || rv.comment || rv.commentaire || rv.content || rv.message || rv.text || ''))
              : '';
            if (txt && String(txt).trim()) {
              el.textContent = String(txt).trim();
              el.style.display = '';
            } else {
              el.textContent = '';
              el.style.display = 'none';
            }
          }
        }
      } catch (err) {
        console.debug('fallback local reviews failed', err);
      }

      // Extraire l'id du conducteur depuis trajet et charger les avis depuis l'API
      const driver = trajet?.chauffeur || trajet?.driver || null;
      let driverId = null;
      if (driver) {
        driverId = driver.id
          || (typeof driver === 'string' ? (driver.match(/\/(\d+)$/) || [])[1] : null)
          || (driver['@id'] ? (String(driver['@id']).match(/\/(\d+)$/) || [])[1] : null);
      }
      if (!driverId) {
        console.debug('Impossible d\'extraire driverId depuis trajet, chargement avis annulé');
        return;
      }

      console.debug('Chargement des avis pour driverId:', driverId);
      try {
        await loadDriverReviews(String(driverId), container);
      } catch (e) {
        console.warn('Erreur chargement avis conducteur:', e);
      }
    })();

    console.log('Trajet normalisé:', trajet);

    // Mettre à jour places / capacité avant rendu
    try {
      updatePlacesFromVehicle(trajet);
    } catch (e) {
      console.warn('updatePlacesFromVehicle a échoué', e);
    }
    try {
      renderPlaces(trajet);
    } catch (e) {
      console.warn('renderPlaces a échoué', e);
    }

    // Debug détaillé des préférences (avant rendu)
    console.log('Preferences à afficher:', {
      basePreferences: trajet.preferences,
      vehicleOther: trajet.car?.other ?? trajet.vehicle?.other ?? '',
      autresPrefs: trajet.autres_preferences_chauffeur ?? trajet.autresPreferencesChauffeur ?? trajet.otherPreferences ?? trajet.driverPreferences ?? trajet.car?.driverPreferences
    });
    console.log('DEBUG trajet complet:', trajet);
    console.log('DEBUG basePreferences:', trajet.preferences, trajet.car?.driverPreferences, trajet.driverPreferences);
    console.log('DEBUG autresPrefsRaw:', trajet.autres_preferences_chauffeur, trajet.autresPreferencesChauffeur, trajet.otherPreferences, trajet.driverPreferences);
    console.log('DEBUG vehicleOther:', trajet.car?.other ?? trajet.vehicle?.other);

    // Rendu des preferences (une seule fois)
    try {
      renderPreferences(trajet);
    } catch (e) {
      console.warn('renderPreferences a échoué', e);
    }

    // Badge / type
    const badgeEl = document.getElementById('detail-type') || document.querySelector('.type') || document.getElementById('detail-vehicle-type');
    try {
      applyVehicleTypeToElement(trajet, badgeEl);
    } catch (e) {
      console.warn('applyVehicleTypeToElement a échoué', e);
    }

    // Mettre à jour la ligne véhicule (marque/model/color/type) en vérifiant l'existence des éléments
    const elMarque = document.getElementById('detail-vehicle-marque');
    if (elMarque) elMarque.textContent = trajet.car?.marque || trajet.vehicle?.marque || 'Marque non spécifiée';

    const elModel = document.getElementById('detail-vehicle-model');
    if (elModel) elModel.textContent = trajet.car?.model || trajet.vehicle?.model || 'Modèle non spécifié';

    const elColor = document.getElementById('detail-vehicle-color');
    if (elColor) elColor.textContent = trajet.car?.color || trajet.vehicle?.color || 'Couleur non spécifiée';

    // champ de type détaillé (optionnel)
    const typeElement = document.getElementById('detail-vehicle-type');
    if (typeElement) {
      try {
        const { label, key } = applyVehicleTypeToElement(trajet, typeElement) || {};
        if (key === 'non-specifie') {
          typeElement.style.display = 'none';
        } else {
          typeElement.style.display = '';
          typeElement.textContent = label || (trajet.type ? capitalize(trajet.type) : '');
        }
      } catch (e) {
        // fallback simple
        const inferred = trajet.car?.type || trajet.vehicle?.type || trajet.type || '';
        if (!inferred) {
          typeElement.style.display = 'none';
        } else {
          typeElement.style.display = '';
          typeElement.textContent = capitalize(inferred);
        }
      }
    }

    // Exposer pour debug
    window.__debug_trajet = trajet;
    console.log('DEBUG exposé sur window.__debug_trajet', window.__debug_trajet);

    // Fonction interne pour appliquer le badge de carburant / type (avec fallback car/vehicle)
    async function applyFuelBadgeFromTrajet(trajetObj) {
      const rawType = trajetObj ? (trajetObj.type || trajetObj.vehicle?.type || trajetObj.car?.type) : null;
      const displayed = normalizeTypeKey(rawType);

      // Trouver l’élément cible
      const selectors = ['#detail-type', '.type', '#type-trajet-select', '[data-ecoride-type]'];
      let el = null;
      for (const s of selectors) {
        el = document.querySelector(s);
        if (el) break;
      }
      if (!el) {
        const container = document.querySelector('.detail-container') || document.querySelector('main') || document.body;
        const h1 = container ? (container.querySelector('h1') || container.querySelector('header h1')) : null;
        const wrapper = document.createElement('p');
        wrapper.id = 'detail-type';
        wrapper.className = 'type';
        if (h1 && h1.parentNode) h1.parentNode.insertBefore(wrapper, h1.nextSibling);
        else if (container) container.prepend(wrapper);
        el = wrapper;
      }

      // Nettoyer anciennes classes
      Array.from(el.classList).forEach(c => {
        if (c.startsWith('badge-') || c.startsWith('type-')) el.classList.remove(c);
      });

      // Appliquer texte et classe (utilise une classe custom si besoin)
      const text = (displayed || '').charAt(0).toUpperCase() + (displayed || '').slice(1);
      el.textContent = text || '';
      if (displayed) el.classList.add(`type-${String(displayed).replace(/\s+/g, '-')}`);

      console.log('applyFuelBadgeFromTrajet appliqué ->', { el, displayed });
    }

    // appeler la fonction (trajet est la variable existante)
    applyFuelBadgeFromTrajet(window.__debug_trajet || trajet).catch(e => console.warn('Erreur applyFuelBadgeFromTrajet', e));

    console.log('DEBUG carpoolFromApi output date:', trajet.date);
    console.log('✅ Trajet chargé depuis l\'API :', trajet);

    // Logs additionnels (me vs driver/chauffeur)
    try {
      const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
      console.log('[detail] me =', me);
      console.log('[detail] trajet.driver/chauffeur =', trajet?.driver ?? trajet?.chauffeur);
    } catch (e) {
      console.warn('[detail] erreur log me/driver', e);
    }

  } catch (e) {
    console.warn('⚠️ Erreur chargement trajet API', e);

    // Si 401, rediriger vers connexion
    if (String(e).includes('401') || String(e).includes('Unauthorized')) {
      alert('🔒 Vous devez être connecté pour voir ce trajet.');
      window.location.href = '/connexion';
      return;
    }

    // Fallback sur les trajets locaux (nouveauxTrajets uniquement)
    try {
      const trajetsSauvegardes = JSON.parse(localStorage.getItem("nouveauxTrajets") || "[]");
      trajet = trajetsSauvegardes.find(t => String(t.id) === String(id));
      if (trajet) {
        console.log('✅ Trajet trouvé dans localStorage (nouveauxTrajets)');
        // Si trouvée en local, on rend quand même les éléments essentiels
        try { renderPlaces(trajet); } catch (err) { console.warn('renderPlaces fallback failed', err); }
        try { renderPreferences(trajet); } catch (err) { console.warn('renderPreferences fallback failed', err); }
        window.__debug_trajet = trajet;
      }
    } catch (localErr) {
      console.error('Erreur lors du fallback localStorage', localErr);
    }
  }

  if (!trajet) {
    console.warn('Trajet introuvable côté API, navigation simple vers /covoiturage');
    window.location.href = '/covoiturage';
    return;
  }

  // Installer une seule fois le listener reservationCreated pour la page détail
  if (!window.__ecoride_reservationCreated_listener_installed) {
    window.__ecoride_reservationCreated_listener_installed = true;

    window.addEventListener('ecoride:reservationCreated', async (ev) => {
      try {
        const detail = ev?.detail || {};
        // chercher plusieurs chemins possibles vers l'id du trajet
        const ridRaw = detail.trajetId
          || detail.reservation?.covoId
          || detail.reservation?.detailId
          || detail.reservation?.tripId
          || detail.reservation?.['@id']
          || detail.booking?.tripId
          || null;

        if (!ridRaw) return;

        const rid = normalizeCovoId(ridRaw);
        const targetId = normalizeCovoId(trajet?.id ?? trajet?.serverId ?? trajet?.['@id'] ?? trajet?.detailId ?? '');

        if (!rid || !targetId) return;
        if (String(rid) !== String(targetId)) return;

        // Optionnel : recharger depuis le serveur pour avoir l'état canonique
        // const updated = await reloadCarpoolAndNotify(trajet.id);
        // if (updated) { trajet = { ...trajet, ...updated }; window.__debug_trajet = trajet; }

        // Mettre à jour l'objet local si l'event inclut la réservation
        if (detail.reservation) {
          // merge prudente : n'écrase pas des champs non présents
          trajet.passagers = Array.isArray(trajet.passagers) ? trajet.passagers : [];
          // si reservation contient pseudo/places, on l'ajoute localement (dédup si besoin)
          try {
            const r = detail.reservation;
            const pseudo = r.pseudo || (JSON.parse(localStorage.getItem('ecoride_user')||'null')||{}).pseudo || 'Moi';
            const places = Number(r.placesReservees ?? r.places ?? r.seats ?? 1) || 1;
            // évite doublons simples par id
            const exists = trajet.passagers.some(p => (p.id && r.id && String(p.id) === String(r.id)) || (p.pseudo && p.pseudo === pseudo && p.places === places));
            if (!exists) trajet.passagers.push({ id: r.id, pseudo, places });
          } catch (e) { /* ignore */ }
        }

        // Recalculer places et rerender
        try { renderPlaces(trajet); } catch (e) { console.warn('renderPlaces error', e); }
        try { renderActionButton(trajet); } catch (e) { console.warn('renderActionButton error', e); }

        // exposer pour debug
        window.__debug_trajet = trajet;
        console.log('[detail.js] reservationCreated handled for trajet', targetId);
      } catch (err) {
        console.warn('listener reservationCreated error', err);
      }
    });
  }

  // =================== Injection des données dans le HTML ===================

  const photoElement = document.getElementById("detail-photo");
  if (photoElement) {
    let computedSrc = null;

    // Priorité 1 : photo explicite du chauffeur
    if (trajet.chauffeur?.photo) {
      computedSrc = resolveAvatarSrc(trajet.chauffeur.photo);
    }

    // Priorité 2 : si le chauffeur est l'utilisateur actuel, utiliser l'avatar du profil
    try {
      const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
      if (me && me.pseudo && trajet.chauffeur?.pseudo && me.pseudo === trajet.chauffeur.pseudo) {
        computedSrc = getProfileAvatarFromStorage() || computedSrc;
      }
    } catch (e) {
      console.warn('Erreur lors de la vérification du currentUser', e);
    }

    // Priorité 3 : fallback global
    if (!computedSrc) {
      computedSrc = getProfileAvatarFromStorage();
    }

    console.log('Avatar src utilisé:', computedSrc);
    photoElement.src = computedSrc || DEFAULT_AVATAR;
    photoElement.onerror = () => { photoElement.onerror = null; photoElement.src = DEFAULT_AVATAR; };
  }

  const pseudoElement = document.getElementById("detail-pseudo");
  if (pseudoElement) pseudoElement.textContent = trajet.chauffeur?.pseudo || "Inconnu";

  const ratingElement = document.getElementById("detail-rating");
  if (ratingElement) {
    // ✅ Utilise averageRating au lieu de rating
    const rating = trajet.chauffeur?.averageRating ?? 5.0;
  
    // Arrondi pour avoir un nombre entier d'étoiles
    const fullStars = Math.round(rating);
  
    ratingElement.textContent = "★".repeat(fullStars) + "☆".repeat(5 - fullStars);
  }

  function renderTypeBadge(trajet, element) {
    if (!element || !trajet) return;
  
    // Cherche la valeur brute dans plusieurs champs possibles
    const rawCandidates = [
      trajet.fuelType,
      trajet.type,
      trajet.vehicle?.fuelType,
      trajet.vehicle?.type,
      trajet.car?.fuelType,
      trajet.car?.type,
      trajet.vehicule?.fuelType,
      trajet.vehicule?.type
    ];
  
    const raw = rawCandidates.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const displayedKey = normalizeTypeKey(raw); // 'electrique' | 'thermique' | 'hybride' | 'non-specifie'
    const label = labelFromTypeKey(displayedKey); // 'Électrique', etc.
  
  
    const className = 'type-' + slugifyForClass(displayedKey);
  
    // Debug utile
    console.debug('[renderTypeBadge] raw:', raw, '-> displayedKey:', displayedKey, 'class:', className);
  
    // Nettoyer anciennes classes de type/badge
    Array.from(element.classList).forEach(cls => {
      if (cls.startsWith('badge-') || cls.startsWith('type-')) element.classList.remove(cls);
    });
  
    // S'assurer d'avoir la classe badge pour le style pill (optionnel)
    if (!element.classList.contains('badge')) element.classList.add('badge');
  
    // Appliquer la nouvelle classe et le texte
    element.classList.add(className);
    element.textContent = label;
  }

  const dateElement = document.getElementById("detail-date");
  if (dateElement) dateElement.textContent = trajet.date || "";

  const departElement = document.getElementById("detail-depart");
  if (departElement) departElement.textContent = trajet.depart || "";

  const arriveeElement = document.getElementById("detail-arrivee");
  if (arriveeElement) arriveeElement.textContent = trajet.arrivee || "";

  const heureDepartElement = document.getElementById("detail-heureDepart");
  if (heureDepartElement) heureDepartElement.textContent = trajet.heureDepart || "";

  const heureArriveeElement = document.getElementById("detail-heureArrivee");
  if (heureArriveeElement) heureArriveeElement.textContent = trajet.heureArrivee || "";

  const prixElement = document.getElementById("detail-prix");
  if (prixElement) prixElement.textContent = `Prix : ${trajet.prix || 0} crédits`;

  const dureeElement = document.getElementById("detail-duree");
  if (dureeElement) {
    const duree = trajet.duree || calculerDuree(trajet.heureDepart, trajet.heureArrivee);
    const heures = Math.floor(duree);
    const minutes = Math.round((duree - heures) * 60);
    dureeElement.textContent = `Durée : ${heures}h${minutes.toString().padStart(2, '0')}`;
  }

  renderPlaces(trajet);
  renderActionButton(trajet);
  console.log('DEBUG trajet complet:', trajet);
  console.log('DEBUG basePreferences:', trajet.preferences, trajet.vehicle?.preferences, trajet.driverPreferences);
  console.log('DEBUG autresPrefsRaw:', trajet.autres_preferences_chauffeur, trajet.autresPreferencesChauffeur, trajet.otherPreferences, trajet.driverPreferences);
  console.log('DEBUG vehicleOther:', trajet.vehicle?.other);
  renderPreferences(trajet);

  const vehicle = trajet.vehicle || {};
  console.log("🔎 trajet:", trajet);
  console.log("🔎 vehicle keys:", Object.keys(vehicle));
  console.log("🔎 vehicle raw:", vehicle);

  const brandElement = document.getElementById("detail-vehicle-marque");
  if (brandElement) brandElement.textContent = vehicle.marque || "Marque non spécifiée";

  const modelElement = document.getElementById("detail-vehicle-model");
  if (modelElement) modelElement.textContent = vehicle.model || "Modèle non spécifié";

  const colorElement = document.getElementById("detail-vehicle-color");
  if (colorElement) colorElement.textContent = vehicle.color || "Couleur non spécifiée";

  // --- Type : normalisé et affichage lisible ---
  const typeElement = document.getElementById("detail-vehicle-type");
  // rechercher le type dans plusieurs champs et normaliser la clé
  const inferredTypeRaw = (
    vehicle.type ||
    vehicle.fuelType ||
    trajet.type ||
    trajet.fuelType ||
    vehicle.typeRaw ||
    ''
  );
  const typeKey = normalizeTypeKey(inferredTypeRaw); // 'electrique'|'thermique'|'hybride'|'non-specifie'
  const typeLabel = labelFromTypeKey(typeKey);

  if (typeElement) {
    if (!typeKey || typeKey === 'non-specifie') {
      // si tu préfères masquer la ligne quand non renseigné
      typeElement.textContent = '';
      typeElement.style.display = 'none';
    } else {
      typeElement.textContent = typeLabel;
      typeElement.style.display = ''; // restore si précédemment caché
    }
  }

  // trouver l'élément qui affichera le type (priorité id/detail -> .type -> typeElement)
  const badgeEl = document.getElementById('detail-type') || document.querySelector('.type') || typeElement;

  // Appeler le renderer de badge (fonction définie plus haut)
  if (badgeEl) {
    renderTypeBadge(trajet, badgeEl);
  } else {
    // si aucun élément n'existe, option : créer #detail-type sous le h1 (décommenter si souhaité)
    // const container = document.querySelector('.detail-container') || document.querySelector('main') || document.body;
    // const h1 = container ? (container.querySelector('h1') || container.querySelector('header h1')) : null;
    // const p = document.createElement('p');
    // p.id = 'detail-type';
    // p.className = 'type';
    // p.textContent = (trajet.type || trajet.vehicle?.type || 'Non spécifié');
    // if (h1 && h1.parentNode) h1.parentNode.insertBefore(p, h1.nextSibling); else container.prepend(p);
  }

  function renderDriverAbout(trajetParam) {
    const NO_DESCRIPTION_MSG = 'Aucune description fournie.';

    function looksLikeARoleString(s) {
      if (!s || typeof s !== 'string') return false;
      const norm = s.trim().toLowerCase();
      return ['chauffeur','passager','driver','passenger','both','les deux'].includes(norm)
        || (/^[a-z]{1,20}$/i.test(norm));
    }

    function getDriverAboutFromTrajet(pTrajet) {
      try {
        const drv = pTrajet ? (pTrajet.chauffeur || pTrajet.driver || null) : null;
        if (!drv) return null;
        const fields = ['about','bio','description','text'];
        for (const f of fields) {
          if (typeof drv[f] === 'string' && drv[f].trim()) return drv[f].trim();
        }
        if (drv.role && typeof drv.role === 'object') {
          if (typeof drv.role.description === 'string' && drv.role.description.trim()) return drv.role.description.trim();
          if (typeof drv.role.text === 'string' && drv.role.text.trim()) return drv.role.text.trim();
        }
        if (typeof drv.role === 'string' && drv.role.trim().length > 30 && !looksLikeARoleString(drv.role)) {
          return drv.role.trim();
        }
        return null;
      } catch (e) {
        console.warn('getDriverAboutFromTrajet error', e);
        return null;
      }
    }

    function writeToDom(text) {
      const el = ensureAboutEl();
      if (!el) {
        console.warn('renderDriverAbout: élément cible introuvable');
        return;
      }
      const output = (text && String(text).trim()) ? String(text).trim() : NO_DESCRIPTION_MSG;
      el.textContent = output;
      if (output === NO_DESCRIPTION_MSG) el.classList.add('text-muted');
      else el.classList.remove('text-muted');
    }

    const aboutFromTrajet = getDriverAboutFromTrajet(trajetParam);
    const aboutFromProfil = getProfileAboutFromStorage ? getProfileAboutFromStorage() : '';

    console.log('renderDriverAbout -> aboutFromTrajet:', aboutFromTrajet, 'aboutFromProfil:', aboutFromProfil);

    if (trajetParam && typeof trajetParam === 'object') {
      const chosen = aboutFromTrajet || aboutFromProfil || '';
      writeToDom(chosen);
      return;
    }

    writeToDom(aboutFromProfil || '');

    // installer un MutationObserver simple pour debug (idempotent)
    try {
      const tgt = document.getElementById('driver-about-text');
      if (tgt && !window.__ecoride_about_mut_observer_installed) {
        const mo = new MutationObserver((muts) => {
          console.log('Mutation on #driver-about-text', muts);
        });
        mo.observe(tgt, { childList: true, characterData: true, subtree: true });
        window.__ecoride_about_mut_observer_installed = true;
      }
    } catch (e) { /* ignore */ }
  }

  // appel : juste après que `trajet` soit défini dans ton code
  renderDriverAbout(trajet);
  updateDriverAboutDom();

    /*const reviews = trajet.reviews || ["Aucun avis disponible pour ce conducteur.", "", ""];
    ['detail-review1', 'detail-review2', 'detail-review3'].forEach((id, index) => {
      const reviewElement = document.getElementById(id);
      if (reviewElement) {
        reviewElement.textContent = reviews[index] || "";
        reviewElement.style.display = reviews[index] ? "block" : "none";
      }
    });*/

    // ========== Listener pour mises à jour venant d'ailleurs ==========
    if (!window.__ecoride_detail_carpoolUpdated_installed) {
      window.__ecoride_detail_carpoolUpdated_installed = true;

      window.addEventListener('ecoride:carpoolUpdated', (ev) => {
        const d = ev.detail || {};
        let id = d.id || (d.updated && (d.updated.id || d.updated['@id']));
        if (!id && d.updated && typeof d.updated['@id'] === 'string') {
          const parts = d.updated['@id'].split('/').filter(Boolean);
          id = parts[parts.length - 1];
        }
        if (!id) return;
        id = String(id);
      
        if (id === String(trajet.id)) {
          console.log('[detail.js] carpoolUpdated reçu pour le trajet affiché', id);
      
          // Met à jour l'objet trajet avec les nouvelles données
          trajet = { ...trajet, ...d.updated };
      
          // Recalcule les places restantes
          const reserved = Array.isArray(trajet.passagers)
            ? trajet.passagers.reduce((s, p) => s + (Number(p.places) || Number(p.seats) || 1), 0)
            : 0;
          const cap = Number(
            trajet.capacity ??
            trajet.places ??
            trajet.vehicle?.places ??
            trajet.car?.places ??
            0
          );
          trajet.remainingPlaces = Math.max(0, cap - reserved);
      
          // Mets à jour l'affichage du détail
          renderPlaces(trajet);
          renderActionButton(trajet);
          renderPreferences(trajet);
      
          // Si tu as d'autres fonctions de rendu, appelle-les ici aussi
        }
      });
    }

    console.log("✅ Page détail chargée et remplie pour le trajet:", trajet.id);

    // Révèle le contenu maintenant que tout est rempli
    const detailContainer = document.querySelector('.detail-container');
    if (detailContainer) {
      detailContainer.classList.add('loaded');
    }
});

// Installer le listener pour l'event dispatché par reloadCarpoolAndNotify
if (!window.__ecoride_detail_covoiturageReloaded_installed) {
  window.__ecoride_detail_covoiturageReloaded_installed = true;

  window.addEventListener('ecoride:covoiturageReloaded', (ev) => {
    try {
      const newTrajet = ev?.detail?.trajet;
      if (!newTrajet) return;

      // Mettre à jour la variable globale trajet
      trajet = newTrajet;
      window.__debug_trajet = trajet;

      // Mettre à jour le DOM avec les nouvelles places disponibles
      const remaining = (typeof trajet.availableSeats === 'number')
        ? Math.max(0, trajet.availableSeats)
        : computeRemaining(trajet);

      const placesEl = document.getElementById('detail-places');
      if (placesEl) {
        placesEl.textContent = `Place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''} : ${remaining}`;
      }

      // Mettre à jour les boutons, préférences, etc. (si les fonctions existent)
      try {
        if (typeof renderActionButton === 'function') renderActionButton(trajet);
      } catch (e) {
        console.warn('renderActionButton failed on covoiturageReloaded', e);
      }

      try {
        if (typeof renderPreferences === 'function') renderPreferences(trajet);
      } catch (e) {
        console.warn('renderPreferences failed on covoiturageReloaded', e);
      }

      // Notifier aussi les autres listeners (history / map / liste)
      try {
        window.dispatchEvent(new CustomEvent('ecoride:carpoolUpdated', { detail: { id: trajet.id, updated: newTrajet } }));
      } catch (e) {
        console.warn('Failed to dispatch ecoride:carpoolUpdated', e);
      }

    } catch (err) {
      console.error('Error handling ecoride:covoiturageReloaded', err);
    }
  });
}

// =================== Fonctions utilitaires ===================

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function calculerDuree(heureDepart, heureArrivee) {
  if (!heureDepart || !heureArrivee) return 0;
  const timeStringToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.replace('h', ':').split(':').map(Number);
    return hours * 60 + (minutes || 0);
  };
  const departMinutes = timeStringToMinutes(heureDepart);
  const arriveeMinutes = timeStringToMinutes(heureArrivee);
  let dureeMinutes = arriveeMinutes - departMinutes;
  if (dureeMinutes < 0) dureeMinutes += 24 * 60;
  return dureeMinutes / 60;
}

// =================== Modal sélecteur de places ===================
function showSeatSelector(max) {
  return new Promise(resolve => {
    const modalId = 'seatSelectorModal';
    let modalEl = document.getElementById(modalId);
    if (modalEl) modalEl.remove();

    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Choisir le nombre de places</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
            </div>
            <div class="modal-body text-center">
              <p class="mb-3 text-muted">Maximum disponible : <strong>${max}</strong></p>
              <div class="d-flex align-items-center justify-content-center gap-3">
                <button class="btn btn-outline-secondary btn-lg px-3" id="modal-minus">−</button>
                <span class="fs-3 fw-bold" id="modal-count">1</span>
                <button class="btn btn-outline-secondary btn-lg px-3" id="modal-plus">+</button>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
              <button class="btn btn-primary" id="modal-confirm">Confirmer</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    modalEl = document.getElementById(modalId);
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    const countEl = modalEl.querySelector('#modal-count');
    const minusBtn = modalEl.querySelector('#modal-minus');
    const plusBtn = modalEl.querySelector('#modal-plus');
    const confirmBtn = modalEl.querySelector('#modal-confirm');
    const cancelBtn = modalEl.querySelector('[data-bs-dismiss="modal"]');

    let count = 1;

    minusBtn.addEventListener('click', () => {
      if (count > 1) {
        count--;
        countEl.textContent = count;
      }
    });

    plusBtn.addEventListener('click', () => {
      if (count < max) {
        count++;
        countEl.textContent = count;
      }
    });

    const cleanup = (result) => {
      try { bsModal.hide(); } catch (e) {}
      setTimeout(() => {
        wrapper.remove();
        resolve(result);
      }, 300);
    };

    confirmBtn.addEventListener('click', () => cleanup(count));
    cancelBtn.addEventListener('click', () => cleanup(null));

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (document.body.contains(wrapper)) wrapper.remove();
    });
  });
}

// =================== Fonction de réservation ===================

async function reserverPlace(trajet, seats = 1) {
  if (isCurrentUserDriver(trajet)) {
    alert("Vous êtes le conducteur de ce trajet, vous ne pouvez pas réserver de place.");
    return;
  }

  seats = Number(seats) || 1;
  if (seats <= 0) seats = 1;

  if (!confirm(`Confirmer la réservation de ${seats} place${seats > 1 ? 's' : ''} ?`)) return;

  try {
    const result = await createBooking(trajet.id, seats);

    if (!result.ok) {
      if (result.unauthorized) {
        alert('Vous devez vous connecter pour réserver.');
        window.location.href = '/login'; // adapte selon ta route login
        return;
      }

      // Affiche un message d’erreur détaillé si disponible
      let msg = 'Erreur lors de la réservation.';
      if (result.body) {
        if (result.body['hydra:description']) msg = result.body['hydra:description'];
        else if (result.body.detail) msg = result.body.detail;
        else if (typeof result.body === 'string') msg = result.body;
        else if (result.body.violations && Array.isArray(result.body.violations)) {
          msg = result.body.violations.map(v => `${v.propertyPath}: ${v.message}`).join('\n');
        }
      }
      alert(msg);
      console.error('createBooking error:', result);
      return;
    }

    // Succès — Option A : utiliser la réponse de reloadCarpoolAndNotify (évite double requête)
    const updatedTrajet = await reloadCarpoolAndNotify(trajet.id);
    if (updatedTrajet) {
      // Merge les données serveur dans l'objet local
      trajet = { ...trajet, ...updatedTrajet };
      window.__debug_trajet = trajet;

      // 1) Construire un objet local de réservation cohérent avec ce que
      //    trajets.js attend (role/passager/status/places...)
      try {
        const bookingData = result?.data || null;
        const localReservation = {
          id: bookingData?.id || bookingData?.['@id'] || (`local_res_${Date.now()}`),
          // clé qui référence le covoiturage côté front (utilisée par getCovoId)
          covoId: trajet.id,
          // rendre aussi compatible avec getCovoId qui regarde detailId/covoiturageId/id
          detailId: trajet.id,
          placesReservees: Number(seats) || 1,
          userId: (JSON.parse(localStorage.getItem('ecoride_user') || 'null') || {}).id || null,
          role: 'passager',
          status: 'reserve',
          createdAt: new Date().toISOString(),

          // champs pratiques pour affichage rapide dans "Mes trajets"
          depart: trajet.depart,
          arrivee: trajet.arrivee,
          date: trajet.date,
          heureDepart: trajet.heureDepart,
          heureArrivee: trajet.heureArrivee,
          prix: trajet.prix
        };

        // 2) Sauvegarder dans ecoride_trajets (localStorage)
        try {
          const stored = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
          stored.push(localReservation);
          localStorage.setItem('ecoride_trajets', JSON.stringify(stored));
        } catch (err) {
          console.warn('detail: impossible de sauvegarder reservation localement', err);
        }

        // 3) Mettre à jour 'nouveauxTrajets' (passagers + places disponibles)
        try {
          const key = 'nouveauxTrajets';
          const covos = JSON.parse(localStorage.getItem(key) || '[]');
          const idx = covos.findIndex(c => String(c.id) === String(trajet.id));
          if (idx !== -1) {
            const covo = covos[idx];
            covo.passagers = Array.isArray(covo.passagers) ? covo.passagers : [];
            covo.passagers.push({ pseudo: (JSON.parse(localStorage.getItem('ecoride_user') || 'null') || {}).pseudo || 'Moi', places: Number(seats) || 1 });
            const occupied = covo.passagers.reduce((s,p) => s + (Number(p.places)||1), 0);
            const capacity = Number(covo.capacity ?? covo.vehicle?.places ?? covo.places ?? 4);
            covo.places = Math.max(0, capacity - occupied);
            covos[idx] = covo;
            localStorage.setItem(key, JSON.stringify(covos));
          }
        } catch (err) {
          console.warn('detail: impossible de mettre à jour nouveauxTrajets', err);
        }

        // 4) Dispatcher des events pour avertir les autres modules (trajets.js écoutera ecoride:reservationCreated)
        window.dispatchEvent(new CustomEvent('ecoride:reservationCreated', { detail: { trajetId: trajet.id, reservation: localReservation, booking: bookingData } }));
        window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
        window.dispatchEvent(new CustomEvent('ecoride:reservationCreated:ui', { detail: { trajetId: trajet.id, reservation: localReservation } }));

      } catch (err) {
        console.warn('detail: échec patch réservation locale', err);
      }

      // Si le serveur fournit availableSeats, on l'utilise en priorité
      if (typeof updatedTrajet.availableSeats === 'number') {
        trajet.availableSeats = updatedTrajet.availableSeats;
      } else {
        // Sinon on met à jour la liste des passagers si fournie
        trajet.passagers = Array.isArray(updatedTrajet.passagers) ? updatedTrajet.passagers : trajet.passagers;
      }

      // Mettre à jour capacité / places au besoin
      trajet.capacity = updatedTrajet.capacity ?? updatedTrajet.places ?? updatedTrajet.vehicle?.places ?? trajet.capacity;
      trajet.places = updatedTrajet.places ?? trajet.places;

      // Mettre à jour l'UI — renderPlaces utilisera availableSeats si présent
      try { renderPlaces(trajet); } catch (e) { console.warn('renderPlaces error', e); }
      try { renderActionButton(trajet); } catch (e) { console.warn('renderActionButton error', e); }
      try { renderPreferences(trajet); } catch (e) { /* ignore */ }

      // Notifier les autres parties de l'app (liste, cartes, etc.)
      window.dispatchEvent(new CustomEvent('ecoride:carpoolUpdated', { detail: { id: trajet.id, updated: updatedTrajet } }));
    }

    // Confirmation et navigation
    alert(`✅ Réservation confirmée : ${seats} place${seats > 1 ? 's' : ''}.`);
    window.location.href = "/espace-utilisateur?tab=trajets";
  } catch (e) {
    console.error('Erreur reserverPlace:', e);
    alert('Erreur inattendue lors de la réservation (voir console).');
  }
}

// =================== Chargement et affichage des avis conducteur ===================

// helper safe escape
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateNice(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// wrapper pour récupérer JSON — utilise l'apiFetch importé si disponible, sinon window.apiFetch, sinon fetch native
async function fetchJson(url, opts = {}) {
  try {
    // Priorité : apiFetch importé dans ce module
    if (typeof apiFetch === 'function') {
      console.debug('fetchJson -> using imported apiFetch for', url);
      return await apiFetch(url, { method: 'GET', ...opts });
    }

    // Seconde priorité : window.apiFetch (compatibilité)
    if (window.apiFetch && typeof window.apiFetch === 'function') {
      console.debug('fetchJson -> using window.apiFetch for', url);
      return await window.apiFetch(url, { method: 'GET', ...opts });
    }

    // Fallback : fetch natif (envoie les cookies si nécessaire)
    console.debug('fetchJson -> using native fetch for', url);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...opts,
    });
    console.debug('fetch response status for', url, res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('fetchJson error for', url, err);
    throw err;
  }
}

async function getCurrentUserId() {
  try {
    const me = await fetchJson('/api/me');
    // supporte formats : { id: 7 } ou { "@id": "/api/users/7" } ou { '@id': ... }
    if (me.id) return String(me.id);
    const iri = me['@id'] || me['@id'] || me['@id'];
    if (iri) {
      const m = iri.match(/\/api\/users\/(\d+)/);
      if (m) return m[1];
    }
    // fallback : maybe me['@id'] = "/api/users/7"
    return null;
  } catch (err) {
    console.warn('Impossible de récupérer /api/me :', err);
    return null;
  }
}

async function loadDriverReviews(driverId, containerEl = document.getElementById('driver-reviews')) {
  if (!containerEl || !driverId) return;
  const loading = containerEl.querySelector('.reviews-loading');
  if (loading) loading.remove();

  // helpers
  const extractText = r => {
    if (!r) return '';
    return String(r.comment || r.review || r.content || r.message || r.text || r.body || '').trim();
  };
  const extractDate = r => {
    if (!r) return null;
    // plusieurs champs possibles : createdAt, created_at, date, publishedAt, published_at
    const d = r.createdAt || r.created_at || r.date || r.publishedAt || r.published_at || r.timestamp || r.ts || null;
    if (!d) return null;
    const parsed = new Date(d);
    if (!isNaN(parsed)) return parsed;
    // tenter un parse plus permissif
    const parsed2 = new Date(String(d).replace(/Z$/, ''));
    return isNaN(parsed2) ? null : parsed2;
  };

  try {
    // 1) Récupérer les avis serveur
    let serverData;
    try {
      serverData = await apiFetch(`/users/${driverId}/reviews`, { method: 'GET' });
    } catch (err) {
      console.warn('loadDriverReviews: erreur apiFetch reviews', err);
      serverData = null;
    }

    let serverArray = [];
    if (Array.isArray(serverData)) serverArray = serverData;
    else if (serverData && Array.isArray(serverData['hydra:member'])) serverArray = serverData['hydra:member'];
    else if (serverData && Array.isArray(serverData.items)) serverArray = serverData.items;
    // else rester vide

    // 2) Récupérer les avis locaux en attente (si disponible)
    let pending = [];
    try {
      // getPendingReviewsSorted peut accepter un booléen pour tri descendant dans ton util — on essaye les deux
      pending = typeof getPendingReviewsSorted === 'function'
        ? (getPendingReviewsSorted(true) || getPendingReviewsSorted()) // essaye avec arg true sinon fallback
        : [];
      if (!Array.isArray(pending)) pending = [];
    } catch (err) {
      console.warn('loadDriverReviews: getPendingReviewsSorted failed', err);
      pending = [];
    }

    // 3) Normaliser les objets reviews (mettre un id si possible, texte, date)
    const normalize = (r, source = 'server') => {
      return {
        _source: source,
        _raw: r,
        id: r && (r.id || r['@id'] || r['@id'] || r.uuid || null),
        text: extractText(r),
        date: extractDate(r),
      };
    };

    const normalizedServer = serverArray.map(r => normalize(r, 'server'));
    const normalizedPending = pending.map(r => normalize(r, 'pending'));

    // 4) Concaténer, dédupliquer (par id ou par texte+date) et trier par date descendante
    const combined = normalizedPending.concat(normalizedServer);

    const seen = new Set();
    const deduped = [];
    for (const item of combined) {
      // clé de déduplication : id si présent, sinon texte+timestamp
      const key = item.id ? String(item.id) : (item.text ? `${item.text}::${item.date ? +item.date : 'nodate'}` : JSON.stringify(item._raw));
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    // Sort: items with a real date first (desc), then items without date
    deduped.sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return 0;
    });

    const topThree = deduped.slice(0, 3);

    // 5) Afficher dans les slots #detail-review1 .. #detail-review3
    for (let i = 0; i < 3; i++) {
      const el = containerEl.querySelector(`#detail-review${i + 1}`);
      if (!el) continue;
      const r = topThree[i];
      if (!r || !r.text) {
        el.textContent = '';
        el.style.display = 'none';
      } else {
        // afficher uniquement le texte (textContent) — safe contre XSS
        el.textContent = r.text;
        el.style.display = '';
      }
    }

    // Si aucun avis trouvé -> message dans le premier slot
    if (topThree.length === 0) {
      const first = containerEl.querySelector('#detail-review1');
      if (first) {
        first.textContent = 'Aucun avis pour le moment';
        first.style.display = '';
      }
      ['#detail-review2', '#detail-review3'].forEach(id => {
        const e = containerEl.querySelector(id);
        if (e) { e.textContent = ''; e.style.display = 'none'; }
      });
    }
  } catch (err) {
    console.error('Erreur chargement avis conducteur (enhanced)', err);
    const first = containerEl.querySelector('#detail-review1');
    if (first) { first.textContent = 'Erreur lors du chargement des avis.'; first.style.display = ''; }
    ['#detail-review2','#detail-review3'].forEach(id => {
      const e = containerEl.querySelector(id);
      if (e) { e.textContent = ''; e.style.display = 'none'; }
    });
  }
}

// =================== Chargement et affichage des avis conducteur (init robuste) ===================

/*async function initDriverReviews() {
  try {
    // Eviter double initialisation
    if (window.__ecoride_driver_reviews_initialized) {
      console.debug('initDriverReviews: déjà initialisé');
      return;
    }
    window.__ecoride_driver_reviews_initialized = true;

    const container = document.getElementById('driver-reviews');
    console.debug('initDriverReviews: container trouvé?', !!container, container);

    if (!container) {
      console.debug('initDriverReviews: aucun container #driver-reviews présent — skip');
      return;
    }

    let driverId = container.dataset.driverId;
    console.debug('initDriverReviews: data-driver-id raw =', driverId);

    if (!driverId || driverId === 'me') {
      // Récupérer l'id courant via /api/me
      const meId = await getCurrentUserId();
      console.debug('initDriverReviews: meId from /api/me =', meId);
      if (!meId) {
        container.innerHTML = '<p class="no-reviews">Impossible de déterminer l\'utilisateur connecté.</p>';
        return;
      }
      driverId = meId;
    }

    console.debug('initDriverReviews: final driverId =', driverId);
    // Appel effectif (await pour voir les erreurs dans la console)
    await loadDriverReviews(driverId, container);

  } catch (err) {
    console.error('initDriverReviews error:', err);
    const container = document.getElementById('driver-reviews');
    if (container) container.innerHTML = '<p class="error">Impossible d\'initialiser les avis.</p>';
  }
}

// Lancer l'init au bon moment pour SPA + page normale
document.addEventListener('pageContentLoaded', initDriverReviews);
document.addEventListener('DOMContentLoaded', initDriverReviews);
// Si le DOM est déjà prêt (script chargé tard), appeler tout de suite
if (document.readyState !== 'loading') {
  initDriverReviews().catch(err => console.warn('initDriverReviews immediate call failed', err));
}*/