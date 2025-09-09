import Route from "./Route.js";
import { allRoutes, websiteName } from "./allRoutes.js";

const mainPage = document.getElementById("main-page");
const loaderOverlay = document.getElementById("loader-overlay");

function showLoader() {
  if (loaderOverlay) loaderOverlay.style.display = "flex";
  if (mainPage) mainPage.classList.add("loading");
}

function hideLoader() {
  if (loaderOverlay) loaderOverlay.style.display = "none";
  if (mainPage) mainPage.classList.remove("loading");
}

const route404 = new Route("404", "Page introuvable", "/pages/404.html");

// Fonction pour récupérer la route correspondant à une URL donnée ou un pathname
const getRouteByUrl = (url) => {
  const currentRoute = allRoutes.find(element => element.url === url);
  return currentRoute || route404;
};

const getRouteByPathname = (pathname) => {
  if (!pathname || pathname === "") pathname = "/";
  const exact = allRoutes.find(r => r.url === pathname);
  if (exact) return exact;
  for (const r of allRoutes) {
    if (r.url !== "/" && pathname.startsWith(r.url + "/")) return r;
  }
  return route404;
};

// Supprime les scripts et styles précédemment ajoutés
const removePreviousAssets = () => {
  const scripts = document.querySelectorAll("script[data-dynamic], script[data-route-script]");
  const styles = document.querySelectorAll("link[data-dynamic]");
  scripts.forEach((script) => script.remove());
  styles.forEach((style) => style.remove());
};

const attachDetailBtnListeners = () => {
  document.querySelectorAll('.detail-btn').forEach(original => {
    if (!original) return;
    const newNode = original.cloneNode(true);
    original.replaceWith(newNode);
  });

  document.querySelectorAll('.detail-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id || "";
      const newPath = `/detail/${encodeURIComponent(id)}`;
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

const LoadContentPage = async () => {
  const pathname = window.location.pathname;
  const route = getRouteByPathname(pathname);

  showLoader();

  try {
    const res = await fetch(route.pathHtml);
    if (!res.ok) throw new Error("HTML non trouvé");
    const html = await res.text();

    if (mainPage) mainPage.innerHTML = html;

    // Supprime les anciens scripts dynamiques et styles
    removePreviousAssets();

    if (route.pathJS && route.pathJS.trim() !== "") {
      const scriptTag = document.createElement("script");
      scriptTag.type = "text/javascript";
      scriptTag.src = route.pathJS;
      scriptTag.setAttribute("data-route-script", route.pathJS);
      scriptTag.onload = () => {
        attachDetailBtnListeners();
        document.dispatchEvent(new Event('pageContentLoaded'));
      };
      scriptTag.onerror = () => {
        console.warn("Impossible de charger le script:", route.pathJS);
        attachDetailBtnListeners();
        document.dispatchEvent(new Event('pageContentLoaded'));
      };
      document.body.appendChild(scriptTag);
    } else {
      attachDetailBtnListeners();
      document.dispatchEvent(new Event('pageContentLoaded'));
    }

    document.title = `${route.title} - ${websiteName}`;
  } catch (err) {
    if (mainPage) mainPage.innerHTML = '<p style="color:red; text-align:center;">Erreur lors du chargement de la page.</p>';
    console.error("Erreur fetch page:", err);
  } finally {
    hideLoader();
  }
};

const routeEvent = (event) => {
  event.preventDefault();
  const a = event.target.closest('a');
  if (!a) return;
  const url = new URL(a.getAttribute('href'), window.location.origin);
  window.history.pushState({}, "", url.pathname + url.search);
  LoadContentPage();
};

window.onpopstate = LoadContentPage;
window.route = routeEvent;

// Chargement initial au DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  LoadContentPage();
});