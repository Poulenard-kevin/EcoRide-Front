// rating-utils.js

// Calcule la moyenne arrondie sur 5 étoiles à partir d'une liste d'avis
export function computeAverageRating(reviews) {
    if (!Array.isArray(reviews) || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return Math.round(sum / reviews.length);
  }
  
  // Met à jour tous les éléments affichant la note d'un utilisateur donné
  export function updateUserRatingUI(userId, averageRating) {
    if (!userId) return;
    const rounded = Math.min(Math.max(Math.round(averageRating), 0), 5);
  
    // 1) Met à jour le détail (ex: #detail-rating)
    const detailEl = document.getElementById('detail-rating');
    if (detailEl) {
      detailEl.textContent = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    }
  
    // 2) Met à jour toutes les étoiles dans la liste (ex: éléments avec data-user-id ou data-driver-id)
    const selectors = [
      `[data-user-id="${userId}"] .rating`,
      `[data-driver-id="${userId}"] .rating`,
      `.rating[data-user-id="${userId}"]`,
      `.rating[data-driver-id="${userId}"]`
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.textContent = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
      });
    });
  
    // 3) Émettre un event global pour que d'autres modules puissent réagir
    window.dispatchEvent(new CustomEvent('ecoride:ratingUpdated', { detail: { userId, averageRating } }));
  }