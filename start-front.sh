#!/bin/bash

# --- Configuration ---
PORT=3000
# Le répertoire racine à servir par le serveur PHP.
# Puisque ton front est en HTML/CSS/JS pur, c'est probablement le répertoire courant ('.')
# ou un sous-répertoire si tes fichiers sont dans 'public' par exemple.
# Pour l'instant, on suppose que le script est exécuté depuis la racine de ton projet frontend.
FRONTEND_ROOT_DIR="."
OS="$(uname)"
echo "OS détecté : $OS"

# --- Fonctions utilitaires ---

# Fonction pour vérifier si un port est utilisé
is_port_in_use() {
    local port=$1
    lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
    return $?
}

# Fonction pour détecter l'OS et ouvrir le navigateur
open_browser() {
    local url=$1
    local os=$(uname)
    echo "Ouverture du navigateur..."
    case "$os" in
        Darwin*) open -a "Google Chrome" "$url" 2>/dev/null || open "$url" ;;
        Linux*)  xdg-open "$url" 2>/dev/null || (google-chrome "$url" &) ;;
        MINGW*|MSYS*|CYGWIN*|Windows_NT) cmd.exe /C start "chrome" "$url" ;;
        *) echo "Impossible d'ouvrir le navigateur automatiquement sur ce système ($os). Veuillez ouvrir manuellement : $url";;
    esac
}

# --- Script principal ---

echo "--- Démarrage du frontend EcoRide (HTML/CSS/JS) ---"

# 1. Vérifier si le port est déjà utilisé
if is_port_in_use "$PORT"; then
  PID_IN_USE=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t)
  echo "Le port $PORT est déjà utilisé par PID $PID_IN_USE. Veuillez libérer le port ou modifier la configuration."
  echo "Pour libérer le port, vous pouvez utiliser : kill -9 $PID_IN_USE"
  exit 1
fi

# 2. Créer un fichier de log temporaire pour le serveur PHP
# Utilisation de mktemp -t pour s'assurer que le fichier est créé dans /tmp
# et gestion de l'échec de mktemp
LOGFILE=$(mktemp -t php-server-XXXX.log)
if [ $? -ne 0 ]; then
    echo "Erreur : Impossible de créer un fichier de log temporaire."
    exit 1
fi

# 3. Lancer le serveur PHP en arrière-plan
echo "Lancement du serveur PHP intégré pour servir les fichiers depuis '$FRONTEND_ROOT_DIR' sur http://127.0.0.1:$PORT..."
# Le serveur PHP intégré peut servir des fichiers statiques.
# Pour les SPAs, il est souvent nécessaire d'avoir un routeur qui redirige toutes les requêtes
# vers index.html si le fichier demandé n'existe pas.
# Si tu as un fichier 'router.php' pour gérer le routage de ta SPA, tu peux l'utiliser ici:
# php -S 127.0.0.1:"$PORT" -t "$FRONTEND_ROOT_DIR" router.php >"$LOGFILE" 2>&1 &
# Sinon, pour un simple service de fichiers statiques:
php -S 127.0.0.1:"$PORT" -t "$FRONTEND_ROOT_DIR" >"$LOGFILE" 2>&1 &
PHP_PID=$!
PHP_STARTED=false

# Fonction de nettoyage
cleanup() {
  echo
  if $PHP_STARTED; then
    echo "Arrêt du serveur PHP (PID $PHP_PID)..."
    kill "$PHP_PID" 2>/dev/null || true
  fi
  # Supprimer le fichier de log temporaire
  if [ -f "$LOGFILE" ]; then
      rm -f "$LOGFILE"
  fi
}
# Piège Ctrl+C et la sortie normale du script
trap cleanup EXIT SIGINT

# Attendre un peu que PHP démarre
sleep 1

# Vérifier que le processus existe et que le port écoute
if kill -0 "$PHP_PID" >/dev/null 2>&1 && is_port_in_use "$PORT"; then
  PHP_STARTED=true
else
  echo "Le serveur PHP n'a pas réussi à démarrer."
  echo "Veuillez vérifier les logs pour plus de détails :"
  if [ -f "$LOGFILE" ]; then
      cat "$LOGFILE" # Affiche tout le contenu du log
  else
      echo "Fichier de log temporaire '$LOGFILE' introuvable."
  fi
  exit 2
fi

URL="http://127.0.0.1:$PORT/accueil" # J'ai gardé /accueil car tu l'avais mentionné

# Ouvrir le navigateur
open_browser "$URL"

echo "Serveur frontend en écoute sur $URL"
echo "Appuyez sur Ctrl+C pour arrêter le serveur PHP."

# Attendre PHP (bloquant)
wait "$PHP_PID"