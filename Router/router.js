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

  // Compatibilité : supporte getRouteByPathname ou getRouteByUrl
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
    const mainPageEl = typeof mainPage !== 'undefined' && mainPage ? mainPage : document.getElementById("main-page");
    if (!mainPageEl) {
      console.error("main-page introuvable");
      return;
    }

    // Nettoie les anciens scripts gérés par les routes
    document.querySelectorAll('script[data-route-script]').forEach(s => s.remove());

    // Parse le HTML pour extraire les scripts sans les laisser inertes
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script'));

    // Injecte le HTML sans les balises <script>
    mainPageEl.innerHTML = '';
    Array.from(doc.body.childNodes).forEach(node => {
      if (!(node.tagName && node.tagName.toLowerCase() === 'script')) {
        mainPageEl.appendChild(node.cloneNode(true));
      }
    });

    // Helpers pour exécuter/charger scripts
    function runInlineScript(content, isModule) {
      const s = document.createElement('script');
      if (isModule) s.type = 'module';
      s.textContent = content;
      s.setAttribute('data-route-script', 'inline');
      document.body.appendChild(s);
    }

    function loadExternalScript(src, isModule) {
      return new Promise(resolve => {
        const s = document.createElement('script');
        s.src = src;
        if (isModule) s.type = 'module';
        s.setAttribute('data-route-script', src);
        s.onload = () => resolve();
        s.onerror = () => {
          console.warn("Impossible de charger le script:", src);
          resolve();
        };
        document.body.appendChild(s);
      });
    }

    // Exécute les scripts trouvés dans le HTML (inline ou externes)
    for (const s of scripts) {
      const isModule = s.type === 'module';
      if (s.src) {
        await loadExternalScript(s.src, isModule);
      } else {
        runInlineScript(s.textContent, isModule);
      }
    }

    // Ensuite, charge route.pathJS s'il est défini (comme avant)
    if (route.pathJS && route.pathJS.trim() !== "") {
      // détecte module si l'info est fournie sur la route (optionnel)
      const isModule = route.isModule === true;
      await loadExternalScript(route.pathJS, isModule);
    }

    // Attache listeners et dispatch events — inclut queryParams pour compatibilité
    typeof attachDetailBtnListeners === 'function' && attachDetailBtnListeners();
    document.dispatchEvent(new CustomEvent('pageContentLoaded', { detail: { queryParams } }));
    document.dispatchEvent(new CustomEvent('routeLoaded', { detail: { queryParams } }));

    document.title = `${route.title} - ${websiteName || ''}`;
  } catch (err) {
    const mainPageEl = typeof mainPage !== 'undefined' && mainPage ? mainPage : document.getElementById("main-page");
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