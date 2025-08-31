// js/detail.js

document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer l'id depuis pathname (/detail/1)
    const segments = window.location.pathname.split('/').filter(Boolean); // ["detail", "1"]
    const id = segments.length >= 2 ? decodeURIComponent(segments[1]) : null;
  
    // Si tu utilises querystring (/detail?id=1) fallback
    if (!id) {
      const q = new URLSearchParams(window.location.search);
      if (q.has('id')) {
        // si présent en querystring
        // const idFromQuery = q.get('id');
      }
    }
  
    if (!id) {
      console.warn("Aucun id trouvé dans l'URL");
      return;
    }
  
    // Récupérer les données du trajet
    // Option A: si tu as un fichier JSON /data/trips.json
    // const trips = await fetch('/data/trips.json').then(r=>r.json());
  
    // Option B: si tu as un script qui expose window.Trips
    // const trips = window.Trips || [];
  
    // Option C: mock local (remplace par fetch réel si dispo)
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
      },
      // ... autres mock if needed
    ];
  
    // Trouver le trajet
    const trip = tripsMock.find(t => String(t.id) === String(id));
    if (!trip) {
      document.getElementById('main-page').innerHTML = '<p>Trajet non trouvé.</p>';
      return;
    }
  
    // Injections DOM — adapte les sélecteurs à ton HTML
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
  
    // Infos
    if (infoItems && infoItems.length >= 3) {
      infoItems[0].textContent = `Prix : ${trip.price}`;
      infoItems[1].textContent = `Durée : ${trip.duration}`;
      infoItems[2].textContent = `Place disponible : ${trip.seats}`;
    }
  
    // Prefs (si nombre variable, on peut reconstruire)
    if (prefItems && prefItems.length) {
      // si tu as un nombre fixe d'éléments, renseigne-les
      for (let i=0; i<prefItems.length; i++) {
        prefItems[i].textContent = trip.prefs[i] || "";
      }
    }
  
    // Vehicle
    if (vehicleItems && vehicleItems.length >= 2) {
      vehicleItems[0].textContent = trip.vehicle.model;
      vehicleItems[1].textContent = trip.vehicle.type;
    }
  
    // Reviews — remplacer le conteneur actuel par les reviews
    if (reviewContainer) {
      const reviewsHtml = trip.reviews.map(r => `<blockquote class="review">"${r}"</blockquote>`).join("\n");
      reviewContainer.innerHTML = `<h3>Avis du conducteur</h3>${reviewsHtml}`;
    }
  
    // Bouton réserver : si présent on peut attacher handler
    const btnReserve = document.querySelector('.btn-reserver');
    if (btnReserve) {
      btnReserve.addEventListener('click', () => {
        alert(`Réservation mock pour le trajet ${trip.id}`);
      });
    }
  });