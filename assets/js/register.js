// assets/js/register.js
(function () {
    'use strict';
  
    // ---------- CONFIG ----------
    // Changez ici si votre API est ailleurs
    const REGISTER_URL = 'http://127.0.0.1:8000/api/register';
    const REDIRECT_TO_AUTH = '/auth';            // page d'auth (ex: /auth?tab=login)
    const REDIRECT_AFTER_REGISTER = null;        // ex: '/espace-utilisateur' ou null pour reload
  
    // ---------- utilitaires ----------
    const qs = (sel, ctx = document) => ctx.querySelector(sel);
    const qsa = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));
    const createErrorNode = (msg) => {
      const d = document.createElement('div');
      d.className = 'invalid-feedback d-block field-error';
      d.textContent = msg;
      return d;
    };
    const capitalizeName = (str) => {
      if (!str) return '';
      return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    };
  
    // Lecture robuste des champs depuis un <form> ou un conteneur <div>
    function readPayloadFromContainer(container) {
      if (!container) return {};
      if (container.tagName === 'FORM') {
        return Object.fromEntries(new FormData(container).entries());
      }
      const inputs = Array.from(container.querySelectorAll('input, textarea, select'));
      const data = {};
      inputs.forEach(i => {
        if (!i.name) return;
        if (i.type === 'checkbox') data[i.name] = i.checked;
        else if (i.type === 'radio') {
          if (i.checked) data[i.name] = i.value;
        } else data[i.name] = i.value;
      });
      return data;
    }
  
    // Envoi POST vers le backend
    async function postRegister(payload) {
      const res = await fetch(REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        // changez 'omit' -> 'include' si votre API utilise cookie/session côté serveur
        credentials: 'omit'
      });
  
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (err) { data = { raw: text }; }
  
      if (!res.ok) {
        const err = new Error(data?.message || data?.detail || `Erreur ${res.status}`);
        err.body = data;
        err.status = res.status;
        throw err;
      }
      return data;
    }
  
    // Handler principal
    async function submitRegisterForm(e) {
      if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
        e.stopPropagation();
      }
  
      // On cherche le conteneur : d'abord id="register-form", sinon premier form, sinon un div avec id
      const container = document.getElementById('register-form') ||
                        document.querySelector('form#register-form') ||
                        document.querySelector('form') ||
                        document.getElementById('register-form') ||
                        document.body;
  
      if (!container) return;
  
      // Bouton submit (si existant) pour UI feedback
      const submitBtn = container.querySelector('.auth-button[type="submit"], .auth-button');
  
      // Lecture des champs
      const raw = readPayloadFromContainer(container);
      const lastName = (raw['Nom'] || raw['lastName'] || '').trim();
      const firstName = (raw['Prenom'] || raw['firstName'] || '').trim();
      const email = (raw['email'] || '').trim();
      const password = (raw['password'] || '').trim();
      const confirm = (raw['confirm-password'] || raw['confirmPassword'] || '').trim();
  
      // Maj champs capitalisés (optionnel)
      const lastNameInput = container.querySelector('input[name="Nom"], input[name="lastName"]');
      const firstNameInput = container.querySelector('input[name="Prenom"], input[name="firstName"]');
      if (lastNameInput) lastNameInput.value = capitalizeName(lastName);
      if (firstNameInput) firstNameInput.value = capitalizeName(firstName);
  
      // Validation simple côté client
      if (!email || !password || password !== confirm) {
        if (!email) (container.querySelector('input[name="email"]') || {}).classList?.add?.('is-invalid');
        if (!password) (container.querySelector('input[name="password"]') || {}).classList?.add?.('is-invalid');
        if (password !== confirm) (container.querySelector('input[name="confirm-password"], input[name="confirmPassword"]') || {}).classList?.add?.('is-invalid');
        return;
      }
  
      // UI -> envoi en cours
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.origHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Envoi en cours…';
      }
  
      // cleanup erreurs précédentes
      qsa('.field-error', container).forEach(n => n.remove());
      qsa('input', container).forEach(i => i.classList.remove('is-invalid'));
  
      // Préparer payload attendu par votre backend
      const payload = {
        lastName: lastName,
        firstName: firstName,
        email: email,
        password: password,
        confirmPassword: confirm
      };
  
      try {
        console.log('[register] POST ->', REGISTER_URL, payload);
        const data = await postRegister(payload);
        console.log('[register] response', data);
  
        // Tolérance sur le nom du token renvoyé
        const token = data?.apiToken || data?.token || data?.access_token || null;
        if (token) {
          localStorage.setItem('apiToken', token);
          // si vous avez un objet global d'auth
          if (window.ecoAuth && typeof window.ecoAuth.setToken === 'function') {
            try { window.ecoAuth.setToken(token); } catch(e){/* ignore */ }
          }
          if (REDIRECT_AFTER_REGISTER) {
            window.location.href = REDIRECT_AFTER_REGISTER;
          } else {
            window.location.reload();
          }
          return;
        }
  
        // Pas de token -> rediriger vers page de connexion en pré-remplissant l'email
        const next = new URL(window.location.href);
        next.pathname = REDIRECT_TO_AUTH;
        next.searchParams.set('tab', 'login');
        next.searchParams.set('email', email);
        window.location.href = next.toString();
  
      } catch (err) {
        console.error('register: erreur', err);
        // Si erreurs de validation renvoyées par le backend (API Platform style)
        const body = err?.body || {};
        if (Array.isArray(body.violations) && body.violations.length) {
          body.violations.forEach(v => {
            const field = v.propertyPath || v.field;
            const msg = v.message || 'Erreur';
            let el = null;
            if (field) {
              if (field === 'firstName') el = firstNameInput;
              else if (field === 'lastName') el = lastNameInput;
              else el = qs(`input[name="${field}"]`, container);
            }
            if (el) {
              el.classList.add('is-invalid');
              el.parentNode?.appendChild(createErrorNode(msg));
            } else {
              container.prepend(createErrorNode(msg));
            }
          });
        } else {
          const msg = body?.message || body?.detail || err.message || 'Erreur inscription';
          container.prepend(createErrorNode(msg));
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitBtn.dataset.origHtml) submitBtn.innerHTML = submitBtn.dataset.origHtml;
        }
      }
    }
  
    // Attache le handler : si c'est un <form> on écoute 'submit', sinon on écoute le click sur le container
    function attachIfRegisterFormExists() {
      const regForm = document.getElementById('register-form') ||
                      document.querySelector('form#register-form') ||
                      document.querySelector('form') ||
                      document.getElementById('register-form');
  
      if (!regForm) return false;
      if (regForm.dataset.registerHandlerAttached === 'true') return true;
  
      if (regForm.tagName === 'FORM') {
        regForm.addEventListener('submit', submitRegisterForm);
      } else {
        // container non-form — on intercepte le click sur le bouton submit
        regForm.addEventListener('click', (e) => {
          const btn = e.target.closest('button, input[type="submit"], a');
          if (!btn) return;
          if (!regForm.contains(btn)) return;
          e.preventDefault(); e.stopPropagation();
          submitRegisterForm(e);
        }, { capture: true });
      }
  
      regForm.dataset.registerHandlerAttached = 'true';
      return true;
    }
  
    // init
    document.addEventListener('DOMContentLoaded', () => { attachIfRegisterFormExists(); });
    // si vous avez un route loader (SPA), on réessaie
    document.addEventListener('routeLoaded', () => setTimeout(attachIfRegisterFormExists, 30));
  
  })();