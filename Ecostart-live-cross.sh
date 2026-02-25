#!/bin/bash

# Définir le port unique
PORT=3000

# Détecter l'OS
OS="$(uname)"
echo "OS détecté : $OS"

# 1. Tuer tout processus qui utiliserait déjà le port 3000 (pour éviter les erreurs)
echo "Nettoyage du port $PORT..."
lsof -ti :$PORT | xargs kill -9 2>/dev/null || true

# 2. Lancer le serveur PHP intégré sur 127.0.0.1:3000
echo "Démarrage du serveur PHP sur http://127.0.0.1:$PORT..."
php -S 127.0.0.1:$PORT -t . &
PHP_PID=$!

# Attendre une seconde que le serveur soit prêt
sleep 1

# 3. Ouvrir les navigateurs sur l'URL directe
URL="http://127.0.0.1:$PORT/accueil"

if [[ "$OS" == "Darwin" ]]; then
    # macOS : Ouvrir Chrome ET Safari
    open -a "Google Chrome" "$URL"
    open -a "Safari" "$URL"
elif [[ "$OS" == "Linux" ]]; then
    google-chrome "$URL" &
else
    # Windows
    cmd.exe /C start chrome "$URL"
fi

echo "Serveur en cours d'exécution (PID: $PHP_PID). Appuyez sur Ctrl+C pour arrêter."

# Maintenir le script en vie pour garder le serveur PHP actif
wait $PHP_PID