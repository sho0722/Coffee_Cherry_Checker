const serviceWorkerVersion = '0.1.0'
const CACHE_NAME = 'CoffeeCherryChecker-v' + serviceWorkerVersion
const CACHE_ASSETS = [
  '/',
  '/index.html',
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
  '/assets/icons/app_icon_144x144.png',
  '/assets/icons/app_icon_96x96.png',
  '/assets/icons/app_icon_72x72.png',
  '/assets/icons/app_icon_48x48.png',
]

// Install service worker
self.addEventListener('install', function (event) {
  console.log('[Service Worker] Installing... version: ' + serviceWorkerVersion + ' cacheName:' + CACHE_NAME) 
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log('[Service Worker] Caching all: app shell and content')
      return cache.addAll(CACHE_ASSETS)
    })
  )
})

// Catch files
self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (r) {
      // console.log('[Service Worker] Fetching resource: ' + event.request.url) // For Debug
      // we don't store falsy objects, so '||' works fine here.
      return r || fetch(event.request).then(function (response) {
        return caches.open(CACHE_NAME).then(function (cache) {
          // console.log('[Service Worker] Caching new resource: ' + event.request.url) // For Debug
          cache.put(event.request, response.clone())
          return response
        })
      })
    })
  )
})

// Activate
self.addEventListener('activate', (event) => {
  console.log('Activating new service worker...')
  const cacheAllowlist = [CACHE_NAME]

  event.waitUntil(
    caches.keys().then((keyList) => {
      // eslint-disable-next-line array-callback-return
      return Promise.all(keyList.map((key) => {
        if (cacheAllowlist.indexOf(key) === -1) {
          console.log('[Service Worker] deleting old cache: ' + CACHE_NAME)
          return caches.delete(key)
        }
      }))
    })
  )
  console.log('done.')
})