#!/bin/bash

# Définir le port
PORT=3000

# Détecter l'OS
OS="$(uname)"
echo "OS détecté : $OS"

# Lancer le serveur PHP intégré
php -S 127.0.0.1:$PORT -t . &
PHP_PID=$!
sleep 1

# Définir le navigateur à ouvrir
if [[ "$OS" == "Darwin" ]]; then
    # macOS
    BROWSER_CMD="open -a Google Chrome"
elif [[ "$OS" == "Linux" ]]; then
    # Linux
    BROWSER_CMD="google-chrome"
else
    # Windows via Git Bash / WSL
    BROWSER_CMD="cmd.exe /C start chrome"
fi

# Lancer BrowserSync pour rafraîchissement automatique
browser-sync start --proxy "127.0.0.1:$PORT" --startPath "/accueil" --files "**/*.php,**/*.css,**/*.js,**/*.html" --browser "google chrome"

# Arrêter PHP quand BrowserSync est fermé
kill $PHP_PID

# "ctrl+cmd+b" pour lancer ce script dans VSCode