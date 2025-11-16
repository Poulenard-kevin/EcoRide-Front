// assets/js/register.js
(function () {
    'use strict';
  
    // Config : adapte si besoin
    const REGISTER_URL = '/api/register';         // endpoint d'inscription (à adapter)
    const REDIRECT_TO_AUTH = '/auth';             // page d'authentification (où ?tab=login sera ajouté)
    const REDIRECT_AFTER_REGISTER = null;         // ex: '/user-space' ou null pour redirection vers auth
  
    // Utilitaires
    function qs(sel, ctx = document) { return ctx.querySelector(sel); }
    function qsa(sel, ctx = document) { return Array.from((ctx || document).querySelectorAll(sel)); }
    function createErrorNode(msg) {
      const d = document.createElement('div');
      d.className = 'invalid-feedback d-block field-error';
      d.textContent = msg;
      return d;
    }
  
    // Capitalise la première lettre de chaque mot (ex: "jean-pierre" => "Jean-Pierre")
    function capitalizeName(str) {
      if (!str) return '';
      return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }
  
    async function submitRegisterForm(e) {
      e.preventDefault();
      const form = e.currentTarget;
      if (!form || form.dataset.sending === 'true') return;
  
      const submitBtn = form.querySelector('.auth-button[type="submit"], .auth-button');
      if (submitBtn && submitBtn.disabled) {
        const firstInvalid = form.querySelector('.is-invalid, input:invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
  
      // Collecte champs (noms basés sur ton HTML existant)
      const lastNameInput = qs('input[name="Nom"]', form);
      const firstNameInput = qs('input[name="Prenom"]', form);
      const emailInput = qs('input[name="email"]', form);
      const passwordInput = qs('input[name="password"]', form);
      const confirmInput = qs('input[name="confirm-password"]', form);
  
      // Récupération + capitalisation automatique
      const lastName = capitalizeName(lastNameInput?.value || '');
      const firstName = capitalizeName(firstNameInput?.value || '');
      const email = (emailInput?.value || '').trim();
      const password = (passwordInput?.value || '').trim();
      const confirm = (confirmInput?.value || '').trim();
  
      // Mise à jour des champs avec les versions capitalisées (optionnel mais propre)
      if (lastNameInput) lastNameInput.value = lastName;
      if (firstNameInput) firstNameInput.value = firstName;
  
      // Simple validation côté client
      if (!email || !password || password !== confirm) {
        if (!email) emailInput?.classList.add('is-invalid');
        if (!password) passwordInput?.classList.add('is-invalid');
        if (password !== confirm) confirmInput?.classList.add('is-invalid');
        const firstInvalid = form.querySelector('.is-invalid');
        firstInvalid?.focus();
        return;
      }
  
      // UI -> envoi en cours
      form.dataset.sending = 'true';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.origHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Envoi en cours…';
      }
  
      // nettoyage erreurs précédentes
      qsa('.field-error', form).forEach(n => n.remove());
      qsa('input', form).forEach(i => i.classList.remove('is-invalid'));
  
      const payload = { lastName, firstName, email, password };
  
      try {
        const res = await fetch(REGISTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        });
  
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch (err) { data = { raw: text }; }
  
        if (!res.ok) {
          // errors: ApiPlatform style violations or generic message
          if (data && Array.isArray(data.violations)) {
            data.violations.forEach(v => {
              const field = v.propertyPath || v.field || null;
              const msg = v.message || v.title || 'Erreur';
              let inputEl = null;
              if (field) {
                if (field === 'firstName') inputEl = firstNameInput;
                else if (field === 'lastName') inputEl = lastNameInput;
                else inputEl = qs(`input[name="${field}"]`, form);
              }
              if (inputEl) {
                inputEl.classList.add('is-invalid');
                inputEl.parentNode?.appendChild(createErrorNode(msg));
              } else {
                form.prepend(createErrorNode(msg));
              }
            });
          } else {
            const msg = (data && (data.message || data.detail)) || `Erreur ${res.status}`;
            form.prepend(createErrorNode(msg));
          }
          return;
        }
  
        // Succès : si API renvoie token on peut le stocker, sinon rediriger vers auth
        const token = data?.token || data?.access_token || data?.tokenValue || null;
        if (token) {
          try {
            localStorage.setItem('token', token);
            if (window.ecoAuth && typeof window.ecoAuth.setToken === 'function') {
              window.ecoAuth.setToken(token);
            }
            if (window.ecoAuth && typeof window.ecoAuth.refresh === 'function') {
              await window.ecoAuth.refresh();
            } else if (REDIRECT_AFTER_REGISTER) {
              window.location.href = REDIRECT_AFTER_REGISTER;
            } else {
              window.location.reload();
            }
          } catch (err) {
            console.warn('register: erreur stockage token', err);
            if (REDIRECT_AFTER_REGISTER) window.location.href = REDIRECT_AFTER_REGISTER;
            else window.location.reload();
          }
          return;
        }
  
        // Pas de token : rediriger vers la page de connexion avec pré-remplissage de l'email
        const next = new URL(window.location.href);
        next.pathname = REDIRECT_TO_AUTH;
        next.searchParams.set('tab', 'login');
        next.searchParams.set('email', email);
        window.location.href = next.toString();
  
      } catch (err) {
        console.error('register: erreur réseau', err);
        form.prepend(createErrorNode('Erreur réseau. Réessayez.'));
      } finally {
        form.dataset.sending = 'false';
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitBtn.dataset.origHtml) submitBtn.innerHTML = submitBtn.dataset.origHtml;
        }
      }
    }
  
    // Attache le handler si le formulaire est présent
    function attachIfRegisterFormExists() {
      const regForm = document.getElementById('register-form');
      if (!regForm) return false;
      if (regForm.dataset.registerHandlerAttached === 'true') return true;
      regForm.addEventListener('submit', submitRegisterForm);
      regForm.dataset.registerHandlerAttached = 'true';
      return true;
    }
  
    // Au chargement initial
    document.addEventListener('DOMContentLoaded', () => {
      attachIfRegisterFormExists();
    });
  
    // Si ton app émet un événement 'routeLoaded' lorsque le DOM de la route est injecté,
    // on écoute aussi pour s'attacher dynamiquement
    document.addEventListener('routeLoaded', () => {
      setTimeout(attachIfRegisterFormExists, 30);
    });
  
  })();