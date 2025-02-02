const CACHE_VERSION = '0.1.0'; // Change version number when updating
const CACHE_NAME = 'CoffeeCherryChecker-v' + CACHE_VERSION;
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/css/ress.css',
  '/assets/css/splide.min.css',
  '/assets/js/main.js',
  '/assets/js/opencv.js',
  '/assets/js/heic2any.min.js',
  '/assets/js/splide.min.js',
  '/assets/js/chart.umd.min.js',
  '/assets/images/icon_camera.svg',
  '/assets/images/img_bg.png',
  '/assets/icons/app_icon_512x512.png',
  '/assets/icons/app_icon_192x192.png',
  '/assets/icons/app_icon_96x96.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon.ico',
  '/assets/icons/favicon.svg',
]

// Install service worker
self.addEventListener('install', function (event) {
  console.log('[Service Worker] Installing new version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async function (cache) {
      console.log('[Service Worker] Caching all: app shell and content');

      const cachePromises = CACHE_ASSETS.map(url => {
        return fetch(url).then(response => {
          if (!response.ok) throw new Error(`Failed to fetch ${url}`);
          return cache.put(url, response);
        }).catch(error => {
          console.warn(`Skipping ${url}:`, error);
        });
      });

      return Promise.all(cachePromises);
    }).then(() => {
      self.skipWaiting();
    })
  );
})

// Catch files
self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (r) {
      return r || fetch(event.request).then(function (response) {
        return caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, response.clone())
          return response
        })
      })
    })
  )
})

// Activate
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating new service worker...');

  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // すぐに新しいバージョンを適用
    })
  );

  // Send notification
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
        clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
    })
  );
});

// Receive message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
      self.skipWaiting();
  }
});