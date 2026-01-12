// assets/js/type-utils.js

export function normalizeTypeKey(raw) {
  if (!raw || raw === '' || raw === 'tous' || raw === 'all') return '';
  
  // ✅ Normaliser : minuscules + retirer accents
  const s = String(raw)
    .toLowerCase()
    .trim()
    .normalize('NFD')                    // décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, '');    // retire les accents
  
  if (s.includes('elec') || s === 'electric') return 'electrique';
  if (s.includes('hybr')) return 'hybride';
  if (s.includes('therm') || s.includes('essence') || s.includes('diesel')) return 'thermique';
  
  return ''; // ← au lieu de 'non-specifie'
}
  
export function labelFromTypeKey(key) {
const labels = {
    'electrique': 'Électrique',
    'thermique': 'Thermique',
    'hybride': 'Hybride',
    'non-specifie': 'Non spécifié'
};
return labels[key] || 'Non spécifié';
}

export function slugifyForClass(s) {
if (!s) return 'non-specifie';
return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Met à jour capacity et places d'un trajet en se basant sur trajet.vehicle.places
 * Modifie l'objet trajet en place.
 */
export function updatePlacesFromVehicle(trajet) {
    if (!trajet) return;
    const vehiclePlaces = trajet.vehicle?.places ?? trajet.vehicule?.places ?? null;
    if (vehiclePlaces !== null && vehiclePlaces !== undefined && !Number.isNaN(Number(vehiclePlaces))) {
        trajet.capacity = Number(vehiclePlaces);
        const totalOccupied = (Array.isArray(trajet.passagers) ? trajet.passagers : [])
        .reduce((sum, p) => sum + (Number(p.places) || 1), 0);
        trajet.places = Math.max(0, trajet.capacity - totalOccupied);
    }
}

/**
 * Met à jour l'affichage des préférences dans le DOM.
 * - trajet : objet trajet
 * - options.ids : tableau d'IDs DOM pour les cases (défaut 4)
 * - options.basePreferencesFallback : tableau fallback si trajet.preferences absent
 */
export function renderPreferences(trajet, options = {}) {
    const ids = options.ids || ['detail-pref1', 'detail-pref2', 'detail-pref3', 'detail-pref4'];
  
    // Récupérer les préférences de base (tableau ou fallback)
    const basePreferences = Array.isArray(trajet.preferences) && trajet.preferences.length
      ? trajet.preferences
      : (options.basePreferencesFallback || ['Non-fumeur', 'Animaux acceptés', 'Musique']);
  
    // Récupérer la préférence "other" du véhicule
    const vehicleOther = String(trajet.car?.other ?? trajet.vehicle?.other ?? '').trim();
  
    // Récupérer les autres préférences textuelles (ex: driverPreferences)
    const autresPrefsRaw = trajet.autres_preferences_chauffeur
      ?? trajet.autresPreferencesChauffeur
      ?? trajet.otherPreferences
      ?? trajet.driverPreferences
      ?? trajet.car?.driverPreferences
      ?? [];
  
    // Transformer en tableau propre
    let autresPrefs = [];
    if (Array.isArray(autresPrefsRaw)) {
      autresPrefs = autresPrefsRaw.map(p => String(p).trim()).filter(Boolean);
    } else if (typeof autresPrefsRaw === 'string' && autresPrefsRaw.trim()) {
      autresPrefs = [autresPrefsRaw.trim()];
    }
  
    // Construire la liste complète en évitant les doublons
    const allPreferences = [...basePreferences];
  
    if (vehicleOther && !allPreferences.includes(vehicleOther)) {
      allPreferences.push(vehicleOther);
    }
  
    for (const pref of autresPrefs) {
      if (!allPreferences.includes(pref)) {
        allPreferences.push(pref);
      }
    }
  
    // Afficher dans les éléments DOM
    ids.forEach((id, index) => {
      const el = document.getElementById(id);
      if (!el) return;
      const text = allPreferences[index] || '';
      el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    });
}

/**
 * Détermine le type véhicule (clé normalisée + label) à partir du trajet et applique au DOM si element fourni.
 * Retourne { key, label }.
 * Si element est fourni, applique classe 'type-xxx' et texte (ou masque si non-specifie).
 */
export function applyVehicleTypeToElement(trajet, element = null) {
    const rawCandidates = [
        trajet.type,
        trajet.fuelType,
        trajet.vehicle?.fuelType,
        trajet.vehicle?.type,
        trajet.car?.fuelType,
        trajet.car?.type,
        trajet.vehicule?.type,
        trajet.vehicule?.fuelType
    ];
    const raw = rawCandidates.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const key = normalizeTypeKey(raw);
    const label = labelFromTypeKey(key);

    if (element) {
        // nettoyer anciennes classes
        Array.from(element.classList || []).forEach(c => {
        if (c.startsWith('badge-') || c.startsWith('type-')) element.classList.remove(c);
        });
        // ne pas ajouter la classe Bootstrap .badge (évite texte blanc) :
        // si tu veux un style "pill", crée une classe .type-badge dans ton CSS et utilise-la
        // if (!element.classList.contains('type-badge')) element.classList.add('type-badge');
        element.classList.add('type-' + slugifyForClass(key));
        if (key === 'non-specifie') {
        element.textContent = '';
        element.style.display = 'none';
        } else {
        element.textContent = label;
        element.style.display = '';
        }
    }

return { key, label };
}