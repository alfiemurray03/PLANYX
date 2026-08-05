# Sousa Murray Planeia Website

Public website for **Sousa Murray Planeia**, a trading division and service line of JA Group Services Ltd.

Production domain: `planyx.jagroupservices.co.uk`

Administrator authentication now uses native Microsoft Entra ID directly through the application.

The Customer Portal also uses native Microsoft Entra External ID through the application.

## Local preview

```powershell
python -m http.server 4174 --directory public
```

Static previews do not run Pages Functions. Use Wrangler Pages to test the complete application:

```powershell
npx wrangler pages dev public --d1 DB=ja-group-services
```

## Enquiry email setup

Production is served by **Cloudflare Pages with Pages Functions**. The form at `/contact/` submits to the single Pages Functions endpoint `/api/enquiries`; the standalone Worker contains no enquiry route.

The enquiry system reuses the email provider configured in the Administrator Control Centre. Cloudflare Pages environment variables remain supported as a fallback, including `RESEND_API_KEY`, `ENQUIRY_FROM_EMAIL` and `ENQUIRY_TO_EMAIL`.

`ENQUIRY_FROM_EMAIL` should use the verified domain, for example:

```text
Sousa Murray Planeia <contact@jagroupservices.co.uk>
```

The Administrator Control Centre email settings take precedence over environment-variable fallbacks.

## Turnstile setup

Configure these values in the production Cloudflare Pages project:

- `TURNSTILE_SITE_KEY` — public widget site key. The existing `turnstile_site_key` database setting is also supported.
- `TURNSTILE_SECRET_KEY` — encrypted secret used only by Pages Functions. The existing `TURNSTILE_SECRET` name remains supported.

For a local or `.pages.dev` preview without Turnstile credentials, verification is disabled automatically. `TURNSTILE_DISABLED=true` may be used only for an explicitly non-production preview. Production fails safely if the keys are missing.

## Generate the XML sitemap

```powershell
node scripts/generate-sitemap.mjs
```

## Deploy

Push `main` to deploy through the connected Cloudflare Pages project.

## Launch notes

- Activity bookings are completed with the named third-party provider.
- No flights, visas, transfers, transport or package holidays are sold.
- The enquiry and contact forms require the Cloudflare Pages Turnstile and email settings described above.
- Headout content will be added when the relevant approved partner material is ready.
- The Privacy Policy, Terms and Conditions and Cookie Policy pages are holding pages and require final approved policies before the relevant public service features are fully launched.
- No selected partner hotels are currently listed.
