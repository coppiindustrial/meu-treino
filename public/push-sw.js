// Avisos de fim do descanso: carregado dentro do service worker do app (vite.config.ts → workbox.importScripts).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Descanso acabou', {
      body: data.body || 'Hora da próxima série.',
      icon: 'pwa-192x192.png',
      tag: 'descanso',
      renotify: true,
      data: { url: './#/sessao' },
    }),
  );
});

// Tocar no aviso abre o app no treino em andamento.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          if ('navigate' in w) await w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
