self.addEventListener('fetch', event => {
    event.respondWith(
      (async () => {
        // On attend la réponse preload si elle existe
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }
        // Sinon on fait une requête réseau classique
        return fetch(event.request);
      })()
    );
  });
