import Route from "./Route.js";

export const allRoutes = [
  new Route("/accueil", "Accueil", "/pages/home.html"),
  new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html"),
  new Route("/espace-utilisateur", "Espace utilisateur", "/pages/user-space.html", "/Js/user-space.js", "/scss/user-space.css"),
  new Route("/user-profile", "Profile / Role", "/pages/user-profile-form.html", null, "/scss/user-profile-form.css"),
  new Route("/user-trajects", "My Trajects", "/pages/user-trajects-form.html", null, "/scss/user-trajects-form.css"),
  new Route("/user-vehicles", "My Vehicles", "/pages/user-vehicles-form.html", null, "/scss/user-vehicles-form.css"),
  new Route("/user-history", "History", "/pages/user-history-form.html", null, "/scss/user-history-form.css"),
];

export const websiteName = "EcoRide";