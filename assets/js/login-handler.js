// /assets/js/login-handler.js
import { login } from '/assets/js/auth-client.js';

console.log('[login-handler] module loaded');

function attachLoginHandler() {
  const form = document.getElementById('loginForm');
  if (!form) {
    console.log('[login-handler] no #loginForm found, skipping');
    return;
  }

  // idempotence : si on a déjà attaché le handler, ne pas le faire à nouveau
  if (form.dataset.loginHandlerAttached === 'true') {
    console.log('[login-handler] already attached, skipping');
    return;
  }
  form.dataset.loginHandlerAttached = 'true';

  console.log('[login-handler] attaching submit listener');

  const emailInput = document.getElementById('EmailInput');
  const passwordInput = document.getElementById('PasswordInput');
  const submitBtn = document.getElementById('btn-validation-connexion');
  const feedback = document.getElementById('login-global-feedback');
  const rememberCheckbox = document.querySelector('input[name="rememberMe"]');

  function basicValidate(email, password) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const passOk = password.length > 0;
    return emailOk && passOk;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  
    const email = (emailInput?.value || '').trim();
    const password = (passwordInput?.value || '').trim();
  
    if (!basicValidate(email, password)) {
      feedback && (feedback.style.color = 'crimson');
      feedback && (feedback.textContent = 'Email ou mot de passe invalide');
      return;
    }
  
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.prevText = submitBtn.textContent;
      submitBtn.textContent = 'Connexion...';
    }
    feedback && (feedback.textContent = '');
  
    try {
      console.log('[login-handler] calling login for', email);
      await login(email, password);
      console.log('[login-handler] login successful');
  
      if (rememberCheckbox && rememberCheckbox.checked) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.setItem('rememberMe', 'false');
        localStorage.removeItem('rememberedEmail');
      }
  
      feedback && (feedback.style.color = 'green');
      feedback && (feedback.textContent = 'Connecté ✅');
  
      setTimeout(() => window.location.href = '/espace-utilisateur', 400);
    } catch (err) {
      console.error('[login-handler] login error', err);
      feedback && (feedback.style.color = 'crimson');
      const msg = err?.body?.message || err?.message || 'Erreur de connexion';
      feedback && (feedback.textContent = 'Erreur : ' + msg);
  
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.prevText || 'Se connecter';
      }
    }
  }, { capture: true });
}

// 1) Si la page est déjà ready, attacher tout de suite
if (document.readyState !== 'loading') {
  attachLoginHandler();
} else {
  // 2) Sinon attendre DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    attachLoginHandler();
  }, { once: true });
}

// 3) Aussi écouter l'événement personnalisé émis par ton router après injection
document.addEventListener('routeLoaded', (evt) => {
  // routeLoaded peut contenir des detail/queryParams ; on attend un micro-tic pour laisser le DOM se stabiliser
  setTimeout(() => attachLoginHandler(), 0);
});