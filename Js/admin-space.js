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
// Utils persistance locale
// ==========================
const LS_KEY_USERS = 'ecoride_utilisateurs';

function loadUsers() {
  try {
    const raw = localStorage.getItem(LS_KEY_USERS);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  // fallback: liste par défaut si rien en storage
  return [
    { id: 1, nom: "Utilisateur 1", email: "user1@exemple.com", role: "Utilisateur", statut: "actif" },
    { id: 2, nom: "Employé 1",    email: "employe1@exemple.com", role: "Employé",   statut: "actif" },
    { id: 3, nom: "Utilisateur 2", email: "user2@exemple.com", role: "Utilisateur", statut: "suspendu" }
  ];
}

function saveUsers(list) {
  localStorage.setItem(LS_KEY_USERS, JSON.stringify(list));
}

// Liste utilisée par l'app
let utilisateurs = loadUsers();

// ==========================
// Rendu du tableau comptes
// ==========================
function renderAccountsTable() {
  const tbody = document.getElementById("accountsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

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

  // Attacher events
  document.querySelectorAll(".btn-action").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-id"), 10);
      toggleUserStatus(id);
    });
  });
}

function toggleUserStatus(id) {
  const user = utilisateurs.find(u => u.id === id);
  if (user) {
    user.statut = user.statut === "actif" ? "suspendu" : "actif";
    saveUsers(utilisateurs);
    renderAccountsTable();
  }
}

// ==========================
// Initial render
// ==========================
renderAccountsTable();


// ==========================
// Formulaire employés: validation + ajout + persistance
// ==========================
(function () {
  const form = document.getElementById('employeeForm');
  if (!form) return;

  const nameInput  = document.getElementById('employeeName');
  const emailInput = document.getElementById('employeeEmail');
  const passInput  = document.getElementById('employeePassword');
  const submitBtn  = form.querySelector('button[type="submit"]');

  // Regex (version autorisant chiffres dans le nom)
  const nameRegex  = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s'-]{2,}$/; // ou version "doit commencer par lettre" si tu préfères
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passRegex  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  function grp(el){ return el.closest('.form-group'); }
  function showValid(el){
    el.classList.remove('is-invalid'); el.classList.add('is-valid');
    const g = grp(el);
    g?.querySelector('.invalid-feedback') && (g.querySelector('.invalid-feedback').style.display = 'none');
    g?.querySelector('.valid-feedback')   && (g.querySelector('.valid-feedback').style.display   = 'block');
  }
  function showInvalid(el, msg){
    el.classList.remove('is-valid'); el.classList.add('is-invalid');
    const g = grp(el);
    if (g) {
      const inv = g.querySelector('.invalid-feedback');
      const val = g.querySelector('.valid-feedback');
      if (inv) { if (msg) inv.textContent = msg; inv.style.display = 'block'; }
      if (val) val.style.display = 'none';
    }
  }
  function clearState(el){
    el.classList.remove('is-valid','is-invalid');
    const g = grp(el);
    if (g) {
      const inv = g.querySelector('.invalid-feedback');
      const val = g.querySelector('.valid-feedback');
      if (inv) inv.style.display = 'none';
      if (val) val.style.display = 'none';
    }
  }

  function validateField(el){
    const v = el.value;
    if (el === nameInput){
      if (!v.trim()) return showInvalid(el,'Le nom est requis.');
      if (!nameRegex.test(v.trim())) return showInvalid(el,'Le nom doit contenir au moins 2 caractères (lettres/chiffres).');
      return showValid(el);
    }
    if (el === emailInput){
      if (!v.trim()) return showInvalid(el,"L'email est requis.");
      if (!emailRegex.test(v.trim())) return showInvalid(el,"Le mail n'est pas au bon format.");
      return showValid(el);
    }
    if (el === passInput){
      if (!v) return showInvalid(el,'Le mot de passe est requis.');
      if (!passRegex.test(v)) return showInvalid(el,'8+ caractères, minuscule, majuscule, chiffre et spécial.');
      return showValid(el);
    }
  }

  function allValid(){
    return [nameInput,emailInput,passInput].every(i => i.classList.contains('is-valid'));
  }
  function updateSubmitState(){
    if (submitBtn) submitBtn.disabled = !allValid();
  }

  [nameInput,emailInput,passInput].forEach(el=>{
    el.addEventListener('input', ()=>{ validateField(el); updateSubmitState(); });
    el.addEventListener('blur',  ()=>{ validateField(el); updateSubmitState(); });
  });

  form.addEventListener('submit', (e)=>{
    validateField(nameInput);
    validateField(emailInput);
    validateField(passInput);
    if (!allValid()){
      e.preventDefault();
      return;
    }

    e.preventDefault(); // à enlever quand branché au backend

    // Créer le nouvel employé
    const newUser = {
      id: (utilisateurs.length ? Math.max(...utilisateurs.map(u=>u.id)) + 1 : 1),
      nom: nameInput.value.trim(),
      email: emailInput.value.trim(),
      role: "Employé",
      statut: "actif"
    };

    // Ajouter + persister + rerender
    utilisateurs.push(newUser);
    saveUsers(utilisateurs);
    renderAccountsTable();

    // Reset UI
    form.reset();
    [nameInput,emailInput,passInput].forEach(clearState);
    updateSubmitState();
  });

  updateSubmitState();
})();
