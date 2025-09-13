// -------------------- Helpers --------------------
document.addEventListener('pageContentLoaded', () => {
  const resultsContainer = document.querySelector('.results');
  if (!resultsContainer) {
    return; // 🚪 sort si pas sur la page covoiturage
  }

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
    let trajets = [
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
    ];

    // Charger et normaliser les trajets publiés depuis l'espace utilisateur (localStorage)
    const trajetsSauvegardes = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    if (trajetsSauvegardes.length > 0) {
      // const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || '[]'); // optionnel si besoin
      const normalized = trajetsSauvegardes.map(t => {
        const nt = {...t};
        nt.passagers = Array.isArray(nt.passagers) ? nt.passagers : [];
        // Si capacity manquante : prendre vehicle.places ou nt.places ou fallback 4
        const vehiclePlaces = nt.vehicle?.places ?? nt.vehicle?.seats ?? null;
        nt.capacity = (nt.capacity !== undefined && nt.capacity !== null)
          ? Number(nt.capacity)
          : (vehiclePlaces !== null ? Number(vehiclePlaces) : (nt.places !== undefined ? Number(nt.places) : 4));
        // Si places manquante : initialiser à capacity si création (ou garder si existe)
        nt.places = (nt.places !== undefined && nt.places !== null) ? Number(nt.places) : Number(nt.capacity);
        return nt;
      });

      trajets.push(...normalized);
      console.log("🚗 Trajets fusionnés avec ceux de l'utilisateur :", normalized);
    }
  
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
  
    // Crée la carte HTML d’un trajet
    function createTrajetCard(trajet) {
      const card = document.createElement('div');
      card.classList.add('result-card');
      card.dataset.id = trajet.id;

      // ======= Calcul des places restantes (source unique) =======
      // Priorité : trajet.places si c'est un nombre
      // Sinon si capacity défini => capacity - passagers.length
      // Sinon fallback 0
      const passagersArray = Array.isArray(trajet.passagers) ? trajet.passagers : [];
      const remaining = (typeof trajet.places === 'number')
        ? trajet.places
        : (typeof trajet.capacity === 'number'
            ? Math.max(0, trajet.capacity - passagersArray.length)
            : (typeof trajet.places === 'string' && !isNaN(Number(trajet.places)) ? Number(trajet.places) : 0)
        );

      const placesText = `${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}`;

      // ===========================================================

      card.innerHTML = `
        <div class="result-header">
          <p class="date">${trajet.date}</p>
        </div>
        <div class="result-body">
          <div class="profile-column">
            <img src="${trajet.chauffeur.photo}" alt="Profil" class="profile-photo">
            <div class="pseudo-rating">
              <p class="pseudo">${trajet.chauffeur.pseudo}</p>
              <p class="rating">${'★'.repeat(trajet.chauffeur.rating)}${'☆'.repeat(5 - trajet.chauffeur.rating)}</p>
            </div>
            <div class="column">
              <p class="type">${capitalize(trajet.type)}</p>
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

      const btn = card.querySelector('.detail-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const newPath = `/detail/${trajet.id}`;
          window.history.pushState({}, "", newPath);
          window.dispatchEvent(new Event("popstate"));
        });
      }

      return card;
    }
  
    // Capitalise la première lettre
    function capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
  
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
        .map(cb => cb.value.toLowerCase());
  
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
  
    // Convertit une date ISO (YYYY-MM-DD) en "jour mois" en français, ex: "16 septembre"
    function formatDateISOToDayMonth(isoDate) {
      if (!isoDate) return '';
      const dateObj = new Date(isoDate);
      const options = { day: 'numeric', month: 'long' };
      return dateObj.toLocaleDateString('fr-FR', options).toLowerCase();
    }
  
    // Convertit une heure ISO (HH:MM) en format "HHhMM", ex: "16:00" -> "16h00"
    function formatTimeISOToCustom(timeStr) {
      if (!timeStr) return '';
      return timeStr.replace(':', 'h');
    }
  
    // Fonction de filtrage combiné recherche + filtres desktop
    function filterBySearchAndFilters() {
      const departVal = inputDepart.value.trim().toLowerCase();
      const arriveeVal = inputArrivee.value.trim().toLowerCase();
      const dateVal = formatDateISOToDayMonth(inputDate.value);
      const heureVal = formatTimeISOToCustom(inputHeure.value);
      const passagersVal = parseInt(inputPassagers.value) || 0;
      const typeVal = selectType.value.toLowerCase();
  
      const { checkedTypes, prixMax, dureeMax, noteMini } = getDesktopFilters();
  
      const filtered = trajets.filter(trajet => {
        const trajetDepart = trajet.depart.toLowerCase().trim();
        const trajetArrivee = trajet.arrivee.toLowerCase().trim();
  
        const departOk = departVal === '' || trajetDepart.includes(departVal);
        const arriveeOk = arriveeVal === '' || trajetArrivee.includes(arriveeVal);
        const dateOk = dateVal === '' || trajet.date.toLowerCase().includes(dateVal);
        const heureOk = heureVal === '' || trajet.heureDepart.toLowerCase().includes(heureVal);
        const placesOk = passagersVal === 0 || trajet.places >= passagersVal;
        const typeRechercheOk = typeVal === '' || trajet.type.toLowerCase() === typeVal;
  
        const typeFilterOk = checkedTypes.length === 0 || checkedTypes.includes(trajet.type.toLowerCase());
        const prixOk = trajet.prix <= prixMax;
        const dureeOk = trajet.duree <= dureeMax;
        const noteOk = trajet.rating >= noteMini;
  
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
    offcanvasEl.addEventListener('show.bs.offcanvas', () => {
      copyDesktopToOffcanvas();
    });
  
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
    btnReserver.addEventListener('click', () => {
      filterBySearchAndFilters();
    });
  
    // Affiche tous les trajets au départ
    displayTrajets(trajets);
  
  
});