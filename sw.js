const CACHE = 'mullify-v3';
const ASSETS = ['/', '/index.html', '/css/app.css', '/manifest.json',
  '/js/firebase-config.js', '/js/auth.js', '/js/db.js', '/js/store.js',
  '/js/courses-data.js', '/js/players.js', '/js/courses.js',
  '/js/round-setup.js', '/js/scorecard.js', '/js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never intercept external API calls — let them go straight to network
  if (url.includes('golfcourseapi.com') ||
      url.includes('firebaseio.com') ||
      url.includes('firebase.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com')) {
    return; // Let browser handle it normally
  }
  // For local assets — cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});
