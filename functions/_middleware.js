function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAccessIdentity(request) {
  return String(request.headers.get("x-ja-auth-email") || "").trim().toLowerCase();
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk";
  return String(raw).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function isAdminRequest(request, env) {
  const email = getAccessIdentity(request);
  if (!email) return false;
  const configured = configuredAdmins(env).includes(email);
  if (!env.DB) return configured;

  try {
    const admin = await env.DB.prepare(`SELECT * FROM admin_users WHERE lower(email) = lower(?)`).bind(email).first();
    const status = String(admin?.status || "Active").trim().toLowerCase();
    if (admin && ["blocked", "closed", "disabled", "inactive", "suspended"].includes(status)) return false;
    return configured || Boolean(admin);
  } catch {
    return configured;
  }
}

function pageHtml(settings, page) {
  const prefix = page === "launch-gateway" ? "launchgateway" : "maintenance";
  const mode = settings[`${prefix}_content_mode`] === "html" ? "html" : "plain";
  const content = String(settings[`${prefix}_content`] ?? "");

  if (mode === "html") return content;

  const title = prefix === "launchgateway" ? "Launch Gateway" : (settings.maintenance_title || "We are making Sousa Murray Planeia even better");
  const plainContent = escapeHtml(content).replace(/\r?\n/g, "<br>");

  if (prefix === "maintenance") {
    const reason = escapeHtml(settings.maintenance_reason || "Planned platform maintenance");
    const message = escapeHtml(settings.maintenance_message || content || "Sousa Murray Planeia is temporarily unavailable while our team completes essential improvements.");
    const started = escapeHtml(settings.maintenance_start || "");
    const expected = escapeHtml(settings.maintenance_expected_return || "");
    const contact = escapeHtml(settings.maintenance_contact_text || "Need help while we are away? Contact contact@jagroupservices.co.uk or call 020 3834 2790.");
    return `<!doctype html><html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Sousa Murray Planeia</title><meta name="robots" content="noindex,nofollow"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#07101f;color:#eef6ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 15%,rgba(37,99,235,.24),transparent 34%),radial-gradient(circle at 85% 75%,rgba(6,182,212,.14),transparent 32%)}
.shell{position:relative;min-height:100vh;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:min(1120px,calc(100% - 2rem));margin:0 auto;padding:1.4rem 0;border-bottom:1px solid rgba(148,163,184,.16)}
.logo{height:42px;width:auto;max-width:180px;object-fit:contain}.status{display:inline-flex;align-items:center;gap:.55rem;color:#a9c3e6;font-size:.8rem}.dot{width:8px;height:8px;border-radius:999px;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.1)}
main{flex:1;display:grid;place-items:center;width:min(920px,calc(100% - 2rem));margin:0 auto;padding:clamp(3rem,8vw,7rem) 0}.card{width:100%;border:1px solid rgba(96,165,250,.22);border-radius:24px;background:linear-gradient(145deg,rgba(15,30,51,.88),rgba(9,20,37,.92));box-shadow:0 28px 90px rgba(0,0,0,.28);padding:clamp(1.5rem,5vw,3.5rem)}
.eyebrow{display:inline-flex;margin:0 0 1.15rem;color:#7dd3fc;font-size:.76rem;font-weight:650;letter-spacing:.1em;text-transform:uppercase}h1{max-width:760px;margin:0;font-size:clamp(2rem,5vw,4.2rem);font-weight:560;line-height:1.06;letter-spacing:-.045em}h1 span{color:#60a5fa}.message{max-width:700px;margin:1.35rem 0 0;color:#b9cbe2;font-size:clamp(1rem,2vw,1.15rem);line-height:1.75}
.timeline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:2rem;overflow:hidden;border:1px solid rgba(148,163,184,.17);border-radius:16px;background:rgba(148,163,184,.17)}.time{padding:1rem 1.15rem;background:rgba(6,16,31,.74)}.time small{display:block;margin-bottom:.35rem;color:#7187a5;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.time strong{font-size:.94rem;font-weight:520;color:#ddecff}
.contact{margin:1.25rem 0 0;padding:1rem 1.15rem;border-left:2px solid #3b82f6;border-radius:0 12px 12px 0;background:rgba(37,99,235,.09);color:#a9c3e6;font-size:.9rem;line-height:1.65}footer{width:min(1120px,calc(100% - 2rem));margin:0 auto;padding:1.4rem 0 2rem;border-top:1px solid rgba(148,163,184,.16);display:flex;justify-content:space-between;gap:1rem;color:#7187a5;font-size:.76rem}footer a{color:#9ab7da;text-decoration:none}footer nav{display:flex;gap:1rem;flex-wrap:wrap}
@media(max-width:640px){.top{padding-top:1rem}.logo{height:34px}.timeline{grid-template-columns:1fr}footer{flex-direction:column}.status{font-size:.72rem}}
</style></head><body><div class="shell">
<header class="top"><span class="brand-wordmark" style="font-weight:800;letter-spacing:-.02em;color:inherit">Sousa Murray Planeia</span><div class="status"><span class="dot"></span>Maintenance in progress</div></header>
<main><section class="card" aria-labelledby="maintenance-title"><p class="eyebrow">${reason}</p><h1 id="maintenance-title">${escapeHtml(title).replace("Sousa Murray Planeia", "<span>Sousa Murray Planeia</span>")}</h1><p class="message">${message}</p>
${(started || expected) ? `<div class="timeline">${started ? `<div class="time"><small>Work started</small><strong data-date="${started}">${started}</strong></div>` : ""}${expected ? `<div class="time"><small>Expected return</small><strong data-date="${expected}">${expected}</strong></div>` : ""}</div>` : ""}
<p class="contact">${contact}</p></section></main><footer><span>© ${new Date().getFullYear()} Sousa Murray Planeia · Operated by JA Group Services Ltd</span><nav><a href="/legal/terms/">Terms</a><a href="/legal/privacy/">Privacy</a><a href="/legal/cookies/">Cookies</a></nav></footer>
</div><script>document.querySelectorAll("[data-date]").forEach(function(el){var d=new Date(el.dataset.date);if(!isNaN(d))el.textContent=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(d)})</script></body></html>`;
  }

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="robots" content="noindex,nofollow"><link rel="shortcut icon" href="/assets/favicons/favicon.ico?v=20260704-1" type="image/x-icon">
  <link rel="apple-touch-icon" href="/assets/favicons/apple-touch-icon.png?v=20260704-1">
  <link rel="manifest" href="/assets/favicons/site.webmanifest?v=20260704-1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: clamp(1.25rem, 5vw, 4rem);
      background: #f6f7f9;
      color: #111827;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(760px, 100%);
      border: 1px solid #e2e6eb;
      border-radius: 14px;
      background: #ffffff;
      padding: clamp(1.5rem, 5vw, 3.5rem);
      box-shadow: 0 18px 50px rgba(16, 24, 40, .08);
      font-size: clamp(1rem, 2.5vw, 1.125rem);
      line-height: 1.75;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <main>${plainContent}</main>
</body>
</html>`;
}

function contactStatusHtml(settings, mode) {
  const maintenance = mode === "maintenance";
  const title = maintenance ? (settings.contact_maintenance_title || "Contact support is temporarily unavailable") : "Contact Us is currently offline";
  const reason = maintenance ? (settings.contact_maintenance_reason || "Contact service maintenance") : "Contact page unavailable";
  const message = maintenance ? (settings.contact_maintenance_message || "We are carrying out essential work on the Sousa Murray Planeia contact service. Please check back shortly.") : (settings.contact_offline_message || "The Contact Us page is currently offline.");
  const started = maintenance ? escapeHtml(settings.contact_maintenance_start || "") : "";
  const expected = maintenance ? escapeHtml(settings.contact_maintenance_expected_return || "") : "";
  const statusLabel = maintenance ? "Maintenance in progress" : "Contact page offline";
  return `<!doctype html><html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Sousa Murray Planeia</title><meta name="robots" content="noindex,nofollow"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#07101f;color:#eef6ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 14% 12%,rgba(37,99,235,.23),transparent 35%),radial-gradient(circle at 86% 78%,rgba(14,165,233,.12),transparent 32%)}.shell{position:relative;min-height:100vh;display:flex;flex-direction:column}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:min(1120px,calc(100% - 2rem));margin:0 auto;padding:1.4rem 0;border-bottom:1px solid rgba(148,163,184,.16)}.logo{height:42px;width:auto;max-width:180px;object-fit:contain}.status{display:inline-flex;align-items:center;gap:.55rem;color:#a9c3e6;font-size:.8rem}.dot{width:8px;height:8px;border-radius:999px;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.1)}main{flex:1;display:grid;place-items:center;width:min(900px,calc(100% - 2rem));margin:0 auto;padding:clamp(3rem,8vw,7rem) 0}.card{width:100%;border:1px solid rgba(96,165,250,.22);border-radius:24px;background:linear-gradient(145deg,rgba(15,30,51,.88),rgba(9,20,37,.92));box-shadow:0 28px 90px rgba(0,0,0,.28);padding:clamp(1.5rem,5vw,3.5rem)}.eyebrow{display:inline-flex;margin:0 0 1.15rem;color:#7dd3fc;font-size:.76rem;font-weight:650;letter-spacing:.1em;text-transform:uppercase}h1{max-width:760px;margin:0;font-size:clamp(2rem,5vw,4rem);font-weight:560;line-height:1.08;letter-spacing:-.04em}.message{max-width:700px;margin:1.35rem 0 0;color:#b9cbe2;font-size:clamp(1rem,2vw,1.15rem);line-height:1.75}.timeline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:2rem;overflow:hidden;border:1px solid rgba(148,163,184,.17);border-radius:16px;background:rgba(148,163,184,.17)}.time{padding:1rem 1.15rem;background:rgba(6,16,31,.74)}.time small{display:block;margin-bottom:.35rem;color:#7187a5;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.time strong{font-size:.94rem;font-weight:520;color:#ddecff}.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}.actions a{display:inline-flex;align-items:center;min-height:42px;padding:.65rem 1rem;border-radius:10px;border:1px solid rgba(96,165,250,.3);color:#bfdbfe;text-decoration:none;background:rgba(37,99,235,.1);font-size:.86rem;font-weight:650}footer{width:min(1120px,calc(100% - 2rem));margin:0 auto;padding:1.4rem 0 2rem;border-top:1px solid rgba(148,163,184,.16);display:flex;justify-content:space-between;gap:1rem;color:#7187a5;font-size:.76rem}footer a{color:#9ab7da;text-decoration:none}footer nav{display:flex;gap:1rem;flex-wrap:wrap}@media(max-width:640px){.top{padding-top:1rem}.logo{height:34px}.timeline{grid-template-columns:1fr}footer{flex-direction:column}.status{font-size:.72rem}}</style></head><body><div class="shell"><header class="top"><a href="/"><span class="brand-wordmark" style="font-weight:800;letter-spacing:-.02em;color:inherit">Sousa Murray Planeia</span></a><div class="status"><span class="dot"></span>${escapeHtml(statusLabel)}</div></header><main><section class="card"><p class="eyebrow">${escapeHtml(reason)}</p><h1>${escapeHtml(title)}</h1><p class="message">${escapeHtml(message)}</p>${(started || expected) ? `<div class="timeline">${started ? `<div class="time"><small>Work started</small><strong data-date="${started}">${started}</strong></div>` : ""}${expected ? `<div class="time"><small>Expected return</small><strong data-date="${expected}">${expected}</strong></div>` : ""}</div>` : ""}<div class="actions"><a href="/">Return to Sousa Murray Planeia</a><a href="mailto:contact@jagroupservices.co.uk">Email Sousa Murray Planeia support</a></div></section></main><footer><span>© ${new Date().getFullYear()} Sousa Murray Planeia · Operated by JA Group Services Ltd</span><nav><a href="/legal/terms/">Terms</a><a href="/legal/privacy/">Privacy</a><a href="/legal/cookies/">Cookies</a></nav></footer></div><script>document.querySelectorAll("[data-date]").forEach(function(el){var d=new Date(el.dataset.date);if(!isNaN(d))el.textContent=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(d)})</script></body></html>`;
}

async function getSiteSettings(DB) {
  try {
    const result = await DB.prepare(`
      SELECT key, value
      FROM site_settings
      WHERE key IN (
        'maintenance_enabled',
        'maintenance_content_mode',
        'maintenance_content',
        'maintenance_title',
        'maintenance_reason',
        'maintenance_message',
        'maintenance_start',
        'maintenance_expected_return',
        'maintenance_contact_text',
        'contact_page_status',
        'contact_maintenance_title',
        'contact_maintenance_reason',
        'contact_maintenance_message',
        'contact_maintenance_start',
        'contact_maintenance_expected_return',
        'contact_offline_message',
        'launchgateway_enabled',
        'launchgateway_content_mode',
        'launchgateway_content',
        'site_theme_mode',
        'site_status'
      )
    `).all();

    const settings = {};

    for (const row of result.results || []) {
      settings[row.key] = row.value;
    }

    return settings;
  } catch {
    return {
      maintenance_enabled: "true",
      maintenance_content_mode: "plain",
      maintenance_content: "We are temporarily unavailable while we resolve a technical issue. Please check back shortly.",
      launchgateway_enabled: "false",
      launchgateway_content_mode: "plain",
      launchgateway_content: "",
      site_theme_mode: "dark",
      site_status: "maintenance",
      contact_page_status: "online"
    };
  }
}

function injectTheme(html, settings) {
  const mode = ["light", "dark", "system"].includes(settings.site_theme_mode) ? settings.site_theme_mode : "dark";
  const themeScript = `<script>document.documentElement.dataset.siteTheme=${JSON.stringify(mode)};</script>`;
  const themeStyle = `<style>
    html[data-site-theme="dark"] body {
      background-color: #0b1220;
      color-scheme: dark;
    }
    html[data-site-theme="dark"] .section,
    html[data-site-theme="dark"] .page-hero,
    html[data-site-theme="dark"] .info-card,
    html[data-site-theme="dark"] .card,
    html[data-site-theme="dark"] .panel,
    html[data-site-theme="dark"] .notice {
      background-color: #101827;
      color: #f8fafc;
      border-color: rgba(148, 163, 184, 0.24);
    }
    html[data-site-theme="dark"] p,
    html[data-site-theme="dark"] li,
    html[data-site-theme="dark"] .section-heading p {
      color: #bdd0ea;
    }
    html[data-site-theme="light"] body {
      color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      html[data-site-theme="system"] body {
        background-color: #0b1220;
        color-scheme: dark;
      }
    }
  </style>`;

  if (html.includes("</head>")) return html.replace("</head>", `${themeScript}${themeStyle}</head>`);
  return `${themeScript}${themeStyle}${html}`;
}

function injectAccessibility(html) {
  const accessibilityStyle = `<style>
    :root {
      --accessibility-line-height: 1.6;
      --accessibility-letter-spacing: 0em;
    }
    html.accessibility-underline-links a { text-decoration: underline !important; text-underline-offset: .14em; }
    html.accessibility-dyslexia-font, html.accessibility-dyslexia-font body {
      font-family: "Arial", "Helvetica Neue", Helvetica, sans-serif !important;
    }
    html.accessibility-large-cursor, html.accessibility-large-cursor * { cursor: auto; }
    html.accessibility-reduced-motion *, html.accessibility-reduced-motion *::before, html.accessibility-reduced-motion *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
      scroll-behavior: auto !important;
    }
    body { line-height: var(--accessibility-line-height, 1.6); letter-spacing: var(--accessibility-letter-spacing, 0em); }
    .accessibility-button {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 9999;
      border: 0;
      border-radius: 999px;
      padding: .9rem 1.1rem;
      background: #0f172a;
      color: #fff;
      box-shadow: 0 14px 34px rgba(15, 23, 42, .2);
      font: inherit;
      font-weight: 800;
    }
    .accessibility-panel {
      position: fixed;
      right: 1rem;
      bottom: 4.75rem;
      z-index: 9999;
      width: min(92vw, 360px);
      background: #fff;
      color: #0f172a;
      border: 1px solid rgba(148, 163, 184, .4);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, .18);
      padding: 1rem;
    }
    .accessibility-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      margin-bottom: .85rem;
    }
    .accessibility-panel-head strong { font-size: 1rem; }
    .accessibility-close {
      border: 0;
      background: transparent;
      font-size: 1.4rem;
      line-height: 1;
      padding: .25rem .35rem;
      color: inherit;
    }
    .accessibility-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: .7rem;
    }
    .accessibility-grid label {
      display: grid;
      gap: .35rem;
      font-size: .92rem;
      font-weight: 700;
    }
    .accessibility-grid select,
    .toggle-row {
      min-height: 42px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, .4);
      padding: .55rem .7rem;
      background: #fff;
      color: inherit;
      font: inherit;
    }
    .toggle-row {
      display: flex !important;
      align-items: center;
      gap: .6rem;
    }
    .accessibility-actions { margin-top: .85rem; }
    .accessibility-reset {
      width: 100%;
      min-height: 42px;
      border: 0;
      border-radius: 10px;
      background: #e2e8f0;
      color: #0f172a;
      font: inherit;
      font-weight: 800;
    }
    @media (max-width: 560px) {
      .accessibility-button, .accessibility-panel { right: .75rem; left: .75rem; width: auto; }
      .accessibility-panel { bottom: 4.4rem; }
    }
  </style>`;
  const accessibilityScript = `<script defer src="/assets/js/accessibility.js"></script>`;
  let output = html;
  if (output.includes("</head>")) output = output.replace("</head>", `${accessibilityStyle}</head>`);
  if (output.includes("</body>")) output = output.replace("</body>", `${accessibilityScript}</body>`);
  else output += accessibilityScript;
  return output;
}

function injectNativeIdentity(html, identity) {
  if (!identity) return html;
  const metadata = `<meta name="ja-native-identity" content="${escapeHtml(JSON.stringify({
    email: identity.email || "",
    name: identity.name || "",
    realm: identity.realm || "",
    subject: identity.subject || "",
    tenantId: identity.tenantId || "",
    objectId: identity.objectId || "",
    givenName: identity.givenName || "",
    familyName: identity.familyName || "",
    preferredUsername: identity.preferredUsername || "",
    locale: identity.locale || "",
    jobTitle: identity.jobTitle || "",
    department: identity.department || "",
    companyName: identity.companyName || "",
    mobilePhone: identity.mobilePhone || "",
    businessPhone: identity.businessPhone || "",
    country: identity.country || "",
    preferredLanguage: identity.preferredLanguage || "",
    photoUrl: identity.photoUrl || ""
  }))}">`;
  if (html.includes("</head>")) return html.replace("</head>", `${metadata}</head>`);
  return `${metadata}${html}`;
}

function requestIdentitySnapshot(request) {
  const email = request.headers.get("x-ja-auth-email") || "";
  if (!email) return null;
  return {
    email,
    name: request.headers.get("x-ja-auth-name") || "",
    realm: request.headers.get("x-ja-auth-realm") || "",
    subject: request.headers.get("x-ja-auth-subject") || "",
    tenantId: request.headers.get("x-ja-auth-tenant") || "",
    objectId: request.headers.get("x-ja-auth-object-id") || "",
    givenName: request.headers.get("x-ja-auth-given-name") || "",
    familyName: request.headers.get("x-ja-auth-family-name") || "",
    preferredUsername: request.headers.get("x-ja-auth-preferred-username") || "",
    locale: request.headers.get("x-ja-auth-locale") || "",
    jobTitle: request.headers.get("x-ja-auth-job-title") || "",
    department: request.headers.get("x-ja-auth-department") || "",
    companyName: request.headers.get("x-ja-auth-company-name") || "",
    mobilePhone: request.headers.get("x-ja-auth-mobile-phone") || "",
    businessPhone: request.headers.get("x-ja-auth-business-phone") || "",
    country: request.headers.get("x-ja-auth-country") || "",
    preferredLanguage: request.headers.get("x-ja-auth-preferred-language") || "",
    photoUrl: request.headers.get("x-ja-auth-photo-url") || ""
  };
}

function hasFileExtension(path) {
  return /\/[^/]+\.[a-z0-9]+$/i.test(path);
}

function isHtmlNavigationRequest(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const destination = (request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
  return destination === "document" || accept.includes("text/html") || accept.includes("*/*");
}

function isPublicDocumentPath(path) {
  if (path === "/" || path === "/index.html") return true;
  if (path === "/ja-group-services-id" || path === "/ja-group-services-id/") return true;
  if (path === "/legal/terms" || path === "/legal/terms/") return true;
  if (path === "/legal/privacy" || path === "/legal/privacy/") return true;
  if (path === "/legal/cookies" || path === "/legal/cookies/") return true;
  if (path === "/account" || path === "/account/") return true;
  if (path === "/admin" || path === "/admin/") return true;
  if (path === "/signed-out" || path.startsWith("/signed-out/")) return true;
  return false;
}

function isCustomerPortalPath(path) {
  return ["/dashboard", "/documents", "/builders", "/settings"].some(
    (prefix) => path === prefix || path === `${prefix}/` || path.startsWith(`${prefix}/`)
  );
}

function isPublicPlanningPath(path) {
  const exact = new Set([
    "/", "/index.html", "/pricing", "/activities", "/experiences", "/headout",
    "/getyourguide", "/booking-partners", "/how-it-works", "/plan-your-trip",
    "/planning-services", "/accommodation", "/transfers", "/local-transport",
    "/travel-documentation-support", "/accessibility-support",
    "/selected-partner-hotels", "/budget-experiences", "/family-experiences",
    "/couples-experiences", "/about", "/faqs", "/terms", "/privacy", "/cookies",
    "/complaints", "/acceptable-use"
  ]);
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return exact.has(normalized) || normalized === "/destinations" || normalized.startsWith("/destinations/");
}

function isPublicLegalPath(path) {
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return new Set(["/terms", "/privacy", "/cookies", "/complaints", "/acceptable-use"]).has(normalized)
    || normalized.startsWith("/legal/");
}

function shouldGateCustomerDocument(request, path, publicAuthPath) {
  if (publicAuthPath) return false;
  if (path.startsWith("/account/") || path === "/account/dashboard") {
    if (path.startsWith("/assets/") || path.startsWith("/api/") || path === "/favicon.ico" || path === "/robots.txt" || path === "/sitemap.xml" || hasFileExtension(path)) {
      return false;
    }
    const accept = (request.headers.get("Accept") || "").toLowerCase();
    const destination = (request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
    return destination === "document" || accept.includes("text/html") || accept.includes("*/*");
  }
  return false;
}

async function getAuthenticatedAdminIdentity(request, env) {
  try {
    const identity = await getNativeSession(request, env, "admin");
    if (!identity) return null;
    const authenticatedRequest = withIdentity(request.clone(), identity);
    if (!(await isAdminRequest(authenticatedRequest, env))) return null;
    let role = "";
    let permissions = [];
    if (env.DB) {
      const admin = await env.DB.prepare(`SELECT role, permissions FROM admin_users WHERE lower(email) = lower(?)`)
        .bind(identity.email)
        .first()
        .catch(() => null);
      role = String(admin?.role || "");
      permissions = Array.isArray(admin?.permissions) ? admin.permissions : [];
    }
    return { identity, role, permissions };
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_bypass_lookup_error",
      message: error instanceof Error ? error.message : "Unknown admin bypass error"
    }));
    return null;
  }
}

