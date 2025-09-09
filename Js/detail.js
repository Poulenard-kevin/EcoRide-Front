console.log("detail.js chargé");

document.addEventListener('pageContentLoaded', () => {
  console.log("detail.js exécuté après chargement contenu");

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    console.warn("Aucun ID trouvé dans l'URL");
    return;
  }

  // Données mock complètes avec tous trajets
  const tripsMock = [
    {
      id: 'trajet1',
      from: 'Paris',
      to: 'Lyon',
      date: 'Vendredi 16 septembre',
      timeStart: '16h00',
      timeEnd: '20h30',
      price: '30€',
      type: 'Economique',
      driver: { name: 'Jean', rating: '★★★★☆', photo: 'images/profil4m.png' },
      duration: '4h30',
      seats: 2,
      prefs: ['Non-fumeur', 'Animaux acceptés', 'Musique'],
      vehicle: { model: 'Peugeot 308', color: 'Bleu', type: 'Électrique' },
      reviews: [
        "Super expérience avec EcoRide ! Le conducteur était très ponctuel et la voiture impeccable. Je recommande !",
        "Trajet agréable et efficace. Le chauffeur était courtois et la conduite souple. Parfait pour mes déplacements quotidiens.",
        "EcoRide, c'est l'assurance d'un trajet serein. Mon conducteur était professionnel et très sympathique. À refaire sans hésiter."
      ]
    },
    {
      id: 'trajet2',
      from: 'Marseille',
      to: 'Nice',
      date: 'Samedi 17 septembre',
      timeStart: '10h00',
      timeEnd: '13h00',
      price: '25€',
      type: 'Hybride',
      driver: { name: 'Marie', rating: '★★★★★', photo: 'images/profil1.png' },
      duration: '3h00',
      seats: 3,
      prefs: ['Fumeur', 'Pas d\'animaux', 'Silence'],
      vehicle: { model: 'Renault Clio', color: 'Rouge', type: 'Hybride' },
      reviews: [
        "Marie est une conductrice très prudente et sympathique.",
        "Trajet agréable, voiture propre et confortable."
      ]
    },
    {
      id: 'trajet3',
      from: 'Lille',
      to: 'Bruxelles',
      date: 'Dimanche 18 septembre',
      timeStart: '09h30',
      timeEnd: '12h00',
      price: '20€',
      type: 'Thermique',
      driver: { name: 'Luc', rating: '★★★☆☆', photo: 'images/profil3m.png' },
      duration: '2h30',
      seats: 1,
      prefs: ['Non-fumeur', 'Animaux acceptés', 'Musique'],
      vehicle: { model: 'Volkswagen Golf', color: 'Gris', type: 'Thermique' },
      reviews: [
        "Luc est ponctuel et la conduite est agréable.",
        "Bonne expérience, je recommande."
      ]
    },
    {
      id: 'trajet4',
      from: 'Bordeaux',
      to: 'Toulouse',
      date: 'Lundi 19 septembre',
      timeStart: '14h00',
      timeEnd: '17h00',
      price: '35€',
      type: 'Electrique',
      driver: { name: 'Sophie', rating: '★★★★☆', photo: 'images/profil2w.png' },
      duration: '3h00',
      seats: 4,
      prefs: ['Non-fumeur', 'Pas d\'animaux', 'Musique'],
      vehicle: { model: 'Tesla Model 3', color: 'Blanc', type: 'Électrique' },
      reviews: [
        "Sophie est très professionnelle et sympathique.",
        "Trajet très confortable et écologique."
      ]
    }
  ];

  const trip = tripsMock.find(t => t.id === id);
  if (!trip) {
    document.getElementById('main-page').innerHTML = '<p>Trajet non trouvé.</p>';
    return;
  }

  // Mise à jour du badge type
  const badgeTypeEl = document.querySelector('.badge-economique');
  if (badgeTypeEl && trip.type) {
    const typeText = trip.type.charAt(0).toUpperCase() + trip.type.slice(1);
    badgeTypeEl.textContent = typeText;
    badgeTypeEl.className = 'badge';
    badgeTypeEl.classList.add(`badge-${trip.type.toLowerCase()}`);
  }

  // Sélecteurs
  const pseudoEl = document.querySelector('.pseudo');
  const ratingEl = document.querySelector('.rating');
  const photoEl = document.querySelector('.profile-photo img');
  const dateBadge = document.querySelector('.badge-date');
  const fromEl = document.querySelector('.locations span:first-child');
  const toEl = document.querySelector('.locations span:last-child');
  const timeDepartEl = document.querySelector('.time-depart');
  const timeArriveeEl = document.querySelector('.time-arrivee');
  const infoContainer = document.querySelector('.info');
  const prefContainer = document.querySelector('.preferences');
  const vehicleInfo = document.querySelector('.vehicle-info');
  const reviewContainer = document.querySelector('.driver-reviews');

  // Injection simple
  if (pseudoEl) pseudoEl.textContent = trip.driver.name;
  if (ratingEl) ratingEl.textContent = trip.driver.rating;
  if (photoEl) photoEl.src = trip.driver.photo;
  if (dateBadge) dateBadge.textContent = trip.date;
  if (fromEl) fromEl.textContent = trip.from;
  if (toEl) toEl.textContent = trip.to;
  if (timeDepartEl) timeDepartEl.textContent = trip.timeStart;
  if (timeArriveeEl) timeArriveeEl.textContent = trip.timeEnd;

  // Vider et remplir infos
  if (infoContainer) {
    infoContainer.innerHTML = '';
    const priceEl = document.createElement('h3');
    priceEl.className = 'info-item';
    priceEl.textContent = `Prix : ${trip.price}`;
    const durationEl = document.createElement('h3');
    durationEl.className = 'info-item';
    durationEl.textContent = `Durée : ${trip.duration}`;
    const seatsEl = document.createElement('h3');
    seatsEl.className = 'info-item';
    seatsEl.textContent = `Place disponible : ${trip.seats}`;
    infoContainer.append(priceEl, durationEl, seatsEl);
  }

  // Vider et remplir préférences
  if (prefContainer) {
    prefContainer.innerHTML = '';
    trip.prefs.forEach(pref => {
      const prefEl = document.createElement('h3');
      prefEl.className = 'pref-item';
      prefEl.textContent = pref;
      prefContainer.appendChild(prefEl);
    });
  }

  // Vider et remplir véhicule
  if (vehicleInfo) {
    vehicleInfo.innerHTML = '';
    const modelEl = document.createElement('h3');
    modelEl.className = 'vehicle-item';
    modelEl.textContent = trip.vehicle.model;
    const colorEl = document.createElement('h3');
    colorEl.className = 'vehicle-item';
    colorEl.textContent = trip.vehicle.color;
    const typeEl = document.createElement('h3');
    typeEl.className = 'vehicle-item';
    typeEl.textContent = trip.vehicle.type;
    vehicleInfo.append(modelEl, colorEl, typeEl);
  }

  // Vider et remplir avis
  if (reviewContainer) {
    reviewContainer.innerHTML = '';
    trip.reviews.forEach(review => {
      const blockquote = document.createElement('blockquote');
      blockquote.className = 'review';
      blockquote.textContent = `"${review}"`;
      reviewContainer.appendChild(blockquote);
    });
  }

  // Bouton réserver
  const btnReserve = document.querySelector('.reserve-btn');
  if (btnReserve) {
    btnReserve.addEventListener('click', () => {
      alert(`Réservation mock pour le trajet ${trip.id}`);
    });
  }
});