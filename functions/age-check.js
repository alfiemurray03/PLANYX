import { getNativeSession, expireOidcCookie } from "./_shared/oidc.js";
import {
  createAgeAssurance,
  ageAssuranceCookie,
  expireAgeAssuranceCookie,
  persistAgeAssurance,
} from "./_shared/age-assurance.js";
import { createAgeVerificationRecord } from "./_shared/age-verification-records.js";
import {
  getAgeVerificationSettings,
  recordAgeVerificationEvent,
} from "./_shared/age-verification-settings.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeReturnPath(value) {
  try {
    const raw = String(value || "/dashboard");
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    const url = new URL(raw, "https://planyx.local");
    const allowed = ["/dashboard", "/builders", "/settings", "/account", "/documents", "/pricing"];
    if (!allowed.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return "/dashboard";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
}

function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("Referer");
  if (!referer) return true;
  try { return new URL(referer).origin === url.origin; } catch { return false; }
}

function maximumEligibleBirthDate() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

function effectiveAvailability(settings) {
  if (settings.serviceStatus !== "live") return settings.serviceStatus;
  if (settings.verificationMethod === "independent_provider" && !settings.provider?.ready) return "maintenance";
  return "live";
}

function statusIcon({ denied, success, maintenance }) {
  if (denied) return "!";
  if (success) return "✓";
  if (maintenance) return "•";
  return "16+";
}

