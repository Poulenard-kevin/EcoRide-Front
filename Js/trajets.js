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

  trajets = getTrajets()

  updatePlacesReservees()

  console.log("📥 Trajets chargés:", trajets);

  // ⚡ Injection dynamique des véhicules
  populateVehiclesDatalist();

  if (form) {
    form.addEventListener('submit', handleTrajetSubmit);
    console.log("✅ Event listener formulaire ajouté");
  }

  // Event listeners pour les boutons dynamiques
  document.addEventListener('click', handleTrajetActions);

  renderTrajetsInProgress();
  renderHistorique();
  populateVehiclesDatalist();

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
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();

          console.log(`🧹 Historique vidé (dev). Trajets supprimés: ${removed}`);
        });

        // Insérer le bouton au-dessus du titre de l'historique
        histoContainer.parentNode.insertBefore(clearBtn, histoContainer);
      }
    }
  }
  window.addEventListener('ecoride:reservationAdded', (e) => {
    try {
      const reservation = e.detail;
  
      // Vérifier si la réservation existe déjà (évite doublons)
      if (!trajets.find(r => r.id === reservation.id)) {
        trajets.push(reservation);
        saveTrajets(); // sauve la variable globale trajets
        updatePlacesReservees();
        renderTrajetsInProgress();
      }
    } catch (err) {
      console.warn('Erreur lors du traitement de l\'événement reservationAdded', err);
    }
  });
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

  console.log("DEBUG selectedVehicle.places:", selectedVehicle ? selectedVehicle.places : "aucun véhicule sélectionné");

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
    places: (selectedVehicle && selectedVehicle.seats !== undefined && selectedVehicle.seats !== null)
  ? Number(selectedVehicle.seats)
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
  updatePlacesReservees();
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

// Helper : retry until fn() returns true (ou maxAttempts atteintes)
function tryUntilExists(fn, maxAttempts = 8, intervalMs = 80) {
  let attempts = 0;
  return new Promise(resolve => {
    const runner = () => {
      try {
        const ok = fn();
        if (ok) return resolve(true);
      } catch (err) { /* ignore */ }
      attempts++;
      if (attempts >= maxAttempts) return resolve(false);
      setTimeout(runner, intervalMs);
    };
    runner();
  });
}

