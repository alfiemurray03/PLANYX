import { expireOidcCookie, getNativeSession } from "./oidc.js";
import { issueCustomerAgeChallenge } from "./customerops-age-assurance.js";
import {
  blocksAccess,
  checkHeadOfficeAccess,
  isHeadOfficeAgeStepUp,
  revokeLocalCustomerSession
} from "./customerops-central.js";

const ACCESS_DECISION_CACHE_SECONDS = 30;

function hasCustomerSession(request) {
  return (request.headers.get("Cookie") || "")
    .split(";")
    .some(part => part.trim().startsWith("ja_customer_oidc_session="));
}

function expectsJson(request) {
  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const path = new URL(request.url).pathname;
  return accept.includes("application/json") || path === "/api" || path.startsWith("/api/") || request.method !== "GET";
}

function protectedResponse(request, access, challengeCookie = "", status = 403) {
  const ageStepUp = isHeadOfficeAgeStepUp(access);
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer"
  });
  headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (challengeCookie) headers.append("Set-Cookie", challengeCookie);

  if (expectsJson(request)) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({
      success: false,
      access: ageStepUp ? "step_up" : (access?.decision || access?.action || "denied"),
      code: ageStepUp ? "HEAD_OFFICE_AGE_ASSURANCE_REQUIRED" : "HEAD_OFFICE_ACCESS_RESTRICTED",
      error: ageStepUp
        ? `Head Office requires ${Number(access?.ageAssurance?.minimumAge || 16)}+ customer age assurance before access can continue.`
        : "Head Office has restricted access to this customer account.",
      logoutUrl: ageStepUp ? "/account/verification-required/" : "/account/access-restricted/",
      ageAssurance: ageStepUp ? {
        minimumAge: Number(access?.ageAssurance?.minimumAge || 16),
        decisionAuthority: "HEAD_OFFICE",
        staffAccountsAffected: false
      } : undefined
    }), { status, headers });
  }

  headers.set("Location", ageStepUp ? "/account/verification-required/" : "/account/access-restricted/");
  return new Response(null, { status: 303, headers });
}

function unavailableResponse(request, message) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Retry-After": "60",
    "Referrer-Policy": "no-referrer"
  });
  headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (expectsJson(request)) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({
      success: false,
      access: "review",
      code: "HEAD_OFFICE_PROTECTION_UNAVAILABLE",
      error: message,
      logoutUrl: "/account/access-restricted/"
    }), { status: 503, headers });
  }
  headers.set("Location", "/account/access-restricted/");
  return new Response(null, { status: 303, headers });
}

async function cacheKeyForIdentity(identity) {
  const source = `${identity?.tenantId || ""}:${identity?.objectId || identity?.subject || ""}:${String(identity?.email || "").toLowerCase()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`https://planyx.internal/head-office-access/${hash}`, { method: "GET" });
}

async function checkHeadOfficeAccessCached(env, DB, identity) {
  if (typeof caches === "undefined" || !caches.default) return checkHeadOfficeAccess(env, DB, identity);

  const key = await cacheKeyForIdentity(identity);
  const cached = await caches.default.match(key);
  if (cached) {
    try { return await cached.json(); }
    catch { /* Ignore an invalid cache entry and refresh it. */ }
  }

  const result = await checkHeadOfficeAccess(env, DB, identity);
  if (!blocksAccess(result.access)) {
    await caches.default.put(key, new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${ACCESS_DECISION_CACHE_SECONDS}`
      }
    })).catch(() => null);
  }
  return result;
}

export async function enforceCustomerAge(context) {
  // This middleware is mounted only around customer routes. Admin/staff OIDC
  // uses a separate cookie and realm and is never evaluated here.
  if (!hasCustomerSession(context.request)) return context.next();

  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!identity?.email) return context.next();
  if (!context.env.DB) return unavailableResponse(context.request, "Head Office customer protection is temporarily unavailable.");

  try {
    const result = await checkHeadOfficeAccessCached(context.env, context.env.DB, identity);
    const access = result.access || { decision: "review", revokeSessions: true };
    if (!blocksAccess(access)) {
      const headers = new Headers(context.request.headers);
      headers.set("x-planyx-age-assurance-authority", "HEAD_OFFICE");
      if (access.ageAssurance?.satisfied === true) {
        headers.set("x-planyx-age-assurance", "verified");
        headers.set("x-planyx-minimum-age", String(access.ageAssurance.minimumAge || 16));
      }
      return context.next(new Request(context.request, { headers }));
    }

    let challengeCookie = "";
    if (isHeadOfficeAgeStepUp(access)) {
      const challenge = await issueCustomerAgeChallenge(context.env.DB, identity, result.reference, access.ageAssurance);
      challengeCookie = challenge.cookie;
    }
    await revokeLocalCustomerSession(context.env.DB, identity, access.reason || "Head Office customer access decision");
    return protectedResponse(context.request, access, challengeCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Head Office customer protection is temporarily unavailable.";
    await revokeLocalCustomerSession(context.env.DB, identity, message).catch(() => null);
    return unavailableResponse(context.request, message);
  }
}
