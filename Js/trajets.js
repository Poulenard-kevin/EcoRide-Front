// -------------------- Helpers --------------------
function getVehicleLabel(v) {
  const brand = v.brand || v.marque || '';
  const model = v.model || v.vehicleModel || v.modele || '';
  const color = v.color || v.couleur || '';
  return `${brand} ${model} ${color}`.trim();
}

// -------------------- Variables globales --------------------
let trajets = [];
let editingIndex = null; // 👈 nouvel indicateur d'édition

// -------------------- Fonction principale d'initialisation --------------------
export function initTrajets() {
  console.log("🚀 Initialisation des trajets");

  // 🔄 Migration des anciennes clés localStorage
  const oldVehicules = localStorage.getItem('ecoride_vehicules');
  if (oldVehicules) {
    localStorage.setItem('ecoride_vehicles', oldVehicules);
    localStorage.removeItem('ecoride_vehicules');
    console.log("🔄 Migration effectuée : ecoride_vehicules ➝ ecoride_vehicles");
  }

  const form = document.querySelector('#trajet-form');
  console.log("📋 Formulaire trouvé:", form);

  trajets = getTrajets();
  console.log("📥 Trajets chargés:", trajets);

  // ⚡ Injection dynamique des véhicules
  populateVehicles();

  if (form) {
    form.addEventListener('submit', handleTrajetSubmit);
    console.log("✅ Event listener formulaire ajouté");
  }

  // Event listeners pour les boutons dynamiques
  document.addEventListener('click', handleTrajetActions);

  renderTrajetsInProgress();
  renderHistorique();
  populateVehicles();

  // =================== ⚡ Gestion placeholder Date / Time ===================
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

  // ================== DEV ONLY: Bouton pour vider l'historique ==================
  // Affiché uniquement en local (localhost ou 127.0.0.1)
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const histoContainer = document.querySelector('.trajets-historique');
    if (histoContainer) {
      // Eviter les doublons si initTrajets est rappelé
      if (!document.getElementById('btn-clear-historique-dev')) {
        const clearBtn = document.createElement('button');
        clearBtn.id = 'btn-clear-historique-dev';
        clearBtn.type = 'button';
        clearBtn.textContent = "🗑 Vider l'historique (DEV)";
        clearBtn.style.margin = "10px 0";
        clearBtn.style.background = "red";
        clearBtn.style.color = "white";
        clearBtn.style.border = "none";
        clearBtn.style.padding = "8px 12px";
        clearBtn.style.borderRadius = "6px";
        clearBtn.style.cursor = "pointer";

        clearBtn.addEventListener('click', () => {
          // On passe tous les trajets non "valide" tels quels
          // et on supprime ceux en "valide" (historique)
          const before = trajets.length;
          trajets = trajets.filter(t => t.status !== 'valide');
          const removed = before - trajets.length;

          saveTrajets();
          renderTrajetsInProgress();
          renderHistorique();

          console.log(`🧹 Historique vidé (dev). Trajets supprimés: ${removed}`);
        });

        // Insérer le bouton au-dessus du titre de l'historique
        histoContainer.parentNode.insertBefore(clearBtn, histoContainer);
      }
    }
  }
}

// -------------------- Gestion soumission formulaire --------------------

function handleTrajetSubmit(e) {
  e.preventDefault();
  console.log("📝 Soumission du formulaire trajet");

  const formData = new FormData(e.target);

  // 🔹 Récupérer l'objet véhicule complet depuis localStorage
  const vehicles = JSON.parse(localStorage.getItem('ecoride_vehicles') || "[]");
  const selectedPlate = formData.get('vehicle');

  const selectedVehicle = vehicles.find(v => v.plate === selectedPlate);

  console.log("DEBUG selectedPlate:", selectedPlate);
  console.log("DEBUG selectedVehicle:", selectedVehicle);

  const trajetData = {
    id: (editingIndex !== null && trajets[editingIndex]) 
      ? trajets[editingIndex].id 
      : crypto.randomUUID(),
    depart: formData.get('depart')?.trim() || '',
    arrivee: formData.get('arrivee')?.trim() || '',
    date: formData.get('date') || '',
    heureDepart: formData.get('heure-depart') || '',
    heureArrivee: formData.get('heure-arrivee') || '',
    prix: formData.get('prix') || '',
    vehicle: selectedVehicle || null, // 👉 objet véhicule complet
    places: (selectedVehicle && selectedVehicle.places !== undefined && selectedVehicle.places !== null)
    ? Number(selectedVehicle.places)
    : (formData.get('places') ? Number(formData.get('places')) : 4),
    role: "chauffeur",
    status: 'ajoute'
  };

  // 🔎 Vérification champs obligatoires
  if (!trajetData.depart || !trajetData.arrivee || !trajetData.date) {
    alert('Veuillez remplir les champs obligatoires (départ, arrivée, date)');
    return;
  }

  // ✏️ Mise à jour ou ajout
  if (editingIndex !== null && trajets[editingIndex]) {
    trajetData.status = trajets[editingIndex].status; 
    trajets[editingIndex] = trajetData;
    console.log("✏️ Trajet modifié:", trajetData);
    editingIndex = null;
  } else {
    trajets.push(trajetData);
    console.log("➕ Nouveau trajet ajouté:", trajetData);
  }

  // 💾 Sauvegarde et mise à jour UI
  saveTrajets();
  ajouterAuCovoiturage(trajetData);
  renderTrajetsInProgress();
  renderHistorique();

  // 🔄 Reset du formulaire
  e.target.reset();
  document.querySelectorAll('input, select').forEach(input => {
    if (!input.value) input.classList.add('empty'); 
    else input.classList.remove('empty');
  });
}

