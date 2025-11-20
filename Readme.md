# Projet EcoRide

Ce projet est composé de deux parties principales : un frontend (HTML/CSS/JavaScript pur) et un backend (Symfony avec API Platform), ainsi qu'une base de données MySQL gérée via Docker Compose.

Ce `README.md` vous guidera à travers les étapes nécessaires pour installer, configurer et lancer l'application.

## Prérequis

Avant de commencer, assurez-vous d'avoir les éléments suivants installés sur votre machine :

* **Git** — pour cloner les dépôts du projet.  

* **Docker Desktop** — pour faire fonctionner la base de données MySQL et phpMyAdmin.  
  https://www.docker.com/products/docker-desktop/  

* **PHP** — le serveur PHP intégré est utilisé pour servir le frontend.  
  macOS (Homebrew) : https://formulae.brew.sh/formula/php  
  Linux : https://www.php.net/manual/fr/install.unix.php  
  Windows : https://www.php.net/manual/fr/install.windows.php  

* **Composer** — gestionnaire de dépendances PHP pour Symfony.  
  https://getcomposer.org/download/  

* **Symfony CLI** — outil en ligne de commande Symfony.  
  https://symfony.com/download  

* **Un navigateur web moderne** (Chrome, Firefox, Safari, Edge).

## Installation du projet

1) Cloner les dépôts  
- Ouvrez un terminal puis :  
  cd ~/Documents/Cours\ Studi/ECF/WEB/  
  git clone [URL_DE_VOTRE_DEPOT_FRONTEND] EcoRide-Front  
  git clone [URL_DE_VOTRE_DEPOT_BACKEND] EcoRide-Back

(Remplacez les URL par vos URL Git réelles.)

## Configuration du backend (EcoRide-Back)

1) Aller dans le dossier du backend  
cd ~/Documents/Cours\ Studi/ECF/WEB/EcoRide-Back

2) Installer les dépendances Composer  
composer install

3) Fichier .env — exemple de configuration de la base de données  
# .env  
DATABASE_URL="mysql://kevin:kevin_password@127.0.0.1:3310/sf_EcoRide?serverVersion=8.0.32&charset=utf8mb4"

Note : le port 3310 est le port exposé par Docker sur la machine hôte.

4) Exemple de docker-compose.yml (pour MySQL + phpMyAdmin)
version: '3.8'
services:
  db_ecoride:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword_ecoride
      MYSQL_DATABASE: sf_EcoRide
      MYSQL_USER: kevin
      MYSQL_PASSWORD: kevin_password
    ports:
      - "3310:3306"
    volumes:
      - ecoride_db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "kevin", "--password=kevin_password"]
      interval: 5s
      timeout: 10s
      retries: 5
      start_period: 30s

  phpmyadmin_ecoride:
    image: phpmyadmin/phpmyadmin
    restart: unless-stopped
    depends_on:
      db_ecoride:
        condition: service_healthy
    environment:
      PMA_HOST: db_ecoride
      PMA_USER: root
      PMA_PASSWORD: rootpassword_ecoride
    volumes:
      - ./phpmyadmin/config.user.inc.php:/etc/phpmyadmin/config.user.inc.php:ro
    ports:
      - "8082:80"

volumes:
  ecoride_db_data:

(Placez ce fichier docker-compose.yml à l'emplacement prévu.)

## Scripts de démarrage

Rendre les scripts exécutables (depuis chaque repo)  
cd ~/Documents/Cours\ Studi/ECF/WEB/EcoRide-Front  
chmod +x start-front.sh

cd ~/Documents/Cours\ Studi/ECF/WEB/EcoRide-Back  
chmod +x start-back-docker.sh

## Lancement de l'application

1) Démarrer le backend et la base de données  
cd ~/Documents/Cours\ Studi/ECF/WEB/EcoRide-Back  
./start-back-docker.sh

Ce script doit :  
* démarrer les conteneurs Docker (MySQL sur 3310, phpMyAdmin sur 8082),  
* exécuter les migrations Doctrine,  
* lancer le serveur Symfony sur le port 8000,  
* ouvrir le navigateur sur http://localhost:8000/login et http://localhost:8082 (si configuré).

Points d'accès :  
* Formulaire de connexion / CRUD : http://localhost:8000/login  
* API Platform : http://localhost:8000/api  
* phpMyAdmin : http://localhost:8082

2) Accéder à phpMyAdmin  
Ouvrez http://localhost:8082  
Identifiants : utilisateur root / mot de passe rootpassword_ecoride

Importation des données initiales (si besoin) : dans phpMyAdmin → Importer → choisir ecf_dump_sf_EcoRide_with_users.sql → Exécuter.

Remarque : n’exécutez add_users.sql qu’une seule fois si vous l’utilisez séparément (pour éviter les doublons).

3) Démarrer le frontend  
cd ~/Documents/Cours\ Studi/ECF/WEB/EcoRide-Front  
./start-front.sh

Le script démarre un serveur (PHP intégré ou http-server selon votre config) pour servir le frontend sur le port 3000 et ouvre http://localhost:3000/accueil.

4) Arrêt des services  
Appuyez sur Ctrl+C dans les terminaux où les scripts sont lancés. Les scripts sont prévus pour nettoyer les processus/containers.

## Comptes de test

Admin  
Email : admin@example.com  
Mot de passe : AdminPass!2025  
Rôles : ROLE_USER, ROLE_EMPLOYE, ROLE_ADMIN

Employé  
Email : employe@example.com  
Mot de passe : EmployerPass!2025  
Rôles : ROLE_USER, ROLE_EMPLOYE

Utilisateur simple  
Email : user@example.com  
Mot de passe : UserPass!2025  
Rôles : ROLE_USER

---

Si tu as besoin d’aide supplémentaire, n’hésite pas à me demander.
