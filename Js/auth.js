document.addEventListener("routeLoaded", () => {
    console.log("auth.js chargé correctement après injection du contenu HTML");

    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    if (!loginTab || !registerTab || !loginForm || !registerForm) {
        console.error("Un ou plusieurs éléments HTML nécessaires sont introuvables.");
        return;
    }

    console.log("login-tab existe ?", loginTab);
    console.log("register-tab existe ?", registerTab);
    console.log("login-form existe ?", loginForm);
    console.log("register-form existe ?", registerForm);

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