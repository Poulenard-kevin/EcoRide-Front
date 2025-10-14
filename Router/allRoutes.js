import Route from "./Route.js";

export const allRoutes = [
  new Route("/accueil", "Accueil", "/pages/home.html", "/Js/home.js"),
  new Route("/covoiturage", "Covoiturage", "/pages/covoiturage.html", "/Js/covoiturage.js", "/scss/_covoiturage.css"),
  new Route("/detail", "Détail trajet", "/pages/detail.html", "/Js/detail.js", "/scss/_detail.css"),
  new Route("/espace-utilisateur","Espace utilisateur","/pages/user-space.html",["/Js/user-space.js", "/Js/trajets.js"],"/scss/user-space.css"),
  new Route("/user-profile", "Profile / Role", "/pages/user-profile-form.html", null, "/scss/user-profile-form.css"),
  new Route("/user-trajects", "My Trajects", "/pages/user-trajects-form.html", null, "/scss/user-trajects-form.css"),
  new Route("/user-vehicles", "My Vehicles", "/pages/user-vehicles-form.html", null, "/scss/user-vehicles-form.css"),
  new Route("/user-history", "History", "/pages/user-history-form.html", null, "/scss/user-history-form.css"),
  new Route("/auth", "Connexion", "/pages/auth.html", "/Js/auth.js", "/scss/_auth.css"),
  new Route("/contact", "Contact", "/pages/contact.html","/JS/contact.js","/scss/contact.css"),
  new Route("/espace-employe", "Espace Employé", "/pages/employee-space.html","/Js/employee-space.js","/scss/employee-space.css"),
  new Route("/espace-administrateur", "Espace administrateur", "/pages/admin-space.html","/Js/admin-space.js","/scss/admin-space.css"),
];

//Le titre s'affiche comme ceci : Route.titre - websitename
export const websiteName = "EcoRide";