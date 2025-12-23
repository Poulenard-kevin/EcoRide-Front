// covoiturage.js (module)
import { resolveAvatarSrc, getProfileAvatarFromStorage, getCurrentUser, enrichTrajetWithCurrentUser, genId, formatDateJJMMAAAA } from './trajets.js';
import { apiFetch } from '/assets/js/api.js';
import { carpoolFromApiAsync } from '/assets/js/trips-api.js';
import { normalizeTypeKey, labelFromTypeKey } from '/assets/js/type-utils.js';

console.log('[covoiturage] script chargé');

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
// --- Fin utilitaires ---

function createTrajetCard(trajet) {
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

  // Construire innerHTML (utilise typeKey et label)
  card.innerHTML = `
    <div class="result-header">
      <p class="date">${capitalizeFirst(formatFullFrDay(trajet.date))}</p>
    </div>
    <div class="result-body">
      <div class="profile-column">
        <img src="${avatarSrc}" alt="Profil ${trajet.chauffeur?.pseudo || ''}" class="profile-photo" onerror="this.onerror=null;this.src='/images/default-avatar.png'">
        <div class="pseudo-rating">
          <p class="pseudo">${trajet.chauffeur?.pseudo || 'Inconnu'}</p>
          <p class="rating">${'★'.repeat(Math.round(trajet.chauffeur?.averageRating ?? 5))}${'☆'.repeat(5 - Math.round(trajet.chauffeur?.averageRating ?? 5))}</p>
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
  if (!resultsContainer) {
    return; // 🚪 sort si pas sur la page covoiturage
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

    // Tu peux passer '/carpools' ou '/api/carpools' :
    // apiFetch va normaliser en http://127.0.0.1:8000/api/carpools
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

    console.log('DEBUG mapped first 3 dates:', trajetsFromApi.slice(0,3).map(t => ({
      id: t.id,
      date: t.date,
      heureDepart: t.heureDepart,
      type: t.type
    })));

    console.log('🚗 Trajets chargés depuis l’API (normalisés) :', trajetsFromApi);
  } catch (err) {
    console.warn(
      '⚠️ Erreur chargement trajets API',
      err.status,
      err.body || err.message
    );
  }

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
  trajets = [...trajetsFromApi];
  
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
    trajet.duree = calculerDureeEnHeures(trajet.heureDepart, trajet.heureArrivee);
  });


  // Affiche les trajets dans le container
  function displayTrajets(filteredTrajets) {
    resultsContainer.innerHTML = '';
    if (filteredTrajets.length === 0) {
      resultsContainer.innerHTML = '<p>Aucun trajet ne correspond à votre recherche.</p>';
      return;
    }
    filteredTrajets.forEach(trajet => {
      const card = createTrajetCard(trajet);
      resultsContainer.appendChild(card);
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
    // valeurs issues des inputs (récupérées à chaque appel)
    const departVal = (inputDepart?.value || '').trim().toLowerCase();
    const arriveeVal = (inputArrivee?.value || '').trim().toLowerCase();
    const dateVal = formatDateISOToDayMonth(inputDate?.value || '');
    const heureVal = formatTimeISOToCustom(inputHeure?.value || '');
    const passagersVal = parseInt(inputPassagers?.value) || 0;
    const typeVal = normalizeTypeKey(selectType?.value || '');
  
    const { checkedTypes, prixMax, dureeMax, noteMini } = getDesktopFilters();
  
    const filtered = trajets.filter(trajet => {
      // sécuriser les champs du trajet
      const trajetDepart = String(trajet.depart || '').toLowerCase().trim();
      const trajetArrivee = String(trajet.arrivee || '').toLowerCase().trim();
      const trajetDate = String(trajet.date || '').toLowerCase();
      const trajetHeure = String(trajet.heureDepart || '').toLowerCase();
      const trajetType = normalizeTypeKey(trajet.type || trajet.fuelType || trajet.vehicle?.type || '');
      const trajetPlaces = typeof trajet.remainingPlaces === 'number' ? trajet.remainingPlaces : Number(trajet.places || trajet.capacity || 0);
  
      const departOk = departVal === '' || trajetDepart.includes(departVal);
      const arriveeOk = arriveeVal === '' || trajetArrivee.includes(arriveeVal);
      const dateOk = dateVal === '' || trajetDate.includes(dateVal);
      const heureOk = heureVal === '' || trajetHeure.includes(heureVal);
      const placesOk = passagersVal === 0 || trajetPlaces >= passagersVal;
      const typeRechercheOk = typeVal === '' || trajetType === typeVal;
  
      const typeFilterOk = checkedTypes.length === 0 || checkedTypes.includes(trajetType);
      const prixOk = (typeof trajet.prix === 'number' ? trajet.prix : Number(trajet.prix || Infinity)) <= prixMax;
      const dureeOk = (typeof trajet.duree === 'number' ? trajet.duree : Infinity) <= dureeMax;
      const noteOk = (typeof trajet.rating === 'number' ? trajet.rating : 0) >= noteMini;
  
      return departOk && arriveeOk && dateOk && heureOk && placesOk && typeRechercheOk &&
        typeFilterOk && prixOk && dureeOk && noteOk;
    });
  
    console.log('Trajets filtrés:', filtered.map(t => t.id));
    displayTrajets(filtered);
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

  // Affiche tous les trajets au départ
  displayTrajets(trajets);
});