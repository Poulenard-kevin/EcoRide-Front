import Route from "./Route.js";

//Définir ici vos routes
export const allRoutes = [
    new Route("/accueil", "Accueil", "/pages/home.html"),
    new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html"),
    new Route("/espace-administrateur", "Espace administrateur", "/pages/admin-space.html","/jS/admin-space.js", "/scss/admin-space.css"),

];

//Le titre s'affiche comme ceci : Route.titre - websitename
export const websiteName = "EcoRide";