function handleTrajetActions(e) {
  const target = e.target;

  if (target.classList.contains('trajet-start-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === "chauffeur") {
      trajet.status = "demarre";
      saveTrajets();
      updatePlacesReservees()
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
      updatePlacesReservees();
      renderTrajetsInProgress();
      renderHistorique();
      console.log("🏁 Trajet terminé :", trajet);
    }
  }

  if (target.classList.contains('trajet-edit-btn')) {
    e.preventDefault?.();           // empêcher comportement par défaut
    e.stopPropagation?.();          // empêcher propagation

    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);

    // Seuls les trajets chauffeur peuvent être édités
    if (!trajet || trajet.role !== 'chauffeur') return;

    // Forcer l'onglet "Mes trajets"
    if (typeof switchToTab === 'function') {
      switchToTab('user-trajects-form');
      console.log('switchToTab called for user-trajects-form');
    }

    // Attendre que le formulaire soit présent / prêt dans le DOM
    tryUntilExists(() => {
      return document.querySelector('#trajet-form') !== null;
    }, 12, 80).then(found => {
      if (!found) {
        console.warn('trajet-form introuvable après retries');
        return;
      }

      const form = document.querySelector('#trajet-form');
      if (!form) return;

      // Pré-remplissage
      const setIf = (selector, value) => {
        const el = form.querySelector(selector);
        if (el) el.value = value || '';
      };

      setIf('[name="depart"]', trajet.depart);
      setIf('[name="arrivee"]', trajet.arrivee);
      setIf('[name="date"]', trajet.date);
      setIf('[name="heure-depart"]', trajet.heureDepart);
      setIf('[name="heure-arrivee"]', trajet.heureArrivee);
      setIf('[name="prix"]', trajet.prix);
      setIf('[name="vehicle"]', trajet.vehicle ? trajet.vehicle.plate : '');

      // marque l'index d'édition
      editingIndex = trajets.findIndex(t => t.id === id);
      console.log("✏️ Trajet prêt pour modification (index:", editingIndex, "):", trajet);

      // Scroll robuste vers le formulaire (gère parents scrollables)
      const getScrollableParent = el => {
        let node = el.parentElement;
        while (node) {
          const style = window.getComputedStyle(node);
          const overflow = style.overflow + style.overflowY + style.overflowX;
          if (/(auto|scroll)/.test(overflow)) return node;
          node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
      };

      const robustScrollTo = (el) => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const parent = getScrollableParent(el);
          if (parent && parent !== document.scrollingElement && parent !== document.documentElement) {
            const elRect = el.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const offset = (elRect.top - parentRect.top) - (parentRect.height / 2) + (elRect.height / 2);
            parent.scrollTo({ top: parent.scrollTop + offset, behavior: 'smooth' });
          }
        } catch (err) {
          console.error('robustScrollTo error', err);
        }
      };

      // Laisser un petit délai si nécessaire (après injection du contenu)
      setTimeout(() => {
        robustScrollTo(form);
        // focus premier champ pour montrer visuellement que c'est prêt
        const first = form.querySelector('input, textarea, select, button');
        if (first) first.focus({ preventScroll: true });
      }, 40);
    });

    return; // sortir du handler pour éviter autres branches
  }

  // -------------------- trajet-delete-btn --------------------

  if (target.classList.contains('trajet-delete-btn')) {
    const id = target.dataset.id;
    const index = trajets.findIndex(t => t.id === id);
    if (index === -1) return;
  
    if (!confirm("Voulez-vous vraiment supprimer ce trajet ? Les passagers seront notifiés que le trajet a été annulé par le chauffeur.")) {
      return;
    }
  
    // 1) Supprimer le trajet local (chauffeur)
    const removed = trajets.splice(index, 1)[0];
    saveTrajets();
  
    // 2) Supprimer le covoiturage (nouveauxTrajets)
    let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
    const covoIndex = trajetsCovoit.findIndex(t => t.id === id);
    let removedCovo = null;
    if (covoIndex !== -1) {
      removedCovo = trajetsCovoit.splice(covoIndex, 1)[0];
      localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
      console.log("🚮 Covoiturage supprimé depuis nouveauxTrajets (ID:", id, ")");
    } else {
      console.log("ℹ️ Aucun covoiturage trouvé dans nouveauxTrajets pour l'ID:", id);
    }
  
    // 3) Marquer les réservations liées dans ecoride_trajets et créer notifications
    let userTrajets = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
    let notifications = JSON.parse(localStorage.getItem('ecoride_notifications') || '[]');
  
    const beforeCount = userTrajets.length;
    let affected = 0;
  
    // helper pour récupérer un identifiant utilisateur depuis une réservation (si présent)
    const getPassengerIdentifier = (res) => {
      return res.userId || res.passagerId || res.pseudo || (res.user && res.user.id) || (res.passager && res.passager.id) || null;
    };
  
    userTrajets = userTrajets.map(res => {
      const ref = res.covoiturageId || res.detailId || null;
      if (ref === id) {
        affected++;
  
        // Marquer la réservation comme annulée par le chauffeur
        res.status = 'annule_par_chauffeur';
        res.cancellationReason = res.cancellationReason || "Trajet annulé par le chauffeur";
        res.cancellationAt = new Date().toISOString();
        res.notified = false; // on pourra utiliser ce flag pour afficher une notif non lue
  
        // Créer une notification destinée au passager
        const passengerId = getPassengerIdentifier(res);
        const notification = {
          id: crypto.randomUUID ? crypto.randomUUID() : ('notif_' + Date.now() + Math.random().toString(36).slice(2)),
          to: passengerId, // peut être null si pas d'identifiant lié
          message: `Le trajet ${removedCovo ? (removedCovo.depart + ' → ' + removedCovo.arrivee) : ''} du ${removedCovo ? removedCovo.date : ''} a été annulé par le chauffeur.`,
          relatedCovoiturageId: id,
          type: 'trajet_annule',
          read: false,
          createdAt: new Date().toISOString()
        };
        notifications.push(notification);
      }
      return res;
    });
  
    if (affected > 0) {
      localStorage.setItem('ecoride_trajets', JSON.stringify(userTrajets));
      localStorage.setItem('ecoride_notifications', JSON.stringify(notifications));
      console.log(`🔔 ${affected} réservation(s) marquée(s) 'annule_par_chauffeur' et notifications créées.`);
    } else {
      console.log("ℹ️ Aucune réservation utilisateur liée trouvée.");
    }
  
    // 4) Mettre à jour places réservées avant rendu
    updatePlacesReservees();
  
    // 5) Re-render + event global pour que l'UI se mette à jour
    if (typeof renderTrajetsInProgress === 'function') renderTrajetsInProgress();
    if (typeof renderHistorique === 'function') renderHistorique();
    window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
    window.dispatchEvent(new CustomEvent('ecoride:notificationsUpdated'));
  
    // 6) Message au chauffeur
    alert(`Trajet supprimé. ${affected} réservation(s) ont été marquée(s) comme annulée(s) et les passagers ont été notifiés.`);
  }

  if (target.classList.contains('trajet-close-btn')) {
    const id = target.dataset.id;
    const trajet = trajets.find(t => t.id === id);
    if (trajet && trajet.role === 'chauffeur') {
      trajet.status = 'valide'; // ✅ on bascule en historique
      saveTrajets();
      updatePlacesReservees();

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
          // 1) Supprimer la réservation dans trajets (ecoride_trajets)
          trajets.splice(index, 1);
          saveTrajets();
  
          // 2) Mettre à jour le covoiturage dans nouveauxTrajets
          let trajetsCovoit = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');
          const covoIndex = trajetsCovoit.findIndex(t => t.id === trajet.detailId || trajet.covoiturageId || null);
          if (covoIndex !== -1) {
            const covo = trajetsCovoit[covoIndex];
  
            // Recalculer places restantes
            const reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');
            const totalReserved = reservations.reduce((acc, res) => {
              const ref = res.covoiturageId || res.detailId || null;
              if (ref === covo.id && res.status === 'reserve') {
                return acc + (typeof res.placesReservees === 'number' ? res.placesReservees : 1);
              }
              return acc;
            }, 0);
  
            covo.places = Math.max(0, covo.capacity - totalReserved);
  
            // Sauvegarder la mise à jour
            trajetsCovoit[covoIndex] = covo;
            localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoit));
            console.log("🔄 Covoiturage mis à jour après annulation réservation :", covo);
          }
  
          // 3) Mettre à jour l'UI
          updatePlacesReservees();
          renderTrajetsInProgress();
          renderHistorique();
  
          console.log("❌ Réservation annulée (ID:", id, ")");
        }
      }
    }
  }
}

