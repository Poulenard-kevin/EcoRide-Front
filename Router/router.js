import Route from "./Route.js";
import { allRoutes, websiteName } from "./allRoutes.js";

// Route 404
const route404 = new Route("404", "Page introuvable", "/pages/404.html");

// Récupère la route correspondant au pathname (sans query)
const getRouteByPathname = () => {
  const url = new URL(window.location.href);
  const pathname = url.pathname;

  const exact = allRoutes.find(r => r.url === pathname);
  return exact || route404;
};

// Fonction pour attacher les événements sur les boutons détail
const attachDetailBtnListeners = () => {
  document.querySelectorAll('.detail-btn').forEach(original => {
    const newNode = original.cloneNode(true);
    original.replaceWith(newNode);
  });

  document.querySelectorAll('.detail-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id || "";
      const newPath = `/detail?id=${encodeURIComponent(id)}`;
      window.history.pushState({}, "", newPath);
      LoadContentPage();
    });
  });

  document.querySelectorAll('a[data-link]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const href = a.getAttribute('href');
      const u = new URL(href, window.location.origin);
      window.history.pushState({}, "", u.pathname + u.search);
      LoadContentPage();
    });
  });
};

// Fonction pour charger et injecter la page
const LoadContentPage = async () => {
  const route = getRouteByPathname();

  try {
    const res = await fetch(route.pathHtml);
    if (!res.ok) throw new Error("HTML non trouvé");
    const html = await res.text();
    const main = document.getElementById("main-page");
    if (main) main.innerHTML = html;
  } catch (err) {
    console.error("Erreur fetch page:", err);
    const main = document.getElementById("main-page");
    if (main) main.innerHTML = "<h2>Erreur de chargement</h2>";
  }

  document.querySelectorAll('script[data-route-script]').forEach(s => s.remove());

  if (route.pathJS && route.pathJS.trim() !== "") {
    const scriptTag = document.createElement("script");
    scriptTag.type = "text/javascript";
    scriptTag.src = route.pathJS;
    scriptTag.setAttribute("data-route-script", route.pathJS);
    scriptTag.onload = () => attachDetailBtnListeners();
    scriptTag.onerror = () => {
      console.warn("Impossible de charger le script:", route.pathJS);
      attachDetailBtnListeners();
    };
    document.body.appendChild(scriptTag);
  } else {
    attachDetailBtnListeners();
  }

  document.title = `${route.title} - ${websiteName}`;
};

// Gestion des liens internes
const routeEvent = (event) => {
  event = event || window.event;
  event.preventDefault();
  const a = event.target.closest('a');
  if (!a) return;
  const url = new URL(a.getAttribute('href'), window.location.origin);
  window.history.pushState({}, "", url.pathname + url.search);
  LoadContentPage();
};

window.onpopstate = LoadContentPage;
window.route = routeEvent;

// Chargement initial
window.addEventListener('DOMContentLoaded', () => {
  LoadContentPage();
});