document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  console.log("🔍 ID du trajet recherché:", id);

  // =================== Récupération des trajets ===================
  
  // Trajets sauvegardés depuis l'espace utilisateur
  const trajetsSauvegardes = JSON.parse(localStorage.getItem("nouveauxTrajets") || "[]");
  
  // Trajets mock (ceux de base dans covoiturage.js)
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
      vehicule: { model: 'Peugeot 308', color: 'Bleu', type: 'Économique' },
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
      vehicule: { model: 'Toyota Prius', color: 'Blanc', type: 'Hybride' },
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
      vehicule: { model: 'Renault Clio', color: 'Rouge', type: 'Thermique' },
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
      vehicule: { model: 'Tesla Model 3', color: 'Noir', type: 'Électrique' },
      preferences: ['Non-fumeur', 'Animaux acceptés', 'Musique douce'],
      reviews: [
        "Tesla très confortable ! Sophie conduit très bien.",
        "Expérience premium avec cette voiture électrique.",
        "Trajet silencieux et agréable, je recommande."
      ]
    }
  ];


  // Fusion des deux sources
  const trajets = [...trajetsMock, ...trajetsSauvegardes];
  const trajet = trajets.find(t => t.id === id);

  console.log("📋 Trajets disponibles:", trajets.map(t => t.id));
  console.log("🎯 Trajet trouvé:", trajet);

  // =================== Gestion trajet introuvable ===================
  if (!trajet) {
    document.querySelector(".detail-container").innerHTML = `
      <div style="text-align: center; padding: 50px;">
        <h2>❌ Trajet introuvable</h2>
        <p>Le trajet avec l'ID "${id}" n'existe pas ou a été supprimé.</p>
        <a href="covoiturage.html" class="search-btn reserve-btn">← Retour aux trajets</a>
      </div>
    `;
    return;
  }

  // =================== Injection des données dans le HTML ===================

  // Photo et infos chauffeur
  const photoElement = document.getElementById("detail-photo");
  if (photoElement) {
    photoElement.src = trajet.chauffeur?.photo || "images/default-avatar.png";
  }

  const pseudoElement = document.getElementById("detail-pseudo");
  if (pseudoElement) {
    pseudoElement.textContent = trajet.chauffeur?.pseudo || "Inconnu";
  }

  const ratingElement = document.getElementById("detail-rating");
  if (ratingElement) {
    const rating = trajet.chauffeur?.rating || 0;
    ratingElement.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  // Type de véhicule (badge)
  const typeElement = document.getElementById("detail-type");
  if (typeElement) {
    typeElement.textContent = capitalize(trajet.type || "economique");
    // Nettoyer les anciennes classes badge-*
    typeElement.className = typeElement.className.replace(/badge-\w+/g, '');
    typeElement.classList.add(`badge-${trajet.type || "economique"}`);
  }

  // Date et trajets
  const dateElement = document.getElementById("detail-date");
  if (dateElement) {
    dateElement.textContent = trajet.date || "";
  }

  const departElement = document.getElementById("detail-depart");
  if (departElement) {
    departElement.textContent = trajet.depart || "";
  }

  const arriveeElement = document.getElementById("detail-arrivee");
  if (arriveeElement) {
    arriveeElement.textContent = trajet.arrivee || "";
  }

  const heureDepartElement = document.getElementById("detail-heureDepart");
  if (heureDepartElement) {
    heureDepartElement.textContent = trajet.heureDepart || "";
  }

  const heureArriveeElement = document.getElementById("detail-heureArrivee");
  if (heureArriveeElement) {
    heureArriveeElement.textContent = trajet.heureArrivee || "";
  }

  // Informations (prix, durée, places)
  const prixElement = document.getElementById("detail-prix");
  if (prixElement) {
    prixElement.textContent = `Prix : ${trajet.prix || 0} crédits`;
  }

  const dureeElement = document.getElementById("detail-duree");
  if (dureeElement) {
    const duree = trajet.duree || calculerDuree(trajet.heureDepart, trajet.heureArrivee);
    const heures = Math.floor(duree);
    const minutes = Math.round((duree - heures) * 60);
    dureeElement.textContent = `Durée : ${heures}h${minutes.toString().padStart(2, '0')}`;
  }

  const placesElement = document.getElementById("detail-places");
  if (placesElement) {
    const placesDisponibles = trajet.places || 0;
    const pluriel = placesDisponibles > 1 ? "s" : "";
    placesElement.textContent = `Place${pluriel} disponible${pluriel} : ${placesDisponibles}`;
  }

  // Préférences
  const preferences = trajet.preferences || ['Non-fumeur', 'Animaux acceptés', 'Musique'];
  ['detail-pref1', 'detail-pref2', 'detail-pref3'].forEach((id, index) => {
    const prefElement = document.getElementById(id);
    if (prefElement) {
      prefElement.textContent = preferences[index] || "";
      prefElement.style.display = preferences[index] ? "block" : "none";
    }
  });

  // Véhicule
  const vehicule = trajet.vehicule || { model: 'Véhicule non spécifié', color: '', type: trajet.type || 'economique' };
  
  const vehiculeModelElement = document.getElementById("detail-vehicule-model");
  if (vehiculeModelElement) {
    vehiculeModelElement.textContent = vehicule.model || "Véhicule non spécifié";
  }

  const vehiculeColorElement = document.getElementById("detail-vehicule-color");
  if (vehiculeColorElement) {
    vehiculeColorElement.textContent = vehicule.color || "";
    vehiculeColorElement.style.display = vehicule.color ? "block" : "none";
  }

  const vehiculeTypeElement = document.getElementById("detail-vehicule-type");
  if (vehiculeTypeElement) {
    vehiculeTypeElement.textContent = capitalize(vehicule.type || trajet.type || "economique");
  }

  // Avis du conducteur
  const reviews = trajet.reviews || [
    "Aucun avis disponible pour ce conducteur.",
    "",
    ""
  ];
  
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
    reserverBtn.addEventListener('click', () => {
      // Vérifier si l'utilisateur peut réserver (pas son propre trajet, places disponibles, etc.)
      if (trajet.places <= 0) {
        alert("❌ Aucune place disponible pour ce trajet.");
        return;
      }

      if (confirm(`Voulez-vous réserver une place pour le trajet ${trajet.depart} → ${trajet.arrivee} le ${trajet.date} ?`)) {
        // Logique de réservation (à adapter selon tes besoins)
        reserverPlace(trajet);
      }
    });
  }

  console.log("✅ Page détail chargée pour le trajet:", trajet.id);
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
  
  if (dureeMinutes < 0) dureeMinutes += 24 * 60; // Trajet sur 2 jours
  
  return dureeMinutes / 60; // Retour en heures décimales
}

