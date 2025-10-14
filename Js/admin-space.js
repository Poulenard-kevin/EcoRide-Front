console.log('admin-space.js chargé');

// ==========================
// Dashboard dynamique relié aux trajets payés (dates JJ-MM-AAAA)
// ==========================

const LS_KEY_TRAJETS = 'ecoride_trajets';
const COMMISSION_FIXE = 2; // 2 crédits commission par trajet payé

// Helpers dates
function toFRDash(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`; // JJ-MM-AAAA
}
window.toFRDash = toFRDash; // utile pour tester en console

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
    return toFRDash(dt); // JJ-MM-AAAA
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

// Migration/normalisation des trajets (champ datePaiement en JJ-MM-AAAA, etc.)
function migrateAndNormalizeTrajets() {
  let changed = false;
  trajets = (Array.isArray(trajets) ? trajets : []).map((t, idx) => {
    const clone = { ...t };

    // Id manquant
    if (clone.id == null) { clone.id = idx + 1; changed = true; }

    // Statut par défaut
    if (!clone.statutPaiement) { clone.statutPaiement = 'payé'; changed = true; }

    // Normaliser la date
    let v = clone.datePaiement;
    if (!v && clone.date) v = clone.date; // fallback ancien champ
    v = v ? String(v) : '';

    if (!v) {
      v = toFRDash(new Date());
      changed = true;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-');
      v = `${d}-${m}-${y}`;
      changed = true;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      const [d, m, y] = v.split('/');
      v = `${d}-${m}-${y}`;
      changed = true;
    }
    clone.datePaiement = v;

    // Commission par défaut
    if (clone.commissionEcoRide == null) {
      clone.commissionEcoRide = COMMISSION_FIXE;
      changed = true;
    }

    return clone;
  });

  if (changed) {
    console.log('[migrate] trajets normalisés et sauvegardés');
    saveTrajets(trajets);
  }
}

// Génère les 7 derniers jours: labels (Lun, Mar, …) et clés JJ-MM-AAAA
function lastNDays(n = 7) {
  const labels = [];
  const keys = [];
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(fmt.format(d));    // ex: lun., mar.
    keys.push(toFRDash(d));        // JJ-MM-AAAA
  }
  return { labels, keys };
}

// Agrège le nombre de trajets payés et les commissions par jour (JJ-MM-AAAA)
function aggregateByDay(trajetsList, dayKeys) {
  const setKeys = new Set(dayKeys);
  const counts = Object.fromEntries(dayKeys.map(k => [k, 0]));
  const commissions = Object.fromEntries(dayKeys.map(k => [k, 0]));

  trajetsList.forEach(t => {
    if (!t || t.statutPaiement !== 'payé') return;
    const d = String(t.datePaiement || '');
    if (!setKeys.has(d)) return;
    counts[d] += 1;
    commissions[d] += Number(t.commissionEcoRide ?? COMMISSION_FIXE);
  });
  return { counts, commissions };
}

// Instances Chart.js globales
let covoituragesChartInstance = null;
let creditsChartInstance = null;

// Met à jour les graphiques et le total
function updateAdminDashboard() {
  console.log('[upd] start');

  if (typeof Chart !== 'function') {
    console.error('[upd] Chart.js non chargé');
    return;
  }

  const ctx1 = document.getElementById('covoituragesChart');
  const ctx2 = document.getElementById('creditsChart');
  console.log('[upd] canvas1?', !!ctx1, 'canvas2?', !!ctx2);
  if (!ctx1 || !ctx2) {
    console.error('[upd] Canvas introuvable (IDs)');
    return;
  }

  const { labels, keys } = lastNDays(7);
  console.log('[upd] keys', keys);
  console.log('[upd] trajets', trajets.map(t => t.datePaiement));
  const { counts, commissions } = aggregateByDay(trajets, keys);
  console.log('[upd] counts', counts, 'commissions', commissions);

  const covoituragesData   = keys.map(k => counts[k]);
  const creditsEcoRideData = keys.map(k => commissions[k]);

  const totalCreditsDepuisLancement = trajets
    .filter(t => t.statutPaiement === 'payé')
    .reduce((sum, t) => sum + Number(t.commissionEcoRide ?? COMMISSION_FIXE), 0);
  const totalCreditsNode = document.getElementById('totalCredits');
  if (totalCreditsNode) totalCreditsNode.textContent = totalCreditsDepuisLancement;

  if (covoituragesChartInstance) covoituragesChartInstance.destroy();
  if (creditsChartInstance) creditsChartInstance.destroy();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  covoituragesChartInstance = new Chart(ctx1, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Covoiturages (trajets payés)', data: covoituragesData, backgroundColor: '#4B8A47' }] },
    options: commonOptions
  });

  creditsChartInstance = new Chart(ctx2, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Crédits EcoRide (commission)', data: creditsEcoRideData, backgroundColor: '#CACFAA' }] },
    options: commonOptions
  });

  console.log('[upd] charts rendus');
}
window.updateAdminDashboard = updateAdminDashboard;

// Fonction utilitaire pour ajouter un trajet payé (date JJ-MM-AAAA)
function ajouterTrajetPaye({ dateFR, prixChauffeurCredits }) {
  const newId = trajets.length ? Math.max(...trajets.map(t => t.id)) + 1 : 1;
  const t = {
    id: newId,
    datePaiement: dateFR || toFRDash(new Date()), // JJ-MM-AAAA
    prixChauffeurCredits: Number(prixChauffeurCredits),
    commissionEcoRide: COMMISSION_FIXE,
    statutPaiement: "payé"
  };
  trajets.push(t);
  saveTrajets(trajets);
  updateAdminDashboard();
}
window.ajouterTrajetPaye = ajouterTrajetPaye;

// Premier rendu du dashboard après que le DOM soit prêt
document.addEventListener('DOMContentLoaded', () => {
  console.log('[boot] DOM prêt, migration éventuelle + updateAdminDashboard');

  // Normaliser les données avant d'agréger
  migrateAndNormalizeTrajets();

  console.log('[boot] Appel updateAdminDashboard()');
  updateAdminDashboard();
});

// Support SPA: si la vue admin est injectée après l’exécution du script
(function ensureAdminChartsRendered() {
  const hasCanvases = () =>
    document.getElementById('covoituragesChart') &&
    document.getElementById('creditsChart');

  // 1) Si déjà là (cas où la vue est montée avant le script)
  if (hasCanvases()) {
    console.log('[spa] Vue admin déjà présente, rendu immédiat');
    try { updateAdminDashboard(); } catch (e) { console.error(e); }
    return;
  }

  // 2) Sinon, observe les mutations du DOM jusqu’à ce que les canvases apparaissent
  const obs = new MutationObserver(() => {
    if (hasCanvases()) {
      console.log('[spa] Canvases détectés via MutationObserver, rendu');
      try { updateAdminDashboard(); } catch (e) { console.error(e); }
      obs.disconnect();
    }
  });

  obs.observe(document.body, { childList: true, subtree: true });

  // 3) Fallback: retentatives temporisées (au cas où l’observer serait bloqué)
  let attempts = 0;
  const maxAttempts = 10;
  const tick = setInterval(() => {
    if (hasCanvases()) {
      console.log('[spa] Canvases détectés via retry, rendu');
      try { updateAdminDashboard(); } catch (e) { console.error(e); }
      clearInterval(tick);
    } else if (++attempts >= maxAttempts) {
      console.warn('[spa] Canvases introuvables après retentatives');
      clearInterval(tick);
    }
  }, 200);
})();

// ==========================
// Utils persistance locale (comptes)
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
// Initial render comptes
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
  const nameRegex  = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s'-]{2,}$/;
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