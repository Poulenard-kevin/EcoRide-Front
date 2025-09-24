function initRememberMe() {
  const rememberCheckbox = document.querySelector('input[type="checkbox"][name="rememberMe"]');
  const emailInput = document.querySelector('input[name="email"], input#EmailInput');

  if (!rememberCheckbox) {
    console.log('Checkbox "Souviens-toi de moi" non trouvée');
    return;
  }
  if (!emailInput) {
    console.log('Input email non trouvé');
    return;
  }

  // Restaure l'état depuis localStorage
  const savedRemember = localStorage.getItem('rememberMe') === 'true';
  rememberCheckbox.checked = savedRemember;

  if (savedRemember) {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }

  rememberCheckbox.addEventListener('change', () => {
    localStorage.setItem('rememberMe', rememberCheckbox.checked);
    if (!rememberCheckbox.checked) {
      localStorage.removeItem('rememberedEmail');
    } else if (emailInput.value.trim() !== '') {
      localStorage.setItem('rememberedEmail', emailInput.value.trim());
    }
  });

  emailInput.addEventListener('input', () => {
    if (rememberCheckbox.checked) {
      localStorage.setItem('rememberedEmail', emailInput.value.trim());
    }
  });
}

function blurActiveIfNotBody() {
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) {
    try { active.blur(); } catch (e) { /* ignore */ }
  }
}

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

function showRegister(options = { focus: false }) {
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

      // Reset validation state (préventif)
      registerForm.querySelectorAll('input').forEach(i => {
        i.classList.remove('is-valid', 'is-invalid');
        try { i.touched = false; } catch (e) {}
      });
    }
    if (loginForm) loginForm.style.display = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // focus only if explicitly requested (and page has focus)
        if (options.focus && document.hasFocus()) {
          const firstInput = registerForm?.querySelector('input');
          // don't steal focus if something else already has it (eg search)
          const active = document.activeElement;
          const activeIsBody = !active || active === document.body || active === document.documentElement;
          if (firstInput && activeIsBody) {
            // slight delay to avoid racing with other programmatic events
            setTimeout(() => firstInput.focus(), 120);
          }
        }
        resolve();
      });
    });
  });
}

// Initialise au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready - gestion rememberMe active');
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

      if (typeof showRegister === 'function') {
        await showRegister();
      }

      const registerForm = document.getElementById('register-form');
      if (!registerForm) return;
      void registerForm.offsetWidth;

      await new Promise(r => setTimeout(r, 80));

      const rect = registerForm.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetPosition = rect.top + scrollTop - 100;

      try { document.documentElement.scrollTo(0, targetPosition); } catch (err) { window.scrollTo(0, targetPosition); }

        setTimeout(() => {
          registerForm.querySelector('input')?.focus();
        }, 120); // 80-200 ms fonctionne bien ; ajuste si nécessaire
    });
  }

  // Attacher le listener "Mot de passe oublié" pour la page chargée
  if (typeof attachForgotPasswordListener === 'function') {
    // cible le scope auth si présent, sinon global
    const authScope = document.getElementById('auth') || document;
    attachForgotPasswordListener(authScope);
  }

  // Gestion de la checkbox "Souviens-toi de moi"
  const rememberCheckbox = document.querySelector('input[type="checkbox"][name="rememberMe"]');
  const emailInput = document.querySelector('input[name="email"], input#EmailInput');

  if (rememberCheckbox) {
    // Restaure l'état depuis localStorage
    const savedRemember = localStorage.getItem('rememberMe') === 'true';
    rememberCheckbox.checked = savedRemember;

    // Pré-remplir email si checkbox cochée et email mémorisé
    if (savedRemember && emailInput) {
      const savedEmail = localStorage.getItem('rememberedEmail');
      if (savedEmail) {
        emailInput.value = savedEmail;
      }
    }

    // Sauvegarde l'état à chaque changement
    rememberCheckbox.addEventListener('change', () => {
      localStorage.setItem('rememberMe', rememberCheckbox.checked);
      if (!rememberCheckbox.checked) {
        localStorage.removeItem('rememberedEmail');
      } else if (emailInput && emailInput.value.trim() !== '') {
        localStorage.setItem('rememberedEmail', emailInput.value.trim());
      }
    });

    // Met à jour l'email mémorisé à chaque modification si checkbox cochée
    if (emailInput) {
      emailInput.addEventListener('input', () => {
        if (rememberCheckbox.checked) {
          localStorage.setItem('rememberedEmail', emailInput.value.trim());
        }
      });
    }
  }
});

// Modal mot de passe oublié//
// Modal mot de passe oublié//
// Modal mot de passe oublié//

