import { completeLogin, expireOidcCookie, getNativeSession } from "../../_shared/oidc.js";
import { recordAuthenticationFailure } from "../../_shared/auth-attempt-audit.js";
import { recordCompletedLogin } from "../../_shared/completed-login-audit.js";
import { syncCustomerWithHeadOffice } from "../../_shared/customerops.js";
import { issueCustomerAgeChallenge } from "../../_shared/customerops-age-assurance.js";
import { blocksAccess, isHeadOfficeAgeStepUp } from "../../_shared/customerops-access-policy.js";
import {
  flushCustomerOpsOutbox,
  reportCustomerEvent,
  reportCustomerSnapshot,
  reportPlatformHeartbeat,
  revokeLocalCustomerSession
} from "../../_shared/customerops-central.js";

function customerSessionCookie(response) {
  const headers = response.headers;
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("Set-Cookie") || ""];
  for (const value of values) {
    const match = /(?:^|,\s*)ja_customer_oidc_session=([^;]+)/.exec(value);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return "";
}

function restrictedRedirect(_reason, decision = "deny", status = 303, challengeCookie = "") {
  const normalized = String(decision || "deny").trim().toLowerCase();
  const location = normalized === "step_up"
    ? "/account/verification-required/"
    : "/account/access-restricted/";
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer"
  });
  headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (challengeCookie) headers.append("Set-Cookie", challengeCookie);
  return new Response(null, { status, headers });
}

function scheduleAllowedTelemetry(context, identity, syncResult) {
  const task = (async () => {
    await reportCustomerEvent(context.env, context.env.DB, identity, {
      eventType: "auth.succeeded",
      title: "Customer signed in to Planyx",
      category: "authentication",
      outcome: "allowed",
      severity: "information",
      session: {
        id: identity.tokenHash,
        status: "active",
        startedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
        ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
      },
      metadata: {
        matchedBy: syncResult.matchedBy || null,
        ageAssuranceAuthority: "HEAD_OFFICE",
        ageAssurance: syncResult.enforcement?.ageAssurance || null,
        headOfficeProtectionStatus: syncResult.protectionStatus || "confirmed"
      }
    });
    await reportCustomerSnapshot(context.env, context.env.DB, identity, {
      metadata: { signInSource: "JA Group Services ID", ageAssuranceAuthority: "HEAD_OFFICE" }
    }).catch(() => null);
    await reportPlatformHeartbeat(context.env, context.env.DB, { trigger: "customer_sign_in" }).catch(() => null);
    await flushCustomerOpsOutbox(context.env, context.env.DB).catch(() => null);
  })().catch(error => {
    console.error(JSON.stringify({
      event: "customerops_allowed_telemetry_failed",
      email: identity.email,
      message: error instanceof Error ? error.message : "Unknown CustomerOps telemetry error"
    }));
  });
  if (typeof context.waitUntil === "function") context.waitUntil(task);
}

function requiresIdentityHold(syncResult) {
  return ["review_required", "ucn_conflict"].includes(String(syncResult?.status || ""));
}

export async function onRequestGet(context) {
  try {
    // Microsoft resolves the customer first. Head Office then resolves the UCN
    // and returns the authoritative customer access decision when available.
    const response = await completeLogin(context, "customer");
    const sessionToken = customerSessionCookie(response);
    if (!sessionToken) throw new Error("The customer session could not be linked to the Head Office decision.");

    const headers = new Headers(context.request.headers);
    headers.set("Cookie", `ja_customer_oidc_session=${encodeURIComponent(sessionToken)}`);
    const identityRequest = new Request(context.request.url, { method: "GET", headers });
    const identity = await getNativeSession(identityRequest, context.env, "customer");
    if (!identity?.email) throw new Error("The verified customer identity could not be resolved.");

    const syncResult = await syncCustomerWithHeadOffice(context, identity);
    if (!syncResult?.ok) {
      const reason = syncResult?.error || "Head Office customer protection is temporarily unavailable.";

      // A confirmed identity conflict or review remains blocking. Transport,
      // configuration and availability failures are not security decisions and
      // must not fabricate an account restriction.
      if (requiresIdentityHold(syncResult)) {
        await revokeLocalCustomerSession(context.env.DB, identity, reason);
        await reportCustomerEvent(context.env, context.env.DB, identity, {
          eventType: "auth.failed",
          title: "Planyx sign-in held for Head Office identity review",
          category: "authentication",
          outcome: "blocked",
          severity: "high",
          reason,
          metadata: { customerOpsStatus: syncResult?.status || "review_required" }
        }).catch(() => null);
        return restrictedRedirect(reason, "review", 303);
      }

      console.error(JSON.stringify({
        event: "customerops_sign_in_degraded",
        email: identity.email,
        status: syncResult?.status || "error",
        message: reason
      }));
      await recordCompletedLogin(context, response, "customer").catch(() => null);
      scheduleAllowedTelemetry(context, identity, {
        ...syncResult,
        matchedBy: null,
        protectionStatus: "temporarily_unavailable",
        enforcement: { action: "allow", decision: "allow", restrictions: [] }
      });
      return response;
    }

    const access = syncResult.enforcement || {
      decision: "allow",
      action: "allow",
      revokeSessions: false,
      restrictions: []
    };

    if (blocksAccess(access)) {
      const reason = access.reason || "Head Office has restricted access to this customer account.";
      let challengeCookie = "";
      if (isHeadOfficeAgeStepUp(access)) {
        const challenge = await issueCustomerAgeChallenge(context.env.DB, identity, {
          customerNumber: syncResult.ucn,
          platformCustomerId: syncResult.accountId,
          entraTenantId: identity.tenantId,
          entraObjectId: identity.objectId || identity.subject
        }, access.ageAssurance);
        challengeCookie = challenge.cookie;
      }

      await revokeLocalCustomerSession(context.env.DB, identity, reason);
      await reportCustomerEvent(context.env, context.env.DB, identity, {
        eventType: isHeadOfficeAgeStepUp(access) ? "age_assurance.required" : "auth.denied",
        title: isHeadOfficeAgeStepUp(access) ? "Head Office age assurance required" : "Customer sign-in denied by Head Office",
        category: "security",
        outcome: "denied",
        severity: isHeadOfficeAgeStepUp(access) ? "moderate" : "high",
        reason,
        metadata: {
          decision: access.decision || access.action,
          restrictions: access.restrictions || [],
          ageAssurance: isHeadOfficeAgeStepUp(access) ? {
            minimumAge: access.ageAssurance?.minimumAge || 16,
            decisionAuthority: "HEAD_OFFICE",
            staffAccountsAffected: false
          } : undefined
        }
      }).catch(() => null);
      return restrictedRedirect(reason, access.decision || access.action || "deny", 303, challengeCookie);
    }

    await recordCompletedLogin(context, response, "customer").catch(() => null);
    scheduleAllowedTelemetry(context, identity, syncResult);
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_oidc_callback_failed",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? (error.details || null) : null,
      auth_stage: error instanceof Error ? (error.authStage || null) : null
    }));
    await recordAuthenticationFailure(context.env.DB, context.request, "customer", error).catch(() => null);
    return new Response("Customer sign-in could not be completed. Please try again or contact Planyx support.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
