import { getNativeSession, expireOidcCookie } from "./_shared/oidc.js";
import {
  createAgeAssurance,
  ageAssuranceCookie,
  expireAgeAssuranceCookie,
  persistAgeAssurance,
} from "./_shared/age-assurance.js";

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
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

function maximumEligibleBirthDate() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

function page({ returnTo = "/dashboard", error = "", denied = false, success = false, ageBand = "" } = {}) {
  const title = denied ? "Planyx is only available to people aged 16 or over" : success ? "Age check completed" : "Confirm you are aged 16 or over";
  const description = denied
    ? "An account cannot be registered or used by anyone under 16 years of age."
    : success
      ? `Your ${ageBand === "16-17" ? "young-person" : "adult"} account safeguards have been applied.`
      : "Planyx is a 16+ planning service. We use your date of birth to enforce the minimum age and apply the correct privacy safeguards.";
  return `<!doctype html>
<html lang="en-GB" class="h-full"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)} — Planyx</title><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/brand/planyx-icon.png?v=1">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f8ff;color:#0f172a}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 18% 15%,rgba(37,99,235,.16),transparent 34%),radial-gradient(circle at 84% 75%,rgba(124,58,237,.12),transparent 32%)}.shell{position:relative;min-height:100vh;display:flex;flex-direction:column}.top{width:min(1080px,calc(100% - 2rem));margin:0 auto;padding:1.25rem 0;border-bottom:1px solid #dbe5f4}.top img{height:40px;width:auto}.main{flex:1;display:grid;place-items:center;width:min(760px,calc(100% - 2rem));margin:0 auto;padding:clamp(2.5rem,7vw,6rem) 0}.card{width:100%;overflow:hidden;border:1px solid #cbdaf0;border-radius:24px;background:rgba(255,255,255,.95);box-shadow:0 28px 80px rgba(15,23,42,.14)}.accent{height:5px;background:linear-gradient(90deg,#2563eb,#06b6d4,#7c3aed)}.content{padding:clamp(1.4rem,5vw,3rem)}.icon{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#eaf1ff;color:#2563eb;font-size:1.45rem}.eyebrow{margin:1.25rem 0 .5rem;color:#2563eb;font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{margin:0;max-width:650px;font-size:clamp(2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.04em}p{line-height:1.7}.lead{color:#475569;font-size:1rem}.notice{margin-top:1.25rem;padding:1rem;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;color:#1e3a8a;font-size:.88rem}.error{margin-top:1rem;padding:1rem;border:1px solid #fecaca;border-radius:14px;background:#fef2f2;color:#991b1b;font-size:.9rem}.form{margin-top:1.5rem;display:grid;gap:1rem}.label{font-size:.88rem;font-weight:750}.input{width:100%;min-height:50px;border:1px solid #b8c7dc;border-radius:12px;background:#fff;color:#0f172a;padding:.75rem 1rem;font:inherit}.input:focus{outline:3px solid rgba(37,99,235,.22);border-color:#2563eb}.button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;border:0;border-radius:12px;background:#2563eb;color:white;padding:.75rem 1rem;font:inherit;font-weight:800;cursor:pointer}.button:hover{background:#1d4ed8}.button.secondary{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe;text-decoration:none}.small{color:#64748b;font-size:.78rem;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}footer{width:min(1080px,calc(100% - 2rem));margin:0 auto;padding:1.25rem 0 2rem;border-top:1px solid #dbe5f4;color:#64748b;font-size:.75rem}footer a{color:#1d4ed8}
@media(prefers-color-scheme:dark){body{background:#07101f;color:#eff6ff}.top,footer{border-color:#1e2d45}.card{border-color:#223b61;background:rgba(10,20,37,.96);box-shadow:0 28px 80px rgba(0,0,0,.36)}.icon{background:#102a55;color:#93c5fd}.eyebrow{color:#7dd3fc}.lead,.small,footer{color:#9fb1c9}.notice{border-color:#254b7a;background:#0c2341;color:#bfdbfe}.error{border-color:#7f1d1d;background:#2f1117;color:#fecaca}.input{border-color:#365071;background:#09182c;color:#eff6ff}.button.secondary{background:#0b1d35;color:#bfdbfe;border-color:#294b75}footer a{color:#93c5fd}}
</style></head><body><div class="shell">
<header class="top"><a href="/"><img src="/assets/brand/planyx-logo.svg?v=1" alt="Planyx"></a></header>
<main class="main"><section class="card"><div class="accent"></div><div class="content">
<div class="icon" aria-hidden="true">${denied ? "⛔" : success ? "✓" : "16+"}</div>
<p class="eyebrow">Planyx age and safeguarding check</p><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p>
${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
${denied ? `<div class="notice"><strong>Registration has not been permitted.</strong><br>Do not try to create or use an account for somebody under 16. Public pages may still be viewed without registering.</div><div class="actions"><a class="button secondary" href="/">Return to Planyx</a><a class="button secondary" href="/contact">Contact support</a></div>` : success ? `<div class="actions"><a class="button" href="${escapeHtml(returnTo)}">Continue to Planyx</a></div>` : `<form class="form" method="post" action="/age-check" novalidate>
<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
<label class="label" for="date_of_birth">Date of birth</label>
<input class="input" id="date_of_birth" name="date_of_birth" type="date" max="${maximumEligibleBirthDate()}" autocomplete="bday" required aria-describedby="age-help">
<p id="age-help" class="small">You must already be 16. People aged 16–17 receive enhanced privacy and safeguarding defaults. We do not ask for an identity document during this check.</p>
<button class="button" type="submit">Confirm age and continue</button>
</form><div class="notice"><strong>Privacy:</strong> your date of birth is used to enforce the 16+ rule, determine whether young-person safeguards apply and support account safety. It is not displayed publicly.</div>`}
</div></section></main>
<footer>© ${new Date().getFullYear()} Planyx · Operated by JA Group Services Ltd · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Safeguarding support</a></footer>
</div></body></html>`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  return new Response(page({ returnTo }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return new Response("Invalid request origin.", { status: 403 });
  const form = await context.request.formData().catch(() => new FormData());
  const dateOfBirth = String(form.get("date_of_birth") || "");
  const returnTo = safeReturnPath(form.get("return_to"));
  let assurance;
  try {
    assurance = await createAgeAssurance(dateOfBirth, context.env);
  } catch (error) {
    return new Response(page({ returnTo, error: error instanceof Error ? error.message : "The age check could not be completed." }), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!assurance.eligible) {
    if (identity?.email && context.env.DB) {
      await persistAgeAssurance(context.env.DB, identity.email, {
        dateOfBirth: assurance.dateOfBirth,
        method: "Self-declared date of birth — account found to be under 16",
        policyVersion: "planyx-16-plus-v1",
      }).catch(() => null);
    }
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    headers.append("Set-Cookie", expireAgeAssuranceCookie());
    headers.append("Set-Cookie", expireOidcCookie("customer"));
    return new Response(page({ returnTo, denied: true }), { status: 403, headers });
  }

  if (identity?.email && context.env.DB) {
    await persistAgeAssurance(context.env.DB, identity.email, assurance);
  }
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