// -------------------- Rendu dynamique --------------------

function updatePlacesReservees() {
  const reservations = JSON.parse(localStorage.getItem('ecoride_trajets') || '[]');

  trajets.forEach(trajet => {
    if (trajet.role === 'chauffeur') {
      // Somme des places réservées par les passagers pour ce covoiturage
      const id = trajet.id;
      const count = reservations.reduce((acc, res) => {
        const ref = res.covoiturageId || res.detailId || null;
        if (ref === id && res.status === 'reserve') {
          return acc + (typeof res.placesReservees === 'number' ? res.placesReservees : 1);
        }
        return acc;
      }, 0);
      trajet.placesReservees = count;
    } else if (trajet.role === 'passager') {
      // Trouver la réservation correspondante dans localStorage
      const res = reservations.find(r => r.id === trajet.id);
      if (res && typeof res.placesReservees === 'number') {
        trajet.placesReservees = res.placesReservees;
      } else {
        trajet.placesReservees = 1; // valeur par défaut
      }
    } else {
      trajet.placesReservees = 0;
    }
  });
}

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

  updatePlacesReservees();
  console.log("DEBUG — enCours après updatePlacesReservees:", trajets.filter(t => t.status !== "valide"));

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
    } else if (trajet.role === "passager") {
      if (trajet.status === "reserve") {
        bgClass = "trajet-card reserve";
        const detailUrl = `detail.html?id=${trajet.id}`;
        actionHtml = `
          <a href="${detailUrl}" class="btn-trajet trajet-detail-btn">Détail</a>
          <button class="btn-trajet trajet-cancel-btn" data-id="${trajet.id}">Annuler</button>
        `;
      }
    }
  
    container.innerHTML += `
      <div class="${bgClass}" data-id="${trajet.id}">
        <div class="trajet-body">
          <div class="trajet-info">
            <strong>Covoiturage (${trajet.date || ""}) : <br>${trajet.depart} → ${trajet.arrivee}</strong>
            <span class="details">
              ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""} • ${trajet.placesReservees} place${trajet.placesReservees > 1 ? 's' : ''} réservée${trajet.placesReservees > 1 ? 's' : ''}
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
          updatePlacesReservees();
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
export function getTrajets() {
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


// -------------------- Injection dynamique véhicules --------------------

function populateVehiclesDatalist() {
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
  console.log("🚗 ajout/update covoiturage pour:", trajetData.id);

  // Charger la liste existante
  let trajetsCovoiturage = JSON.parse(localStorage.getItem('nouveauxTrajets') || '[]');

  // Déterminer la capacity (priorité : vehicle.places, puis trajetData.places, sinon 4)
  const capacity = (trajetData.vehicle && trajetData.vehicle.seats !== undefined)
    ? Number(trajetData.vehicle.seats)
    : (trajetData.places !== undefined ? Number(trajetData.places) : 4);

  // Construire l'objet standardisé pour le covoiturage
  const baseTrajetCovoit = {
    id: trajetData.id,
    date: formatDateForCovoiturage(trajetData.date),
    chauffeur: {
      pseudo: trajetData.chauffeur?.pseudo || "Moi",
      rating: trajetData.chauffeur?.rating || 0,
      photo: trajetData.chauffeur?.photo || "images/default-avatar.png"
    },
    type: getVehicleType(trajetData.vehicle),
    capacity,
    places: capacity, // valeur par défaut, sera réajustée ensuite
    depart: trajetData.depart,
    arrivee: trajetData.arrivee,
    heureDepart: trajetData.heureDepart ? trajetData.heureDepart.replace(':', 'h') : '',
    heureArrivee: trajetData.heureArrivee ? trajetData.heureArrivee.replace(':', 'h') : '',
    prix: parseInt(trajetData.prix) || 0,
    rating: trajetData.rating || 0,
    passagers: Array.isArray(trajetData.passagers) ? trajetData.passagers.slice() : [],
    vehicle: trajetData.vehicle || null
  };

  // Chercher si le covoiturage existe déjà
  const idx = trajetsCovoiturage.findIndex(t => t.id === baseTrajetCovoit.id);

  if (idx !== -1) {
    // Mise à jour : ne pas écraser passagers ni places sans recalcul
    const existing = trajetsCovoiturage[idx];

    // Conserver les passagers existants s'il y en a (priorité aux existants)
    baseTrajetCovoit.passagers = Array.isArray(existing.passagers) && existing.passagers.length > 0
      ? existing.passagers.slice()
      : baseTrajetCovoit.passagers;

    // Si la capacité a changé (p.ex. véhicule modifié), recalculer places restantes
    const totalOccupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      if (typeof p === 'string') {
        const m = p.match(/x(\d+)$/);
        return sum + (m ? Number(m[1]) : 1);
      }
      return sum + 1;
    }, 0);

    const newCapacity = baseTrajetCovoit.capacity;
    baseTrajetCovoit.capacity = (typeof existing.capacity === 'number') ? existing.capacity : newCapacity;

    // Si on détecte que vehicle a changé => mettre à jour capacity puis places
    if (newCapacity !== baseTrajetCovoit.capacity) {
      // si capacity réduit en dessous de occupants, places=0 sinon capacity - occupied
      baseTrajetCovoit.places = Math.max(0, newCapacity - totalOccupied);
    } else {
      // sinon préserver places si existant sinon calculer
      baseTrajetCovoit.places = (typeof existing.places === 'number') ? existing.places : Math.max(0, newCapacity - totalOccupied);
    }

    // Merge non destructif (préserver champs existants si présents)
    trajetsCovoiturage[idx] = Object.assign({}, existing, baseTrajetCovoit);
    console.log("🔁 Trajet covoiturage mis à jour :", trajetsCovoiturage[idx]);
  } else {
    // Nouveau covoiturage : recalculer places en fonction des passagers actuels
    const occupied = baseTrajetCovoit.passagers.reduce((sum, p) => {
      if (typeof p === 'string') {
        const m = p.match(/x(\d+)$/);
        return sum + (m ? Number(m[1]) : 1);
      }
      return sum + 1;
    }, 0);
    baseTrajetCovoit.places = Math.max(0, capacity - occupied);

    trajetsCovoiturage.push(baseTrajetCovoit);
    console.log("➕ Nouveau trajet covoiturage ajouté :", baseTrajetCovoit);
  }

  // Sauvegarde
  localStorage.setItem('nouveauxTrajets', JSON.stringify(trajetsCovoiturage));
  // Notifier si tu utilises l'événement global
  window.dispatchEvent(new CustomEvent('ecoride:trajetsUpdated'));
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