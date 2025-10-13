// ==========================
// Dashboard dynamique relié aux trajets payés
// ==========================

// Clé de persistance des trajets
const LS_KEY_TRAJETS = 'ecoride_trajets';
const COMMISSION_FIXE = 2; // 2 crédits commission par trajet payé

function loadTrajets() {
  try {
    const raw = localStorage.getItem(LS_KEY_TRAJETS);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  // Seed de démo si rien en storage (réparti sur 7 jours)
  const today = new Date();
  const d = (offset) => {
    const dt = new Date(today);
    dt.setDate(today.getDate() - offset);
    return dt.toISOString().slice(0,10); // YYYY-MM-DD
  };
  const seed = [
    { id: 1, datePaiement: d(6), prixChauffeurCredits: 18, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
    { id: 2, datePaiement: d(5), prixChauffeurCredits: 22, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
    { id: 3, datePaiement: d(5), prixChauffeurCredits: 20, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
    { id: 4, datePaiement: d(3), prixChauffeurCredits: 25, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
    { id: 5, datePaiement: d(1), prixChauffeurCredits: 20, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
    { id: 6, datePaiement: d(0), prixChauffeurCredits: 30, commissionEcoRide: COMMISSION_FIXE, statutPaiement: "payé" },
  ];
  localStorage.setItem(LS_KEY_TRAJETS, JSON.stringify(seed));
  return seed;
}
function saveTrajets(list) {
  localStorage.setItem(LS_KEY_TRAJETS, JSON.stringify(list));
}

// Source de vérité des trajets
let trajets = loadTrajets();

// Génère les 7 derniers jours: labels (Lun, Mar, …) et clés ISO (YYYY-MM-DD)
function lastNDays(n=7) {
  const labels = [];
  const keys = [];
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const today = new Date();
  for (let i=n-1; i>=0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(fmt.format(d));             // ex: lun., mar.
    keys.push(d.toISOString().slice(0,10)); // YYYY-MM-DD
  }
  return { labels, keys };
}

// Agrège le nombre de trajets payés et les commissions par jour
function aggregateByDay(trajetsList, dayKeys) {
  const counts = Object.fromEntries(dayKeys.map(k => [k, 0]));
  const commissions = Object.fromEntries(dayKeys.map(k => [k, 0]));
  trajetsList.forEach(t => {
    if (t.statutPaiement !== "payé") return;
    if (!counts.hasOwnProperty(t.datePaiement)) return;
    counts[t.datePaiement] += 1;
    // commission par trajet (fixe 2 crédits ici)
    commissions[t.datePaiement] += Number(t.commissionEcoRide ?? COMMISSION_FIXE);
  });
  return { counts, commissions };
}

// Instances Chart.js (pour pouvoir les détruire avant mise à jour)
let covoituragesChartInstance = null;
let creditsChartInstance = null;

// Met à jour les graphiques et le total
function updateDashboard() {
  const { labels, keys } = lastNDays(7);
  const { counts, commissions } = aggregateByDay(trajets, keys);

  const covoituragesData = keys.map(k => counts[k]);       // nb trajets payés / jour
  const creditsEcoRideData = keys.map(k => commissions[k]); // commissions / jour

  const totalCreditsDepuisLancement = trajets
    .filter(t => t.statutPaiement === 'payé')
    .reduce((sum, t)=> sum + Number(t.commissionEcoRide ?? COMMISSION_FIXE), 0);

  // Total affiché
  const totalCreditsNode = document.getElementById("totalCredits");
  if (totalCreditsNode) totalCreditsNode.textContent = totalCreditsDepuisLancement;

  // Graph 1: Covoiturages
  const ctx1 = document.getElementById("covoituragesChart");
  if (ctx1) {
    if (covoituragesChartInstance) covoituragesChartInstance.destroy();
    covoituragesChartInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: "Covoiturages (trajets payés)",
          data: covoituragesData,
          backgroundColor: "#4B8A47"
        }]
      },
      options: { responsive: true }
    });
  }

  // Graph 2: Crédits EcoRide (commission)
  const ctx2 = document.getElementById("creditsChart");
  if (ctx2) {
    if (creditsChartInstance) creditsChartInstance.destroy();
    creditsChartInstance = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: "Crédits EcoRide (commission)",
          data: creditsEcoRideData,
          backgroundColor: "#CACFAA"
        }]
      },
      options: { responsive: true }
    });
  }
}

// Fonction utilitaire pour ajouter un trajet payé (à appeler quand un paiement est confirmé)
function ajouterTrajetPaye({ dateISO, prixChauffeurCredits }) {
  const newId = trajets.length ? Math.max(...trajets.map(t=>t.id)) + 1 : 1;
  const t = {
    id: newId,
    datePaiement: dateISO || new Date().toISOString().slice(0,10),
    prixChauffeurCredits: Number(prixChauffeurCredits),
    commissionEcoRide: COMMISSION_FIXE, // règle actuelle: 2 crédits par trajet
    statutPaiement: "payé"
  };
  trajets.push(t);
  saveTrajets(trajets);
  updateDashboard();
}

// Premier rendu du dashboard
updateDashboard();

/* Exemple d’usage:
ajouterTrajetPaye({ dateISO: '2025-10-13', prixChauffeurCredits: 20 });
*/



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
