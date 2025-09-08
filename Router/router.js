import Route from "./Route.js";
import { allRoutes, websiteName } from "./allRoutes.js";

const mainPage = document.getElementById("main-page");
const loaderOverlay = document.getElementById("loader-overlay");

function showLoader() {
  if (loaderOverlay) {
    loaderOverlay.style.display = "flex"; // Affiche le loader (flex pour centrer)
  }
  if (mainPage) {
    mainPage.classList.add("loading"); // Ajoute la classe pour transition CSS
  }
}

function hideLoader() {
  if (loaderOverlay) {
    loaderOverlay.style.display = "none"; // Cache le loader
  }
  if (mainPage) {
    mainPage.classList.remove("loading"); // Enlève la classe
  }
}

const mainPage = document.getElementById("main-page");
const loaderOverlay = document.getElementById("loader-overlay");

function showLoader() {
  if (loaderOverlay) {
    loaderOverlay.style.display = "flex"; // Affiche le loader (flex pour centrer)
  }
  if (mainPage) {
    mainPage.classList.add("loading"); // Ajoute la classe pour transition CSS
  }
}

function hideLoader() {
  if (loaderOverlay) {
    loaderOverlay.style.display = "none"; // Cache le loader
  }
  if (mainPage) {
    mainPage.classList.remove("loading"); // Enlève la classe
  }
}

const route404 = new Route("404", "Page introuvable", "/pages/404.html");

const getRouteByUrl = (url) => {
  let currentRoute = null;
  allRoutes.forEach((element) => {
    if (element.url === url) {
      currentRoute = element;
    }
  });
  return currentRoute != null ? currentRoute : route404;
  return currentRoute != null ? currentRoute : route404;
};

async function LoadContentPage() {
async function LoadContentPage() {
  const path = window.location.pathname;
  const actualRoute = getRouteByUrl(path);

  showLoader();

  try {
    const response = await fetch(actualRoute.pathHtml);
    if (!response.ok) throw new Error("Erreur HTTP " + response.status);
    const html = await response.text();

    // Supprime les anciens scripts dynamiques
    document.querySelectorAll("body > script[data-dynamic]").forEach((s) => s.remove());

    // Ajoute le nouveau contenu
    mainPage.innerHTML = html;
    console.log('HTML injecté dans #main-page');

    if (actualRoute.pathJS) {
      const scriptTag = document.createElement("script");
      scriptTag.type = "text/javascript";
      scriptTag.src = actualRoute.pathJS;
      scriptTag.setAttribute("data-dynamic", "true");

      scriptTag.onload = () => {
        console.log('Script chargé:', actualRoute.pathJS);
        document.dispatchEvent(new Event('pageContentLoaded'));
      };

      document.body.appendChild(scriptTag);
    } else {
      document.dispatchEvent(new Event('pageContentLoaded'));
    }

    document.title = `${actualRoute.title} - ${websiteName}`;
  } catch (error) {
    mainPage.innerHTML = '<p style="color:red; text-align:center;">Erreur lors du chargement de la page.</p>';
    console.error("Erreur de chargement :", error);
  } finally {
    hideLoader();
  }
}



const routeEvent = (event) => {
  event.preventDefault();
  const href = event.target.closest("a")?.href;
  if (!href) return;
  window.history.pushState({}, "", href);
  const href = event.target.closest("a")?.href;
  if (!href) return;
  window.history.pushState({}, "", href);
  LoadContentPage();
};

window.onpopstate = LoadContentPage;
window.route = routeEvent;
LoadContentPage();