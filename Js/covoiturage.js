// covoiturage.js (module)
import { resolveAvatarSrc, getProfileAvatarFromStorage, getCurrentUser, enrichTrajetWithCurrentUser, genId, formatDateJJMMAAAA } from './trajets.js';
import { apiFetch } from '/assets/js/api.js';
import { carpoolFromApiAsync } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey, updatePlacesFromVehicle } from '/assets/js/type-utils.js';
import { computeAverageRating, updateUserRatingUI } from './rating-utils.js';

console.log('[covoiturage] script chargé');

// -------------------- Helper statut --------------------

function normalizeTimeToMinutes(timeStr) {
  if (!timeStr) return null;

  // "10:00" → 600
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // "10h00" → 600
  if (/^\d{2}h\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split('h').map(Number);
    return h * 60 + m;
  }

  return null;
}

function isTripActive(trip) {
  if (!trip) return false;
  const s = String(trip.status ?? trip.statut ?? trip.rawStatus ?? '').toLowerCase().trim();

  // Statuts considérés comme actifs (affichables)
  const activeStatuses = new Set([
    'en cours', 'encours', 'démarré', 'demarre', 'started', 'ongoing', 'confirmé', 'confirmed', 'à venir', 'a venir', 'upcoming', 'pending'
  ]);

  // Statuts considérés comme inactifs (non affichables)
  const inactiveStatuses = new Set([
    'terminé', 'termine', 'archivé', 'archive', 'validé', 'valide', 'historique', 'canceled', 'annulé', 'annule', 'cancelled', 'finished', 'completed'
  ]);

  if (inactiveStatuses.has(s)) return false;
  if (activeStatuses.has(s)) return true;

  // Par défaut, si statut inconnu, on considère actif (ou adapte selon ton besoin)
  return true;
}

// utilisation :
if (!enrichTrajetWithCurrentUser) {
  console.warn('enrichTrajetWithCurrentUser non importé — vérifier chemin');
}

