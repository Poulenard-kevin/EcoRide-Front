document.addEventListener('DOMContentLoaded', async () => {
<<<<<<< HEAD
  // Récupérer l'id depuis pathname (/detail/1)
  const segments = window.location.pathname.split('/').filter(Boolean); // ["detail", "1"]
  let id = segments.length >= 2 ? decodeURIComponent(segments[1]) : null;

  // Fallback : si pas d'id dans pathname, chercher dans query string (/detail?id=1)
  if (!id) {
    const q = new URLSearchParams(window.location.search);
    if (q.has('id')) {
      id = q.get('id');
    }
  }

  if (!id) {
    console.warn("Aucun id trouvé dans l'URL");
    return;
  }

  // Données mock — remplace par fetch réel si disponible
  const tripsMock = [
    {
      id: "1",
      from: "Paris",
      to: "Lyon",
      date: "Vendredi 16 septembre",
      timeStart: "16h00",
      timeEnd: "20h30",
      price: "30€",
      driver: { name: "Pseudo", rating: "★★★★☆", photo: "/images/profil1.png" },
      duration: "4h30",
      seats: 2,
      prefs: ["Non-fumeur", "Animaux acceptés", "Musique"],
      vehicle: { model: "Peugeot 308", type: "Électrique" },
      reviews: [
        "Super expérience avec EcoRide ! Le conducteur était très ponctuel et la voiture impeccable. Je recommande !",
        "Trajet agréable et efficace. Le chauffeur était courtois et la conduite souple. Parfait pour mes déplacements quotidiens."
      ]
    }
    // Ajoute d'autres trajets mock si besoin
  ];

  const trip = tripsMock.find(t => String(t.id) === String(id));
  if (!trip) {
    const mainPage = document.getElementById('main-page');
    if (mainPage) mainPage.innerHTML = '<p>Trajet non trouvé.</p>';
    return;
  }

  // Sélecteurs DOM
  const pseudoEl = document.querySelector('.pseudo');
  const ratingEl = document.querySelector('.rating');
  const photoEl = document.querySelector('.profile-photo img') || document.querySelector('.profile-photo');
  const dateBadge = document.querySelector('.badge-date');
  const fromEl = document.querySelector('.locations span:first-child');
  const toEl = document.querySelector('.locations span:last-child');
  const timeEls = document.querySelectorAll('.times .time');
  const infoItems = document.querySelectorAll('.info .info-item');
  const prefItems = document.querySelectorAll('.preferences .pref-item');
  const vehicleItems = document.querySelectorAll('.vehicle-item');
  const reviewContainer = document.querySelector('.driver-reviews');

  if (pseudoEl) pseudoEl.textContent = trip.driver.name;
  if (ratingEl) ratingEl.textContent = trip.driver.rating;
  if (photoEl) {
    if (photoEl.tagName === 'IMG') photoEl.src = trip.driver.photo;
    else photoEl.querySelector('img')?.setAttribute('src', trip.driver.photo);
  }

  if (dateBadge) dateBadge.textContent = trip.date;
  if (fromEl) fromEl.textContent = trip.from;
  if (toEl) toEl.textContent = trip.to;
  if (timeEls.length >= 2) {
    timeEls[0].textContent = trip.timeStart;
    timeEls[1].textContent = trip.timeEnd;
  }

  if (infoItems.length >= 3) {
    infoItems[0].textContent = `Prix : ${trip.price}`;
    infoItems[1].textContent = `Durée : ${trip.duration}`;
    infoItems[2].textContent = `Place disponible : ${trip.seats}`;
  }

  if (prefItems.length) {
    for (let i = 0; i < prefItems.length; i++) {
      prefItems[i].textContent = trip.prefs[i] || "";
    }
  }

  if (vehicleItems.length >= 2) {
=======
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    console.warn("Aucun ID trouvé dans l'URL");
    return;
  }

  // Exemple de données mock — à remplacer par fetch('/api/trips/' + id)
  const tripsMock = [
    {
      id: "1",
      from: "Paris",
      to: "Lyon",
      date: "Vendredi 16 septembre",
      timeStart: "16h00",
      timeEnd: "20h30",
      price: "30€",
      driver: { name: "Pseudo", rating: "★★★★☆", photo: "/images/profil1.png" },
      duration: "4h30",
      seats: 2,
      prefs: ["Non-fumeur", "Animaux acceptés", "Musique"],
      vehicle: { model: "Peugeot 308", type: "Électrique" },
      reviews: [
        "Super expérience avec EcoRide ! Le conducteur était très ponctuel et la voiture impeccable. Je recommande !",
        "Trajet agréable et efficace. Le chauffeur était courtois et la conduite souple. Parfait pour mes déplacements quotidiens."
      ]
    }
  ];

  const trip = tripsMock.find(t => String(t.id) === String(id));
  if (!trip) {
    document.getElementById('main-page').innerHTML = '<p>Trajet non trouvé.</p>';
    return;
  }

  // Injection dans le DOM — adapte les sélecteurs selon ton HTML
  const pseudoEl = document.querySelector('.pseudo');
  const ratingEl = document.querySelector('.rating');
  const photoEl = document.querySelector('.profile-photo img') || document.querySelector('.profile-photo');
  const dateBadge = document.querySelector('.badge-date');
  const fromEl = document.querySelector('.locations span:first-child');
  const toEl = document.querySelector('.locations span:last-child');
  const timeEls = document.querySelectorAll('.times .time');
  const infoItems = document.querySelectorAll('.info .info-item');
  const prefItems = document.querySelectorAll('.preferences .pref-item');
  const vehicleItems = document.querySelectorAll('.vehicle-item');
  const reviewContainer = document.querySelector('.driver-reviews');

  if (pseudoEl) pseudoEl.textContent = trip.driver.name;
  if (ratingEl) ratingEl.textContent = trip.driver.rating;
  if (photoEl) {
    if (photoEl.tagName === 'IMG') photoEl.src = trip.driver.photo;
    else photoEl.querySelector('img')?.setAttribute('src', trip.driver.photo);
  }

  if (dateBadge) dateBadge.textContent = trip.date;
  if (fromEl) fromEl.textContent = trip.from;
  if (toEl) toEl.textContent = trip.to;
  if (timeEls && timeEls.length >= 2) {
    timeEls[0].textContent = trip.timeStart;
    timeEls[1].textContent = trip.timeEnd;
  }

  if (infoItems && infoItems.length >= 3) {
    infoItems[0].textContent = `Prix : ${trip.price}`;
    infoItems[1].textContent = `Durée : ${trip.duration}`;
    infoItems[2].textContent = `Place disponible : ${trip.seats}`;
  }

  if (prefItems && prefItems.length) {
    for (let i = 0; i < prefItems.length; i++) {
      prefItems[i].textContent = trip.prefs[i] || "";
    }
  }

  if (vehicleItems && vehicleItems.length >= 2) {
>>>>>>> 30ebdf7 (Ajout fichier _detail.scss / ajout hero-scene +- modification titre big-title + ajout de la profile-section)
    vehicleItems[0].textContent = trip.vehicle.model;
    vehicleItems[1].textContent = trip.vehicle.type;
  }

  if (reviewContainer) {
    const reviewsHtml = trip.reviews.map(r => `<blockquote class="review">"${r}"</blockquote>`).join("\n");
    reviewContainer.innerHTML = `<h3>Avis du conducteur</h3>${reviewsHtml}`;
  }

  const btnReserve = document.querySelector('.btn-reserver');
  if (btnReserve) {
    btnReserve.addEventListener('click', () => {
      alert(`Réservation mock pour le trajet ${trip.id}`);
    });
  }
});