// Helpers pour afficher / cacher et initialiser
function showLogin() {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginTab) loginTab.classList.add('active');
  if (registerTab) registerTab.classList.remove('active');

  if (loginForm) {
    loginForm.style.display = 'block';
    if (typeof setupAuthValidationForLogin === 'function') {
      setupAuthValidationForLogin(loginForm);
    }
  }
  if (registerForm) registerForm.style.display = 'none';
}

function showRegister() {
  return new Promise((resolve) => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (registerTab) registerTab.classList.add('active');
    if (loginTab) loginTab.classList.remove('active');

    if (registerForm) {
      registerForm.style.display = 'block';
      // forcer reflow pour s'assurer que le style est appliqué
      void registerForm.offsetWidth;
    }
    if (loginForm) loginForm.style.display = 'none';

    // donne le temps au navigateur d'appliquer les styles, puis resolve
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

// Initialise au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('auth.js chargé correctement (unified init)');

  // initialisation si présents
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');

  if (loginForm && typeof setupAuthValidationForLogin === 'function') {
    setupAuthValidationForLogin(loginForm);
  }
  if (registerForm && typeof setupAuthValidationForRegister === 'function') {
    // on initialise aussi le register si présent (safe)
    setupAuthValidationForRegister(registerForm);
  }

  // Attacher les clics des onglets (si présents)
  if (loginTab) {
    loginTab.addEventListener('click', (e) => {
      e.preventDefault();
      showLogin();
    });
  }
  if (registerTab) {
    registerTab.addEventListener('click', (e) => {
      e.preventDefault();
      showRegister();
    });
  }

  // Scroll doux centré sur le lien "Inscrivez-vous"
  const linkInscrivezVous = document.getElementById('switch-to-register');
  if (linkInscrivezVous) {
    linkInscrivezVous.addEventListener('click', async (e) => {
      e.preventDefault();

      // Affiche l'onglet inscription et attendre que showRegister ait fini
      if (typeof showRegister === 'function') {
        await showRegister();
      }

      // Récupération et forçage de reflow
      const registerForm = document.getElementById('register-form');
      if (!registerForm) return;
      void registerForm.offsetWidth;

      // Petit délai pour s'assurer que le layout est stable
      await new Promise(r => setTimeout(r, 80));

      // Calculer la position cible et scroller (instant puis smooth)
      const rect = registerForm.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetPosition = rect.top + scrollTop - 100; // ajuste l'offset si besoin

      // Tentative instant pour forcer la position (utile si smooth est écrasé)
      try { document.documentElement.scrollTo(0, targetPosition); } catch (err) { window.scrollTo(0, targetPosition); }

      // Puis smooth (fallback si supporté)
      setTimeout(() => {
        try { window.scrollTo({ top: targetPosition, behavior: 'smooth' }); }
        catch (e) { /* ignore */ }
      }, 20);

      // Focus sur le premier champ pour attirer l'attention
      registerForm.querySelector('input')?.focus();
    });
  }

});

// routeLoaded : seulement basculer sur l'onglet demandé (ne retourne pas si éléments manquants)
document.addEventListener('routeLoaded', async (event) => {
  try {
    const tab = event?.detail?.queryParams?.get('tab');
    if (tab === 'register') {
      if (typeof showRegister === 'function') await showRegister();

      const registerForm = document.getElementById('register-form');
      if (!registerForm) return;
      void registerForm.offsetWidth;
      await new Promise(r => setTimeout(r, 80));
      const rect = registerForm.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetPosition = rect.top + scrollTop - 100;
      try { document.documentElement.scrollTo(0, targetPosition); } catch (err) { window.scrollTo(0, targetPosition); }
      setTimeout(() => {
        try { window.scrollTo({ top: targetPosition, behavior: 'smooth' }); } catch (e) {}
      }, 20);
      registerForm.querySelector('input')?.focus();
    } else {
      showLogin && showLogin();
    }
  } catch (err) {
    console.warn('routeLoaded handler :', err);
  }
});

