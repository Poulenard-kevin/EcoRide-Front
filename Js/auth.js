document.addEventListener('DOMContentLoaded', () => {
    console.log("auth.js chargé correctement");

    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (!loginTab || !registerTab || !loginForm || !registerForm) {
        console.error("Un ou plusieurs éléments HTML nécessaires sont introuvables.");
        return;
    }

    console.log("login-tab existe ?", loginTab);
    console.log("register-tab existe ?", registerTab);
    console.log("login-form existe ?", loginForm);
    console.log("register-form existe ?", registerForm);
});

document.addEventListener("routeLoaded", (event) => {
    console.log("Événement routeLoaded reçu dans auth.js");

    const queryParams = event.detail.queryParams;
    console.log("Paramètres de l'URL :", queryParams.toString());

    const tab = queryParams.get("tab");
    console.log("Valeur du paramètre 'tab' :", tab);

    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    if (!loginTab || !registerTab || !loginForm || !registerForm) {
        console.error("Un ou plusieurs éléments HTML nécessaires sont introuvables.");
        return;
    }

    // Basculer vers l'onglet correspondant en fonction du paramètre "tab"
    if (tab === "register") {
        console.log("Bascule vers l'onglet Inscription");
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
        registerForm.style.display = "block";
        loginForm.style.display = "none";
    } else if (tab === "login") {
        console.log("Bascule vers l'onglet Se connecter");
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        loginForm.style.display = "block";
        registerForm.style.display = "none";
    }

    // Gestion du clic sur "Se connecter"
    loginTab.addEventListener("click", (e) => {
        e.preventDefault();
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        loginForm.style.display = "block";
        registerForm.style.display = "none";
    });

    // Gestion du clic sur "Inscription"
    registerTab.addEventListener("click", (e) => {
        e.preventDefault();
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
        registerForm.style.display = "block";
        loginForm.style.display = "none";
    });
});