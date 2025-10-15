console.log('admin-space.js chargé');

// Enregistrer le plugin DataLabels globalement dès que Chart est dispo
if (typeof Chart !== 'undefined' && Chart?.register && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

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

// Détecte si c'est un objet "course" (réservation) plutôt qu'un "trajet payé"
function looksLikeCourse(o) {
  return o && (o.depart || o.arrivee || o.heureDepart || o.heureArrivee || o.role || o.status);
}

// Normalise n'importe quelle date (ISO, JJ/MM/AAAA, Date) vers JJ-MM-AAAA
function normalizeToFRDash(anyDate) {
  if (!anyDate) return null;
  if (anyDate instanceof Date) {
    const dd = String(anyDate.getDate()).padStart(2,'0');
    const mm = String(anyDate.getMonth()+1).padStart(2,'0');
    const yyyy = anyDate.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }
  const s = String(anyDate).trim();

  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;                 // JJ-MM-AAAA
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,d]=s.split('-'); return `${d}-${m}-${y}`; } // ISO date-only
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y]=s.split('/'); return `${d}-${m}-${y}`; } // JJ/MM/AAAA

  // Parser robuste en LOCAL, pas en UTC
  const d = new Date(s);
  if (!isNaN(d)) {
    // neutraliser l’heure: setHours(0,0,0,0) au fuseau local
    d.setHours(0,0,0,0);
    return normalizeToFRDash(d);
  }
  return null;
}

// Vrai si l’objet représente un trajet CONDUCTEUR payé (et non une réservation/passager)
function isPaidDriverTrip(t) {
  const statutRaw = (t?.statutPaiement ?? t?.status ?? '').toString().trim().toLowerCase();
  const paid = ['payé','paye','payee','validé','valide','validee','terminé','termine','done','completed','confirme','confirmé','confirmée']
    .some(s => statutRaw.includes(s));

  const role = (t?.role ?? t?.type ?? '').toString().toLowerCase();

  // ICI: on ajoute 'chauffeur' aux rôles reconnus comme conducteur
  const isDriver = t?.isDriverRide === true
    || role.includes('conducteur')
    || role.includes('driver')
    || role.includes('chauffeur');

  return paid && isDriver;
}

// Map "course" -> "trajet payé" comptable par le dashboard
function mapCourseToPaidTrip(course) {
  const dateFR = normalizeToFRDash(course.date) || normalizeToFRDash(new Date());
  const prixChauffeurCredits = Number(course.prix ?? 0);
  return {
    id: course.id || course.detailId || crypto.randomUUID?.() || Date.now(),
    datePaiement: dateFR,
    prixChauffeurCredits,
    commissionEcoRide: COMMISSION_FIXE,
    statutPaiement: 'payé'
  };
}

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
  window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
  return seed;
}

function saveTrajets(list) {
  localStorage.setItem(LS_KEY_TRAJETS, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('ecoride:trajet-updated'));
}

// Source de vérité des trajets
let trajets = loadTrajets();

