# Service worker login redirect incident

Date: 3 August 2026

## Symptom

Navigating to `/account/login?return_to=%2Fdashboard` produced Microsoft Edge `ERR_FAILED` before the browser reached Microsoft External ID.

## Cause

The Planyx service worker classified every `/account/*` navigation as a protected application page and handled it with `event.respondWith(fetch(request, { redirect: 'follow' }))`.

`/account/login` is not an application document. It is a server-side identity endpoint whose response redirects the top-level browser to the Microsoft `ciamlogin.com` authority. A service worker must not take ownership of that cross-origin top-level identity redirect. Doing so can convert the otherwise valid navigation into a failed service-worker fetch.

A new tab does not avoid this because a service worker controls the whole registered Planyx scope, not an individual tab.

## Correction

Microsoft login, callback, logout and signed-out navigations are allowed to bypass the service worker completely. The browser therefore owns the cross-origin navigation and redirect chain. Authenticated Planyx application pages remain network-only and are never served from the public offline shell.
