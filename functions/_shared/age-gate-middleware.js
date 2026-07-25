import { expireOidcCookie, getNativeSession } from "./oidc.js";
import { profileAgeStatus } from "./age-assurance.js";
import { getAgeVerificationSettings, recordAgeVerificationEvent } from "./age-verification-settings.js";

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

function unavailableResponse(context, settings, message, status = 503) {
  const jsonRequest = expectsJson(context.request);
  const headers = new Headers({
    "Content-Type": jsonRequest ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": "900",
  });
  return new Response(jsonRequest ? JSON.stringify({
    error: message,
    code: "age_verification_unavailable",
    service_status: settings.serviceStatus,
  }) : message, { status, headers });
}

export async function enforceCustomerAge(context) {
  if (!hasCustomerSession(context.request)) return context.next();

  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!identity?.email) return context.next();
  if (!context.env.DB) {
    return unavailableResponse(context, { serviceStatus: "maintenance" }, "Age safeguarding is temporarily unavailable.");
  }

  const settings = await getAgeVerificationSettings(context.env.DB, context.env).catch(() => ({
    serviceStatus: "maintenance",
    allowExistingVerifiedAccess: false,
  }));
  const status = await profileAgeStatus(context.env.DB, identity.email);

  if (status.eligible) {
    if (settings.serviceStatus !== "live" && !settings.allowExistingVerifiedAccess) {
      await recordAgeVerificationEvent(context.env.DB, context.request, {
        eventType: "existing_customer_blocked_during_maintenance", outcome: "failed",
        ageBand: status.ageBand, subjectEmail: identity.email,
        detail: `Existing verified access was disabled while service status was ${settings.serviceStatus}.`,
      }).catch(() => null);
      return unavailableResponse(context, settings, "Customer access is temporarily paused while age-verification safeguards are maintained.");
    }
    const headers = new Headers(context.request.headers);
    headers.set("x-planyx-age-band", status.ageBand || "18+");
    headers.set("x-planyx-young-person", status.minorSafeguards ? "true" : "false");
    headers.set("x-planyx-age-policy", settings.policyVersion || "planyx-16-plus-v1");
    return context.next(new Request(context.request, { headers }));
  }

  if (settings.serviceStatus !== "live") {
    await recordAgeVerificationEvent(context.env.DB, context.request, {
      eventType: "age_check_required_while_unavailable", outcome: "failed",
      subjectEmail: identity.email, detail: `An unverified account attempted access while service status was ${settings.serviceStatus}.`,
    }).catch(() => null);
    return unavailableResponse(context, settings, "Complete age verification when the service is available. Unverified customer access is currently blocked.");
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
