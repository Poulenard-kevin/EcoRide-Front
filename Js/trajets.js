// -------------------- Variables globales --------------------
let trajets = [];
let editingIndex = null; // 👈 nouvel indicateur d'édition

// -------------------- Fonction principale d'initialisation --------------------
export function initTrajets() {
  console.log("🚀 Initialisation des trajets");

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
    const trajetData = {
      depart: formData.get('depart')?.trim() || '',
      arrivee: formData.get('arrivee')?.trim() || '',
      date: formData.get('date') || '',
      heureDepart: formData.get('heure-depart') || '',
      heureArrivee: formData.get('heure-arrivee') || '',
      prix: formData.get('prix') || '',
      vehicule: formData.get('vehicule') || '',
      status: 'ajoute' // valeur par défaut
    };
  
    if (!trajetData.depart || !trajetData.arrivee || !trajetData.date) {
      alert('Veuillez remplir les champs obligatoires (départ, arrivée, date)');
      return;
    }
  
    if (editingIndex !== null && trajets[editingIndex]) {
        // Mode édition
        trajetData.status = trajets[editingIndex].status; 
        trajets[editingIndex] = trajetData;
        console.log("✏️ Trajet modifié:", trajetData);
        editingIndex = null;
      } else if (editingIndex !== null && !trajets[editingIndex]) {
        console.warn("⚠️ Trajet à éditer introuvable, ajout normal");
        trajets.push(trajetData);
        editingIndex = null;
      } else {
        // Ajout normal
        trajets.push(trajetData);
        console.log("➕ Nouveau trajet ajouté:", trajetData);
      }
  
    saveTrajets();
    renderTrajetsInProgress();
    renderHistorique();
    e.target.reset();
  }

// -------------------- Gestion des actions --------------------

function handleTrajetActions(e) {
    const target = e.target;
  
    if (target.classList.contains('trajet-start-btn')) {
      const index = parseInt(target.dataset.index, 10);
      trajets[index].status = 'demarre';
      saveTrajets();
      renderTrajetsInProgress();
    }
  
    if (target.classList.contains('trajet-arrive-btn')) {
        const index = parseInt(target.dataset.index, 10);
        trajets[index].status = 'termine';
        saveTrajets();
        renderTrajetsInProgress();
        renderHistorique();
    }
  
    if (target.classList.contains('trajet-edit-btn')) {
        const index = parseInt(target.dataset.index, 10);
        const trajet = trajets[index];
      
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

          const vehiculeInput = form.querySelector('[name="vehicule"]');
          if (vehiculeInput) vehiculeInput.value = trajet.vehicule || '';
        }
      
        editingIndex = index; // 👈 on se souvient de quel trajet on édite
        console.log("✏️ Trajet prêt pour modification (index:", index, "):", trajet);
      
        // Bonus UX → scroll vers le formulaire
        form.scrollIntoView({ behavior: "smooth" });
    }
  
    if (target.classList.contains('trajet-delete-btn')) {
      const index = parseInt(target.dataset.index, 10);
      if (confirm("Voulez-vous vraiment supprimer ce trajet ?")) {
        trajets.splice(index, 1);
        saveTrajets();
        renderTrajetsInProgress();
        console.log("🗑️ Trajet supprimé");
      }
    }

    if (target.classList.contains('trajet-close-btn')) {
        const index = parseInt(target.dataset.index, 10);
        trajets[index].status = 'valide'; // ✅ on bascule en historique
        saveTrajets();
        renderTrajetsInProgress();
        renderHistorique();
        console.log("📂 Trajet déplacé dans l’historique :", trajets[index]);
    }
  }

// -------------------- Rendu dynamique --------------------

function renderTrajetsInProgress() {
    console.log("🎨 Rendu dans 'Mes trajets en cours'");
  
    const container = document.querySelector('.trajets-en-cours');
    if (!container) return;
  
    container.innerHTML = `<h2>Mes trajets en cours</h2>`;
  
    if (trajets.length === 0) {
      container.innerHTML += `<p>Aucun trajet en cours</p>`;
      return;
    }
  
    trajets.forEach((trajet, index) => {
      let bgClass = "";
      let actionHtml = "";
  
      if (trajet.status === "ajoute") {
        bgClass = "trajet-card actif";
        actionHtml = `
          <button type="button" class="btn-trajet trajet-edit-btn" data-index="${index}">Modifier</button>
          <button type="button" class="btn-trajet trajet-delete-btn" data-index="${index}">Supprimer</button>
          <button type="button" class="btn-trajet trajet-start-btn" data-index="${index}">Démarrer</button>
        `;
      } 
      else if (trajet.status === "demarre") {
        bgClass = "trajet-card termine";
        actionHtml = `
          <button type="button" class="btn-trajet trajet-arrive-btn" data-index="${index}">Arrivée à destination</button>
        `;
      } 
      else if (trajet.status === "termine") {
        bgClass = "trajet-card attente";
        actionHtml = `
          <span class="trajet-status">En attente de validation des passagers...</span>
          <button type="button" class="btn-trajet trajet-close-btn" data-index="${index}">Clôturer</button>
        `;
      }
  
      container.innerHTML += `
        <div class="${bgClass}">
          <div class="trajet-body">
            <div class="trajet-info">
              <strong>Covoiturage : <br>${trajet.depart} → ${trajet.arrivee}</strong>
              <span class="details">${trajet.date} ${trajet.heureDepart ? "• " + trajet.heureDepart : ""}</span>
            </div>
            <div class="trajet-price">${trajet.prix} crédits</div>
            ${actionHtml}
          </div>
        </div>
      `;
    });
}

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
      container.innerHTML += `
        <div class="trajet-card valide">
          <div class="trajet-body">
            <div class="trajet-info">
              <strong>Covoiturage : <br>${trajet.depart} → ${trajet.arrivee}</strong>
              <span class="details">${trajet.date} ${trajet.heureDepart || ""} → ${trajet.heureArrivee || ""}</span>
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
      const stored = localStorage.getItem('ecoride_vehicules');
      const vehicles = stored ? JSON.parse(stored) : [];
  
      const datalist = document.querySelector('#vehicles');
      if (!datalist) return;
  
      datalist.innerHTML = ''; // reset
  
      vehicles.forEach(v => {
        const option = document.createElement('option');
        option.value = `${v.marque} ${v.modele} ${v.couleur || ''}`.trim();
        datalist.appendChild(option);
      });
  
      console.log("🚗 Véhicules injectés:", vehicles.length);
    } catch (err) {
      console.error("❌ Erreur chargement véhicules:", err);
    }
  }

// -------------------- Exports debug --------------------
export function debugTrajets() {
  console.log("🔍 Etat trajets:", trajets);
  return trajets;
}

window.debugTrajets = debugTrajets;