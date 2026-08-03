const CACHE_NAME = 'planyx-shell-v9';
const PUBLIC_LAUNCH = '/?source=pwa&launch=public-v8';
const SHELL = ['/', PUBLIC_LAUNCH, '/manifest.webmanifest?v=8', '/pwa-icon.svg', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isProtectedNavigation(pathname) {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/') ||
    pathname === '/builders' || pathname.startsWith('/builders/') ||
    pathname === '/documents' || pathname.startsWith('/documents/') ||
    pathname === '/settings' || pathname.startsWith('/settings/') ||
    pathname === '/admin' || pathname.startsWith('/admin/') ||
    pathname === '/account' || pathname.startsWith('/account/') ||
    pathname === '/sign-in' || pathname.startsWith('/sign-in/');
}

function isIdentityNavigation(pathname) {
  return pathname === '/account/login' || pathname.startsWith('/account/login/') ||
    pathname === '/account/auth/callback' || pathname.startsWith('/account/auth/callback/') ||
    pathname === '/account/logout' || pathname.startsWith('/account/logout/') ||
    pathname === '/auth/login' || pathname.startsWith('/auth/login/') ||
    pathname === '/auth/callback' || pathname.startsWith('/auth/callback/') ||
    pathname === '/auth/logout' || pathname.startsWith('/auth/logout/') ||
    pathname === '/admin/login' || pathname.startsWith('/admin/login/') ||
    pathname === '/admin/auth/callback' || pathname.startsWith('/admin/auth/callback/') ||
    pathname === '/admin/logout' || pathname.startsWith('/admin/logout/') ||
    pathname === '/signed-out' || pathname.startsWith('/signed-out/');
}

function isAdminRoute(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

async function publicLaunchResponse() {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(PUBLIC_LAUNCH)) || (await cache.match('/')) || fetch(PUBLIC_LAUNCH, { cache: 'no-store' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The browser, not the service worker, must own Microsoft sign-in, callback
  // and sign-out navigations. These endpoints can issue cross-origin redirects
  // to ciamlogin.com, and wrapping them in event.respondWith(fetch(...)) can turn
  // a valid top-level redirect into ERR_FAILED.
  if (request.mode === 'navigate' && isIdentityNavigation(url.pathname)) return;

  // Authenticated application pages and the Admin Centre always receive the
  // current network document. They are never served from the cached public shell.
  if (
    request.mode === 'navigate' &&
    (isAdminRoute(url.pathname) || isProtectedNavigation(url.pathname))
  ) {
    event.respondWith(fetch(request, { cache: 'no-store', redirect: 'follow' }));
    return;
  }

  // Never cache authenticated APIs or identity traffic.
  if (
    url.pathname.startsWith('/api/') ||
    isIdentityNavigation(url.pathname) ||
    isProtectedNavigation(url.pathname)
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || publicLaunchResponse()),
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        });
        return cached || network;
      }),
    );
  }

  if (request.destination === 'manifest') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('/manifest.webmanifest?v=8')));
  }
});
