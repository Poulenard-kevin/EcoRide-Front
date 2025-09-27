(function setupContactValidation() {
  const formElement = document.getElementById('contact-form');
  if (!formElement || formElement.dataset.validationInitialized === "true") return;
  formElement.dataset.validationInitialized = "true";

  const inputs = {
    name: formElement.querySelector('#contact-name'),
    email: formElement.querySelector('#contact-email'),
    subject: formElement.querySelector('#contact-subject'),
    message: formElement.querySelector('#contact-message')
  };
  const sendButton = formElement.querySelector('.btn-send');

  const visualFields = new Set(['name', 'email']); // feedback visuel uniquement pour ces champs

  // Associer feedbacks
  const feedbackMap = new WeakMap();
  Array.from(formElement.querySelectorAll('input, textarea')).forEach((input) => {
    let invalidEl = null;
    let validEl = null;
    let el = input.nextElementSibling;
    while (el) {
      if (el.matches && el.matches('input, textarea')) break;
      if (el.classList && el.classList.contains('invalid-feedback')) invalidEl = el;
      if (el.classList && el.classList.contains('valid-feedback')) validEl = el;
      if (invalidEl && validEl) break;
      el = el.nextElementSibling;
    }
    feedbackMap.set(input, { invalidEl, validEl });
  });

  function getFB(input) {
    return feedbackMap.get(input) || { invalidEl: null, validEl: null };
  }

  function showOnlyFeedback(input, which) {
    const { invalidEl, validEl } = getFB(input);
    if (invalidEl) invalidEl.style.display = which === 'invalid' ? 'block' : 'none';
    if (validEl) validEl.style.display = which === 'valid' ? 'block' : 'none';
  }

  function setValid(input) {
    if (!input) return;
    if (visualFields.has(input.name)) {
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
      input.setAttribute('aria-invalid', 'false');
      showOnlyFeedback(input, 'valid');
    } else {
      input.classList.remove('is-valid', 'is-invalid');
      showOnlyFeedback(input, null);
    }
  }

  function setInvalid(input) {
    if (!input) return;
    if (visualFields.has(input.name)) {
      input.classList.remove('is-valid');
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      showOnlyFeedback(input, 'invalid');
    } else {
      input.classList.remove('is-valid', 'is-invalid');
      showOnlyFeedback(input, null);
    }
  }

  function clearValidation(input) {
    if (!input) return;
    input.classList.remove('is-valid', 'is-invalid');
    input.setAttribute('aria-invalid', 'false');
    showOnlyFeedback(input, null);
  }

  Object.values(inputs).forEach(inp => {
    if (!inp) return;
    inp.touched = false;

    inp.addEventListener('input', (e) => {
      if (!e.isTrusted) return;
      inp.touched = true;
      validateField(inp);
      updateSubmitButton();
    });

    inp.addEventListener('blur', (e) => {
      if (!e || e.isTrusted) inp.touched = true;
      validateField(inp);
      updateSubmitButton();
    });
  });

  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]{2,}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateField(input) {
    if (!input) return false;
    const v = input.value.trim();

    if (!input.touched) {
      clearValidation(input);
      return false;
    }

    if (input === inputs.name) {
      if (!v || !nameRegex.test(v)) { setInvalid(input); updateSubmitButton(); return false; }
      setValid(input); updateSubmitButton(); return true;
    }
    if (input === inputs.email) {
      if (!v || !emailRegex.test(v)) { setInvalid(input); updateSubmitButton(); return false; }
      setValid(input); updateSubmitButton(); return true;
    }
    
    if (input === inputs.subject) {
      setValid(input);
      updateSubmitButton();
      return true;
    }
    
    if (input === inputs.message) {
      if (v.length < 10) { setInvalid(input); updateSubmitButton(); return false; }
      if (v.length > 1500) { setInvalid(input); updateSubmitButton(); return false; }
      setValid(input);
      updateSubmitButton();
      return true;
    }

    return false;
  }

  function logicalValidation() {
    const okName = inputs.name && nameRegex.test(inputs.name.value.trim());
    const okEmail = inputs.email && emailRegex.test(inputs.email.value.trim());
    const okMessage = inputs.message && inputs.message.value.trim().length >= 10 && inputs.message.value.trim().length <= 1500;
    // Objet optionnel, on ne le teste pas ici
    return !!(okName && okEmail && okMessage);
  }

  function updateSubmitButton() {
    if (sendButton) sendButton.disabled = !logicalValidation();
  }

  function validateAll() {
    Object.values(inputs).forEach(inp => {
      if (!inp) return;
      inp.touched = true;
      validateField(inp);
    });
    updateSubmitButton();
  }

  formElement.addEventListener('submit', function(e) {
    e.preventDefault();
    validateAll();

    if (!logicalValidation()) {
      const firstInvalid = Object.values(inputs).find(inp => {
        if (!inp) return false;
        if (inp === inputs.name) return !(nameRegex.test(inp.value.trim()));
        if (inp === inputs.email) return !(emailRegex.test(inp.value.trim()));
        if (inp === inputs.message) return inp.value.trim().length < 10 || inp.value.trim().length > 1500;
        return false;
      });
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    if (sendButton) {
      const orig = sendButton.textContent;
      sendButton.disabled = true;
      sendButton.textContent = 'Envoi...';
      setTimeout(() => {
        alert('✅ Message envoyé (simulation).');
        formElement.reset();
        Object.values(inputs).forEach(inp => { if (inp) { inp.touched = false; clearValidation(inp); } });
        updateSubmitButton();
        sendButton.textContent = orig;
      }, 900);
    }
  });

  // Initialisation
  formElement.querySelectorAll('.invalid-feedback, .valid-feedback').forEach(el => el.style.display = 'none');formElement.querySelectorAll('.invalid-feedback, .valid-feedback').forEach(el => el.style.display = 'none');
  updateSubmitButton(); 
})();