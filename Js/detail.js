import { resolveAvatarSrc, getProfileAvatarFromStorage } from './trajets.js';
import { carpoolFromApiAsync } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey, slugifyForClass } from '/assets/js/type-utils.js';

console.log("🔍 detail.js chargé !");

// =================== Helpers ===================

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


// S'assure qu'il existe un élément DOM pour afficher le about ; si non, il le crée sous le <h1> principal
function ensureAboutEl() {
  let el = document.getElementById('driver-about-text') || document.querySelector('#profileAboutCard p') || document.querySelector('[data-ecoride-about]');
  if (el) return el;

  // trouver un point d'insertion raisonnable : .detail-container, main ou premier <h1>
  const container = document.querySelector('.detail-container') || document.querySelector('main') || document.body;
  const h1 = container.querySelector('h1') || container.querySelector('header h1');

  // créer wrapper si absent
  const wrapper = document.createElement('div');
  wrapper.id = 'profileAboutCard';
  wrapper.style.margin = '1rem 0';
  wrapper.innerHTML = `<p id="driver-about-text" class="text-muted"></p>`;

  if (h1 && h1.parentNode) {
    h1.parentNode.insertBefore(wrapper, h1.nextSibling);
  } else {
    // sinon append en tête du container
    container.prepend(wrapper);
  }

  return document.getElementById('driver-about-text');
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

function renderActionButton(trajet) {
  const reservation = getUserReservationForCovoiturage(trajet.id);
  const actionsContainer = document.querySelector('.actions');
  if (!actionsContainer) {
    console.warn('Conteneur .actions introuvable');
    return;
  }

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

    cancelBtn.addEventListener('click', () => {
      if (!confirm("Voulez-vous vraiment annuler cette réservation ?")) return;
      const ok = cancelReservationById(reservation.id);
      if (ok) {
        alert("✅ Réservation annulée.");
        window.location.href = "/covoiturage";
      } else {
        alert("⚠️ Échec lors de l'annulation.");
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

// ======= Helpers globaux (placer en haut du fichier) =======
function computeRemaining(trajetObj) {
  if (!trajetObj) return 0;
  const passagers = Array.isArray(trajetObj.passagers) ? trajetObj.passagers : [];
  if (typeof trajetObj.places === 'number') return trajetObj.places;
  if (typeof trajetObj.capacity === 'number') return Math.max(0, trajetObj.capacity - passagers.length);
  if (trajetObj.vehicle?.places !== undefined) return Math.max(0, Number(trajetObj.vehicle.places) - passagers.length);
  if (trajetObj.vehicule?.places !== undefined) return Math.max(0, Number(trajetObj.vehicule.places) - passagers.length);
  return 0;
}

function renderPlaces(trajetObj) {
  const placesElement = document.getElementById("detail-places");
  if (!placesElement) return;
  const remaining = computeRemaining(trajetObj);
  const pluriel = remaining > 1 ? "s" : "";
  placesElement.textContent = `Place${pluriel} disponible${pluriel} : ${remaining}`;
}

// =================== Main ===================

document.addEventListener("pageContentLoaded", async () => {
  console.log("🎯 pageContentLoaded dans detail.js");

  function getCarpoolIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get('id');
    if (queryId && queryId.trim()) return queryId.trim();
  
    const path = window.location.pathname || '';
    const parts = path.split('/').filter(Boolean); // ["detail","3"]
    if (parts.length >= 2 && parts[0] === 'detail' && parts[1]) {
      try {
        return decodeURIComponent(parts[1]);
      } catch (e) {
        return parts[1];
      }
    }
  
    return null;
  }

  const id = getCarpoolIdFromLocation();
  console.log("🟢 ID récupéré dans detail.js:", id);

  // 🚫 Ne plus faire de history.push/replace/popstate ici
  if (!id) {
    console.warn('Aucun ID de covoiturage valide, rien à afficher dans detail.js');
    // On sort simplement, le router décidera quoi faire
    return;
  }

  // =================== Récupération des trajets ===================


  // Charger le trajet depuis l'API
  let trajet = null;
  try {
    // 🔹 Utilise apiFetch pour bénéficier du token / cookie
    const data = await apiFetch(`/carpools/${id}`);
    console.log('DEBUG API raw carpool:', {
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      arrivalDate: data.arrivalDate,
      arrivalTime: data.arrivalTime
    });
    trajet = await carpoolFromApiAsync(data);
    // Exposer pour debug
    window.__debug_trajet = trajet;
    console.log('DEBUG exposé sur window.__debug_trajet', window.__debug_trajet);

    function waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const obs = new MutationObserver((mutations, o) => {
          const e = document.querySelector(selector);
          if (e) { o.disconnect(); resolve(e); }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        if (timeout) setTimeout(() => { obs.disconnect(); reject(new Error('timeout')); }, timeout);
      });
    }

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
        else container.prepend(wrapper);
        el = wrapper;
      }
  
      // Nettoyer anciennes classes
      Array.from(el.classList).forEach(c => {
        if (c.startsWith('badge-') || c.startsWith('type-')) el.classList.remove(c);
      });
  
      // Appliquer texte et classe
      el.textContent = displayed.charAt(0).toUpperCase() + displayed.slice(1);
      el.classList.add(`type-${displayed.replace(/\s+/g, '-')}`);
  
      console.log('applyFuelBadgeFromTrajet appliqué ->', { el, displayed });
    }

    // appeler la fonction (trajet est la variable existante)
    applyFuelBadgeFromTrajet(window.__debug_trajet || trajet).catch(e => console.warn('Erreur applyFuelBadgeFromTrajet', e));
    console.log('DEBUG carpoolFromApi output date:', trajet.date);
    console.log('✅ Trajet chargé depuis l\'API :', trajet);

    try {
      const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
      console.log('[detail] me =', me);
      console.log('[detail] trajet.chauffeur =', trajet?.chauffeur);
    } catch (e) {
      console.warn('[detail] erreur log me/chauffeur', e);
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

  const vehicleOther = (trajet.vehicle?.other ?? trajet.vehicule?.other ?? "").trim();
  const basePreferences = trajet.preferences || ['Non-fumeur', 'Animaux acceptés', 'Musique'];

  const preferences = vehicleOther
    ? [...basePreferences, vehicleOther]
    : basePreferences;

  ['detail-pref1', 'detail-pref2', 'detail-pref3', 'detail-pref4'].forEach((id, index) => {
    const prefElement = document.getElementById(id);
    if (prefElement) {
      prefElement.textContent = preferences[index] || "";
      prefElement.style.display = preferences[index] ? "block" : "none";
    }
  });

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

  /* ---------- Insert "À propos du conducteur" next to <h1>Véhicule ---------- */
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
      const el = ensureAboutEl(); // ensureAboutEl doit être défini dans Helpers (créé si nécessaire)
      if (!el) {
        console.warn('renderDriverAbout: élément cible introuvable/après ensureAboutEl');
        return;
      }
      const output = (text && String(text).trim()) ? String(text).trim() : NO_DESCRIPTION_MSG;
      el.textContent = output;
      if (output === NO_DESCRIPTION_MSG) el.classList.add('text-muted');
      else el.classList.remove('text-muted');
    }

    // priorités : trajet.chauffeur -> profil local (legacy/canonical) -> défaut
    const aboutFromTrajet = getDriverAboutFromTrajet(trajetParam);
    const aboutFromProfil = getProfileAboutFromStorage(); // doit gérer le JSON legacy

    console.log('renderDriverAbout -> aboutFromTrajet:', aboutFromTrajet, 'aboutFromProfil:', aboutFromProfil);

    if (trajetParam && typeof trajetParam === 'object') {
      const chosen = aboutFromTrajet || aboutFromProfil || '';
      writeToDom(chosen);
      return;
    }

    // pas de trajet : afficher profil local ou message par défaut
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

    const reviews = trajet.reviews || ["Aucun avis disponible pour ce conducteur.", "", ""];
    ['detail-review1', 'detail-review2', 'detail-review3'].forEach((id, index) => {
      const reviewElement = document.getElementById(id);
      if (reviewElement) {
        reviewElement.textContent = reviews[index] || "";
        reviewElement.style.display = reviews[index] ? "block" : "none";
      }
    });

    console.log("✅ Page détail chargée et remplie pour le trajet:", trajet.id);

    // Révèle le contenu maintenant que tout est rempli
    const detailContainer = document.querySelector('.detail-container');
    if (detailContainer) {
      detailContainer.classList.add('loaded');
    }
  });

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
function reserverPlace(trajet, seats = 1) {
  // 🚫 Sécurité : le conducteur ne peut pas réserver
  if (isCurrentUserDriver(trajet)) {
    alert("Vous êtes le conducteur de ce trajet, vous ne pouvez pas réserver de place.");
    return;
  }

  seats = Number(seats) || 1;
  if (seats <= 0) seats = 1;

  const reservation = {
    id: crypto.randomUUID(),
    detailId: trajet.id,
    depart: trajet.depart,
    arrivee: trajet.arrivee,
    date: trajet.date,
    heureDepart: trajet.heureDepart,
    heureArrivee: trajet.heureArrivee,
    prix: trajet.prix,
    chauffeur: trajet.chauffeur?.pseudo || "Inconnu",
    role: "passager",
    status: "reserve",
    placesReservees: seats
  };

  // Sauvegarder dans ecoride_trajets (utilisateur)
  let trajetsUtilisateur = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  trajetsUtilisateur.push(reservation);
  localStorage.setItem('ecoride_trajets', JSON.stringify(trajetsUtilisateur));
  window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));

  // Notifier les autres vues (Admin, Espace employé, etc.)
  window.dispatchEvent(new CustomEvent('ecoride:reservationAdded', { detail: reservation }));
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
 
  // Mettre à jour nouveauxTrajets (ajout passager + recalcul places)
  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
  const trajetIndex = trajetsCovoiturage.findIndex(t => t.id === trajet.id);

  let userPseudo = "Moi";
  try {
    const me = JSON.parse(localStorage.getItem('ecoride_user') || 'null');
    if (me && me.pseudo) userPseudo = me.pseudo;
  } catch(e) {}

  if (trajetIndex !== -1) {
    const target = trajetsCovoiturage[trajetIndex];
    target.passagers = Array.isArray(target.passagers) ? target.passagers : [];

    const alreadyIndex = target.passagers.findIndex(p => p.pseudo === userPseudo);
    if (alreadyIndex !== -1) {
      alert("⚠️ Vous avez déjà une réservation sur ce trajet.");
      return;
    }

    target.passagers.push({ pseudo: userPseudo, places: seats });

    const vehiclePlaces = target.vehicle?.places ?? target.vehicule?.places ?? null;
    target.capacity = (typeof target.capacity === 'number')
      ? target.capacity
      : (vehiclePlaces !== null ? Number(vehiclePlaces) : (typeof target.places === 'number' ? Number(target.places) : 4));

    const totalOccupied = target.passagers.reduce((sum, p) => sum + (p.places || 1), 0);

    target.places = Math.max(0, Number(target.capacity) - totalOccupied);
    trajetsCovoiturage[trajetIndex] = target;

    localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));

    // refléter localement pour l'affichage en cours
    trajet.passagers = target.passagers;
    trajet.capacity = target.capacity;
    trajet.places = target.places;
  }

  try { renderPlaces(trajet); } catch(e) {}

  alert(`✅ Réservation confirmée : ${seats} place${seats > 1 ? 's' : ''}. Vous pouvez voir vos trajets dans votre espace utilisateur.`);

  // Redirection vers espace utilisateur avec onglet trajets ouvert
  window.location.href = "/espace-utilisateur?tab=trajets";
}