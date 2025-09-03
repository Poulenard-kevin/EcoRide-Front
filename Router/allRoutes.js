import Route from "./Route.js";

// Définir ici vos routes
export const allRoutes = [
    new Route("/accueil", "Accueil", "/pages/home.html"),
    new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html"),
    new Route("/espace-utilisateur", "Espace utilisateur", "/pages/user-space.html", "/js/user-space.js"),
];

// Le titre s'affiche comme ceci : Route.titre - websitename
export const websiteName = "EcoRide";