// Formate une date "souple" en "lundi 19 septembre"
function formatFullFrDay(anyDate) {
if (!anyDate) return '';
let d = anyDate instanceof Date ? new Date(anyDate) : null;

if (!d) {
  const s = String(anyDate).trim();

  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { // JJ-MM-AAAA
    const [dd,mm,yyyy] = s.split('-').map(Number);
    d = new Date(yyyy, mm-1, dd);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { // JJ/MM/AAAA
    const [dd,mm,yyyy] = s.split('/').map(Number);
    d = new Date(yyyy, mm-1, dd);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { // AAAA-MM-JJ
    const [yyyy,mm,dd] = s.split('-').map(Number);
    d = new Date(yyyy, mm-1, dd);
  } else {
    return String(anyDate);
  }
}

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d);
const month   = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(d);
const dayNum  = d.getDate();

// sortie en minuscules pour cohérence visuelle
return `${dayName} ${dayNum} ${month}`.toLowerCase();
}

function capitalizeFirst(s) {
  return s && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// utilitaire étoiles (arrondit à l'entier le plus proche, clamp [0..5])
function renderStars(rating, max = 5) {
  if (rating === null || rating === undefined || rating === '') return '☆'.repeat(max);
  const n = Number(rating);
  if (!Number.isFinite(n)) return '☆'.repeat(max);
  const rounded = Math.round(n);
  const clamped = Math.max(0, Math.min(max, rounded));
  return '★'.repeat(clamped) + '☆'.repeat(max - clamped);
}

// --- Fin utilitaires ---

function createTrajetCard(trajet) {
  console.log('[covoiturage] createTrajetCard id=', trajet?.id, 'chauffeur=', trajet?.chauffeur, 'averageRating=', trajet?.chauffeur?.averageRating, 'rating=', trajet?.rating);
  const card = document.createElement('div');
  card.classList.add('result-card');
  card.dataset.id = trajet.id;

  const remaining = (typeof trajet.remainingPlaces === 'number') ? trajet.remainingPlaces : 0;
  const placesText = `${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}`;

  // avatar
  let avatarSrc = null;
  if (trajet.chauffeur?.photo) avatarSrc = resolveAvatarSrc(trajet.chauffeur.photo);
  try {
    const currentUser = getCurrentUser();
    if (currentUser && trajet.chauffeur?.pseudo === currentUser.pseudo) {
      avatarSrc = getProfileAvatarFromStorage() || avatarSrc;
    }
  } catch (e) {
    console.warn('Erreur lors de la vérification du currentUser', e);
  }
  if (!avatarSrc) avatarSrc = getProfileAvatarFromStorage() || '/images/default-avatar.png';

  // type normalisé
  const raw = trajet?.fuelType || trajet?.type || trajet?.vehicle?.type || '';
  const typeKey = normalizeTypeKey(raw);
  const label = labelFromTypeKey(typeKey);

  // Determine driver id (try object id, '@id' IRI, or fallbacks)
  const driverRaw = trajet.chauffeur || trajet.driver || null;
  let driverId = '';
  if (driverRaw) {
    if (typeof driverRaw === 'object') {
      driverId = driverRaw.id || (driverRaw['@id'] ? (String(driverRaw['@id']).match(/\/(\d+)$/) || [])[1] : '') || driverRaw.email || driverRaw.pseudo || '';
    } else if (typeof driverRaw === 'string') {
      const m = driverRaw.match(/\/(\d+)$/);
      driverId = m ? m[1] : driverRaw;
    }
  }

  // build rating value safely (may be blank)
  const ratingValue = trajet.chauffeur?.averageRating ?? trajet.chauffeur?.rating ?? trajet.rating ?? trajet.chauffeurAverageRatingFallback ?? '';
  const ratingTitle = ratingValue ? `${Number(ratingValue).toFixed(1)} / 5` : 'Pas de note';

  // set dataset driver id on card (useful for updateUserRatingUI selectors or later DOM updates)
  if (driverId) card.dataset.driverId = String(driverId);

  card.innerHTML = `
    <div class="result-header">
      <p class="date">${capitalizeFirst(formatFullFrDay(trajet.date))}</p>
    </div>
    <div class="result-body">
      <div class="profile-column">
        <img src="${avatarSrc}" alt="Profil ${trajet.chauffeur?.pseudo || ''}" class="profile-photo" onerror="this.onerror=null;this.src='/images/default-avatar.png'">
        <div class="pseudo-rating">
          <p class="pseudo" ${driverId ? `data-user-id="${driverId}"` : ''}>${trajet.chauffeur?.pseudo || 'Inconnu'}</p>
          <p class="rating" ${driverId ? `data-driver-id="${driverId}"` : ''} aria-hidden="true" title="${ratingTitle}">
            ${renderStars(ratingValue)}
          </p>
        </div>
        <div class="column">
          <p class="type type-${typeKey}">${label}</p>
          <p class="places">${placesText}</p>
        </div>
      </div>
      <div class="details">
        <div class="column">
          <p>${trajet.depart}</p>
          <p>${trajet.arrivee}</p>
        </div>
        <div class="column">
          <p class="time">${trajet.heureDepart}</p>
          <p class="time">${trajet.heureArrivee}</p>
        </div>
        <div class="column">
          <p class="price">${trajet.prix} crédits</p>
          <button class="detail-btn">Détail</button>
        </div>
      </div>
    </div>
  `;

  // corriger src d'image si besoin
  const imgEl = card.querySelector('img.profile-photo');
  if (imgEl) imgEl.src = avatarSrc;

  // bouton détail
  const btn = card.querySelector('.detail-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!trajet.id) {
        console.warn('Trajet sans id, impossible d ouvrir le detail', trajet);
        return;
      }

      // Bloquer l'ouverture si le trajet est démarré
      if (!isTripActive(trajet)) {
        // comportement: alerte + redirection possible vers historique
        alert("Ce trajet a déjà démarré et n'est plus consultable ici.");
        // option : rediriger vers la page historique
        // window.location.href = '/user/history';
        return;
      }

      console.log('Navigation vers détail trajet id=', trajet.id);
      const newPath = `/detail/${trajet.id}`;
      window.history.pushState({}, "", newPath);
      window.dispatchEvent(new Event("popstate"));
    });
  }

  return card;
}

