console.log("🔍 detail.js chargé !");

document.addEventListener("pageContentLoaded", () => {
  console.log("🎯 DOMContentLoaded dans detail.js");

  let id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    const parts = window.location.pathname.split('/');
    if (parts.length >= 3 && parts[1] === 'detail') {
      id = parts[2];
    }
  }

  console.log("🟢 ID récupéré dans detail.js:", id);

  // =================== Récupération des trajets ===================

  const trajetsSauvegardes = JSON.parse(localStorage.getItem("nouveauxTrajets") || "[]");

  const trajetsMock = [
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
      duree: 4.5,
      vehicle: { brand: 'Peugeot', model: '308', color: 'Bleu', type: 'Économique' },
      preferences: ['Non-fumeur', 'Animaux acceptés', 'Musique'],
      reviews: [
        "Super expérience avec EcoRide ! Jean était très ponctuel et la voiture impeccable. Je recommande !",
        "Trajet agréable et efficace. Le chauffeur était courtois et la conduite souple.",
        "EcoRide, c'est l'assurance d'un trajet serein. Jean était professionnel et très sympathique."
      ]
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
      duree: 3,
      vehicle: { brand: 'Toyota', model: 'Prius', color: 'Blanc', type: 'Hybride' },
      preferences: ['Non-fumeur', 'Pas d\'animaux', 'Silence'],
      reviews: [
        "Marie est une excellente conductrice ! Trajet très confortable.",
        "Ponctuelle et sympathique, je recommande vivement.",
        "Voiture propre et conduite sécurisée. Parfait !"
      ]
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
      duree: 2.5,
      vehicle: { brand: 'Renault', model: 'Clio', color: 'Rouge', type: 'Thermique' },
      preferences: ['Fumeur autorisé', 'Animaux acceptés', 'Musique'],
      reviews: [
        "Trajet correct, rien d'exceptionnel mais ça fait le travail.",
        "Luc était sympa mais un peu en retard au départ.",
        "Voiture un peu ancienne mais trajet sans problème."
      ]
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
      duree: 3,
      vehicle: { brand: 'Tesla', model: 'Model 3', color: 'Noir', type: 'Électrique' },
      preferences: ['Non-fumeur', 'Animaux acceptés', 'Musique douce'],
      reviews: [
        "Tesla très confortable ! Sophie conduit très bien.",
        "Expérience premium avec cette voiture électrique.",
        "Trajet silencieux et agréable, je recommande."
      ]
    }
  ];

  const trajets = [...trajetsMock, ...trajetsSauvegardes];
  const trajet = trajets.find(t => t.id === id);

  if (!trajet) {
    const container = document.querySelector(".detail-container") || document.querySelector("main") || document.body;
    container.innerHTML = `
      <div style="text-align: center; padding: 50px;">
        <h2>❌ Trajet introuvable</h2>
        <p>Le trajet avec l'ID "${id}" n'existe pas ou a été supprimé.</p>
        <a href="/covoiturage" data-link class="search-btn reserve-btn">← Retour aux trajets</a>
      </div>
    `;
    return;
  }

  // =================== Injection des données dans le HTML ===================

  const photoElement = document.getElementById("detail-photo");
  if (photoElement) {
    let src = trajet.chauffeur?.photo || "images/default-avatar.png";
    if (!src.startsWith("http") && src.startsWith("/")) src = src.substring(1);
    photoElement.src = "/" + src;
  }

  const pseudoElement = document.getElementById("detail-pseudo");
  if (pseudoElement) pseudoElement.textContent = trajet.chauffeur?.pseudo || "Inconnu";

  const ratingElement = document.getElementById("detail-rating");
  if (ratingElement) {
    const rating = trajet.chauffeur?.rating || 0;
    ratingElement.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  const trajetTypeElement = document.getElementById("detail-type");
  if (trajetTypeElement) {
    trajetTypeElement.textContent = capitalize(trajet.type || "Économique");
    trajetTypeElement.classList.forEach(cls => {
      if (cls.startsWith("badge-") && cls !== "badge") trajetTypeElement.classList.remove(cls);
    });
    trajetTypeElement.classList.add(`type-${(trajet.type || "economique").toLowerCase()}`);
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

  const placesElement = document.getElementById("detail-places");

  function computeRemaining(trajetObj) {
    const passagers = Array.isArray(trajetObj.passagers) ? trajetObj.passagers : [];
    if (typeof trajetObj.places === 'number') return trajetObj.places;
    if (typeof trajetObj.capacity === 'number') return Math.max(0, trajetObj.capacity - passagers.length);
    if (trajetObj.vehicle?.places !== undefined) return Math.max(0, Number(trajetObj.vehicle.places) - passagers.length);
    if (trajetObj.vehicule?.places !== undefined) return Math.max(0, Number(trajetObj.vehicule.places) - passagers.length);
    return 0;
  }

  function renderPlaces() {
    if (!placesElement) return;
    const remaining = computeRemaining(trajet);
    const pluriel = remaining > 1 ? "s" : "";
    placesElement.textContent = `Place${pluriel} disponible${pluriel} : ${remaining}`;
  }

  renderPlaces();

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

  const typeElement = document.getElementById("detail-vehicle-type");
  if (typeElement) typeElement.textContent = vehicle.type || "Non spécifié";

  const reviews = trajet.reviews || ["Aucun avis disponible pour ce conducteur.", "", ""];
  ['detail-review1', 'detail-review2', 'detail-review3'].forEach((id, index) => {
    const reviewElement = document.getElementById(id);
    if (reviewElement) {
      reviewElement.textContent = reviews[index] || "";
      reviewElement.style.display = reviews[index] ? "block" : "none";
    }
  });

  // =================== Bouton Réserver ===================
  const reserverBtn = document.getElementById("detail-reserver");
  if (reserverBtn) {
    reserverBtn.addEventListener('click', async () => {
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

  console.log("✅ Page détail chargée et remplie pour le trajet:", trajet.id);
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

  let trajetsUtilisateur = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  trajetsUtilisateur.push(reservation);
  localStorage.setItem('ecoride_trajets', JSON.stringify(trajetsUtilisateur));

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

    const alreadyIndex = target.passagers.findIndex(p => typeof p === 'string' && p.startsWith(userPseudo));
    if (alreadyIndex !== -1) {
      alert("⚠️ Vous avez déjà une réservation sur ce trajet.");
      return;
    }

    const entry = seats > 1 ? `${userPseudo} x${seats}` : userPseudo;
    target.passagers.push(entry);

    const vehiclePlaces = target.vehicle?.places ?? target.vehicule?.places ?? null;
    target.capacity = (typeof target.capacity === 'number')
      ? target.capacity
      : (vehiclePlaces !== null ? Number(vehiclePlaces) : (typeof target.places === 'number' ? Number(target.places) : 4));

    const totalOccupied = target.passagers.reduce((sum, p) => {
      if (typeof p === 'string') {
        const m = p.match(/x(\d+)$/);
        return sum + (m ? Number(m[1]) : 1);
      }
      return sum + 1;
    }, 0);

    target.places = Math.max(0, Number(target.capacity) - totalOccupied);
    trajetsCovoiturage[trajetIndex] = target;
    localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
      
    trajet.passagers = target.passagers;
    trajet.capacity = target.capacity;
    trajet.places = target.places;
  }

  try { renderPlaces(); } catch(e) {}

  alert(`✅ Réservation confirmée : ${seats} place${seats > 1 ? 's' : ''}. Vous pouvez voir vos trajets dans votre espace utilisateur.`);

  // ← Ici, redirection vers espace utilisateur avec onglet trajets ouvert
  window.location.href = "/espace-utilisateur?tab=trajets";
}