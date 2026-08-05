import { expireAgeAssuranceCookie } from "./_shared/age-assurance.js";

function safeReturnPath(value) {
  try {
    const raw = String(value || "/dashboard");
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    const url = new URL(raw, "https://planyx.local");
    const allowed = ["/dashboard", "/builders", "/settings", "/account", "/documents", "/pricing"];
    if (!allowed.some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return "/dashboard";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
}

async function returnPath(request) {
  const url = new URL(request.url);
  if (request.method === "POST") {
    const form = await request.formData().catch(() => new FormData());
    return safeReturnPath(form.get("return_to"));
  }
  return safeReturnPath(url.searchParams.get("return_to"));
}

async function redirectToCentralJourney(request) {
  const returnTo = await returnPath(request);
  const headers = new Headers({
    Location: `/account/login?return_to=${encodeURIComponent(returnTo)}`,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow"
  });
  // Clear the retired Sousa Murray Planeia self-declaration token. Head Office is now the
  // sole customer age-assurance authority.
  headers.append("Set-Cookie", expireAgeAssuranceCookie());
  return new Response(null, { status: 303, headers });
}

export async function onRequestGet(context) {
  return redirectToCentralJourney(context.request);
}

export async function onRequestPost(context) {
  return redirectToCentralJourney(context.request);
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, POST" } });
}