// Migration/normalisation des trajets (champ datePaiement en JJ-MM-AAAA, etc.)
function migrateAndNormalizeTrajets() {
  let changed = false;

  trajets = (Array.isArray(trajets) ? trajets : []).flatMap((t, idx) => {
    // Si c'est une "course" (réservation passager), on l'ignore pour ce dashboard
  if (looksLikeCourse(t)) {
    return []; // ne pas l’inclure dans la source des covoiturages
  }

    // Sinon, on normalise un "trajet payé"
    const clone = { ...t };

    if (clone.id == null) { clone.id = idx + 1; changed = true; }

    // Trouver une date candidate
    let rawDate = clone.datePaiement ?? clone.date ?? clone.dateReservation ?? clone.dateTrajet ?? null;
    let fr = normalizeToFRDash(rawDate) || normalizeToFRDash(new Date());
    if (fr !== clone.datePaiement) changed = true;
    clone.datePaiement = fr;

    // Nombres
    if (clone.prixChauffeurCredits == null && clone.prix != null) {
      clone.prixChauffeurCredits = Number(clone.prix); changed = true;
    }
    clone.prixChauffeurCredits = Number(clone.prixChauffeurCredits ?? 0);
    clone.commissionEcoRide = Number(clone.commissionEcoRide ?? COMMISSION_FIXE);

    // Statut
    if (!clone.statutPaiement) { clone.statutPaiement = 'payé'; changed = true; }

    return [clone];
  });

  if (changed) {
    console.log('[migrate] trajets convertis/normalisés → save');
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

// Agrège le nombre de trajets conducteurs payés et les commissions par jour (JJ-MM-AAAA)
function aggregateByDay(trajetsList, dayKeys) {
  const setKeys = new Set(dayKeys);
  const counts = Object.fromEntries(dayKeys.map(k => [k, 0]));
  const commissions = Object.fromEntries(dayKeys.map(k => [k, 0]));

  console.log('[agg] init keys', dayKeys);
  console.log('[agg] init counts keys', Object.keys(counts));

  trajetsList.forEach(t => {
    if (!t) return;

    // Calculer la date normalisée d'abord
    const d = normalizeToFRDash(t.datePaiement ?? t.date ?? t.dateReservation ?? t.dateTrajet);

    // Log utile
    const inRange = d ? setKeys.has(d) : false;
    console.log('[agg] test', { d, statutRaw: (t?.statutPaiement ?? t?.status ?? ''), okDriverPaid: isPaidDriverTrip(t), inRange });

    // Filtrer: uniquement trajets CONDUCTEUR payés, avec date dans la fenêtre
    if (!isPaidDriverTrip(t)) return;
    if (!d || !inRange) return;

    counts[d] += 1;
    commissions[d] += Number(t.commissionEcoRide ?? COMMISSION_FIXE ?? 0);
  });

  const missingInRange = trajetsList
    .map(t => normalizeToFRDash(t?.datePaiement ?? t?.date ?? t?.dateReservation ?? t?.dateTrajet))
    .filter(d => d && !setKeys.has(d));
  console.log('[agg] dates hors fenêtre 7j', missingInRange);

  return { counts, commissions };
}

function lastNDaysAround(maxDateStr, n=7) {
  const [dd,mm,yyyy] = maxDateStr.split('-').map(Number);
  const base = new Date(yyyy, mm-1, dd);
  const labels = [], keys = [];
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  for (let i=n-1;i>=0;i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    labels.push(fmt.format(d));
    keys.push(toFRDash(d));
  }
  return { labels, keys };
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
  const allDates = trajets.map(t => normalizeToFRDash(t.datePaiement)).filter(Boolean);
  const maxDate = allDates.length ? allDates.sort((a,b)=>{
    const [da,ma,ya]=a.split('-').map(Number);
    const [db,mb,yb]=b.split('-').map(Number);
    return new Date(ya,ma-1,da) - new Date(yb,mb-1,db);
  }).at(-1) : toFRDash(new Date());

  const { labels, keys } = lastNDaysAround(maxDate, 7);

  console.log('[upd] keys', keys);
  console.log('[upd] trajets', trajets.map(t => t.datePaiement));
  console.log('[upd] trajets raw', trajets);

  const { counts, commissions } = aggregateByDay(trajets, keys);
  console.log('[upd] counts', counts, 'commissions', commissions);

  const covoituragesData   = keys.map(k => counts[k]);
  const creditsEcoRideData = keys.map(k => commissions[k]);

  

  // Totaux COVOITURAGES
  const totalCovoits7J = keys.reduce((sum, k) => sum + Number(counts[k] ?? 0), 0);

  const totalCovoitsAll = trajets.reduce((sum, t) => {
    if (!isPaidDriverTrip(t)) return sum;
    return sum + 1;
  }, 0);

  // Totaux
  const totalCredits7J = keys.reduce((sum, k) => sum + Number(commissions[k] ?? 0), 0);
  const totalCreditsAll = trajets.reduce((sum, t) => {
    if (!isPaidDriverTrip(t)) return sum;
    return sum + Number(t.commissionEcoRide ?? COMMISSION_FIXE ?? 0);
  }, 0);

  // Injection DOM
  const total7Node = document.getElementById('totalCredits7J');
  if (total7Node) total7Node.textContent = totalCredits7J;
  const totalAllNode = document.getElementById('totalCreditsAll');
  if (totalAllNode) totalAllNode.textContent = totalCreditsAll;

  // Injection DOM (covoiturages)
  const cov7El = document.getElementById('totalCovoits7J');
  if (cov7El) cov7El.textContent = String(totalCovoits7J);

  const covAllEl = document.getElementById('totalCovoitsAll');
  if (covAllEl) covAllEl.textContent = String(totalCovoitsAll);
  
  // Détruire les instances existantes
  if (covoituragesChartInstance) covoituragesChartInstance.destroy();
  if (creditsChartInstance) creditsChartInstance.destroy();

  
  const isNarrow = window.matchMedia('(max-width: 420px)').matches;

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 22, right: 6, bottom: 6, left: 6 } },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { font: { size: isNarrow ? 11 : 12 }, padding: isNarrow ? 8 : 12, boxWidth: 10, boxHeight: 10 }
    },
    datalabels: {
      anchor: 'end',
      align: 'top',
      offset: isNarrow ? 4 : 6,
      font: { size: isNarrow ? 10 : 11 },
      formatter: v => (v > 0 ? Math.round(v) : ''),
      clamp: true
    }
  },
  // Réduit la largeur des barres pour caser 7 labels
  datasets: {
    bar: {
      categoryPercentage: isNarrow ? 0.8 : 0.9, // largeur de la catégorie
      barPercentage:      isNarrow ? 0.6 : 0.7  // largeur de la barre dans la catégorie
    }
  },
  scales: {
    x: {
      ticks: {
        autoSkip: false,            // IMPORTANT: n’auto-skippe plus
        maxRotation: 0,
        minRotation: 0,
        font: { size: isNarrow ? 10 : 12 },
        padding: 0                 // compacter l’espace des labels
      },
      grid: { drawBorder: false, display: false }
    },
    y: {
      beginAtZero: true,
      ticks: { precision: 0, font: { size: isNarrow ? 10 : 12 } },
      grid: { drawBorder: false }
    }
  }
};

  // Graphique covoiturages
  covoituragesChartInstance = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Covoiturages (trajets payés)', data: covoituragesData, backgroundColor: '#4B8A47' }
      ]
    },
    options: commonOptions
  });

  // Graphique crédits
  creditsChartInstance = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Crédits EcoRide (commission)', data: creditsEcoRideData, backgroundColor: '#CACFAA' }
      ]
    },
    options: commonOptions
  });

  console.log('[upd] charts rendus');
}
window.updateAdminDashboard = updateAdminDashboard;

