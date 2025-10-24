// Avatar preview + remove
const avatarInput = document.getElementById('profileAvatarInput');
const avatarPreview = document.getElementById('profileAvatarPreview');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');
const defaultAvatar = 'images/default-avatar.png';

avatarInput?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { // 2MB
    alert('Fichier trop volumineux (max 2 Mo).');
    avatarInput.value = '';
    return;
  }
  const url = URL.createObjectURL(f);
  avatarPreview.src = url;
});

removeAvatarBtn?.addEventListener('click', () => {
  avatarPreview.src = defaultAvatar;
  avatarInput.value = '';
  // si tu stockes l'avatar côté serveur/localStorage, gérer la suppression aussi
});

// Compteur bio
const bio = document.getElementById('profileBio');
const bioCount = document.getElementById('bioCount');
if (bio && bioCount) {
  const updateCount = () => bioCount.textContent = bio.value.length;
  bio.addEventListener('input', updateCount);
  updateCount();
}

// Sauvegarde compte (validation simple)
const saveAccountBtn = document.getElementById('saveAccountBtn');
saveAccountBtn?.addEventListener('click', () => {
  const email = document.getElementById('profileEmail')?.value?.trim();
  const current = document.getElementById('currentPassword')?.value;
  const newP = document.getElementById('newPassword')?.value;
  const confirmP = document.getElementById('confirmPassword')?.value;

  // validation email basique
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRe.test(email)) {
    alert('Adresse email invalide');
    return;
  }

  if ((newP || confirmP) && newP !== confirmP) {
    alert('Le nouveau mot de passe et la confirmation ne correspondent pas.');
    return;
  }

  // TODO: appel API / enregistrement localStorage
  console.log('Données prêtes à être envoyées', { email, newP });
  alert('Compte enregistré (simulation)');
});