import { expireOidcCookie, getNativeSession } from "./oidc.js";
import { profileAgeStatus } from "./age-assurance.js";

function hasCustomerSession(request) {
  return (request.headers.get("Cookie") || "")
    .split(";")
    .some((part) => part.trim().startsWith("ja_customer_oidc_session="));
}

function safeReturnPath(request) {
  const url = new URL(request.url);
  const candidate = `${url.pathname}${url.search}`;
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/dashboard";
}

function expectsJson(request) {
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const path = new URL(request.url).pathname;
  return accept.includes("application/json") || path === "/api" || path.startsWith("/api/") || request.method !== "GET";
}

export async function enforceCustomerAge(context) {
  if (!hasCustomerSession(context.request)) return context.next();

  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!identity?.email) return context.next();
  if (!context.env.DB) {
    return new Response(expectsJson(context.request)
      ? JSON.stringify({ error: "Age safeguarding is temporarily unavailable." })
      : "Age safeguarding is temporarily unavailable.", {
      status: 503,
      headers: {
        "Content-Type": expectsJson(context.request) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const status = await profileAgeStatus(context.env.DB, identity.email);
  if (status.eligible) {
    const request = new Request(context.request);
    request.headers.set("x-planyx-age-band", status.ageBand || "18+");
    request.headers.set("x-planyx-young-person", status.minorSafeguards ? "true" : "false");
    return context.next(request);
  }

  if (expectsJson(context.request)) {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (status.reason === "under-16") headers.append("Set-Cookie", expireOidcCookie("customer"));
    return new Response(JSON.stringify({
      error: status.reason === "under-16"
        ? "Planyx accounts are only available to people aged 16 or over."
        : "Complete the Planyx 16+ age check before continuing.",
      code: status.reason === "under-16" ? "under_16_not_eligible" : "age_check_required",
    }), { status: 403, headers });
  }

  const headers = new Headers({
    Location: `/age-check?return_to=${encodeURIComponent(safeReturnPath(context.request))}`,
    "Cache-Control": "no-store",
  });
  if (status.reason === "under-16") headers.append("Set-Cookie", expireOidcCookie("customer"));
  return new Response(null, { status: 302, headers });
}