// délégation pour onglets (robuste si les éléments sont injectés plus tard)
document.addEventListener('click', (e) => {
  const tab = e.target.closest && e.target.closest('#login-tab, #register-tab');
  if (!tab) return;
  e.preventDefault();
  if (tab.id === 'register-tab') {
    console.log('Clic detecté: register-tab');
    showRegister();
  } else if (tab.id === 'login-tab') {
    console.log('Clic detecté: login-tab');
    showLogin();
  }
});

// Validation du formulaire d'inscription//
// Validation du formulaire d'inscription//
// Validation du formulaire d'inscription//

function setupAuthValidationForRegister(formElement) {
  if (!formElement || formElement.dataset.validationInitialized === "true") return;
  formElement.dataset.validationInitialized = "true";

  const inputs = {
    inputNom: formElement.querySelector('input[name="Nom"]'),
    inputPrenom: formElement.querySelector('input[name="Prenom"]'),
    inputEmail: formElement.querySelector('input[name="email"]'),
    inputPassword: formElement.querySelector('input[name="password"]'),
    inputValidatePassword: formElement.querySelector('input[name="confirm-password"]')
  };

  for (const key in inputs) {
    if (!inputs[key]) {
      console.error(`Input manquant: ${key}`);
      return;
    }
  }

  for (const key in inputs) {
    inputs[key].touched = false;
    inputs[key].addEventListener('input', () => {
      inputs[key].touched = true;
      validateForm();
    });
    inputs[key].addEventListener('blur', () => {
      inputs[key].touched = true;
      validateForm();
    });
  }

  function setValid(input) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
  }
  function setInvalid(input) {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
  }
  function clearValidation(input) {
    input.classList.remove('is-valid', 'is-invalid');
  }

  function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Nouvelle fonction pour valider Nom et Prénom avec regex
  function validateName(input) {
    if (!input.touched) {
      clearValidation(input);
      return false;
    }
    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;
    if (nameRegex.test(input.value.trim())) {
      setValid(input);
      return true;
    } else {
      setInvalid(input);
      return false;
    }
  }

  function validateEmail(input) {
    if (!input.touched) {
      clearValidation(input);
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(input.value.trim())) {
      setValid(input);
      return true;
    } else {
      setInvalid(input);
      return false;
    }
  }

  function validatePassword(input) {
    if (!input.touched) {
      clearValidation(input);
      return false;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
    if (passwordRegex.test(input.value.trim())) {
      setValid(input);
      return true;
    } else {
      setInvalid(input);
      return false;
    }
  }

  function validateConfirmPassword(input, passwordInput) {
    if (!input.touched) {
      clearValidation(input);
      return false;
    }
    if (input.value === passwordInput.value && input.value.trim() !== '') {
      setValid(input);
      return true;
    } else {
      setInvalid(input);
      return false;
    }
  }

  inputs.inputNom.addEventListener('blur', () => {
    inputs.inputNom.value = capitalizeFirstLetter(inputs.inputNom.value);
    inputs.inputNom.touched = true;
    validateForm();
  });

  inputs.inputPrenom.addEventListener('blur', () => {
    inputs.inputPrenom.value = capitalizeFirstLetter(inputs.inputPrenom.value);
    inputs.inputPrenom.touched = true;
    validateForm();
  });

  function validateForm() {
    // Validation logique (sans tenir compte de touched) pour activer/désactiver le bouton
    const validNomLogic = inputs.inputNom.value.trim() !== '' && /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(inputs.inputNom.value.trim());
    const validPrenomLogic = inputs.inputPrenom.value.trim() !== '' && /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(inputs.inputPrenom.value.trim());
    const validEmailLogic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputs.inputEmail.value.trim());
    const validPasswordLogic = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/.test(inputs.inputPassword.value.trim());
    const validConfirmLogic = inputs.inputValidatePassword.value.trim() !== '' && inputs.inputValidatePassword.value === inputs.inputPassword.value;

    const allValidLogic = validNomLogic && validPrenomLogic && validEmailLogic && validPasswordLogic && validConfirmLogic;

    const registerButton = formElement.querySelector('.auth-button[type="submit"]') || formElement.querySelector('.auth-button');
    if (registerButton) registerButton.disabled = !allValidLogic;

    // Validation visuelle (avec touched) pour afficher les erreurs
    validateName(inputs.inputNom);
    validateName(inputs.inputPrenom);
    validateEmail(inputs.inputEmail);
    validatePassword(inputs.inputPassword);
    validateConfirmPassword(inputs.inputValidatePassword, inputs.inputPassword);
  }

  // Appel initial pour désactiver le bouton au chargement
  validateForm();
}

