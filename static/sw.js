const CACHE_NAME = 'planyx-shell-v8';
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

function isIdentityResponse(pathname) {
  return pathname.includes('/callback') || pathname.includes('/logout') || pathname.startsWith('/signed-out');
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

  // Authenticated pages, Microsoft identity responses and the Admin Centre must
  // always receive the current network document. Serving a cached public shell
  // here can leave the browser pointing at JavaScript bundles removed by a newer
  // deployment, producing an unexplained white page after sign-in.
  if (
    request.mode === 'navigate' &&
    (isAdminRoute(url.pathname) || isProtectedNavigation(url.pathname) || isIdentityResponse(url.pathname))
  ) {
    event.respondWith(fetch(request, { cache: 'no-store', redirect: 'follow' }));
    return;
  }

  // Never cache authenticated APIs or identity traffic.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/logout') ||
    url.pathname.includes('/callback') ||
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
