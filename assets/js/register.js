// assets/js/register.js
(function () {
  'use strict';

  // ---------- CONFIG ----------
  // Utilise le helper global s'il existe, sinon window.__API_BASE, sinon localhost
  const getApiHost = () => {
    if (typeof window.getApiBase === 'function') return window.getApiBase().replace(/\/+$/, '').replace(/\/api$/i, '');
    return (window.__API_BASE || window.API_BASE || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  };

  const REGISTER_URL = getApiHost() + '/api/register';
  const REDIRECT_TO_AUTH = '/auth';
  const REDIRECT_AFTER_REGISTER = null; 

  // ---------- utilitaires ----------
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));
  
  const createErrorNode = (msg) => {
    const d = document.createElement('div');
    d.className = 'alert alert-danger field-error mt-2'; // Utilise des classes Bootstrap pour la visibilité
    d.style.fontSize = '0.85rem';
    d.textContent = msg;
    return d;
  };

  const capitalizeName = (str) => {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

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
      else if (i.type === 'radio') { if (i.checked) data[i.name] = i.value; } 
      else data[i.name] = i.value;
    });
    return data;
  }

  async function postRegister(payload) {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
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

  async function submitRegisterForm(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const container = document.getElementById('register-form') || document.querySelector('form') || document.body;
    if (!container) return;

    const submitBtn = container.querySelector('button[type="submit"], .auth-button, #register-btn');

    const raw = readPayloadFromContainer(container);
    
    // Mapping des champs (s'adapte à tes noms d'input HTML)
    const lastName = (raw['Nom'] || raw['lastName'] || '').trim();
    const firstName = (raw['Prenom'] || raw['firstName'] || '').trim();
    const email = (raw['email'] || '').trim();
    const password = (raw['password'] || '').trim();
    const confirm = (raw['confirm-password'] || raw['confirmPassword'] || '').trim();

    // Validation client
    let hasError = false;
    qsa('.field-error', container).forEach(n => n.remove());
    qsa('input', container).forEach(i => i.classList.remove('is-invalid'));

    if (!email) { hasError = true; (container.querySelector('input[name="email"]') || {}).classList?.add?.('is-invalid'); }
    if (password.length < 6) { hasError = true; (container.querySelector('input[name="password"]') || {}).classList?.add?.('is-invalid'); }
    if (password !== confirm) { hasError = true; (container.querySelector('input[name*="confirm"]') || {}).classList?.add?.('is-invalid'); }
    
    if (hasError) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.origHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Envoi...';
    }

    const payload = {
      lastName: capitalizeName(lastName),
      firstName: capitalizeName(firstName),
      email: email,
      password: password
    };

    try {
      const data = await postRegister(payload);

      const token = data?.apiToken || data?.token || data?.access_token;
      if (token) {
        localStorage.setItem('api_token', token);
        if (window.ecoAuth) window.ecoAuth.setToken(token);
        
        window.location.href = REDIRECT_AFTER_REGISTER || '/';
        return;
      }

      // Redirection vers login avec email en paramètre
      const next = new URL(window.location.origin + REDIRECT_TO_AUTH);
      next.searchParams.set('tab', 'login');
      next.searchParams.set('registered', '1');
      next.searchParams.set('email', email);
      window.location.href = next.toString();

    } catch (err) {
      console.error('register: erreur', err);
      const body = err?.body || {};
      
      // Gestion des violations API Platform
      if (body.violations) {
        body.violations.forEach(v => {
          const input = container.querySelector(`input[name*="${v.propertyPath}"]`);
          if (input) {
            input.classList.add('is-invalid');
            input.parentNode.appendChild(createErrorNode(v.message));
          }
        });
      } else {
        container.prepend(createErrorNode(body.detail || body.message || "Une erreur est survenue lors de l'inscription."));
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtn.dataset.origHtml;
      }
    }
  }

  function attachIfRegisterFormExists() {
    const regForm = document.getElementById('register-form') || document.querySelector('form');
    if (!regForm || regForm.dataset.registerHandlerAttached === 'true') return;

    if (regForm.tagName === 'FORM') {
      regForm.addEventListener('submit', submitRegisterForm);
    } else {
      regForm.addEventListener('click', (e) => {
        if (e.target.closest('button, .auth-button')) submitRegisterForm(e);
      });
    }
    regForm.dataset.registerHandlerAttached = 'true';
  }

  document.addEventListener('DOMContentLoaded', attachIfRegisterFormExists);
  // Pour les changements de tabs dynamiques (si ton auth.js change de vue sans recharger)
  window.addEventListener('hashchange', () => setTimeout(attachIfRegisterFormExists, 100));
})();