function page({ returnTo = "/dashboard", error = "", denied = false, success = false, ageBand = "", settings, unavailable = "" } = {}) {
  const config = settings || {};
  const maintenance = unavailable === "maintenance" || unavailable === "paused";
  const title = denied
    ? "This account cannot continue"
    : success
      ? "Age check completed"
      : maintenance
        ? (config.maintenanceHeading || "Age verification is temporarily unavailable")
        : (config.publicHeading || "Confirm you are aged 16 or over");
  const description = denied
    ? "Planyx accounts are available only to people aged 16 or over."
    : success
      ? `Your ${ageBand === "16-17" ? "young-person" : "adult"} account settings have been applied securely.`
      : maintenance
        ? (config.maintenanceMessage || "New registrations are paused while the age-verification service is maintained.")
        : (config.publicDescription || "Enter your date of birth so Planyx can apply the correct account access and privacy settings.");
  const compact = config.designVariant === "compact";
  const assurance = config.designVariant === "assurance";

  const primaryPanel = maintenance
    ? `<div class="state-panel state-panel--warning">
        <div class="state-panel__title">Safe registration pause</div>
        <p>No unverified account can be created while this service is unavailable. The 16+ minimum age has not been lowered or bypassed.</p>
       </div>
       <div class="action-row"><a class="button button--secondary" href="/">Return to Planyx</a>${config.showSafetyLink !== false ? `<a class="button button--secondary" href="/safety">Read 16+ safety guidance</a>` : ""}</div>`
    : denied
      ? `<div class="state-panel state-panel--danger">
          <div class="state-panel__title">Registration has not been permitted</div>
          <p>Do not enter a false date of birth or create an account for somebody under 16. Public information remains available without an account.</p>
         </div>
         <div class="action-row"><a class="button button--secondary" href="/">Return to Planyx</a>${config.showSafetyLink !== false ? `<a class="button button--secondary" href="/safety">Read safety guidance</a>` : ""}</div>`
      : success
        ? `<div class="state-panel state-panel--success"><div class="state-panel__title">You are ready to continue</div><p>Your eligibility result has been recorded and the correct privacy settings have been applied.</p></div><div class="action-row"><a class="button" href="${escapeHtml(returnTo)}">Continue to Planyx <span aria-hidden="true">→</span></a></div>`
        : `<form class="verification-form" method="post" action="/age-check" novalidate>
            <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
            <div class="field-group">
              <div class="field-heading">
                <div>
                  <label class="field-label" for="date_of_birth">Your date of birth</label>
                  <p class="field-caption">Use the date shown on your official records.</p>
                </div>
                <span class="secure-pill" aria-label="Secure encrypted field">Secure field</span>
              </div>
              <div class="date-field-wrap">
                <span class="date-field-icon" aria-hidden="true">□</span>
                <input class="date-field" id="date_of_birth" name="date_of_birth" type="date" max="${maximumEligibleBirthDate()}" autocomplete="bday" required aria-describedby="age-help privacy-summary">
              </div>
              <p id="age-help" class="field-help"><strong>You must already be 16.</strong> Customers aged 16–17 receive enhanced privacy and safeguarding defaults.</p>
            </div>
            <div class="declaration-box">
              <span class="declaration-box__icon" aria-hidden="true">✓</span>
              <p>By continuing, you confirm that the date entered is accurate. This self-declaration is an account eligibility check, not independent identity verification. Planyx may require a stronger approved check where necessary.</p>
            </div>
            <button class="button button--primary" type="submit">${escapeHtml(config.buttonLabel || "Confirm age and continue")} <span aria-hidden="true">→</span></button>
          </form>`;

  return `<!doctype html>
<html lang="en-GB" class="h-full"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)} — Planyx</title><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/brand/planyx-icon.png?v=1">
<link rel="stylesheet" href="/assets/age-verification.css?v=2">
</head><body class="age-page ${compact ? "age-page--compact" : ""} ${assurance ? "age-page--assurance" : ""}">
<div class="page-shell">
  <header class="site-header">
    <a class="brand-link" href="/" aria-label="Return to Planyx"><img src="/assets/brand/planyx-logo.svg?v=1" alt="Planyx"></a>
    <div class="header-assurance"><span class="header-assurance__dot" aria-hidden="true"></span><span>Secure age and safeguarding check</span></div>
  </header>
  <main class="page-main">
    <section class="verification-card" aria-labelledby="age-check-title">
      <div class="verification-card__accent"></div>
      <div class="verification-layout">
        <div class="verification-primary">
          <div class="status-icon ${denied ? "status-icon--danger" : success ? "status-icon--success" : maintenance ? "status-icon--warning" : ""}" aria-hidden="true">${statusIcon({ denied, success, maintenance })}</div>
          <p class="eyebrow">Planyx account eligibility</p>
          <h1 id="age-check-title">${escapeHtml(title)}</h1>
          <p class="lead">${escapeHtml(description)}</p>
          ${error ? `<div class="error-panel" role="alert"><strong>We could not complete the check.</strong><span>${escapeHtml(error)}</span></div>` : ""}
          ${primaryPanel}
          ${config.showPrivacyNotice === false || maintenance || denied || success ? "" : `<div id="privacy-summary" class="privacy-summary"><span class="privacy-summary__icon" aria-hidden="true">◈</span><div><strong>Your information is protected</strong><p>Your date of birth is encrypted in a restricted age-verification record linked to your Customer CRM profile. It is masked by default and access is audited. The normal customer profile stores only eligibility, age band and safeguarding status.</p></div></div>`}
        </div>
        <aside class="verification-aside" aria-label="What happens during the age check">
          <div class="aside-card">
            <p class="aside-card__eyebrow">What happens next</p>
            <ol class="steps-list">
              <li><span>1</span><div><strong>Enter your date of birth</strong><p>Use the secure field only. Never send it through the AI guide or ordinary contact form.</p></div></li>
              <li><span>2</span><div><strong>Eligibility is calculated</strong><p>Under-16 access is blocked. Ages 16–17 receive higher privacy defaults.</p></div></li>
              <li><span>3</span><div><strong>Continue securely</strong><p>Eligible customers proceed to Microsoft customer sign-in or their Planyx account.</p></div></li>
            </ol>
          </div>
          <div class="aside-card aside-card--muted">
            <p class="aside-card__eyebrow">Important</p>
            <p class="aside-copy">A debit-card payment or ticking a box is not independent proof of age. Where a more robust check is required, Planyx may use an approved provider that returns only the minimum age result needed.</p>
          </div>
          <section id="age-guide" class="age-guide" hidden aria-labelledby="age-guide-title">
            <button id="age-guide-toggle" class="age-guide__toggle" type="button" aria-expanded="false" aria-controls="age-guide-panel">
              <span><strong id="age-guide-title">Need help with the age check?</strong><small>Ask the Planyx Age Verification Guide</small></span><span aria-hidden="true">+</span>
            </button>
            <div id="age-guide-panel" class="age-guide__panel" hidden>
              <p id="age-guide-welcome" class="age-guide__welcome"></p>
              <div id="age-guide-suggestions" class="age-guide__suggestions"></div>
              <div id="age-guide-messages" class="age-guide__messages" aria-live="polite"></div>
              <form id="age-guide-form" class="age-guide__form">
                <label for="age-guide-input" class="sr-only">Question about the age check</label>
                <textarea id="age-guide-input" rows="2" maxlength="1200" required></textarea>
                <button type="submit">Ask guide</button>
              </form>
              <p class="age-guide__privacy">Do not enter your date of birth, upload identity documents or share payment details in this guide.</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  </main>
  <footer class="site-footer"><span>© ${new Date().getFullYear()} Planyx · Operated by JA Group Services Ltd</span><nav aria-label="Legal links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a>${config.showSafetyLink === false ? "" : `<a href="/safety">16+ safety</a>`}</nav></footer>
</div>
<script src="/assets/age-verification-guide.js?v=2" defer></script>
</body></html>`;
}