export async function onRequest(context) {
  const { env, next } = context;
  let request = withIdentity(context.request, null);
  const url = new URL(request.url);
  const path = url.pathname;

  const adminIdentity = await getAuthenticatedAdminIdentity(request, env);

  if (adminIdentity && path.startsWith("/coming-soon")) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Cache-Control": "no-store"
      }
    });
  }

  const publicAuthPath = new Set([
    "/admin/login", "/admin/login/", "/admin/auth/callback", "/admin/auth/callback/", "/admin/logout", "/admin/logout/",
    "/auth/callback", "/auth/callback/",
    "/account/login", "/account/login/", "/account/auth/callback", "/account/auth/callback/", "/account/logout", "/account/logout/"
  ]).has(path);

  let settings = null;

  // Canonical maintenance-page preview. Render the exact saved D1 content
  // instead of falling through to the hard-coded static HTML file.
  if (
    env.DB &&
    (path === "/maintenance" || path === "/maintenance/" || path.startsWith("/maintenance/"))
  ) {
    settings = await getSiteSettings(env.DB);
    const maintenanceActive = settings.site_status === "maintenance" && !adminIdentity;
    return new Response(pageHtml(settings, "maintenance"), {
      status: maintenanceActive ? 503 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...(maintenanceActive ? { "Retry-After": "3600" } : {})
      }
    });
  }

  // Contact-page-only preview for administrators, using the live saved renderer.
  if (env.DB && (path === "/maintenance/contact" || path === "/maintenance/contact/")) {
    if (!adminIdentity) return new Response("Not found", { status: 404 });
    settings = settings || await getSiteSettings(env.DB);
    const previewMode = url.searchParams.get("view") === "offline" ? "offline" : "maintenance";
    return new Response(contactStatusHtml(settings, previewMode), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  // Enforce site status gates first for non-administrators, excluding absolute system bypasses
  if (!adminIdentity) {
    // Contact status is enforced before React loads so cached client code cannot bypass it.
    if (env.DB && (path === "/contact" || path === "/contact/") && isHtmlNavigationRequest(request)) {
      settings = settings || await getSiteSettings(env.DB);
      const contactStatus = ["online", "maintenance", "offline"].includes(settings.contact_page_status)
        ? settings.contact_page_status
        : "online";
      if (contactStatus !== "online") {
        return new Response(contactStatusHtml(settings, contactStatus), {
          status: contactStatus === "maintenance" ? 503 : 404,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            ...(contactStatus === "maintenance" ? { "Retry-After": "3600" } : {})
          }
        });
      }
    }
    const isStatusBypass =
      path === "/coming-soon" ||
      path === "/coming-soon/" ||
      path.startsWith("/coming-soon/") ||
      path === "/maintenance" ||
      path === "/maintenance/" ||
      path.startsWith("/maintenance/") ||
      path === "/favicon.ico" ||
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      path.startsWith("/assets/") ||
      hasFileExtension(path) ||
      path.startsWith("/cdn-cgi/") ||
      path === "/plans-data" ||
      path === "/plans-data/" ||
      path === "/create-checkout-session" ||
      path === "/create-checkout-session/" ||
      path === "/payment-success" ||
      path === "/payment-success/" ||
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/health" ||
      path === "/health/" ||
      path.startsWith("/health/") ||
      path === "/stripe-webhook" ||
      path === "/stripe-webhook/" ||
      path === "/status" ||
      path.startsWith("/status/") ||
      path === "/admin" ||
      path === "/admin/" ||
      path.startsWith("/admin/") ||
      isPublicLegalPath(path) ||
      publicAuthPath;

    if (!isStatusBypass && env.DB) {
      settings = await getSiteSettings(env.DB);
      if (settings.site_status === "maintenance") {
        return new Response(pageHtml(settings, "maintenance"), {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Retry-After": "3600"
          }
        });
      }

      if (settings.site_status === "coming_soon") {
        if (isHtmlNavigationRequest(request)) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/coming-soon/",
              "Cache-Control": "no-store"
            }
          });
        }
        return new Response(JSON.stringify({ error: "Site is in coming soon mode." }), {
          status: 503,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }
    }
  }

  const rootLanding = path === "/admin" || path === "/admin/" || path === "/account" || path === "/account/";
  const landingRealm = path.startsWith("/admin") ? "admin" : path.startsWith("/account") ? "customer" : "";

  // Admin screens are client-side routes. Serve the application document first and
  // let /api/admin/auth/me perform the authoritative session check inside React.
  // Eagerly opening the D1 session in middleware made a transient lookup failure turn
  // an otherwise healthy admin page into an unstyled plain-text 503 response.
  const adminDocumentRequest = (request.method === "GET" || request.method === "HEAD")
    && path.startsWith("/admin/")
    && !publicAuthPath
    && ((request.headers.get("Sec-Fetch-Dest") || "").toLowerCase() === "document"
      || (request.headers.get("Accept") || "").toLowerCase().includes("text/html"));

  if (adminDocumentRequest) {
    const retiredTransferredRoutes = new Set([
      "/admin/affiliate", "/admin/resellers", "/admin/signing",
      "/admin/portal-nav", "/admin/stripe-diagnostics", "/admin/test-tools",
      "/admin/password-resets"
    ]);
    const normalisedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    if (retiredTransferredRoutes.has(normalisedPath)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/dashboard", "Cache-Control": "no-store" }
      });
    }

    const response = await next(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("Content-Length");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const realm = !rootLanding && (path.startsWith("/admin/") || path === "/admin/dashboard")
    ? "admin"
    : !rootLanding && (path.startsWith("/account/") || path === "/account/dashboard" || isCustomerPortalPath(path) || shouldGateCustomerDocument(request, path, publicAuthPath))
      ? "customer"
      : "";

  if (rootLanding && landingRealm) {
    try {
      const landingIdentity = await getNativeSession(request, env, landingRealm);
      if (landingIdentity) {
        const headers = new Headers({
          Location: landingRealm === "admin" ? "/admin/dashboard/" : "/account/dashboard/",
          "Cache-Control": "no-store"
        });
        return new Response(null, { status: 302, headers });
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "native_oidc_session_validation_error",
        realm: landingRealm,
        message: error instanceof Error ? error.message : "Unknown session error"
      }));
      return new Response("Authentication is temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }

  if (realm && !publicAuthPath) {
    let identity;
    try {
      identity = await getNativeSession(request, env, realm);
    } catch (error) {
      console.error(JSON.stringify({
        event: "native_oidc_session_validation_error",
        realm,
        message: error instanceof Error ? error.message : "Unknown session error"
      }));
      return new Response("Authentication is temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    if (!identity) {
      const expectsJson = (request.headers.get("Accept") || "").toLowerCase().includes("application/json");
      if (expectsJson) {
        return new Response(JSON.stringify({ error: "Not signed in." }), {
          status: 401,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }
      return loginRedirect(request, realm);
    }
    if (!assertSameOrigin(request)) {
      return new Response(JSON.stringify({ error: "Invalid request origin." }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    request = withIdentity(request, identity);

    if (realm === "admin" && !(await isAdminRequest(request, env))) {
      return new Response("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    if (realm === "customer" && env.DB) {
      try {
        const profile = await env.DB.prepare(`SELECT admin_customer_status FROM profiles WHERE lower(email) = lower(?)`)
          .bind(identity.email).first();
        const status = String(profile?.admin_customer_status || "").trim().toLowerCase();
        if (["blocked", "closed", "disabled", "suspended"].includes(status)) {
          return new Response("Your account is currently suspended. Please contact Sousa Murray Planeia for assistance.", {
            status: 403,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
          });
        }
      } catch {
        // Profile provisioning may not have occurred yet; authenticated first visits remain valid.
      }
    }
  }

  if (path === "/admin/dashboard" || path === "/admin/dashboard/" || path.startsWith("/admin/index")) {
    if (!(await isAdminRequest(request, env))) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    const response = await next(request);
    if (!(response.headers.get("Content-Type") || "").includes("text/html")) return response;
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("Content-Length");
    // The Sousa Murray Planeia administration portal is intentionally light-only.
    // Do not inject the public website's saved theme into the admin document.
    return new Response(injectAccessibility(injectNativeIdentity(await response.text(), requestIdentitySnapshot(request))), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const adminSessionCookieDetected = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith("ja_admin_session="));
  if (adminSessionCookieDetected) {
    console.log(JSON.stringify({ event: "admin_bypass_diag", stage: "admin_session_cookie_detected", path }));
  }

  const bypass =
    publicAuthPath ||
    isPublicPlanningPath(path) ||
    path === "/admin" ||
    path === "/admin/" ||
    path.startsWith("/admin/") ||
    path === "/account/logout" ||
    path === "/account/logout/" ||
    path === "/account" ||
    path === "/account/" ||
    path.startsWith("/account/") ||
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/sign-in" ||
    path.startsWith("/sign-in/") ||
    path.startsWith("/legal/") ||
    path === "/accessibility-support" ||
    path === "/accessibility-support/" ||
    path === "/status" ||
    path.startsWith("/status/") ||
    path === "/api/status" ||
    path.startsWith("/api/status/") ||
    path === "/api/enquiries" ||
    path.startsWith("/api/enquiries/") ||
    path === "/plans-data" ||
    path === "/plans-data/" ||
    path === "/create-checkout-session" ||
    path === "/create-checkout-session/" ||
    path === "/payment-success" ||
    path === "/payment-success/" ||
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/health" ||
    path === "/health/" ||
    path.startsWith("/health/") ||
    path === "/stripe-webhook" ||
    path === "/stripe-webhook/" ||
    path.startsWith("/cdn-cgi") ||
    path.startsWith("/assets") ||
    hasFileExtension(path) ||
    path === "/signed-out" ||
    path.startsWith("/signed-out/") ||
    path === "/favicon.ico" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/coming-soon" ||
    path === "/coming-soon/" ||
    path.startsWith("/coming-soon/") ||
    path === "/maintenance" ||
    path === "/maintenance/" ||
    path.startsWith("/maintenance/") ||
    path === "/api/coming-soon-config" ||
    path === "/api/site-status";

  if (bypass) {
    return next(request);
  }

  if (adminIdentity) {
    console.log(JSON.stringify({
      event: "admin_bypass_diag",
      stage: "admin_identity_resolved",
      path,
      email: adminIdentity.identity?.email || "",
      role: adminIdentity.role || "",
      permissions: adminIdentity.permissions || []
    }));
    return next(request);
  }

  if (!settings) {
    settings = await getSiteSettings(env.DB);
  }

  const response = await next(request);
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("Content-Length");
  return new Response(injectAccessibility(injectNativeIdentity(injectTheme(html, settings), requestIdentitySnapshot(request))), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
import {
  assertSameOrigin,
  getNativeSession,
  loginRedirect,
  withIdentity
} from "./_shared/oidc.js";
