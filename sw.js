// Mullify Service Worker — force cache bust by incrementing version
const CACHE_VERSION = 'mullify-v3-' + Date.now();

self.addEventListener('install', e => {
  // Skip waiting immediately — don't wait for old SW to die
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Kill ALL old caches immediately
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept external APIs or Firebase
  if (url.includes('golfcourseapi.com') ||
      url.includes('firebaseio.com') ||
      url.includes('firebase.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('firebaseapp.com')) {
    return;
  }

  // Always fetch HTML fresh — never serve stale
  if (e.request.mode === 'navigate' ||
      url.endsWith('.html') ||
      url.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS and CSS — network first, no caching
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request))
  );
});
