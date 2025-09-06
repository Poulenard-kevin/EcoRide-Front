// -------------------------------
// Gestion AVIS A VALIDER
// -------------------------------

// Données mockées (avis)
const avisData = [
    { id: 1, pseudo: "Alice", note: 4, texte: "Super trajet, conducteur sympa !" },
    { id: 2, pseudo: "Bob", note: 3, texte: "Bien mais voiture pas très propre" },
    { id: 3, pseudo: "Claire", note: 5, texte: "Parfait, je recommande !" },
    { id: 4, pseudo: "David", note: 2, texte: "Retard de 30 min et conduite brusque." }
  ];
  
  // Sélection du conteneur des avis
  const avisList = document.querySelector(".avis-list");
  
  // Génération dynamique des cartes d'avis
  avisData.forEach(({id, pseudo, note, texte}) => {
    const stars = "★".repeat(note) + "☆".repeat(5 - note);
  
    avisList.innerHTML += `
      <div class="avis-card" data-id="${id}">
        <h3 class="pseudo">${pseudo}</h3>
        <div class="stars">${stars}</div>
        <p class="avis-text">${texte}</p>
        <div class="actions">
          <button type="button" class="btn valider">Valider</button>
          <button type="button" class="btn refuser">Refuser</button>
        </div>
      </div>
    `;
  });
  
  // Ajouter events après génération
  document.querySelectorAll('.valider').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.avis-card');
      const id = card.dataset.id;
      console.log("Avis validé ID:", id);
  
      // Plus tard: fetch(`/api/avis/${id}/valider`, { method: "POST" })
    });
  });
  
  document.querySelectorAll('.refuser').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.avis-card');
      const id = card.dataset.id;
      console.log("Avis refusé ID:", id);
  
      // Plus tard: fetch(`/api/avis/${id}/refuser`, { method: "POST" })
    });
  });
  
  
  // -------------------------------
  // Gestion TRAJETS SIGNALES
  // -------------------------------
  
  // Données mockées (trajets signalés)
  const trajetsData = [
    { 
      id: 1234, 
      chauffeur: "Chauffeur1", 
      chauffeurMail: "chauffeur1@email.com",
      passager: "Passager1", 
      passagerMail: "passager1@email.com",
      dateDepart: "12/04/25 08:30", 
      dateArrivee: "12/04/25 11:30",
      trajet: "Lyon → Grenoble",
      description: "Le passager se plaint de retards et d’une conduite trop rapide."
    },
    { 
      id: 5678, 
      chauffeur: "Chauffeur2", 
      chauffeurMail: "chauffeur2@email.com",
      passager: "Passager2", 
      passagerMail: "passager2@email.com",
      dateDepart: "13/04/25 14:00", 
      dateArrivee: "13/04/25 19:15",
      trajet: "Grenoble → Lyon",
      description: "Signalement pour comportement irrespectueux durant le trajet."
    }
  ];
  
  // Sélection du tbody
  const trajetsTableBody = document.querySelector(".trajets-table tbody");
  
  // Génération dynamique des lignes
  trajetsData.forEach(({id, chauffeur, passager, dateDepart, trajet}) => {
    const dateOnly = dateDepart.split(" ")[0];
  
    trajetsTableBody.innerHTML += `
      <tr data-id="${id}">
        <td>${id}</td>
        <td>${chauffeur}</td>
        <td>${passager}</td>
        <td>${dateOnly}</td>
        <td>${trajet}</td>
      </tr>
    `;
  });
  
  
  // -------------------------------
  // Gestion MODAL
  // -------------------------------
  
  const modal = document.getElementById("trajet-modal");
  const closeBtn = document.querySelector(".close-btn");
  
  // Clic sur ligne du tableau -> ouvre modal
  document.querySelectorAll(".trajets-table tbody tr").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const trajet = trajetsData.find(t => t.id == id);
  
      if (trajet) {
        document.getElementById("modal-id").innerText = trajet.id;
        document.getElementById("modal-chauffeur").innerText = trajet.chauffeur;
        document.getElementById("modal-chauffeur-mail").innerText = trajet.chauffeurMail;
        document.getElementById("modal-passager").innerText = trajet.passager;
        document.getElementById("modal-passager-mail").innerText = trajet.passagerMail;
        document.getElementById("modal-date-depart").innerText = trajet.dateDepart;
        document.getElementById("modal-date-arrivee").innerText = trajet.dateArrivee;
        document.getElementById("modal-trajet").innerText = trajet.trajet;
        document.getElementById("modal-description").innerText = trajet.description;
        
        modal.style.display = "block";
      }
    });
  });
  
  // Fermeture modal
  closeBtn.addEventListener("click", () => modal.style.display = "none");
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });