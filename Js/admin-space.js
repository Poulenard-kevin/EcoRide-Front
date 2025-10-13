// ==========================
// Données exemple : nb de trajets par jour
// (= 1 seule semaine ici, mais pourrait s'étendre)
// ==========================
const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const covoituragesData = [4, 6, 5, 7, 3, 8, 9]; // nombre trajets par jour

// Commission EcoRide par trajet
const commissionParTrajet = 2;

// ==========================
// Crédits EcoRide par jour
// ==========================
const creditsEcoRideData = covoituragesData.map(nb => nb * commissionParTrajet);

// ==========================
// Total de la période affichée (ex: semaine)
// ==========================
const totalCreditsSemaine = creditsEcoRideData.reduce((a, b) => a + b, 0);

// ==========================
// Total depuis le lancement
// !!! Ici tu peux remplacer par une valeur fixe venant du back
// Exemple : simulateur avec 10 000 crédits déjà accumulés
// ==========================
const creditsDepuisLancement = 10000 + totalCreditsSemaine;

// On affiche dans le dashboard
document.getElementById("totalCredits").textContent = creditsDepuisLancement;

// ==========================
// Graphs
// ==========================
new Chart(document.getElementById("covoituragesChart"), {
  type: 'bar',
  data: {
    labels: jours,
    datasets: [{
      label: "Covoiturages",
      data: covoituragesData,
      backgroundColor: "#4B8A47"
    }]
  },
  options: { 
    responsive: true, 
    }
});

new Chart(document.getElementById("creditsChart"), {
  type: 'bar',
  data: {
    labels: jours,
    datasets: [{
      label: "Crédits EcoRide (commission)",
      data: creditsEcoRideData,
      backgroundColor: "#CACFAA"
    }]
  },
  options: { responsive: true }
});



// ==========================
// Données exemple utilisateurs
// ==========================
const utilisateurs = [
    { id: 1, nom: "Utilisateur 1", email: "user1@exemple.com", role: "Utilisateur", statut: "actif" },
    { id: 2, nom: "Employé 1", email: "employe1@exemple.com", role: "Employé", statut: "actif" },
    { id: 3, nom: "Utilisateur 2", email: "user2@exemple.com", role: "Utilisateur", statut: "suspendu" }
  ];
  
  // ==========================
  // Rendu du tableau
  // ==========================
  function renderAccountsTable() {
    const tbody = document.getElementById("accountsTableBody");
    tbody.innerHTML = ""; // reset
    
    utilisateurs.forEach(user => {
      const tr = document.createElement("tr");
      
      tr.innerHTML = `
        <td>${user.nom}</td>
        <td>${user.email}</td>
        <td>${user.role}</td>
        <td>${user.statut}</td>
        <td>
            <button class="btn-action ${user.statut === "actif" ? "btn-suspendre" : "btn-reactiver"}" data-id="${user.id}">
            ${user.statut === "actif" ? "Suspendre" : "Réactiver"}
            </button>
        </td>
        `;
      
      tbody.appendChild(tr);
    });
  
    // Attacher event listeners
    document.querySelectorAll(".btn-action").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(e.target.getAttribute("data-id"));
        toggleUserStatus(id);
      });
    });
  }
  
  // ==========================
  // Fonction suspendre/réactiver
  // ==========================
  function toggleUserStatus(id) {
    const user = utilisateurs.find(u => u.id === id);
    if (user) {
      user.statut = user.statut === "actif" ? "suspendu" : "actif";
      renderAccountsTable(); // rerender
    }
  }
   
  // ==========================
  // Initialisation
  // ==========================
  renderAccountsTable();

  // ==========================
  // Gestion employés
  // ==========================

  // ==========================
// Validation REGEX simple (logs console + blocage submit)
// ==========================
(function () {
  const form = document.getElementById('employeeForm');
  if (!form) {
    console.error('Form #employeeForm introuvable');
    return;
  }

  const nameInput = document.getElementById('employeeName');
  const emailInput = document.getElementById('employeeEmail');
  const passInput = document.getElementById('employeePassword');
  const submitBtn = form.querySelector('button[type="submit"]');

  // Regex
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]{2,}$/; // 2+ lettres, accents, espaces, tirets, apostrophes
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;  // email simple robuste
  const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/; // 8+ chars, min, maj, chiffre, spécial

  // Helpers
  const isNameValid = v => nameRegex.test(v.trim());
  const isEmailValid = v => emailRegex.test(v.trim());
  const isPassValid = v => passRegex.test(v);

  function validateAll() {
    const nameOk = isNameValid(nameInput.value);
    const emailOk = isEmailValid(emailInput.value);
    const passOk = isPassValid(passInput.value);

    console.clear();
    console.log('— Validation REGEX —');
    console.log('Nom      :', JSON.stringify(nameInput.value), '=>', nameOk ? 'OK' : 'NOK');
    console.log('Email    :', JSON.stringify(emailInput.value), '=>', emailOk ? 'OK' : 'NOK');
    console.log('Password :', passInput.value.replace(/./g, '*'), '=>', passOk ? 'OK' : 'NOK');

    if (submitBtn) submitBtn.disabled = !(nameOk && emailOk && passOk);
    return nameOk && emailOk && passOk;
  }

  [nameInput, emailInput, passInput].forEach(inp => {
    inp.addEventListener('input', validateAll);
    inp.addEventListener('blur', validateAll);
  });

  form.addEventListener('submit', (e) => {
    const ok = validateAll();
    if (!ok) {
      e.preventDefault();
      console.warn('Soumission bloquée: regex non validées');
      return;
    }
    e.preventDefault(); // Retire cette ligne quand tu intégreras le backend
    console.log('Soumission OK: regex validées');
    alert(`Employé prêt à créer: ${nameInput.value.trim()} (${emailInput.value.trim()})`);
    form.reset();
    validateAll(); // réévalue pour re-désactiver le bouton
  });

  // Etat initial
  if (submitBtn) submitBtn.disabled = true;
})();