// -------------------- Gestion des actions --------------------

function handleTrajetActions(e) {
  const target = e.target;

  if (target.classList.contains('trajet-start-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === "chauffeur") {
      trajet.status = "demarre";
      saveTrajets();
      renderTrajetsInProgress();
      console.log("🚀 Trajet démarré :", trajet);
    }
  }

  if (target.classList.contains('trajet-arrive-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'termine';
      saveTrajets();
      renderTrajetsInProgress();
      renderHistorique();
      console.log("🏁 Trajet terminé :", trajet);
    }
  }

  if (target.classList.contains('trajet-edit-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    
    // Seuls les trajets chauffeur peuvent être édités
    if (!trajet || trajet.role !== 'chauffeur') {
      return;
    }

    const form = document.querySelector('#trajet-form');
    if (form) {
      const departInput = form.querySelector('[name="depart"]');
      if (departInput) departInput.value = trajet.depart || '';

      const arriveeInput = form.querySelector('[name="arrivee"]');
      if (arriveeInput) arriveeInput.value = trajet.arrivee || '';

      const dateInput = form.querySelector('[name="date"]');
      if (dateInput) dateInput.value = trajet.date || '';

      const heureDepartInput = form.querySelector('[name="heure-depart"]');
      if (heureDepartInput) heureDepartInput.value = trajet.heureDepart || '';

      const heureArriveeInput = form.querySelector('[name="heure-arrivee"]');
      if (heureArriveeInput) heureArriveeInput.value = trajet.heureArrivee || '';

      const prixInput = form.querySelector('[name="prix"]');
      if (prixInput) prixInput.value = trajet.prix || '';

      const vehicleInput = form.querySelector('[name="vehicle"]');
      if (vehicleInput) vehicleInput.value = trajet.vehicle ? trajet.vehicle.plate : '';
      }

    // ✅ Correction : on utilise editingIndex au lieu de editingTrajetId
    editingIndex = trajets.findIndex(t => t.id === id);
    console.log("✏️ Trajet prêt pour modification (index:", editingIndex, "):", trajet);

    // 🚀 Forcer l'onglet "Mes trajets" avec Bootstrap
    const tabTrigger = document.querySelector('[data-bs-target="#tab-trajets"]');
    if (tabTrigger) {
      new bootstrap.Tab(tabTrigger).show();
    }

    // Bonus UX → scroll vers le formulaire
    if (form) {
      form.scrollIntoView({ behavior: "smooth" });
    }
  }

  if (target.classList.contains('trajet-delete-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index !== -1) {
      if (confirm("Voulez-vous vraiment supprimer ce trajet ?")) {
        // Supprime depuis ecoride_trajets
        trajets.splice(index, 1);
        saveTrajets();
  
        // 🚀 Supprime aussi depuis nouveauxTrajets (covoiturage)
        let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
        trajetsCovoit = trajetsCovoit.filter(t => t.id !== id);
        localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
  
        renderTrajetsInProgress();
        renderHistorique();
  
        console.log("🗑️ Trajet supprimé (ID:", id, ") et retiré du covoiturage");
      }
    }
  }

  if (target.classList.contains('trajet-close-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'valide'; // ✅ on bascule en historique
      saveTrajets();
  
      // 🚀 Supprimer aussi de la liste covoiturage
      let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
      trajetsCovoit = trajetsCovoit.filter(t => t.id !== id);
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
  
      renderTrajetsInProgress();
      renderHistorique();
      console.log("📂 Trajet déplacé dans l'historique ET retiré du covoiturage :", trajet);
    }
  }

  if (target.classList.contains('trajet-cancel-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index !== -1) {
      const trajet = trajets[index];
      if (trajet && trajet.role === 'passager') {
        if (confirm("Voulez-vous vraiment annuler cette réservation ?")) {
          trajets.splice(index, 1);
          saveTrajets();
          renderTrajetsInProgress();
          console.log("❌ Réservation annulée (ID:", id, ")");
        }
      }
    }
  }
}

// -------------------- Rendu dynamique --------------------

function renderTrajetsInProgress() {
  console.log("🎨 Rendu dans 'Mes trajets en cours'");

  const container = document.querySelector('#trajets-en-cours .trajets-list');
  if (!container) return;

  container.innerHTML = ''; // On vide uniquement la liste, pas le titre 😉

  const enCours = trajets.filter(t => t.status !== "valide");

  if (enCours.length === 0) {
    container.innerHTML = `<p>Aucun trajet en cours</p>`;
    return;
  }

  enCours.forEach((trajet, index) => {
    let bgClass = "";
    let actionHtml = "";
  
    if (trajet.role === "chauffeur") {
      if (trajet.status === "ajoute") {
        bgClass = "trajet-card actif";
        actionHtml = `
          <button class="btn-trajet trajet-edit-btn" data-id="${trajet.id}">Modifier</button>
          <button class="btn-trajet trajet-delete-btn" data-id="${trajet.id}">Supprimer</button>
          <button class="btn-trajet trajet-start-btn" data-id="${trajet.id}">Démarrer</button>
        `;
      } else if (trajet.status === "demarre") {
        bgClass = "trajet-card termine";
        actionHtml = `
          <button class="btn-trajet trajet-arrive-btn" data-id="${trajet.id}">Arrivée à destination</button>
        `;
      } else if (trajet.status === "termine") {
        bgClass = "trajet-card attente";
        actionHtml = `
          <span class="trajet-status">En attente de validation des passagers...</span>
          <button class="btn-trajet trajet-close-btn" data-id="${trajet.id}">Clôturer</button>
        `;
      }
    } 
    else if (trajet.role === "passager") {
      if (trajet.status === "reserve") {
        bgClass = "trajet-card reserve";
        // 🚀 FIX: Utiliser detail.html au lieu de /detail
        const detailUrl = `detail.html?id=${trajet.id}`;
        actionHtml = `
          <a href="${detailUrl}" class="btn-trajet trajet-detail-btn">Détail</a>
          <button class="btn-trajet trajet-cancel-btn" data-id="${trajet.id}">Annuler</button>
        `;
      }
    }

    // Insertion de la carte
    container.innerHTML += `
      <div class="${bgClass}" data-id="${trajet.id}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${trajet.date || ""}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${(trajet.placesReservees || 0)} places réservées
            </span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
          ${actionHtml}
        </div>
      </div>
    `;
  });

  // 🔥 Ajout bouton reset en DEV
  if (window.location.hostname === "localhost") {
    container.innerHTML += `
      <button class="btn-dev-reset" id="reset-trajets-en-cours">
        🗑 Supprimer tous les trajets en cours (DEV)
      </button>
    `;

    const resetBtn = document.getElementById("reset-trajets-en-cours");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Supprimer tous les trajets en cours ? (DEV)")) {
          trajets = trajets.filter(t => t.status === "valide");
          saveTrajets();
          renderTrajetsInProgress();
          renderHistorique();
        }
      });
    }
  }
}

// -------------------- Historique --------------------

function renderHistorique() {
  const container = document.querySelector('.trajets-historique');
  if (!container) return;

  container.innerHTML = `<h2>Mes trajets passés</h2>`;

  const passe = trajets.filter(t => t.status === "valide");

  if (passe.length === 0) {
    container.innerHTML += `<p>Aucun trajet terminé</p>`;
    return;
  }

  passe.forEach(trajet => {
    const placesReservees = trajet.placesReservees || 0;
  
    container.innerHTML += `
      <div class="trajet-card valide">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${trajet.date || ""}) : <br>${trajet.depart} --&gt; ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} -----&gt; ${trajet.heureArrivee || ""} • ${placesReservees} places réservées
            </span>
          </div>
          <div class="trajet-price">${trajet.prix} crédits</div>
        </div>
      </div>
    `;
  });
}

// -------------------- Persistance --------------------
function getTrajets() {
  try {
    const stored = localStorage.getItem('ecoride_trajets');
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("❌ Erreur lecture trajets localStorage:", err);
    return [];
  }
}

function saveTrajets() {
  try {
    localStorage.setItem('ecoride_trajets', JSON.stringify(trajets));
    console.log("💾 Trajets sauvegardés:", trajets.length);
  } catch (err) {
    console.error("❌ Erreur sauvegarde trajets:", err);
  }
}