// Validation du formulaire de connexion//
// Validation du formulaire de connexion//
// Validation du formulaire de connexion//

function setupAuthValidationForLogin(formElement) {
  if (!formElement || formElement.dataset.loginValidationInitialized === "true") return;
  formElement.dataset.loginValidationInitialized = "true";

  const inputEmail = formElement.querySelector('#EmailInput');
  const inputPassword = formElement.querySelector('#PasswordInput');
  const submitBtn = formElement.querySelector('#btn-validation-connexion');
  const globalFeedback = document.getElementById('login-global-feedback');

  if (!inputEmail || !inputPassword || !submitBtn) {
    console.error('Login inputs manquants');
    return;
  }

  // Optionnel : s'assurer des classes bootstrap pour is-valid / is-invalid
  [inputEmail, inputPassword].forEach(i => i.classList.add('form-control'));

  inputEmail.touched = inputEmail.touched || false;
  inputPassword.touched = inputPassword.touched || false;

  function setValid(el){ el.classList.remove('is-invalid'); el.classList.add('is-valid'); }
  function setInvalid(el){ el.classList.remove('is-valid'); el.classList.add('is-invalid'); }
  function clearValidation(el){ el.classList.remove('is-valid','is-invalid'); }

  function validateEmail(el){
    if (!el.touched) { clearValidation(el); return false; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
    ok ? setValid(el) : setInvalid(el);
    return ok;
  }
  function validatePassword(el){
    if (!el.touched) { clearValidation(el); return false; }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
    const ok = passwordRegex.test(el.value.trim());
    ok ? setValid(el) : setInvalid(el);
    return ok;
  }
  function validateFormLogic(){
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail.value.trim());
    const passOk = inputPassword.value.trim().length > 0;
    submitBtn.disabled = !(emailOk && passOk);
    return emailOk && passOk;
  }
  function validateVisual(){ validateEmail(inputEmail); validatePassword(inputPassword); }

  const onInput = (el) => {
    el.touched = true;
    validateFormLogic();
    validateVisual();
  };

  inputEmail.addEventListener('input', () => onInput(inputEmail));
  inputEmail.addEventListener('blur', () => { inputEmail.touched = true; validateVisual(); });
  inputPassword.addEventListener('input', () => onInput(inputPassword));
  inputPassword.addEventListener('blur', () => { inputPassword.touched = true; validateVisual(); });

  // Empêcher la soumission si invalide (et laisser possibilité d'handle AJAX)
  formElement.addEventListener('submit', (e) => {
    if (!validateFormLogic()) {
      e.preventDefault();
      inputEmail.touched = inputPassword.touched = true;
      validateVisual();
      inputEmail.focus();
      return;
    }
    // Sinon laisser la soumission native se faire (ou intercepter pour AJAX)
  });

  // Autofill detection
  setTimeout(() => {
    if (inputEmail.value && inputEmail.value.trim() !== '') inputEmail.touched = true;
    if (inputPassword.value && inputPassword.value.trim() !== '') inputPassword.touched = true;
    validateFormLogic();
    validateVisual();
  }, 150);
}




