console.log("detail.js chargé");

function reserverTrajet(trajet) {
  let trajets = JSON.parse(localStorage.getItem('ecoride_trajets')) || [];

  // Vérifier si déjà réservé
  const existingIndex = trajets.findIndex(t => t.detailId === trajet.id && t.role === "passager");
  if (existingIndex !== -1) {
    alert("Vous avez déjà réservé ce trajet !");
    return;
  }

  // Demander combien de places
  const maxPlaces = trajet.seats || 1;
  let placesReservees = parseInt(prompt(`Combien de places voulez-vous réserver ? (max ${maxPlaces})`), 10);
  if (isNaN(placesReservees) || placesReservees < 1 || placesReservees > maxPlaces) {
    alert("Nombre de places invalide !");
    return;
  }

  // 💾 Sauver toutes les infos (mock complet)
  const trajetReserve = {
    id: crypto.randomUUID(),
    detailId: trajet.detailId || trajet.id,
    depart: trajet.from,
    arrivee: trajet.to,
    date: trajet.date,
    heureDepart: trajet.timeStart,
    heureArrivee: trajet.timeEnd,
    prix: parseInt(trajet.price.match(/\d+/)[0], 10),
    placesReservees,
    role: "passager",
    status: "reserve",
  
    // 👇 infos supplémentaires
    type: trajet.type || "Economique",
    driver: trajet.driver || {},
    duration: trajet.duration || "",
    prefs: trajet.prefs || [],
    vehicle: trajet.vehicle || {},
    reviews: trajet.reviews || []
  };

  trajets.push(trajetReserve);
  localStorage.setItem("ecoride_trajets", JSON.stringify(trajets));

  alert("Réservation effectuée !");
  window.location.href = "/espace-utilisateur?tab=trajets";
}

document.addEventListener('pageContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    document.getElementById('main-page').innerHTML = "<p>Trajet introuvable.</p>";
    return;
  }

  // ① Vérifier dans localStorage
  const trajets = JSON.parse(localStorage.getItem("ecoride_trajets")) || [];
  const trajetReserve = trajets.find(t => t.detailId === id);

  if (trajetReserve) {
    console.log("✅ Trajet réservé trouvé :", trajetReserve);

    // Injection villes
    const fromEl = document.querySelector('.location-time:first-child .location');
    const toEl = document.querySelector('.location-time:last-child .location');
    if (fromEl) fromEl.textContent = trajetReserve.depart;
    if (toEl) toEl.textContent = trajetReserve.arrivee;

    // injection complète (driver, prefs, véhicule, etc.)
    document.querySelector(".pseudo").textContent = trajetReserve.driver?.name || "Conducteur";
    document.querySelector(".profile-photo img").src = trajetReserve.driver?.photo || "/images/default.png";
    document.querySelector(".rating").textContent = trajetReserve.driver?.rating || "★★★★☆";
    document.querySelector(".badge-date").textContent = trajetReserve.date;
    document.querySelector(".time-depart").textContent = trajetReserve.heureDepart;
    document.querySelector(".time-arrivee").textContent = trajetReserve.heureArrivee;

    const infoContainer = document.querySelector(".info");
    infoContainer.innerHTML = `
      <h3 class="info-item">Prix : ${trajetReserve.prix} crédits </h3>
      <h3 class="info-item">Durée : ${trajetReserve.duration || "?"}</h3>
      <h3 class="info-item">Places réservées : ${trajetReserve.placesReservees}</h3>
    `;

    // Injection préférences
    const prefContainer = document.querySelector(".preferences");
    if (prefContainer) {
      prefContainer.innerHTML = "";
      trajetReserve.prefs.forEach(pref => {
        const prefEl = document.createElement("h3");
        prefEl.className = "pref-item";
        prefEl.textContent = pref;
        prefContainer.appendChild(prefEl);
      });
    }

    // Injection véhicule
    const vehicleInfo = document.querySelector(".vehicle-info");
    if (vehicleInfo && trajetReserve.vehicle) {
      vehicleInfo.innerHTML = "";
      if (trajetReserve.vehicle.model) {
        const modelEl = document.createElement("h3");
        modelEl.className = "vehicle-item";
        modelEl.textContent = trajetReserve.vehicle.model;
        vehicleInfo.appendChild(modelEl);
      }
      if (trajetReserve.vehicle.color) {
        const colorEl = document.createElement("h3");
        colorEl.className = "vehicle-item";
        colorEl.textContent = trajetReserve.vehicle.color;
        vehicleInfo.appendChild(colorEl);
      }
      if (trajetReserve.vehicle.type) {
        const typeEl = document.createElement("h3");
        typeEl.className = "vehicle-item";
        typeEl.textContent = trajetReserve.vehicle.type;
        vehicleInfo.appendChild(typeEl);
      }
    }

    // Injection avis
    const reviewContainer = document.querySelector(".driver-reviews");
    if (reviewContainer) {
      reviewContainer.innerHTML = "";
      trajetReserve.reviews.forEach(review => {
        const blockquote = document.createElement("blockquote");
        blockquote.className = "review";
        blockquote.textContent = `"${review}"`;
        reviewContainer.appendChild(blockquote);
      });
    }

    // Badge type (Economique, Hybride, etc.)
    const badgeTypeEl = document.querySelector('.badge-economique');
    if (badgeTypeEl && trajetReserve.type) {
      const typeText = trajetReserve.type.charAt(0).toUpperCase() + trajetReserve.type.slice(1);
      badgeTypeEl.textContent = typeText;
      badgeTypeEl.className = 'badge';
      badgeTypeEl.classList.add(`badge-${trajetReserve.type.toLowerCase()}`);
    }

    // bouton devient ANNULER
    const btnReserve = document.querySelector(".reserve-btn");
    if (btnReserve) {
      btnReserve.textContent = "Annuler";
      btnReserve.onclick = () => {
        const index = trajets.findIndex(t => t.detailId === trajetReserve.detailId);
        if (index !== -1) {
          trajets.splice(index, 1);
          localStorage.setItem("ecoride_trajets", JSON.stringify(trajets));
          alert("Réservation annulée !");
          location.href = "/espace-utilisateur?tab=trajets";
        }
      };
    }

    return; // ✅ terminé
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
      price: '30 crédits',
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
      price: '25 crédits',
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
      price: '20 crédits',
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
      price: '35 crédits',
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

  console.log("✅ Affichage trajet mock:", trip);

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
  const fromEl = document.querySelector('.location-time:first-child .location');
  const toEl = document.querySelector('.location-time:last-child .location');
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
    const trajets = JSON.parse(localStorage.getItem("ecoride_trajets")) || [];
    const dejaReserve = trajets.some(t => t.detailId === trip.id);

    if (dejaReserve) {
      btnReserve.textContent = "Annuler";
      btnReserve.onclick = () => {
        const index = trajets.findIndex(t => t.detailId === trip.id && t.role === "passager");
        if (index !== -1) {
          trajets.splice(index, 1);
          localStorage.setItem("ecoride_trajets", JSON.stringify(trajets));
          alert("Réservation annulée !");
          location.href = "/espace-utilisateur?tab=trajets";
        }
      };
    } else {
      btnReserve.textContent = "Réserver"; 
      btnReserve.onclick = () => reserverTrajet(trip);
    }
  }
});