// -------------------- Helpers --------------------
document.addEventListener('pageContentLoaded', async () => {
  const resultsContainer = document.getElementById('results-container');
  if (!resultsContainer) return;

  const loader = document.getElementById('carpool-loader');
  const loaderText = document.getElementById('carpool-loader-text');

  // helper pour afficher / cacher le loader
  function showLoader(text) {
    if (!loader) return;
    if (text && loaderText) loaderText.textContent = text;
    loader.style.display = 'flex';
  }
  function hideLoader() {
    if (!loader) return;
    loader.style.display = 'none';
  }

  // charger une fois l'utilisateur courant
  let me = getCurrentUser(); // -> objet ou null

  // === Code bouton dev pour effacer trajets ajoutés ===
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const btn = document.getElementById('clear-user-trajets-dev');
  if (isDev && btn) {
    btn.style.display = 'block';

    btn.addEventListener('click', () => {
      if (confirm("⚠️ [DEV] Effacer tous les trajets ajoutés ?")) {
        localStorage.removeItem('nouveauxTrajets');
        alert("✅ Trajets ajoutés effacés (DEV).");
        window.location.reload();
      }
    });
  }

  // =================== ⚡ Gestion placeholders input date/heure ⚡ ===================
  document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
    const toggleClass = () => {
      if (!input.value) {
        input.classList.add('empty');
      } else {
        input.classList.remove('empty');
      }
    };
    toggleClass(); // au chargement
    input.addEventListener('input', toggleClass);
    input.addEventListener('change', toggleClass);
  });

  // Données des trajets
  /*let trajets = [
    {
      id: 'trajet1',
      date: 'Vendredi 16 septembre',
      chauffeur: { pseudo: 'Jean', rating: 4, photo: 'images/profil4m.png' },
      type: 'economique',
      places: 2,
      depart: 'Paris',
      arrivee: 'Lyon',
      heureDepart: '16h00',
      heureArrivee: '20h30',
      prix: 30,
      rating: 4,
      passagers: ['Alice', 'Bob'],
    },
    {
      id: 'trajet2',
      date: 'Samedi 17 septembre',
      chauffeur: { pseudo: 'Marie', rating: 5, photo: 'images/profil1.png' },
      type: 'hybride',
      places: 3,
      depart: 'Marseille',
      arrivee: 'Nice',
      heureDepart: '10h00',
      heureArrivee: '13h00',
      prix: 25,
      rating: 5,
      passagers: ['Paul', 'Sophie'],
    },
    {
      id: 'trajet3',
      date: 'Dimanche 18 septembre',
      chauffeur: { pseudo: 'Luc', rating: 3, photo: 'images/profil3m.png' },
      type: 'thermique',
      places: 1,
      depart: 'Lille',
      arrivee: 'Bruxelles',
      heureDepart: '09h30',
      heureArrivee: '12h00',
      prix: 20,
      rating: 3,
      passagers: ['Emma'],
    },
    {
      id: 'trajet4',
      date: 'Lundi 19 septembre',
      chauffeur: { pseudo: 'Sophie', rating: 4, photo: 'images/profil2w.png' },
      type: 'electrique',
      places: 4,
      depart: 'Bordeaux',
      arrivee: 'Toulouse',
      heureDepart: '14h00',
      heureArrivee: '17h00',
      prix: 35,
      rating: 4,
      passagers: ['Marc', 'Julie', 'Nina'],
    },
  ];*/

  let trajets = [];

  // =================== 🔄 Charger les trajets depuis l'API + localStorage ===================

  // 1️⃣ Charger les trajets depuis l'API (authentifié)
  let trajetsFromApi = [];
  try {
    console.log('🔎 Appel API GET /api/carpools via apiFetch');
  
    // Affiche le loader avant l'appel réseau
    showLoader('Chargement des trajets…');
  
    const data = await apiFetch('/carpools');
    console.log('📦 JSON brut /api/carpools :', data);
  
    const itemsDebug = (data['hydra:member'] || data || []).slice?.(0, 3) || [];
    console.log('DEBUG raw first 3 dates:', itemsDebug.map(c => ({
      id: c['@id'] || c.id,
      departureDate: c.departureDate,
      departureTime: c.departureTime
    })));
  
    const items = data['hydra:member'] || data;
  
    // ✅ Utilise carpoolFromApiAsync pour récupérer le type de fuel
    trajetsFromApi = await Promise.all(
      (Array.isArray(items) ? items : []).map((it) => carpoolFromApiAsync(it))
    );
  
    trajetsFromApi = trajetsFromApi.filter(t => {
      if (!isTripActive(t)) {
        console.debug('[covoiturage] exclu trajet inactif (front) id=', t.id, 'status=', t.status ?? t.rawStatus);
        return false;
      }
      return true;
    });
  
    console.log('DEBUG mapped first 3 dates:', trajetsFromApi.slice(0,3).map(t => ({
      id: t.id,
      date: t.date,
      heureDepart: t.heureDepart,
      type: t.type
    })));
  
    console.log('🚗 Trajets chargés depuis l’API (normalisés) :', trajetsFromApi);
  
  } catch (err) {
    console.warn('⚠️ Erreur chargement trajets API', err);
    resultsContainer.innerHTML = '<p class="text-danger text-center">Erreur lors du chargement des trajets.</p>';
    // Assure-toi de cacher le loader en erreur et d'arrêter la suite
    hideLoader();
    return;
  }

  console.log('[covoiturage] trajetsFromApi.length =', trajetsFromApi.length);
  console.log('[covoiturage] exemple trajet[0] =', trajetsFromApi[0]);

  // 2️⃣ (optionnel) Charger trajets locaux pour debug, mais ne plus les fusionner
  const trajetsSauvegardes = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
  let trajetsLocaux = [];

  if (trajetsSauvegardes.length > 0) {
    trajetsLocaux = trajetsSauvegardes.map(t => {
      const nt = { ...t };
      // ... tu peux garder ta normalisation ici si tu veux les voir en console
      return nt;
    });

    console.log("🚗 Trajets locaux normalisés (DEV) :", trajetsLocaux);
  }

  // 3️⃣ Pas de fusion : on n’utilise que les trajets API pour l’affichage
  trajets.splice(0, trajets.length, ...trajetsFromApi);

  
  // --- Normalisation : calculer remainingPlaces et forcer type normalisé ---
  trajets = trajets.map(t => {
    const passagersArray = Array.isArray(t.passagers) ? t.passagers : [];
    const remaining = (typeof t.places === 'number')
      ? t.places
      : (typeof t.capacity === 'number'
          ? Math.max(0, t.capacity - passagersArray.length)
          : (typeof t.places === 'string' && !isNaN(Number(t.places)) ? Number(t.places) : 0)
      );
    return {
      ...t,
      remainingPlaces: remaining,
      // garde une valeur type normalisée au cas où carpoolFromApiAsync ne l'a pas fait
      type: normalizeTypeKey(t.type || t.fuelType || t.vehicle?.type || '')
    };
  });

  // Cache en mémoire (SPA-friendly). Si tu veux persister: localStorage, etc.
  const __driverAvgCache = new Map(); // key: driverId(string) -> avg(number)

  function extractDriverId(trip) {
    const d = trip?.chauffeur || trip?.driver || null;
    if (!d) return null;

    // object form
    if (typeof d === 'object') {
      // id direct
      if (d.id != null) return String(d.id);

      // IRI @id: "/api/users/3"
      const iri = d['@id'];
      if (typeof iri === 'string') {
        const m = iri.match(/\/(\d+)\s*$/);
        if (m) return m[1];
      }

      // fallback (moins idéal, mais mieux que rien)
      if (d.email) return String(d.email);
      if (d.pseudo) return String(d.pseudo);
      return null;
    }

    // string form: "/api/users/3" ou "3"
    if (typeof d === 'string') {
      const m = d.match(/\/(\d+)\s*$/);
      return m ? m[1] : String(d);
    }

    return null;
  }

  // Petit helper de "pool" pour limiter la concurrence
  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let idx = 0;

    async function runner() {
      while (idx < items.length) {
        const current = idx++;
        results[current] = await worker(items[current], current);
      }
    }

    const n = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: n }, runner));
    return results;
  }

  async function loadAndInjectAveragesForList(trajetsList, { concurrency = 5, useCache = true } = {}) {
    if (!Array.isArray(trajetsList) || trajetsList.length === 0) return;

    // 1) Groupe les trajets par driverId (évite de rescanner tout trajetsList pour chaque id)
    const tripsByDriverId = new Map(); // driverId -> [trip, trip, ...]
    for (const t of trajetsList) {
      const id = extractDriverId(t);
      if (!id) continue;
      if (!tripsByDriverId.has(id)) tripsByDriverId.set(id, []);
      tripsByDriverId.get(id).push(t);
    }

    const driverIds = Array.from(tripsByDriverId.keys());
    if (driverIds.length === 0) return;

    // 2) Worker: fetch reviews -> compute avg -> inject into trips + update UI
    async function fetchAndInject(id) {
      try {
        if (useCache && __driverAvgCache.has(id)) {
          const cachedAvg = __driverAvgCache.get(id);
          // inject + update UI
          for (const trip of tripsByDriverId.get(id) || []) {
            if (trip?.chauffeur && typeof trip.chauffeur === 'object') trip.chauffeur.averageRating = cachedAvg;
            else trip.chauffeurAverageRatingFallback = cachedAvg;
          }
          updateUserRatingUI(String(id), cachedAvg);
          return;
        }

        const reviewsData = await apiFetch(`/users/${id}/reviews`);

        let arr = [];
        if (Array.isArray(reviewsData)) arr = reviewsData;
        else if (reviewsData && Array.isArray(reviewsData['hydra:member'])) arr = reviewsData['hydra:member'];
        else if (reviewsData && Array.isArray(reviewsData.items)) arr = reviewsData.items;

        const ratings = arr
          .map(r => Number(r?.rating ?? r?.stars ?? r?.note ?? NaN))
          .filter(n => Number.isFinite(n));

        const avg = computeAverageRating(ratings.map(r => ({ rating: r })));

        if (useCache) __driverAvgCache.set(id, avg);

        // inject avg sur tous les trajets de ce driver
        for (const trip of tripsByDriverId.get(id) || []) {
          if (trip?.chauffeur && typeof trip.chauffeur === 'object') trip.chauffeur.averageRating = avg;
          else trip.chauffeurAverageRatingFallback = avg;
        }

        updateUserRatingUI(String(id), avg);
      } catch (err) {
        console.warn('[covoiturage] loadAndInjectAveragesForList failed for', id, err);
      }
    }

    // 3) Exécute avec concurrence limitée (plus stable que batch + Promise.all)
    await runWithConcurrency(driverIds, concurrency, fetchAndInject);
  }

  // Appel après avoir construit `trajets`
  showLoader('Calcul des notes conducteurs…');
  await loadAndInjectAveragesForList(trajets);

  // Ajoute la durée calculée à chaque trajet
  trajets.forEach(trajet => {
    updatePlacesFromVehicle(trajet);
    trajet.duree = calculerDureeEnHeures(trajet.heureDepart, trajet.heureArrivee);
  });

  // après tous les await et traitements (ex: après loadAndInjectAveragesForList)
  console.log('[covoiturage] trajetsFromApi.length =', trajetsFromApi.length);

  // Puis affichage final
  displayTrajets(trajets);
  hideLoader();

  // Convertit "HHhMM" en minutes
  function timeStringToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split('h').map(Number);
    return hours * 60 + (minutes || 0);
  }

  // Calcule la durée en heures décimales
  function calculerDureeEnHeures(heureDepart, heureArrivee) {
    const departMinutes = timeStringToMinutes(heureDepart);
    const arriveeMinutes = timeStringToMinutes(heureArrivee);
    let dureeMinutes = arriveeMinutes - departMinutes;
    if (dureeMinutes < 0) dureeMinutes += 24 * 60;
    return dureeMinutes / 60;
  }

  // Ajoute la durée calculée à chaque trajet
  trajets.forEach(trajet => {
    updatePlacesFromVehicle(trajet);
    trajet.duree = calculerDureeEnHeures(trajet.heureDepart, trajet.heureArrivee);
  });

  // Affiche les trajets dans le container
  function displayTrajets(filteredTrajets) {
    resultsContainer.innerHTML = '';
    // supprimer les trajets démarrés par sécurité
    const visible = (filteredTrajets || []).filter(t => isTripActive(t));
    if (visible.length === 0) {
      resultsContainer.innerHTML = '<p>Aucun trajet ne correspond à votre recherche.</p>';
      return;
    }
    visible.forEach(trajet => {
      updatePlacesFromVehicle(trajet);
      const card = createTrajetCard(trajet);
      if (card) resultsContainer.appendChild(card);
    });
  }

  // Récupération des éléments de la barre de recherche avec id
  const inputDepart = document.getElementById('inputDepartCovoiturage');
  const inputArrivee = document.getElementById('inputArriveeCovoiturage');
  const inputDate = document.getElementById('date-depart-input');
  const inputHeure = document.getElementById('heure-depart-input');
  const inputPassagers = document.getElementById('nombre-passagers-input');
  const selectType = document.getElementById('type-trajet-select');

  // Fonction pour récupérer les paramètres URL
  function getQueryParams() {
    const params = {};
    window.location.search.substring(1).split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
    return params;
  }

  // Récupération des paramètres et pré-remplissage des inputs
  const params = getQueryParams();
  if (params.depart && inputDepart) {
    inputDepart.value = params.depart;
  }
  if (params.arrivee && inputArrivee) {
    inputArrivee.value = params.arrivee;
  }

  // Récupère les valeurs des filtres desktop uniquement (pour filtrer)
  function getDesktopFilters() {
    const desktopCheckboxes = Array.from(document.querySelectorAll('.filters input[type="checkbox"]:checked'))
      .map(cb => normalizeTypeKey(cb.value));

    const prixMaxDesktop = document.getElementById('prix-max')?.value;
    const dureeMaxDesktop = document.getElementById('duree-max')?.value;
    const noteMiniDesktop = document.getElementById('note-mini')?.value;

    return {
      checkedTypes: desktopCheckboxes,
      prixMax: prixMaxDesktop ? parseFloat(prixMaxDesktop) : Infinity,
      dureeMax: dureeMaxDesktop ? parseFloat(dureeMaxDesktop) : Infinity,
      noteMini: noteMiniDesktop ? parseInt(noteMiniDesktop) : 1,
    };
  }

  function includesWord(haystack, needle) {
    if (!haystack || !needle) return false;
    const words = haystack.split(/\s+/);
    return words.some(w => w === needle);
  }

  function formatDateISOToDayMonth(isoDate) {
    if (!isoDate) return '';
    const s = String(isoDate).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';

    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);

    // ✅ Date construite en local, pas via parsing UTC
    const d = new Date(yyyy, mm - 1, dd);

    const options = { day: 'numeric', month: 'long' };
    return d.toLocaleDateString('fr-FR', options).toLowerCase();
  }

  // Convertit une heure ISO (HH:MM) en format "HHhMM", ex: "16:00" -> "16h00"
  function formatTimeISOToCustom(timeStr) {
    if (!timeStr) return '';
    return timeStr.replace(':', 'h');
  }

  // Fonction de filtrage combiné recherche + filtres desktop
  function filterBySearchAndFilters() {
    console.log('🔍 === DÉBUT FILTRAGE ===');
    console.log('📊 Nombre total de trajets:', trajets.length);
    console.log('📊 Premier trajet:', trajets[0]);
    
    // Logs des inputs
    console.log('🔎 INPUT depart:', inputDepart?.value);
    console.log('🔎 INPUT arrivee:', inputArrivee?.value);
    console.log('🔎 INPUT date:', inputDate?.value);
    console.log('🔎 INPUT heure:', inputHeure?.value);
    console.log('🔎 INPUT passagers:', inputPassagers?.value);
    console.log('🔎 INPUT type:', selectType?.value);
  
    showLoader('Application des filtres…');
  
    // --- Préparation des inputs ---
    const iDepart = normalizeStr(inputDepart?.value || '');
    const iArrivee = normalizeStr(inputArrivee?.value || '');
    const iDate = (inputDate?.value || '').trim();
    const iHeure = normalizeTimeToMinutes(inputHeure?.value);
    const iPassagers = parseInt(inputPassagers?.value) || 0;
    const iType = normalizeTypeKey(selectType?.value || '');
  
    console.log('✅ NORMALISÉS:');
    console.log('  iDepart:', iDepart);
    console.log('  iArrivee:', iArrivee);
    console.log('  iDate:', iDate);
    console.log('  iHeure:', iHeure);
    console.log('  iPassagers:', iPassagers);
    console.log('  iType:', iType);
  
    const { checkedTypes, prixMax, dureeMax, noteMini } = getDesktopFilters();
    console.log('🎛️ Filtres desktop:', { checkedTypes, prixMax, dureeMax, noteMini });
  
    function normalizeStr(s) {
      return s ? s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
    }
  
    const filtered = trajets.filter(trajet => {
      console.log('🧪 Test trajet ID:', trajet.id);
      
      // --- Extraction des données du trajet ---
      const tDepart = normalizeStr(trajet.depart || trajet.departure || '');
      const tArrivee = normalizeStr(trajet.arrivee || trajet.arrival || '');
      const tDate = (trajet.date || trajet.departureDate || '').trim();
      const tHeure = normalizeTimeToMinutes(trajet.heureDepart || trajet.departureTime);
      const tType = normalizeTypeKey(trajet.type || trajet.fuelType || trajet.vehicle?.type || '');
  
      console.log('  📍 tDepart:', tDepart, '| tArrivee:', tArrivee);
      console.log('  📅 tDate:', tDate, '| tHeure:', tHeure);
      console.log('  🚗 tType:', tType);
  
      const tPlaces = (typeof trajet.remainingPlaces === 'number')
        ? trajet.remainingPlaces
        : Number(trajet.places ?? trajet.capacity ?? trajet.vehicle?.places ?? trajet.car?.places) || 0;
  
      // --- Filtres de recherche ---
      const departOk = !iDepart || tDepart.includes(iDepart);
      const arriveeOk = !iArrivee || tArrivee.includes(iArrivee);
      const dateOk = !iDate || tDate === iDate;
      const heureOk = !iHeure || (tHeure !== null && tHeure >= iHeure);
      const placesOk = iPassagers === 0 || tPlaces >= iPassagers;
      const typeRechercheOk = !iType || iType === 'non-specifie' || tType === iType;
  
      console.log('  ✅ departOk:', departOk, '| arriveeOk:', arriveeOk);
      console.log('  ✅ dateOk:', dateOk, '| heureOk:', heureOk);
      console.log('  ✅ placesOk:', placesOk, '| typeRechercheOk:', typeRechercheOk);
  
      // --- Filtres latéraux ---
      const typeFilterOk = (checkedTypes.length === 0) || checkedTypes.includes(tType);
      const prixOk = (typeof trajet.prix === 'number' ? trajet.prix : Number(trajet.prix || Infinity)) <= prixMax;
      const dureeOk = (typeof trajet.duree === 'number' ? trajet.duree : Infinity) <= dureeMax;
      const noteOk = (typeof trajet.rating === 'number' ? trajet.rating : (trajet.chauffeur?.averageRating || 0)) >= noteMini;
  
      console.log('  ✅ typeFilterOk:', typeFilterOk, '| prixOk:', prixOk);
      console.log('  ✅ dureeOk:', dureeOk, '| noteOk:', noteOk);
  
      const accept = departOk && arriveeOk && dateOk && heureOk && placesOk && typeRechercheOk &&
        typeFilterOk && prixOk && dureeOk && noteOk;
  
      console.log('  🎯 RÉSULTAT:', accept ? '✅ ACCEPTÉ' : '❌ REJETÉ');
  
      return accept;
    });
  
    console.log('🏁 Trajets filtrés:', filtered.length, 'sur', trajets.length);
    console.log('🏁 IDs filtrés:', filtered.map(t => t.id));
    
    displayTrajets(filtered);
    hideLoader();
  }

  // Copie desktop -> offcanvas (au chargement et à l'ouverture de l'offcanvas)
  function copyDesktopToOffcanvas() {
    ['prix-max', 'duree-max', 'note-mini'].forEach(id => {
      const desktopInput = document.getElementById(id);
      const offcanvasInput = document.getElementById(id + '-offcanvas');
      if (desktopInput && offcanvasInput) {
        offcanvasInput.value = desktopInput.value;
      }
    });
    const desktopCheckboxes = document.querySelectorAll('.filters input[type="checkbox"]');
    const offcanvasCheckboxes = document.querySelectorAll('#filtersOffcanvas input[type="checkbox"]');
    desktopCheckboxes.forEach((cb, i) => {
      if (offcanvasCheckboxes[i]) offcanvasCheckboxes[i].checked = cb.checked;
    });
  }

  // Copie offcanvas -> desktop (au clic sur Appliquer)
  function copyOffcanvasToDesktop() {
    ['prix-max', 'duree-max', 'note-mini'].forEach(id => {
      const desktopInput = document.getElementById(id);
      const offcanvasInput = document.getElementById(id + '-offcanvas');
      if (desktopInput && offcanvasInput) {
        desktopInput.value = offcanvasInput.value;
      }
    });
    const desktopCheckboxes = document.querySelectorAll('.filters input[type="checkbox"]');
    const offcanvasCheckboxes = document.querySelectorAll('#filtersOffcanvas input[type="checkbox"]');
    offcanvasCheckboxes.forEach((cb, i) => {
      if (desktopCheckboxes[i]) desktopCheckboxes[i].checked = cb.checked;
    });
  }

  // Au chargement, copie desktop -> offcanvas
  copyDesktopToOffcanvas();

  // À l'ouverture de l'offcanvas, copie desktop -> offcanvas
  const offcanvasEl = document.getElementById('filtersOffcanvas');
  if (offcanvasEl) {
    offcanvasEl.addEventListener('show.bs.offcanvas', () => {
      copyDesktopToOffcanvas();
    });
  }

  // Quand on modifie un filtre desktop, applique directement le filtre (sans toucher à offcanvas)
  document.querySelectorAll('.filters input, .filters select').forEach(el => {
    el.addEventListener('change', () => {
      filterBySearchAndFilters();
    });
  });

  // Bouton Appliquer offcanvas : copie offcanvas -> desktop, applique filtre, ferme offcanvas
  document.querySelectorAll('.apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOffcanvasShown = offcanvasEl.classList.contains('show'); // Vérifie si offcanvas est ouvert

      if (isOffcanvasShown) {
        copyOffcanvasToDesktop();
      }
      filterBySearchAndFilters();
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvasInstance) offcanvasInstance.hide();
    });
  });

  // Bouton Réinitialiser offcanvas : reset desktop + offcanvas, applique filtre, ferme offcanvas
  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Reset desktop
      document.querySelectorAll('.filters input[type="checkbox"]').forEach(cb => cb.checked = true);
      document.getElementById('prix-max').value = '';
      document.getElementById('duree-max').value = '';
      document.getElementById('note-mini').value = '1';

      // Reset offcanvas
      document.querySelectorAll('#filtersOffcanvas input[type="checkbox"]').forEach(cb => cb.checked = true);
      document.getElementById('prix-max-offcanvas').value = '';
      document.getElementById('duree-max-offcanvas').value = '';
      document.getElementById('note-mini-offcanvas').value = '1';

      filterBySearchAndFilters();
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvasInstance) offcanvasInstance.hide();
    });
  });

  // Gestion de la classe "valid" sur le select type trajet
  if (selectType) {
    function updateSelectValidClass() {
      if (selectType.value === "") {
        selectType.classList.remove("valid");
      } else {
        selectType.classList.add("valid");
      }
    }

    selectType.addEventListener("change", updateSelectValidClass);
    updateSelectValidClass();
  }

  // Bouton Recherche lance la recherche combinée
  const btnReserver = document.querySelector('.search-btn.reserve-btn');
  if (btnReserver) {
    btnReserver.addEventListener('click', () => {
      filterBySearchAndFilters();
    });
  }

  // try attach to multiple selectors and log what we found
  const selectorsToTry = [
    '.search-btn.reserve-btn',
    'button#search',                // id possible
    'button.search-btn',
    'button[type="submit"].search-btn',
    '.search-btn',
    '#search-button',
  ];

  let bound = false;
  for (const sel of selectorsToTry) {
    const el = document.querySelector(sel);
    console.log('[DEBUG selector test] trying', sel, '->', !!el);
    if (el && !bound) {
      el.addEventListener('click', (ev) => {
        console.log('[DEBUG] Recherche button clicked (selector:', sel, ')', ev);
        // Empêche le submit si le bouton est dans un <form>
        if (ev && ev.preventDefault) ev.preventDefault();
        filterBySearchAndFilters();
      });
      bound = true;
      console.log('[DEBUG] Bound filterBySearchAndFilters to', sel);
    }
  }

  if (!bound) {
    // fallback: bind to the first <button> with text 'Recherche'
    const btnText = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim().toLowerCase().includes('recherche'));
    if (btnText) {
      btnText.addEventListener('click', (ev) => {
        console.log('[DEBUG] Recherche button clicked (fallback by text)');
        ev.preventDefault();
        filterBySearchAndFilters();
      });
      console.log('[DEBUG] Bound filterBySearchAndFilters to button found by text "Recherche".');
      bound = true;
    }
  }

  if (!bound) {
    console.warn('[DEBUG] Aucun bouton Recherche trouvé — ouvre l\'inspecteur et vérifie le sélecteur ou fournis le HTML du bouton.');
  }

  // si le bouton est effectivement submit, intercepte le submit du form parent
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (ev) => {
      const submitBtnText = (ev.submitter && ev.submitter.textContent) ? ev.submitter.textContent.toLowerCase() : '';
      if (submitBtnText.includes('recherche') || submitBtnText.includes('chercher')) {
        console.log('[DEBUG] form submit intercepte par texte du submiter:', submitBtnText);
        ev.preventDefault();
        filterBySearchAndFilters();
      }
    });
  });

  // helper pour recalculer src d'un avatar à partir d'un trajet
  function getAvatarForTrajet(trajet) {
    return resolveAvatarSrc(trajet.chauffeur?.photo || me?.photo || '/images/default-avatar.png');
  }

  function updateAllAvatars() {
    document.querySelectorAll('.result-card').forEach(card => {
      const id = card.dataset.id;
      const trajet = trajets.find(t => t.id === id);
      if (!trajet) return;
      const img = card.querySelector('img.profile-photo');
      if (img) img.src = getAvatarForTrajet(trajet);
    });
  }

  // écoute l'événement déclenché quand le profil est sauvegardé ailleurs
  document.addEventListener('userUpdated', () => {
    me = getCurrentUser();      // recharge l'objet utilisateur
    updateAllAvatars();         // met à jour les images visibles
  });

  // Installer le listener une seule fois (évite doublons dans un contexte SPA)
  if (!window.__ecoride_carpoolUpdated_listener_installed) {
    window.__ecoride_carpoolUpdated_listener_installed = true;

    window.addEventListener('ecoride:carpoolUpdated', (ev) => {
      const d = ev.detail || {};
    
      // id possible dans d.id, d.updated.id, d.updated['@id'] ou uri "/api/carpools/6"
      let id = d.id || (d.updated && (d.updated.id || d.updated['@id']));
      if (!id && d.updated && typeof d.updated['@id'] === 'string') {
        const parts = d.updated['@id'].split('/').filter(Boolean);
        id = parts[parts.length - 1];
      }
      if (!id) return;
      id = String(id);
    
      console.log('[ecoride] carpoolUpdated received for id=', id, 'detail=', d.updated || d);
    
      const idx = trajets.findIndex(t => String(t.id) === id);
    
      // si pas d.updated -> rien à faire
      if (!d.updated) return;
    
      // si l'objet n'est pas en mémoire mais il y a une card DOM, on la met à jour/supprime selon le statut
      const existingCard = document.querySelector(`.result-card[data-id="${id}"]`);
    
      if (idx === -1) {
        // si la card existe et que le trajet est désormais démarré -> la supprimer
        const temp = { ...(d.updated) }; // normaliser pour !isTripActive
        if (!isTripActive(temp)) {
          if (existingCard) existingCard.remove();
          window.dispatchEvent(new CustomEvent('ecoride:carpoolRemovedLocal', { detail: { id } }));
          filterBySearchAndFilters();
        }
        return;
      }
    
      // Merge léger (préserve champs calculés déjà présents)
      trajets[idx] = { ...trajets[idx], ...d.updated };
    
      // recalcul remaining de façon sûre (somme seats/places)
      const reserved = Array.isArray(trajets[idx].passagers)
        ? trajets[idx].passagers.reduce((s, p) => s + (Number(p.places) || Number(p.seats) || 1), 0)
        : 0;
      const cap = Number(
        trajets[idx].capacity ??
        trajets[idx].places ??
        trajets[idx].vehicle?.places ??
        trajets[idx].car?.places ??
        0
      );
      trajets[idx].remainingPlaces = Math.max(0, cap - reserved);
    
      // Mettre à jour la card DOM si visible
      if (existingCard) {
        const placesEl = existingCard.querySelector('.places');
        const remaining = trajets[idx].remainingPlaces ?? 0;
        if (placesEl) placesEl.textContent = `${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}`;
      }
    
      // Si le trajet devient démarré, retirer la card et l'objet de la liste
      if (!isTripActive(trajets[idx])) {
        console.debug('[covoiturage] trajet passé en état démarré -> suppression front id=', id, trajets[idx].status ?? trajets[idx].rawStatus);
        // retirer de la liste en mémoire
        trajets.splice(idx, 1);
        // retirer la card DOM si présente
        if (existingCard) existingCard.remove();
        // notifier éventuellement d'autres modules
        window.dispatchEvent(new CustomEvent('ecoride:carpoolRemovedLocal', { detail: { id } }));
        // rafraîchir l'affichage
        filterBySearchAndFilters();
        return; // on a déjà traité la suppression
      }
    
      // Optionnel : notifier localement d'autres modules
      window.dispatchEvent(new CustomEvent('ecoride:carpoolUpdatedLocal', { detail: { id, updated: trajets[idx] } }));
    });
  }
});