function showForgotPasswordModal() {
  return new Promise(resolve => {
    const modalId = 'forgotPasswordModal';
    let modalEl = document.getElementById(modalId);
    if (modalEl) modalEl.remove();

    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content auth-scope">
            <div class="modal-header">
              <h5 class="modal-title">Réinitialiser le mot de passe</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
            </div>
            <div class="modal-body">
              <p class="text-muted">Entrez votre adresse e‑mail pour recevoir les instructions de réinitialisation.</p>
              <div class="mb-3">
                <input type="email" id="forgot-email" class="form-control" placeholder="Votre e‑mail" required>
                <div class="invalid-feedback">Veuillez entrer une adresse email valide.</div>
              </div>
              <div id="forgot-feedback" class="mt-2" aria-live="polite"></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
              <button class="btn btn-primary" id="forgot-confirm">Envoyer</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    modalEl = document.getElementById(modalId);
    const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });
    bsModal.show();

    const emailInput = modalEl.querySelector('#forgot-email');
    const confirmBtn = modalEl.querySelector('#forgot-confirm');
    const cancelBtn = modalEl.querySelector('[data-bs-dismiss="modal"]');
    const feedback = modalEl.querySelector('#forgot-feedback');

    function cleanup(result) {
      try { bsModal.hide(); } catch (e) {}
      setTimeout(() => {
        wrapper.remove();
        resolve(result);
      }, 250);
    }

    // Validation basique email
    function isValidEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v||'').trim());
    }

    // Enable/disable confirm
    function updateState() {
      confirmBtn.disabled = !isValidEmail(emailInput.value);
    }
    emailInput.addEventListener('input', updateState);
    updateState();

    // Soumission
    confirmBtn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim();
      if (!isValidEmail(email)) {
        emailInput.classList.add('is-invalid');
        return;
      }
      emailInput.classList.remove('is-invalid');
      confirmBtn.disabled = true;
      feedback.textContent = 'Envoi en cours...';

      try {
        // Exemple d'appel backend — adapte l'URL et la gestion d'erreur selon ton API
        const res = await fetch('/api/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (!res.ok) {
          const errMsg = await res.text().catch(() => 'Erreur serveur');
          feedback.innerHTML = `<span style="color:#b73a3a">${errMsg}</span>`;
          confirmBtn.disabled = false;
          return;
        }

        feedback.innerHTML = `<span style="color:green">Email envoyé si le compte existe. Vérifiez votre boîte.</span>`;
        setTimeout(() => cleanup(email), 1200);
      } catch (err) {
        console.error('forgot-password error', err);
        feedback.innerHTML = `<span style="color:#b73a3a">Erreur réseau. Réessayez.</span>`;
        confirmBtn.disabled = false;
      }
    });

    // Cancel
    cancelBtn.addEventListener('click', () => cleanup(null));

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (document.body.contains(wrapper)) wrapper.remove();
    });
  });
}

function attachForgotPasswordListener(scope = document) {
  const forgotLinks = scope.querySelectorAll('.forgot-password a, a.forgot-password-link');
  forgotLinks.forEach(a => {
    if (a.dataset.forgotAttached === 'true') return;
    a.dataset.forgotAttached = 'true';
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const result = await showForgotPasswordModal();
      if (result) {
        console.log('forgot password requested for', result);
      }
    });
  });
}

// routeLoaded : seulement basculer sur l'onglet demandé (ne retourne pas si éléments manquants)
document.addEventListener('routeLoaded', async (event) => {
  try {
    await new Promise(r => setTimeout(r, 20));

    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');

    if (registerForm && typeof setupAuthValidationForRegister === 'function') {
      setupAuthValidationForRegister(registerForm);
    }
    if (loginForm && typeof setupAuthValidationForLogin === 'function') {
      setupAuthValidationForLogin(loginForm);
    }

    attachForgotPasswordListener(document.getElementById('auth') || document);

    initRememberMe();

    const tab = event?.detail?.queryParams?.get('tab');

    // detect if navigation was user-initiated (try event.isTrusted or custom flag set by menu)
    const userInitiated = !!(event && event.isTrusted) || !!(event?.detail && event.detail.userInitiated);

    if (tab === 'register') {
      // blur any currently focused element to avoid browser stealing focus
      blurActiveIfNotBody();

      // show register; allow focus only when user actually initiated navigation
      if (typeof showRegister === 'function') await showRegister({ focus: !!userInitiated });

      const rf = document.getElementById('register-form');
      if (!rf) return;
      void rf.offsetWidth;
      await new Promise(r => setTimeout(r, 80));
      const rect = rf.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetPosition = rect.top + scrollTop - 100;
      try { document.documentElement.scrollTo(0, targetPosition); } catch (err) { window.scrollTo(0, targetPosition); }
      setTimeout(() => {
        try { window.scrollTo({ top: targetPosition, behavior: 'smooth' }); } catch (e) {}
      }, 20);

      // focus already handled by showRegister when userInitiated === true
      if (userInitiated) {
        // just in case, attempt a small delayed focus
        setTimeout(() => rf.querySelector('input')?.focus(), 180);
      }
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

  // Remplacement de la boucle d'ajout des listeners
  for (const key in inputs) {
    inputs[key].touched = false;

    // input : ne marque touched que si event.isTrusted (user)
    inputs[key].addEventListener('input', (e) => {
      if (!e.isTrusted) return; // ignore programmatic changes / autofill
      inputs[key].touched = true;
      validateForm();
    });

    // blur : idem, et on force la validation visuelle
    inputs[key].addEventListener('blur', (e) => {
      if (e && e.isTrusted) inputs[key].touched = true;
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

  inputs.inputNom.addEventListener('blur', (e) => {
    // ne capitalise que si blur user-triggered
    if (e && e.isTrusted) {
      inputs.inputNom.value = capitalizeFirstLetter(inputs.inputNom.value);
      inputs.inputNom.touched = true;
      validateForm();
    }
  });
  
  inputs.inputPrenom.addEventListener('blur', (e) => {
    if (e && e.isTrusted) {
      inputs.inputPrenom.value = capitalizeFirstLetter(inputs.inputPrenom.value);
      inputs.inputPrenom.touched = true;
      validateForm();
    }
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




