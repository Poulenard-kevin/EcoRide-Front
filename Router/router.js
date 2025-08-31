import Route from "./Route.js";
import { allRoutes, websiteName } from "./allRoutes.js";

// Route 404
const route404 = new Route("404", "Page introuvable", "/pages/404.html");

// Récupère la route correspondant au pathname de base (ex: /detail/1 -> /detail)
const getRouteByPathname = (pathname) => {
  // Normaliser / -> "/"
  if (!pathname || pathname === "") pathname = "/";

  // Si exact match (ex: /covoiturage)
  const exact = allRoutes.find(r => r.url === pathname);
  if (exact) return exact;

  // Sinon, support simple pour segments dynamiques : si pathname commence par route.url + '/'
  for (const r of allRoutes) {
    if (r.url !== "/" && pathname.startsWith(r.url + "/")) {
      return r;
    }
  }

  // Sinon 404
  return route404;
};

// Fonction pour attacher les événements sur les boutons détail
const attachDetailBtnListeners = () => {
  // on clone pour supprimer anciens handlers potentiellement doublonnés
  document.querySelectorAll('.detail-btn').forEach(original => {
    if (!original) return;
    const newNode = original.cloneNode(true);
    original.replaceWith(newNode);
  });

  document.querySelectorAll('.detail-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const id = button.dataset.id || "";
      // pushState vers /detail/ID
      const newPath = `/detail/${encodeURIComponent(id)}`;
      window.history.pushState({}, "", newPath);
      LoadContentPage();
    });
  });

  // si tu veux aussi gérer des liens <a data-link> ...
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
  const pathname = window.location.pathname; // ex: "/detail/1" ou "/covoiturage"
  const route = getRouteByPathname(pathname);

  // fetch HTML de la route
  try {
    const res = await fetch(route.pathHtml);
    if (!res.ok) throw new Error("HTML non trouvé");
    const html = await res.text();
    const main = document.getElementById("main-page");
    if (!main) {
      console.error("Element #main-page introuvable");
      return;
    }
    main.innerHTML = html;
  } catch (err) {
    console.error("Erreur fetch page:", err);
    const main = document.getElementById("main-page");
    if (main) main.innerHTML = "<h2>Erreur de chargement</h2>";
  }

  // Supprimer scripts injectés précédemment
  document.querySelectorAll('script[data-route-script]').forEach(s => s.remove());

  // Injecter script associé à la route (si indiqué)
  if (route.pathJS && route.pathJS.trim() !== "") {
    const scriptTag = document.createElement("script");
    scriptTag.type = "text/javascript";
    scriptTag.src = route.pathJS;
    scriptTag.setAttribute("data-route-script", route.pathJS);
    // Une fois le script chargé, attacher les listeners (au cas où le script génère du DOM)
    scriptTag.onload = () => {
      attachDetailBtnListeners();
    };
    scriptTag.onerror = () => {
      console.warn("Impossible de charger le script:", route.pathJS);
      attachDetailBtnListeners();
    };
    document.body.appendChild(scriptTag);
  } else {
    // Pas de script : on attache directement
    attachDetailBtnListeners();
  }

  // Mettre à jour le titre
  document.title = `${route.title} - ${websiteName}`;
};

// Gestion des liens internes si besoin
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