function reserverPlace(trajet) {
  // Créer une réservation dans l'espace utilisateur
  const reservation = {
    id: crypto.randomUUID(),
    detailId: trajet.id, // Référence vers le trajet original
    depart: trajet.depart,
    arrivee: trajet.arrivee,
    date: trajet.date,
    heureDepart: trajet.heureDepart,
    heureArrivee: trajet.heureArrivee,
    prix: trajet.prix,
    chauffeur: trajet.chauffeur?.pseudo || "Inconnu",
    role: "passager",
    status: "reserve",
    placesReservees: 1
  };

  // Sauvegarder dans l'espace utilisateur (trajets.js)
  let trajetsUtilisateur = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
  trajetsUtilisateur.push(reservation);
  localStorage.setItem('ecoride_trajets', JSON.stringify(trajetsUtilisateur));

  // Réduire les places disponibles dans le trajet original
  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
  const trajetIndex = trajetsCovoiturage.findIndex(t => t.id === trajet.id);
  if (trajetIndex !== -1) {
    trajetsCovoiturage[trajetIndex].places = Math.max(0, trajetsCovoiturage[trajetIndex].places - 1);
    localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
  }

  alert("✅ Réservation confirmée ! Vous pouvez voir vos trajets dans votre espace utilisateur.");
  
  // Optionnel : rediriger vers l'espace utilisateur
  // window.location.href = "user-space.html";
}
