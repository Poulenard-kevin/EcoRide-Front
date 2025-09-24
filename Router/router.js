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

const getRouteByPathname = (pathname) => {
  if (!pathname || pathname === "") pathname = "/";
  const exact = allRoutes.find(r => r.url === pathname);
  if (exact) return exact;
  for (const r of allRoutes) {
    if (r.url !== "/" && pathname.startsWith(r.url + "/")) return r;
  }
  return route404;
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
  const queryParams = new URLSearchParams(window.location.search);
  // Compatibilité : utilise la fonction disponible
  const route = (typeof getRouteByPathname === 'function')
    ? getRouteByPathname(pathname)
    : (typeof getRouteByUrl === 'function' ? getRouteByUrl(pathname) : null);

  if (!route) {
    console.error("Route introuvable pour :", pathname);
    return;
  }

  showLoader && showLoader();

  try {
    const res = await fetch(route.pathHtml);
    if (!res.ok) throw new Error("HTML non trouvé");
    const html = await res.text();

    // mainPage fallback
    const mainPageEl = typeof mainPage !== 'undefined' ? mainPage : document.getElementById("main-page");
    if (mainPageEl) mainPageEl.innerHTML = html;

    // Nettoie les scripts précédemment chargés par les routes
    document.querySelectorAll('script[data-route-script]').forEach(s => s.remove());

    const doAfterLoad = () => {
      typeof attachDetailBtnListeners === 'function' && attachDetailBtnListeners();
      // Dispatch un CustomEvent avec les queryParams pour compatibilité et info
      document.dispatchEvent(new CustomEvent('pageContentLoaded', { detail: { queryParams } }));
      // Pour compatibilité ascendante si du code écoute 'routeLoaded'
      document.dispatchEvent(new CustomEvent('routeLoaded', { detail: { queryParams } }));
    };

    if (route.pathJS && route.pathJS.trim() !== "") {
      const scriptTag = document.createElement("script");
      scriptTag.type = "text/javascript";
      scriptTag.src = route.pathJS;
      scriptTag.setAttribute("data-route-script", route.pathJS);
      scriptTag.onload = () => {
        doAfterLoad();
      };
      scriptTag.onerror = () => {
        console.warn("Impossible de charger le script:", route.pathJS);
        doAfterLoad();
      };
      document.body.appendChild(scriptTag);
    } else {
      doAfterLoad();
    }

    document.title = `${route.title} - ${websiteName || ''}`;
  } catch (err) {
    const mainPageEl = typeof mainPage !== 'undefined' ? mainPage : document.getElementById("main-page");
    if (mainPageEl) mainPageEl.innerHTML = '<p style="color:red; text-align:center;">Erreur lors du chargement de la page.</p>';
    console.error("Erreur fetch page:", err);
  } finally {
    hideLoader && hideLoader();
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

window.addEventListener('DOMContentLoaded', () => {
  LoadContentPage();
});