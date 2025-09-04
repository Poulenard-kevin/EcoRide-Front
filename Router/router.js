import Route from "./Route.js";
import { allRoutes, websiteName } from "./allRoutes.js";

// Création d'une route pour la page 404 (page introuvable)
const route404 = new Route("404", "Page introuvable", "/pages/404.html");

// Fonction pour récupérer la route correspondant à une URL donnée
const getRouteByUrl = (url) => {
  let currentRoute = null;
  allRoutes.forEach((element) => {
    if (element.url === url) {
      currentRoute = element;
    }
  });
  return currentRoute || route404;
};

// Supprime les scripts et styles précédemment ajoutés
const removePreviousAssets = () => {
  const scripts = document.querySelectorAll("script[data-dynamic]");
  const styles = document.querySelectorAll("link[data-dynamic]");
  scripts.forEach((script) => script.remove());
  styles.forEach((style) => style.remove());
};

// Fonction pour charger le contenu de la page
const LoadContentPage = async () => {
  const path = window.location.pathname;
  const actualRoute = getRouteByUrl(path);

  // Récupération du contenu HTML de la route
  const html = await fetch(actualRoute.pathHtml).then((data) => data.text());
  document.getElementById("main-page").innerHTML = html;

  // Supprime les scripts et styles précédents
  removePreviousAssets();

  // Ajout du contenu JavaScript
  if (actualRoute.pathJS) {
    const scriptTag = document.createElement("script");
    scriptTag.setAttribute("type", "text/javascript");
    scriptTag.setAttribute("src", actualRoute.pathJS);
    scriptTag.setAttribute("data-dynamic", "true");
    document.querySelector("body").appendChild(scriptTag);
  }

  // Ajout du contenu SCSS/CSS
  if (actualRoute.pathCSS) {
    const styleTag = document.createElement("link");
    styleTag.setAttribute("rel", "stylesheet");
    styleTag.setAttribute("href", actualRoute.pathCSS);
    styleTag.setAttribute("data-dynamic", "true");
    document.querySelector("head").appendChild(styleTag);
  }

  // Changement du titre de la page
  document.title = `${actualRoute.title} - ${websiteName}`;

  // Déclenchement de l'événement personnalisé
  document.dispatchEvent(new CustomEvent("routeLoaded"));
};

// Fonction pour gérer les événements de routage (clic sur les liens)
const routeEvent = (event) => {
  event = event || window.event;
  event.preventDefault();
  window.history.pushState({}, "", event.target.href);
  LoadContentPage();
};

// Gestion de l'événement de retour en arrière dans l'historique du navigateur
window.onpopstate = LoadContentPage;
// Assignation de la fonction routeEvent à la propriété route de la fenêtre
window.route = routeEvent;
// Chargement du contenu de la page au chargement initial
LoadContentPage();

document.addEventListener("routeLoaded", () => {
  if (window.location.pathname === "/espace-utilisateur") {
    setTimeout(() => initUserSpace(), 50);
  }
});