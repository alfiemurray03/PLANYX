import { getNativeSession, expireOidcCookie } from "./_shared/oidc.js";
import {
  createAgeAssurance,
  ageAssuranceCookie,
  expireAgeAssuranceCookie,
  persistAgeAssurance,
} from "./_shared/age-assurance.js";
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

function page({ returnTo = "/dashboard", error = "", denied = false, success = false, ageBand = "", settings, unavailable = "" } = {}) {
  const config = settings || {};
  const maintenance = unavailable === "maintenance" || unavailable === "paused";
  const title = denied
    ? "Planyx is only available to people aged 16 or over"
    : success
      ? "Age check completed"
      : maintenance
        ? (config.maintenanceHeading || "Age verification is temporarily unavailable")
        : (config.publicHeading || "Confirm you are aged 16 or over");
  const description = denied
    ? "An account cannot be registered or used by anyone under 16 years of age."
    : success
      ? `Your ${ageBand === "16-17" ? "young-person" : "adult"} account safeguards have been applied.`
      : maintenance
        ? (config.maintenanceMessage || "New registrations are paused while the age-verification service is maintained.")
        : (config.publicDescription || "Planyx is a 16+ planning service. Complete the age check before creating or using an account.");
  const compact = config.designVariant === "compact";
  const assurance = config.designVariant === "assurance";
  return `<!doctype html>
<html lang="en-GB" class="h-full"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)} — Planyx</title><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/brand/planyx-icon.png?v=1">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f8ff;color:#0f172a}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 18% 15%,rgba(37,99,235,.16),transparent 34%),radial-gradient(circle at 84% 75%,rgba(124,58,237,.12),transparent 32%)}.shell{position:relative;min-height:100vh;display:flex;flex-direction:column}.top{width:min(1080px,calc(100% - 2rem));margin:0 auto;padding:1.25rem 0;border-bottom:1px solid #dbe5f4}.top img{height:40px;width:auto}.main{flex:1;display:grid;place-items:center;width:min(${compact ? "620px" : "760px"},calc(100% - 2rem));margin:0 auto;padding:${compact ? "2rem" : "clamp(2.5rem,7vw,6rem)"} 0}.card{width:100%;overflow:hidden;border:1px solid ${assurance ? "#93c5fd" : "#cbdaf0"};border-radius:${compact ? "18px" : "24px"};background:rgba(255,255,255,.95);box-shadow:0 28px 80px rgba(15,23,42,.14)}.accent{height:5px;background:linear-gradient(90deg,#2563eb,#06b6d4,#7c3aed)}.content{padding:${compact ? "1.5rem" : "clamp(1.4rem,5vw,3rem)"}}.icon{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#eaf1ff;color:#2563eb;font-size:1.45rem}.eyebrow{margin:1.25rem 0 .5rem;color:#2563eb;font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{margin:0;max-width:650px;font-size:clamp(2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.04em}p{line-height:1.7}.lead{color:#475569;font-size:1rem}.notice{margin-top:1.25rem;padding:1rem;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;color:#1e3a8a;font-size:.88rem}.error{margin-top:1rem;padding:1rem;border:1px solid #fecaca;border-radius:14px;background:#fef2f2;color:#991b1b;font-size:.9rem}.form{margin-top:1.5rem;display:grid;gap:1rem}.label{font-size:.88rem;font-weight:750}.input{width:100%;min-height:50px;border:1px solid #b8c7dc;border-radius:12px;background:#fff;color:#0f172a;padding:.75rem 1rem;font:inherit}.input:focus{outline:3px solid rgba(37,99,235,.22);border-color:#2563eb}.button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;border:0;border-radius:12px;background:#2563eb;color:white;padding:.75rem 1rem;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}.button:hover{background:#1d4ed8}.button.secondary{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}.small{color:#64748b;font-size:.78rem;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}footer{width:min(1080px,calc(100% - 2rem));margin:0 auto;padding:1.25rem 0 2rem;border-top:1px solid #dbe5f4;color:#64748b;font-size:.75rem}footer a{color:#1d4ed8}
@media(prefers-color-scheme:dark){body{background:#07101f;color:#eff6ff}.top,footer{border-color:#1e2d45}.card{border-color:#223b61;background:rgba(10,20,37,.96);box-shadow:0 28px 80px rgba(0,0,0,.36)}.icon{background:#102a55;color:#93c5fd}.eyebrow{color:#7dd3fc}.lead,.small,footer{color:#9fb1c9}.notice{border-color:#254b7a;background:#0c2341;color:#bfdbfe}.error{border-color:#7f1d1d;background:#2f1117;color:#fecaca}.input{border-color:#365071;background:#09182c;color:#eff6ff}.button.secondary{background:#0b1d35;color:#bfdbfe;border-color:#294b75}footer a{color:#93c5fd}}
</style></head><body><div class="shell">
<header class="top"><a href="/"><img src="/assets/brand/planyx-logo.svg?v=1" alt="Planyx"></a></header>
<main class="main"><section class="card"><div class="accent"></div><div class="content">
<div class="icon" aria-hidden="true">${denied ? "⛔" : success ? "✓" : maintenance ? "🛠" : "16+"}</div>
<p class="eyebrow">Planyx age and safeguarding check</p><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p>
${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
${maintenance ? `<div class="notice"><strong>Safe registration pause.</strong><br>No unverified account can be created while this service is unavailable. This does not lower or bypass the 16+ minimum age.</div><div class="actions"><a class="button secondary" href="/">Return to Planyx</a>${config.showSafetyLink !== false ? `<a class="button secondary" href="/safety">Read 16+ safety guidance</a>` : ""}</div>` : denied ? `<div class="notice"><strong>Registration has not been permitted.</strong><br>Do not try to create or use an account for somebody under 16. Public pages may still be viewed without registering.</div><div class="actions"><a class="button secondary" href="/">Return to Planyx</a>${config.showSafetyLink !== false ? `<a class="button secondary" href="/safety">Read safety guidance</a>` : ""}</div>` : success ? `<div class="actions"><a class="button" href="${escapeHtml(returnTo)}">Continue to Planyx</a></div>` : `<form class="form" method="post" action="/age-check" novalidate>
<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
<label class="label" for="date_of_birth">Date of birth</label>
<input class="input" id="date_of_birth" name="date_of_birth" type="date" max="${maximumEligibleBirthDate()}" autocomplete="bday" required aria-describedby="age-help">
<p id="age-help" class="small">You must already be 16. People aged 16–17 receive enhanced privacy and safeguarding defaults. A payment card is not accepted as proof of age.</p>
<button class="button" type="submit">${escapeHtml(config.buttonLabel || "Confirm age and continue")}</button>
</form>${config.showPrivacyNotice === false ? "" : `<div class="notice"><strong>Privacy:</strong> the date is checked on the server and converted to the minimum account record needed: eligibility, age band and—only for 16–17-year-olds—the date young-person safeguards end. Planyx does not keep the full date of birth in the normal customer profile.</div>`}`}
</div></section></main>
<footer>© ${new Date().getFullYear()} Planyx · Operated by JA Group Services Ltd · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>${config.showSafetyLink === false ? "" : ` · <a href="/safety">16+ safety</a>`}</footer>
</div></body></html>`;
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
  if (identity?.email && context.env.DB) await persistAgeAssurance(context.env.DB, identity.email, assurance);
  await recordAgeVerificationEvent(context.env.DB, context.request, {
    eventType: "self_declaration", outcome: "passed", ageBand: assurance.ageBand, subjectEmail: identity?.email,
    method: "self_declaration", detail: `Eligible ${assurance.ageBand} result created without retaining the full date of birth in the normal profile.`,
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
