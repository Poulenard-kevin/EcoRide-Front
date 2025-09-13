console.log("🔍 detail.js chargé !");

document.addEventListener("pageContentLoaded", () => {
  console.log("🎯 DOMContentLoaded dans detail.js");

  let id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    const parts = window.location.pathname.split('/');
    // Exemple : ['', 'detail', '1234']
    if (parts.length >= 3 && parts[1] === 'detail') {
      id = parts[2];
    }
  }

  console.log("🟢 ID récupéré dans detail.js:", id);

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
      vehicle: { brand: 'Peugeot' , model: '308', color: 'Bleu', type: 'Économique' },
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
      vehicle: { brand: 'Toyota' , model: 'Prius', color: 'Blanc', type: 'Hybride' },
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
      vehicle: { brand: 'Renault' , model: 'Clio', color: 'Rouge', type: 'Thermique' },
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
      vehicle: { brand: 'Tesla' , model: 'Model 3', color: 'Noir', type: 'Électrique' },
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

  // ⚡ DEBUG - Logs pour identifier le problème
  console.log("🟢 ID reçu dans detail.js:", id);
  console.log("📋 Tous les trajets accessibles:", trajets.map(t => t.id));

  const trajet = trajets.find(t => t.id === id);

  if (!trajet) {
    console.error("❌ Aucun trajet trouvé pour cet ID:", id);
  } else {
    console.log("✅ Trajet trouvé:", trajet);
  }

  // =================== Gestion trajet introuvable ===================
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

  // Photo et infos chauffeur
  const photoElement = document.getElementById("detail-photo");
  if (photoElement) {
    let src = trajet.chauffeur?.photo || "images/default-avatar.png";

    // Supprimer un éventuel "/" en début
    if (!src.startsWith("http") && src.startsWith("/")) {
      src = src.substring(1);
    }

    photoElement.src = "/" + src;
    console.log("📸 Photo mise à jour:", photoElement.src);
  }

  const pseudoElement = document.getElementById("detail-pseudo");
  if (pseudoElement) {
    pseudoElement.textContent = trajet.chauffeur?.pseudo || "Inconnu";
    console.log("👤 Pseudo mis à jour:", pseudoElement.textContent);
  }

  const ratingElement = document.getElementById("detail-rating");
  if (ratingElement) {
    const rating = trajet.chauffeur?.rating || 0;
    ratingElement.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);
    console.log("⭐ Rating mis à jour:", ratingElement.textContent);
  }

  // Type de trajet (badge dans l'entête)
  const trajetTypeElement = document.getElementById("detail-type");
  if (trajetTypeElement) {
    trajetTypeElement.textContent = capitalize(trajet.type || "Économique");
  
    // 🔄 On nettoie les anciennes "badge-xxx"
    trajetTypeElement.classList.forEach(cls => {
      if (cls.startsWith("badge-") && cls !== "badge") {
        trajetTypeElement.classList.remove(cls);
      }
    });
  
    // ✅ Toujours ajouter les deux : "badge" + "badge-electrique|hybride|thermique"
    trajetTypeElement.classList.add(`type-${(trajet.type || "economique").toLowerCase()}`)
  }

  // Date et trajets
  const dateElement = document.getElementById("detail-date");
  if (dateElement) {
    dateElement.textContent = trajet.date || "";
    console.log("📅 Date mise à jour:", dateElement.textContent);
  }

  const departElement = document.getElementById("detail-depart");
  if (departElement) {
    departElement.textContent = trajet.depart || "";
    console.log("🚀 Départ mis à jour:", departElement.textContent);
  }

  const arriveeElement = document.getElementById("detail-arrivee");
  if (arriveeElement) {
    arriveeElement.textContent = trajet.arrivee || "";
    console.log("🎯 Arrivée mise à jour:", arriveeElement.textContent);
  }

  const heureDepartElement = document.getElementById("detail-heureDepart");
  if (heureDepartElement) {
    heureDepartElement.textContent = trajet.heureDepart || "";
    console.log("⏰ Heure départ mise à jour:", heureDepartElement.textContent);
  }

  const heureArriveeElement = document.getElementById("detail-heureArrivee");
  if (heureArriveeElement) {
    heureArriveeElement.textContent = trajet.heureArrivee || "";
    console.log("⏰ Heure arrivée mise à jour:", heureArriveeElement.textContent);
  }

  // Informations (prix, durée, places)
  const prixElement = document.getElementById("detail-prix");
  if (prixElement) {
    prixElement.textContent = `Prix : ${trajet.prix || 0} crédits`;
    console.log("💰 Prix mis à jour:", prixElement.textContent);
  }

  const dureeElement = document.getElementById("detail-duree");
  if (dureeElement) {
    const duree = trajet.duree || calculerDuree(trajet.heureDepart, trajet.heureArrivee);
    const heures = Math.floor(duree);
    const minutes = Math.round((duree - heures) * 60);
    dureeElement.textContent = `Durée : ${heures}h${minutes.toString().padStart(2, '0')}`;
    console.log("⏱️ Durée mise à jour:", dureeElement.textContent);
  }

  const placesElement = document.getElementById("detail-places");
  if (placesElement) {
    const placesDisponibles = trajet.places || 0;
    const pluriel = placesDisponibles > 1 ? "s" : "";
    placesElement.textContent = `Place${pluriel} disponible${pluriel} : ${placesDisponibles}`;
    console.log("🪑 Places mises à jour:", placesElement.textContent);
  }

  // Préférences
  const preferences = trajet.preferences || ['Non-fumeur', 'Animaux acceptés', 'Musique'];
  ['detail-pref1', 'detail-pref2', 'detail-pref3'].forEach((id, index) => {
    const prefElement = document.getElementById(id);
    if (prefElement) {
      prefElement.textContent = preferences[index] || "";
      prefElement.style.display = preferences[index] ? "block" : "none";
      console.log(`🎯 Préférence ${index + 1} mise à jour:`, preferences[index] || "vide");
    }
  });

  // Vehicle
  const vehicle = trajet.vehicle || {};

  // Brand
  const brandElement = document.getElementById("detail-vehicle-marque");
  if (brandElement) {
    brandElement.textContent = vehicle.brand || "Marque non spécifiée";
  }

  // Model
  const modelElement = document.getElementById("detail-vehicle-model");
  if (modelElement) {
    modelElement.textContent = vehicle.model || "Modèle non spécifié";
  }

  // Color
  const colorElement = document.getElementById("detail-vehicle-color");
  if (colorElement) {
    colorElement.textContent = vehicle.color || "Couleur non spécifiée";
  }

  // Type
  const typeElement = document.getElementById("detail-vehicle-type");
  if (typeElement) {
    typeElement.textContent = vehicle.type || "Non spécifié";
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
      console.log(`💬 Avis ${index + 1} mis à jour:`, reviews[index] || "vide");
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
    console.log("🎫 Bouton réserver configuré");
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
  // window.history.pushState({}, '', '/espace-utilisateur');
  // window.dispatchEvent(new Event('popstate'));
}