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

const loadScripts = async (scripts) => {
  if (!scripts) return;

  const loadOne = (src) => {
    return new Promise((resolve) => {
      const scriptTag = document.createElement("script");
      scriptTag.type = "module"; // ✅ très important
      scriptTag.src = src;
      scriptTag.setAttribute("data-route-script", src);
      scriptTag.onload = resolve;
      scriptTag.onerror = () => {
        console.warn("Impossible de charger le script:", src);
        resolve();
      };
      document.body.appendChild(scriptTag);
    });
  };

  if (Array.isArray(scripts)) {
    for (const src of scripts) {
      await loadOne(src);
    }
  } else {
    await loadOne(scripts);
  }
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

    if (route.pathJS && (
      typeof route.pathJS === 'string' ? route.pathJS.trim() !== "" 
      : Array.isArray(route.pathJS) && route.pathJS.length > 0
    )) {
    await loadScripts(route.pathJS);
  }
  
    // 🔥 Très important : on décale pour que les modules aient le temps de s’exécuter
    setTimeout(() => {
      attachDetailBtnListeners();
      document.dispatchEvent(new Event('pageContentLoaded'));
    }, 0);

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