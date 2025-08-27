document.addEventListener('DOMContentLoaded', () => {
  // Fonction d'attachement à un input
  const attachCleaner = (input) => {
    if (!input || input.dataset.cleanListenerAttached === '1') return;
    input.dataset.cleanListenerAttached = '1';

    // nettoyage : supprime tous les espaces si la valeur ne contient pas de caractère non-blanc
    const cleanIfOnlySpaces = () => {
      try {
        if (input.value == null) return;
        if (input.value.trim() === '') {
          if (input.value !== '') {
            input.value = '';
            // déclenche un event 'input' pour que tout framework réagisse aussi
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      } catch (e) {
        console.error('Cleaner error:', e);
      }
    };

    input.addEventListener('input', cleanIfOnlySpaces, { passive: true });
    input.addEventListener('blur', cleanIfOnlySpaces);
    input.addEventListener('change', cleanIfOnlySpaces);

    // nettoyage initial si la valeur initiale contient seulement des espaces
    cleanIfOnlySpaces();

    // si l'input est dans un form, on s'assure que la valeur est propre au submit
    const form = input.form;
    if (form && !form.dataset.cleanOnSubmit) {
      form.addEventListener('submit', () => {
        if (input.value.trim() === '') input.value = '';
        else input.value = input.value.trim();
      });
      form.dataset.cleanOnSubmit = '1';
    }
  };

  // attache aux inputs existants
  document.querySelectorAll('.search-input').forEach(attachCleaner);

  // observer pour attacher automatiquement si des inputs sont ajoutés dynamiquement
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (!m.addedNodes) continue;
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('.search-input')) attachCleaner(node);
        if (node.querySelectorAll) node.querySelectorAll('.search-input').forEach(attachCleaner);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // debug helper (optionnel)
  window.__searchInputCleaner = { attach: attachCleaner };
});