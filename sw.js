// Archivo: sw.js
const CACHE_NAME = 'genapps-v1';

// Evento de instalación
self.addEventListener('install', (e) => {
    console.log('[GenApps] Service Worker Instalado correctamente.');
    self.skipWaiting();
});

// Evento de activación
self.addEventListener('activate', (e) => {
    console.log('[GenApps] Service Worker Activado.');
    return self.clients.claim();
});

// Evento de intercepción de red (Necesario para el criterio de PWA)
self.addEventListener('fetch', (e) => {
    // Por ahora, dejamos que todo pase directo a internet (Online first)
    // En el futuro, aquí se puede configurar el modo Offline
    e.respondWith(fetch(e.request).catch(() => console.log('Sin conexión de red.')));
});
