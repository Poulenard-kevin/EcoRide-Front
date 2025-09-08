document.addEventListener('pageContentLoaded', () => {
    const resultsContainer = document.querySelector('.results');
    if (!resultsContainer) {
      console.error('Conteneur .results introuvable');
      return;
    }
  
    // Données des trajets
    const trajets = [
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
              <p class="places">Place: ${trajet.places}</p>
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
              <p class="price">${trajet.prix}€</p>
              <button class="detail-btn">Détail</button>
            </div>
          </div>
        </div>
      `;
  
      card.querySelector('.detail-btn').addEventListener('click', () => {
        window.location.href = `/detail?id=${trajet.id}`;
      });
  
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
  
    // Récupère les valeurs des filtres desktop uniquement (pour filtrer)
    function getFilterValues() {
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
        filterTrajets();
      });
    });
  
    // Bouton Appliquer offcanvas : copie offcanvas -> desktop, applique filtre, ferme offcanvas
    document.querySelectorAll('.apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const offcanvasEl = document.getElementById('filtersOffcanvas');
        const isOffcanvasShown = offcanvasEl.classList.contains('show'); // Vérifie si offcanvas est ouvert
  
        if (isOffcanvasShown) {
          copyOffcanvasToDesktop();
        }
        filterTrajets();
        closeOffcanvas();
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
  
        filterTrajets();
        closeOffcanvas();
      });
    });
  
    // Ferme l'offcanvas Bootstrap
    function closeOffcanvas() {
      const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvas) offcanvas.hide();
    }
  
    // Filtre les trajets selon les valeurs des filtres desktop
    function filterTrajets() {
      const { checkedTypes, prixMax, dureeMax, noteMini } = getFilterValues();
  
      const typesToFilter = checkedTypes.length > 0 ? checkedTypes : ['electrique', 'hybride', 'thermique', 'economique'];
  
      const filtered = trajets.filter(trajet => {
        const typeOk = typesToFilter.includes(trajet.type.toLowerCase());
        const prixOk = trajet.prix <= prixMax;
        const dureeOk = trajet.duree <= dureeMax;
        const noteOk = trajet.rating >= noteMini;
  
        return typeOk && prixOk && dureeOk && noteOk;
      });
  
      displayTrajets(filtered);
    }
  
    // Affiche tous les trajets au départ
    displayTrajets(trajets);
  });

  document.addEventListener('pageContentLoaded', () => {
    const resultsContainer = document.querySelector('.results');
    if (!resultsContainer) {
      console.error('Conteneur .results introuvable');
      return;
    }
  
    // Données des trajets (exemple)
    const trajets = [
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
      },
    ];
  
    // Fonction pour créer la carte trajet (identique à ta version)
    function createTrajetCard(trajet) {
      const card = document.createElement('div');
      card.classList.add('result-card');
      card.dataset.id = trajet.id;
  
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
              <p class="places">Place: ${trajet.places}</p>
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
              <p class="price">${trajet.prix}€</p>
              <button class="detail-btn">Détail</button>
            </div>
          </div>
        </div>
      `;
  
      card.querySelector('.detail-btn').addEventListener('click', () => {
        window.location.href = `/detail?id=${trajet.id}`;
      });
  
      return card;
    }
  
    function capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
  
    function displayTrajets(filteredTrajets) {
      resultsContainer.innerHTML = '';
      if (filteredTrajets.length === 0) {
        resultsContainer.innerHTML = '<p>Aucun trajet ne correspond à votre recherche.</p>';
        return;
      }
      filteredTrajets.forEach(trajet => {
        resultsContainer.appendChild(createTrajetCard(trajet));
      });
    }
  
    // Récupère les valeurs des filtres desktop (existants)
    function getDesktopFilters() {
      const checkedTypes = Array.from(document.querySelectorAll('.filters input[type="checkbox"]:checked'))
        .map(cb => cb.value.toLowerCase());
  
      const prixMax = parseFloat(document.getElementById('prix-max').value) || Infinity;
      const dureeMax = parseFloat(document.getElementById('duree-max').value) || Infinity;
      const noteMini = parseInt(document.getElementById('note-mini').value) || 1;
  
      return { checkedTypes, prixMax, dureeMax, noteMini };
    }
  
    // Récupération des inputs de recherche
    const inputDepart = document.querySelector('.search-input[placeholder="Lieux de départ"]');
    const inputArrivee = document.querySelector('.search-input[placeholder="Lieux d\'arrivée"]');
    const inputDate = document.querySelector('.search-input[placeholder="Date de départ"]');
    const inputHeure = document.querySelector('.search-input[placeholder="Heure de départ"]');
    const inputPassagers = document.getElementById('nombre-passagers-input');
    const selectType = document.getElementById('type-trajet-select');
  
    // Fonction de filtrage combiné recherche + filtres desktop
    function filterBySearchAndFilters() {
        const departVal = inputDepart.value.trim().toLowerCase();
        const arriveeVal = inputArrivee.value.trim().toLowerCase();
      
        const filtered = trajets.filter(trajet => {
          const trajetDepart = trajet.depart.toLowerCase().trim();
          const trajetArrivee = trajet.arrivee.toLowerCase().trim();
      
          const departOk = departVal === '' || trajetDepart.includes(departVal);
          const arriveeOk = arriveeVal === '' || trajetArrivee.includes(arriveeVal);
      
          // Commente tout le reste pour l’instant
          // const dateOk = dateVal === '' || trajet.date.toLowerCase().includes(dateVal);
          // const heureOk = heureVal === '' || trajet.heureDepart.toLowerCase().includes(heureVal);
          // const placesOk = passagersVal === 0 || trajet.places >= passagersVal;
          // const typeRechercheOk = typeVal === '' || trajet.type.toLowerCase() === typeVal;
      
          // const typeFilterOk = checkedTypes.length === 0 || checkedTypes.includes(trajet.type.toLowerCase());
          // const prixOk = trajet.prix <= prixMax;
          // const dureeOk = trajet.duree <= dureeMax;
          // const noteOk = trajet.rating >= noteMini;
      
          return departOk && arriveeOk;
        });
      
        displayTrajets(filtered);
      }
  
    // Applique le filtre desktop à chaque changement (comme avant)
    document.querySelectorAll('.filters input, .filters select').forEach(el => {
      el.addEventListener('change', filterBySearchAndFilters);
    });
  
    // Bouton Réserver lance la recherche combinée
    const btnReserver = document.querySelector('.search-btn.reserve-btn');
    btnReserver.addEventListener('click', () => {
      filterBySearchAndFilters();
    });
  
    // Affiche tous les trajets au départ
    displayTrajets(trajets);
  });