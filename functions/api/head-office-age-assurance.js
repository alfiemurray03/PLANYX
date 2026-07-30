import { assertSameOrigin } from "../_shared/oidc.js";
import {
  checkHeadOfficeAccessByReference,
  requestHeadOfficeAgeAssuranceSession
} from "../_shared/customerops-central.js";
import {
  completeCustomerAgeChallenge,
  expireAgeChallengeCookie,
  markCustomerAgeChallengeStarted,
  readCustomerAgeChallenge,
  touchCustomerAgeChallenge
} from "../_shared/customerops-age-assurance.js";

function json(data, status = 200, cookie = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer"
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

async function body(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function safeError(error) {
  return {
    code: String(error?.code || "AGE_ASSURANCE_UNAVAILABLE").slice(0, 120),
    message: String(error instanceof Error ? error.message : "Head Office age assurance is temporarily unavailable.").slice(0, 1000)
  };
}

async function status(context, challenge) {
  const result = await checkHeadOfficeAccessByReference(context.env, challenge.reference);
  await touchCustomerAgeChallenge(context.env.DB, challenge);
  const access = result.access || {};
  const assurance = access.ageAssurance || {};
  const released = access.decision === "allow" && (assurance.satisfied === true || assurance.required !== true);
  if (released) {
    await completeCustomerAgeChallenge(context.env.DB, challenge);
    return json({
      success: true,
      status: assurance.satisfied === true ? "verified" : "requirement_withdrawn",
      allowed: true,
      requiredAge: Number(challenge.required_age || assurance.minimumAge || 16),
      redirectUrl: "/account/login",
      decisionAuthority: "HEAD_OFFICE",
      staffAccountsAffected: false
    }, 200, expireAgeChallengeCookie());
  }
  return json({
    success: true,
    status: access.decision === "step_up" ? "verification_required" : access.decision || "review",
    allowed: false,
    requiredAge: Number(challenge.required_age || assurance.minimumAge || 16),
    reason: access.reason || assurance.reason || "Head Office has not yet approved access.",
    deploymentStatus: assurance.status || null,
    newSessionsAllowed: assurance.newSessionsAllowed === true,
    decisionAuthority: "HEAD_OFFICE",
    staffAccountsAffected: false
  });
}

export async function onRequestGet(context) {
  if (!context.env.DB) return json({ success: false, error: { code: "DATABASE_UNAVAILABLE", message: "The customer verification service is unavailable." } }, 503);
  const challenge = await readCustomerAgeChallenge(context.env.DB, context.request);
  if (!challenge) {
    return json({
      success: false,
      error: { code: "AGE_ASSURANCE_CHALLENGE_REQUIRED", message: "This age-assurance link has expired. Sign in again to request a new Head Office decision." },
      staffAccountsAffected: false
    }, 401, expireAgeChallengeCookie());
  }
  try { return await status(context, challenge); }
  catch (error) { return json({ success: false, error: safeError(error), staffAccountsAffected: false }, Number(error?.status || 503)); }
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) {
    return json({ success: false, error: { code: "ORIGIN_REJECTED", message: "The request origin was rejected." } }, 403);
  }
  if (!context.env.DB) return json({ success: false, error: { code: "DATABASE_UNAVAILABLE", message: "The customer verification service is unavailable." } }, 503);
  const challenge = await readCustomerAgeChallenge(context.env.DB, context.request);
  if (!challenge) {
    return json({ success: false, error: { code: "AGE_ASSURANCE_CHALLENGE_REQUIRED", message: "This age-assurance link has expired. Sign in again to request a new Head Office decision." } }, 401, expireAgeChallengeCookie());
  }
  const payload = await body(context.request);
  if (payload.consentAccepted !== true || String(payload.consentVersion || "").trim() !== "planyx-head-office-age-v1") {
    return json({ success: false, error: { code: "AGE_ASSURANCE_CONSENT_REQUIRED", message: "Read and accept the customer age-assurance disclosure before continuing." } }, 400);
  }
  try {
    const result = await requestHeadOfficeAgeAssuranceSession(context.env, challenge.reference, "planyx-head-office-age-v1");
    if (result.allowed === true || result.status === "already_verified") {
      await completeCustomerAgeChallenge(context.env.DB, challenge);
      return json({
        success: true,
        status: "verified",
        allowed: true,
        redirectUrl: "/account/login",
        requiredAge: Number(result.requiredAge || challenge.required_age || 16),
        decisionAuthority: "HEAD_OFFICE",
        staffAccountsAffected: false
      }, 200, expireAgeChallengeCookie());
    }
    if (!result.verificationUrl) throw Object.assign(new Error("Head Office did not return a secure Didit verification link."), { code: "VERIFICATION_URL_MISSING", status: 502 });
    await markCustomerAgeChallengeStarted(context.env.DB, challenge, result);
    return json({
      success: true,
      status: "verification_started",
      allowed: false,
      requiredAge: Number(result.requiredAge || challenge.required_age || 16),
      verificationUrl: result.verificationUrl,
      sessionId: result.sessionId || null,
      decisionAuthority: "HEAD_OFFICE",
      staffAccountsAffected: false
    }, 201);
  } catch (error) {
    return json({ success: false, error: safeError(error), staffAccountsAffected: false }, Number(error?.status || 503));
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);
}
