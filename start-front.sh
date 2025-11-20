#!/bin/bash

PORT=3000
OS="$(uname)"
echo "OS détecté : $OS"

# Vérifier si le port est déjà utilisé
if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  PID_IN_USE=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t)
  echo "Le port $PORT est déjà utilisé par PID $PID_IN_USE. Abandon."
  exit 1
fi

LOGFILE="$(mktemp /tmp/php-server-XXXX.log)"

# Lancer le serveur PHP en arrière-plan (stdout/stderr dans logfile)
php -S 127.0.0.1:"$PORT" -t . >"$LOGFILE" 2>&1 &
PHP_PID=$!
PHP_STARTED=false

# cleanup seulement si on a démarré PHP
cleanup() {
  echo
  if $PHP_STARTED; then
    echo "Arrêt du serveur PHP (PID $PHP_PID)..."
    kill "$PHP_PID" 2>/dev/null || true
  fi
  rm -f "$LOGFILE"
}
trap cleanup EXIT

# attendre un peu que PHP démarre
sleep 0.5

# vérifier que le process existe et que le port écoute
if kill -0 "$PHP_PID" >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  PHP_STARTED=true
else
  echo "Le serveur PHP n'a pas réussi à démarrer. Logs :"
  sed -n '1,200p' "$LOGFILE"
  exit 2
fi

URL="http://127.0.0.1:$PORT/accueil"

# Ouvrir le navigateur (selon OS)
case "$OS" in
  Darwin*) open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL" ;;
  Linux*)  xdg-open "$URL" 2>/dev/null || (google-chrome "$URL" &) ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT) cmd.exe /C start "chrome" "$URL" ;;
  *) echo "Ouvrez manuellement : $URL" ;;
esac

echo "Serveur en écoute sur $URL"
echo "Appuyez sur Ctrl+C pour arrêter et tuer le serveur PHP."

# Attendre PHP (bloquant)
wait "$PHP_PID"