// -------------------- Reset formulaire --------------------
function resetForm(form) {
  if (form) {
    form.reset();
  }
  editingIndex = null; // on sort du mode édition
}

// -------------------- Injection dynamique véhicules --------------------

function populateVehicles() {
  try {
    const stored = localStorage.getItem('ecoride_vehicles');
    const vehicles = stored ? JSON.parse(stored) : [];

    const select = document.querySelector('#vehicle'); // ⚠️ bien "#vehicle"
    if (!select) return;

    select.innerHTML = '<option value="" selected hidden>-- Sélectionner un véhicule --</option>';

    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = v.plate;
      option.textContent = getVehicleLabel(v); 
      select.appendChild(option);
    });

    console.log("🚗 Véhicules injectés dans le select:", vehicles.length, vehicles);
  } catch (err) {
    console.error("❌ Erreur chargement véhicules:", err);
  }
}

// -------------------- Ajout au covoiturage --------------------
function ajouterAuCovoiturage(trajetData) {
  console.log("🚗 trajetData.vehicle:", trajetData.vehicle);
  console.log("🏷️ getVehicleType result:", getVehicleType(trajetData.vehicle));
  // Convertir le format de trajets.js vers le format covoiturage.js
  const capacity = (trajetData.vehicle && trajetData.vehicle.places !== undefined)
  ? Number(trajetData.vehicle.places)
  : (trajetData.places !== undefined ? Number(trajetData.places) : 4);

  const trajetCovoiturage = {
    id: trajetData.id,
    date: formatDateForCovoiturage(trajetData.date),
    chauffeur: {
      pseudo: "Moi",
      rating: 0,
      photo: "images/default-avatar.png"
    },
    type: getVehicleType(trajetData.vehicle),
    capacity,                 // capacité totale
    places: capacity,         // places restantes (sera décrémentée)
    depart: trajetData.depart,
    arrivee: trajetData.arrivee,
    heureDepart: trajetData.heureDepart ? trajetData.heureDepart.replace(':', 'h') : '',
    heureArrivee: trajetData.heureArrivee ? trajetData.heureArrivee.replace(':', 'h') : '',
    prix: parseInt(trajetData.prix) || 0,
    rating: 0,
    passagers: [],            // tableau des noms/id des passagers
    vehicle: trajetData.vehicle || null
  };

  // Sauvegarder dans le localStorage pour covoiturage.js
  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
  trajetsCovoiturage.push(trajetCovoiturage);
  localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));

  console.log("🚗 Trajet ajouté au covoiturage:", trajetCovoiturage);
}

// Fonction helper pour formater la date
function formatDateForCovoiturage(dateISO) {
  if (!dateISO) return '';
  const date = new Date(dateISO);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  return date.toLocaleDateString('fr-FR', options);
}

// Fonction helper pour déduire le type de véhicule
function getVehicleType(vehicle) {
  if (!vehicle) return "Economique";

  // 🔹 Si c'est déjà une chaîne
  if (typeof vehicle === "string") {
    const vehicleLower = vehicle.toLowerCase();
    if (vehicleLower.includes("tesla") || vehicleLower.includes("électrique")) {
      return "Electrique";  
    } else if (vehicleLower.includes("hybride") || vehicleLower.includes("prius")) {
      return "Hybride";     
    } else {
      return "Thermique";   
    }
  }

  // 🔹 Si c'est un objet
  if (typeof vehicle === "object") {
    if (vehicle.type) {
      // Capitaliser la première lettre
      const type = vehicle.type.toLowerCase();
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    const brand = (vehicle.brand || vehicle.marque || "").toLowerCase();
    const model = (vehicle.vehicleModel || vehicle.modele || "").toLowerCase();

    if (brand.includes("tesla") || model.includes("électrique")) {
      return "Electrique";
    } else if (brand.includes("toyota") || model.includes("hybride") || model.includes("prius")) {
      return "Hybride";
    } else {
      return "Thermique";
    }
  }

  return "Economique";
}

// -------------------- Exports debug --------------------
export function debugTrajets() {
  console.log("🔍 Etat trajets:", trajets);
  return trajets;
}

window.debugTrajets = debugTrajets;