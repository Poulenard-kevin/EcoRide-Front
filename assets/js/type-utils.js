// assets/js/type-utils.js
export function normalizeTypeKey(raw) {
    if (!raw) return 'non-specifie';
    const normalized = String(raw)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  
    if (normalized === 'electrique') return 'electrique';
    if (normalized === 'thermique') return 'thermique';
    if (normalized === 'hybride') return 'hybride';
    return 'non-specifie';
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