async function settingsFor(context) {
  return getAgeVerificationSettings(context.env.DB, context.env).catch(() => ({
    serviceStatus: "maintenance",
    verificationMethod: "self_declaration",
    provider: { ready: false },
    maintenanceHeading: "Age verification is temporarily unavailable",
    maintenanceMessage: "New registrations are paused while the age-verification controls are unavailable.",
    showSafetyLink: true,
    showPrivacyNotice: true,
  }));
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const settings = await settingsFor(context);
  const availability = effectiveAvailability(settings);
  return new Response(page({ returnTo, settings, unavailable: availability === "live" ? "" : availability }), {
    status: availability === "live" ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Retry-After": availability === "live" ? "0" : "900" },
  });
}

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return new Response("Invalid request origin.", { status: 403 });
  const settings = await settingsFor(context);
  const availability = effectiveAvailability(settings);
  const form = await context.request.formData().catch(() => new FormData());
  const returnTo = safeReturnPath(form.get("return_to"));
  if (availability !== "live") {
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "age_check_unavailable", outcome: "failed", method: settings.verificationMethod,
      provider: settings.providerName, detail: `Age check attempted while service status was ${settings.serviceStatus}.`,
    }).catch(() => null);
    return new Response(page({ returnTo, settings, unavailable: availability }), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "900" },
    });
  }
  if (settings.verificationMethod === "independent_provider") {
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "provider_start_required", outcome: "failed", method: settings.verificationMethod,
      provider: settings.providerName, detail: "Independent provider mode was selected but the provider journey is not available on this route.",
    }).catch(() => null);
    return new Response(page({ returnTo, settings, unavailable: "maintenance", error: "Independent verification is not ready. Registration has been paused safely." }), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const dateOfBirth = String(form.get("date_of_birth") || "");
  let assurance;
  try {
    assurance = await createAgeAssurance(dateOfBirth, context.env);
  } catch (error) {
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "self_declaration", outcome: "failed", method: "self_declaration",
      detail: error instanceof Error ? error.message : "The age check could not be completed.",
    }).catch(() => null);
    return new Response(page({ returnTo, settings, error: error instanceof Error ? error.message : "The age check could not be completed." }), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!assurance.eligible) {
    if (identity?.email && context.env.DB) {
      await persistAgeAssurance(context.env.DB, identity.email, {
        ageBand: "under-16", adultOn: "", method: "Self-declared age check — account found to be under 16", policyVersion: settings.policyVersion,
      }).catch(() => null);
    }
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "self_declaration", outcome: "blocked", ageBand: "under-16", subjectEmail: identity?.email,
      method: "self_declaration", detail: "Registration blocked because the declared age was under 16.",
    }).catch(() => null);
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    headers.append("Set-Cookie", expireAgeAssuranceCookie());
    headers.append("Set-Cookie", expireOidcCookie("customer"));
    return new Response(page({ returnTo, denied: true, settings }), { status: 403, headers });
  }

  assurance.method = "Self-declared date of birth converted to a signed age band";
  assurance.policyVersion = settings.policyVersion;
  try {
    await createAgeVerificationRecord(context.env.DB, context.env, {
      verificationId: assurance.verificationId,
      email: identity?.email || "",
      dateOfBirth: assurance.dateOfBirth,
      ageBand: assurance.ageBand,
      method: assurance.method,
      providerName: "Planyx",
      providerReference: assurance.verificationId,
      policyVersion: assurance.policyVersion,
      verifiedAt: assurance.verifiedAt,
      expiresAt: assurance.expiresAt,
    });
  } catch (error) {
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "verification_record_failed", outcome: "failed", ageBand: assurance.ageBand,
      subjectEmail: identity?.email, method: "self_declaration",
      detail: error instanceof Error ? error.message : "The restricted CRM verification record could not be created.",
    }).catch(() => null);
    return new Response(page({ returnTo, settings, error: "The age check could not be recorded securely. Registration has not continued." }), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (identity?.email && context.env.DB) await persistAgeAssurance(context.env.DB, identity.email, assurance);
  await recordAgeVerificationEvent(context.env.DB, context.request, {
    eventType: "self_declaration", outcome: "passed", ageBand: assurance.ageBand, subjectEmail: identity?.email,
    method: "self_declaration", detail: `Eligible ${assurance.ageBand} result recorded under verification ID ${assurance.verificationId}. The DOB is encrypted in the restricted CRM verification record.`,
  }).catch(() => null);
  const next = identity?.email ? returnTo : `/account/login?return_to=${encodeURIComponent(returnTo)}`;
  const headers = new Headers({ Location: next, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", ageAssuranceCookie(assurance.token));
  return new Response(null, { status: 303, headers });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, POST" } });
}
