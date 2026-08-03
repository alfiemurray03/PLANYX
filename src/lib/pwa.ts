function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function installPwaSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.MODE === 'development') return;

  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  if (isAdminRoute) {
    // The Admin Centre is intentionally never PWA-controlled. Remove legacy
    // workers and their shell caches after the network-only Admin page loads.
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      void caches.keys()
        .then(keys => Promise.all(keys.filter(key => key.startsWith('planyx-shell-')).map(key => caches.delete(key))))
        .catch(() => {});
    }
    return;
  }

  if (isStandaloneApp()) {
    document.documentElement.dataset.displayMode = 'standalone';
    document.cookie = 'ja_pwa_mode=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
  }

  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshedForWorkerUpdate = false;

    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshedForWorkerUpdate) return;
        refreshedForWorkerUpdate = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker.register('/sw.js?v=9', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        void registration.update();
      })
      .catch((error) => {
        console.warn('Planyx service worker registration failed.', error);
      });
  }, { once: true });
}
