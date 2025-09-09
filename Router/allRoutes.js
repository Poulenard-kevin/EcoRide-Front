import Route from "./Route.js";

export const allRoutes = [

  new Route("/accueil", "Accueil", "/pages/home.html", "/Js/home.js"),
  new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html", "/Js/covoiturage.js", "/scss/_covoiturage.css"),
  new Route("/detail", "Détail trajet", "/pages/detail.html", "/Js/detail.js"),
];

export const websiteName = "EcoRide";