// Fonction utilitaire pour ajouter un trajet payé (date JJ-MM-AAAA)
function ajouterTrajetPaye({ dateFR, prixChauffeurCredits }) {
  const newId = trajets.length ? Math.max(...trajets.map(t => t.id)) + 1 : 1;
  const dateJJMMYYYY = normalizeToFRDash(dateFR) || toFRDash(new Date()); // normalisé sûr
  const t = {
    id: newId,
    isDriverRide: true,
    statutPaiement: 'payé',
    datePaiement: dateJJMMYYYY,
    prixChauffeurCredits: Number(prixChauffeurCredits ?? 0),
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

// Support SPA: si la vue admin est injectée après l'exécution du script
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

  // 2) Sinon, observe les mutations du DOM jusqu'à ce que les canvases apparaissent
  const obs = new MutationObserver(() => {
    if (hasCanvases()) {
      console.log('[spa] Canvases détectés via MutationObserver, rendu');
      try { updateAdminDashboard(); } catch (e) { console.error(e); }
      obs.disconnect();
    }
  });

  obs.observe(document.body, { childList: true, subtree: true });

  // 3) Fallback: retentatives temporisées (au cas où l'observer serait bloqué)
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

window.addEventListener('focus', () => {
  console.log('[focus] refresh dashboard');
  trajets = loadTrajets();
  migrateAndNormalizeTrajets();
  updateAdminDashboard();
});

window.addEventListener('ecoride:trajet-updated', () => {
  trajets = loadTrajets();
  migrateAndNormalizeTrajets();
  updateAdminDashboard();
});


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
  window.dispatchEvent(new CustomEvent('ecoride:users-updated'));
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