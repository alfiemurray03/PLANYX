import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminMobile = await readFile(new URL('../src/styles/admin-mobile.css', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const pwa = await readFile(new URL('../src/lib/pwa.ts', import.meta.url), 'utf8');
const authContext = await readFile(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../static/manifest.webmanifest', import.meta.url), 'utf8'));
const serviceWorker = await readFile(new URL('../static/sw.js', import.meta.url), 'utf8');
const publicServiceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');


test('Admin Portal supports horizontal touch scrolling on mobile', () => {
  assert.match(adminMobile, /\.admin-portal main[\s\S]*overflow-x: auto/);
  assert.match(adminMobile, /-webkit-overflow-scrolling: touch/);
  assert.match(adminMobile, /touch-action: pan-x pan-y/);
  assert.match(adminMobile, /min-width: max\(720px, 100%\)/);
  assert.match(adminMobile, /env\(safe-area-inset-bottom\)/);
});


test('mobile web app launches only on public pages', () => {
  assert.equal(manifest.id, '/?app=planyx-v8');
  assert.equal(manifest.name, 'Planyx');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/?source=pwa&launch=public-v8');
  assert.ok(manifest.icons.some((icon) => String(icon.purpose).includes('maskable')));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === '/?source=pwa&launch=public-v8'));
  assert.ok(manifest.shortcuts.some((shortcut) => String(shortcut.url).startsWith('/help-centre')));
  assert.ok(!manifest.shortcuts.some((shortcut) => ['/dashboard', '/admin', '/builders', '/sign-in'].includes(shortcut.url)));
});


test('standalone launch guard recovers installed copies from protected pages', () => {
  assert.match(index, /display-mode: standalone/);
  assert.match(index, /window\.navigator\.standalone === true/);
  assert.match(index, /path === '\/builders'/);
  assert.match(index, /path === '\/dashboard'/);
  assert.match(index, /window\.location\.replace\('\/\?source=pwa&launch=public-v8'\)/);
  assert.match(index, /isIdentityResponse/);
});


test('authenticated application pages bypass the cached public shell', () => {
  assert.match(main, /installPwaSupport\(\)/);
  assert.match(pwa, /serviceWorker\.register\('\/sw\.js\?v=9'/);
  assert.match(pwa, /updateViaCache: 'none'/);
  assert.match(pwa, /controllerchange/);
  assert.match(serviceWorker, /planyx-shell-v9/);
  assert.match(serviceWorker, /isProtectedNavigation/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: 'no-store', redirect: 'follow' \}\)/);
  assert.doesNotMatch(serviceWorker, /isColdProtectedLaunch/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /request\.destination === 'manifest'/);
  assert.equal(publicServiceWorker, serviceWorker, 'The production and static service-worker sources must remain identical.');
});


test('Microsoft identity navigations remain browser-owned', () => {
  assert.match(serviceWorker, /function isIdentityNavigation/);
  assert.match(serviceWorker, /pathname === '\/account\/login'/);
  assert.match(serviceWorker, /pathname === '\/account\/auth\/callback'/);
  assert.match(serviceWorker, /pathname === '\/account\/logout'/);
  assert.match(serviceWorker, /if \(request\.mode === 'navigate' && isIdentityNavigation\(url\.pathname\)\) return;/);

  const identityBypass = serviceWorker.indexOf("if (request.mode === 'navigate' && isIdentityNavigation(url.pathname)) return;");
  const applicationRespondWith = serviceWorker.indexOf("event.respondWith(fetch(request, { cache: 'no-store', redirect: 'follow' }));");
  assert.ok(identityBypass >= 0 && identityBypass < applicationRespondWith, 'Identity routes must bypass the worker before any respondWith branch.');
});


test('customer authentication cannot remain on an unexplained loading screen', () => {
  assert.match(authContext, /session_revoked/);
  assert.match(authContext, /explicitlyBlocked/);
  assert.match(authContext, /finally[\s\S]*setIsLoading\(false\)/);
  assert.match(authContext, /if \(!allowed\) \{[\s\S]*setUser\(null\)/);
  assert.match(authContext, /session_register_temporarily_unavailable/);
});


test('HTML includes accessible iPhone and Android web app metadata', () => {
  assert.match(index, /<html lang="en-GB" dir="ltr">/);
  assert.match(index, /rel="manifest" href="\/manifest\.webmanifest\?v=8"/);
  assert.match(index, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(index, /viewport-fit=cover/);
  assert.match(index, /color-scheme" content="light dark"/);
});
