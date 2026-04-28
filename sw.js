const CACHE = 'mullify-v2';
const ASSETS = ['/', '/index.html', '/css/app.css', '/manifest.json',
  '/js/firebase-config.js', '/js/auth.js', '/js/db.js', '/js/store.js',
  '/js/courses-data.js', '/js/players.js', '/js/courses.js',
  '/js/round-setup.js', '/js/scorecard.js', '/js/payouts.js',
  '/js/quota.js', '/js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(()=>caches.match('/index.html'))));
});
