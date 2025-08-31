import Route from "./Route.js";

export const allRoutes = [
  new Route("/accueil", "Accueil", "/pages/home.html"),
  new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html"),
  new Route("/detail", "Détail trajet", "/pages/detail.html", "/Js/detail.js"),
];

export const websiteName = "EcoRide";