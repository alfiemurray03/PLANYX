# Production authentication and portal audit

Date: 2 July 2026  
Production: `https://sousamurrayplaneia.jagroupservices.co.uk`
Authentication: Microsoft Entra ID (administrator) and Microsoft Entra External ID (customer)

## Verified request flow

```text
GET /
  -> public/index.html
  -> site-shell.js loads the shared header and footer
  -> access-header.js requests GET /account/profile with Accept: application/json

GET /account/
  -> middleware checks for an existing customer session
  -> authenticated: 302 /account/dashboard/
  -> signed out: public/account/index.html

GET /account/login/?return_to=/account/dashboard/
  -> functions/account/login.js
  -> beginLogin("customer")
  -> creates one D1 oidc_login_transactions record
  -> sets ja_customer_oidc_tx
  -> redirects to Microsoft Entra External ID

GET /account/auth/callback?code=...&state=...
  -> functions/account/auth/callback.js
  -> completeLogin("customer")
  -> validates state, nonce, PKCE and ID token
  -> syncs available Microsoft claims to profiles
  -> writes customer_oidc_sessions
  -> sets ja_customer_oidc_session
  -> redirects to /account/dashboard/

GET /account/dashboard/
  -> middleware getNativeSession("customer")
  -> injects window.__JA_NATIVE_IDENTITY__ into HTML
  -> dashboard renders the identity immediately
  -> dashboard requests GET /account/profile as JSON

GET /account/profile (Accept: application/json)
  -> middleware getNativeSession("customer")
  -> functions/account/profile.js
  -> getProfile()
  -> reads profiles and consent
  -> returns { profile, consent }
  -> dashboard/profile JavaScript renders the returned fields
```

The administrator flow is the same shape, using `/admin/login`, `/auth/callback`, `admin_oidc_sessions`, `ja_admin_oidc_tx` and `ja_admin_session`. The legacy `/admin/auth/callback` handler remains available for callback compatibility, but new Microsoft authorisation requests use `https://sousamurrayplaneia.jagroupservices.co.uk/auth/callback`.

## Proven divergence: intermittent state validation

The public header previously requested `/account/profile` four times on every page load. When signed out, middleware redirected each JSON request to `/account/login`; every `beginLogin()` call generated a different state and overwrote the same `ja_customer_oidc_tx` cookie. A callback belonging to any earlier request therefore compared its state with a later cookie and failed at the state check.

The correction is two-part:

- signed-out JSON requests now receive `401` JSON and never enter the interactive login flow;
- the public header performs one profile request instead of four timed retries.

## Profile failure boundary

In the production revision that was audited, the visible `Authentication is temporarily unavailable.` response came from middleware's `getNativeSession()` catch. The HTML branch of `functions/account/profile.js` then made a second same-origin HTTP request for `/account/profile/index.html`, which re-entered global middleware and repeated session validation for the same page view.

The HTML branch now uses `context.next()` to continue directly to the static asset handler. This removes the recursive HTTP request and the second session check. Session and profile reads also use schema-tolerant `SELECT *` rows, so optional Microsoft claim columns are consumed when present and do not determine whether a valid core session can be recognised.

## Proven divergence: dashboard never renders

Production sends `Content-Security-Policy: script-src 'self'` and does not permit inline JavaScript. The customer dashboard renderer and the middleware identity bootstrap were both inline scripts. Production therefore displayed the static placeholders, but never executed `loadDashboard()`, never issued the dashboard profile request and never called `renderProfile()`.

The correction keeps the strict CSP in place:

- the customer portal now renders through the shared runtime at `/assets/js/account-portal.js`;
- middleware injects the authenticated identity as inert `<meta>` data rather than executable inline JavaScript;
- the shared portal runtime parses that metadata and renders the signed-in identity immediately;
- page-specific data is requested only where required (for example profile, requests or security data), reducing unnecessary network requests;
- the subsequent profile JSON response enriches the display with stored Microsoft Entra, customer and Stripe fields.

## Middleware decisions

- `/account/` and `/admin/` are signed-out landing pages. Existing sessions redirect directly to their dashboard.
- Login, callback and logout endpoints are public authentication endpoints.
- Other `/account/*` routes require a customer session.
- Other `/admin/*` routes require an administrator session and an active authorised administrator record.
- Unauthenticated HTML navigation redirects to the correct realm login and preserves `return_to`.
- Unauthenticated JSON calls return `401` and do not start an interactive login.
- Unsafe cross-origin authenticated requests are rejected.
- Blocked, closed, disabled or suspended customer records are rejected.

## Protected routes

Customer functions: `/account/profile`, `/account/requests`, `/account/enquiries-api` and the static dashboard, profile, enquiries, settings and subscription pages beneath `/account/`.

Administrator functions: `/admin/api`, `/admin/customers`, `/admin/customer` and the dashboard beneath `/admin/`. The Administrator Control Centre is a single-page application with 24 navigation sections. Every navigation section has a title, renderer and API section handler.

## D1 access inventory

Authentication (`functions/_shared/oidc.js`):

- reads/writes `oidc_login_transactions` for state, nonce, PKCE verifier, expiry and single use;
- writes `customer_oidc_sessions` and `admin_oidc_sessions` on callback;
- reads the appropriate session table on protected requests;
- revokes the appropriate session table on logout;
- synchronises available customer Microsoft claims into `profiles` on customer callback.

Customer portal:

- `functions/account/profile.js` reads/writes `profiles`, reads `service_plans` and `customer_consents`, and handles customer profile/consent updates;
- `functions/account/requests.js` reads/writes customer data-protection requests, system reports, closure requests and their associated messages/history;
- `functions/account/enquiries-api.js` and shared enquiry helpers read/write enquiries, messages, history and notifications.

Administrator portal:

- `functions/admin/api.js` is the main read/write router for administrators, roles, permissions, preferences, sessions, profiles, plans, policies, branding, support, enquiries, system events/reports, data-protection requests, closure requests, affiliate content, appearance, email, maintenance, Launch Gateway settings, Stripe settings and audit records;
- `functions/admin/customers.js` and `functions/admin/customer.js` provide CRM list/detail operations and customer record updates.

Public/business functions:

- `functions/site-settings.js` reads public branding/theme settings;
- `functions/plans-data.js` reads published plan data;
- `functions/api/enquiries.js` and shared enquiry helpers write public enquiries and related operational records;
- `functions/create-checkout-session.js` reads plan/settings data before creating Stripe Checkout sessions;
- `functions/stripe-webhook.js` writes Stripe/customer state from verified webhook events;
- `functions/api/status.js` and policy/settings functions read the relevant published operational content.

## Production verification gate

Local checks do not establish production success. Completion requires a deployed revision followed by one real customer sign-in and one real administrator sign-in, including every administrator navigation section and the customer dashboard/profile JSON response.
