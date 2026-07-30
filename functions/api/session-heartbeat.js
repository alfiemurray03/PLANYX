import { assertSameOrigin, expireOidcCookie, getNativeSession } from "../_shared/oidc.js";
import { recordSessionHeartbeat, recordSessionLogout } from "../_shared/session-tracking.js";
import { issueCustomerAgeChallenge } from "../_shared/customerops-age-assurance.js";
import {
  blocksAccess,
  checkHeadOfficeAccess,
  flushCustomerOpsOutbox,
  isHeadOfficeAgeStepUp,
  reportCustomerEvent,
  reportPlatformHeartbeat,
  revokeLocalCustomerSession
} from "../_shared/customerops-central.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

async function body(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function schedule(context, task) {
  const safe = Promise.resolve(task).catch(error => {
    console.error(JSON.stringify({
      event: "customerops_session_telemetry_failed",
      message: error instanceof Error ? error.message : "Unknown telemetry error"
    }));
  });
  if (typeof context.waitUntil === "function") context.waitUntil(safe);
}

function blockedResponse(payload, status, challengeCookie = "") {
  const response = json(payload, status);
  response.headers.append("Set-Cookie", expireOidcCookie("customer"));
  if (challengeCookie) response.headers.append("Set-Cookie", challengeCookie);
  return response;
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) return json({ success: false, error: "Request origin was rejected." }, 403);
  if (!context.env.DB) return json({ success: false, error: "Session audit storage is unavailable." }, 503);

  let identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  let realm = "admin";
  if (!identity) {
    identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
    realm = "customer";
  }
  if (!identity) return json({ success: false, error: "No authenticated session was found." }, 401);

  const payload = await body(context.request);
  if (payload.action === "logout") {
    await recordSessionLogout(context.env.DB, context.request, identity, realm);
    if (realm === "customer") schedule(context, reportCustomerEvent(context.env, context.env.DB, identity, {
      eventType: "session.signed_out",
      title: "Customer signed out of Planyx",
      category: "authentication",
      outcome: "signed_out",
      severity: "information",
      session: { id: identity.tokenHash, status: "signed_out", lastSeenAt: new Date().toISOString() }
    }));
    return json({ success: true, action: "logout", realm });
  }

  if (realm === "customer") {
    try {
      const result = await checkHeadOfficeAccess(context.env, context.env.DB, identity);
      if (blocksAccess(result.access)) {
        const reason = result.access.reason || "Head Office has restricted access to this customer account.";
        const ageStepUp = isHeadOfficeAgeStepUp(result.access);
        let challengeCookie = "";
        if (ageStepUp) {
          const challenge = await issueCustomerAgeChallenge(context.env.DB, identity, result.reference, result.access.ageAssurance);
          challengeCookie = challenge.cookie;
        }
        await revokeLocalCustomerSession(context.env.DB, identity, reason);
        await reportCustomerEvent(context.env, context.env.DB, identity, {
          eventType: ageStepUp ? "age_assurance.required" : "session.revoked",
          title: ageStepUp ? "Head Office age assurance required" : "Planyx session revoked by Head Office",
          category: "security",
          outcome: "revoked",
          severity: ageStepUp ? "moderate" : "high",
          reason,
          session: {
            id: identity.tokenHash,
            status: "revoked",
            revokedAt: new Date().toISOString(),
            revocationReason: reason,
            deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
            ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
          },
          metadata: {
            decision: result.access.decision,
            restrictions: result.access.restrictions || [],
            ageAssurance: ageStepUp ? {
              minimumAge: result.access.ageAssurance?.minimumAge || 16,
              decisionAuthority: "HEAD_OFFICE",
              staffAccountsAffected: false
            } : undefined
          }
        }).catch(() => null);
        return blockedResponse({
          success: false,
          access: ageStepUp ? "step_up" : "denied",
          decision: result.access.decision,
          reason,
          ageAssurance: ageStepUp ? result.access.ageAssurance : undefined,
          staffAccountsAffected: false,
          logoutUrl: ageStepUp ? "/account/verification-required/" : "/account/access-restricted/"
        }, 403, challengeCookie);
      }
    } catch (error) {
      // CustomerOps is the central security authority. An authenticated customer
      // session is not allowed to continue without a current access decision.
      const reason = error instanceof Error ? error.message : "Head Office customer protection is unavailable.";
      await revokeLocalCustomerSession(context.env.DB, identity, reason);
      return blockedResponse({ success: false, access: "review", reason, logoutUrl: "/account/access-restricted/" }, 503);
    }
  }

  const session = await recordSessionHeartbeat(context.env.DB, context.request, identity, realm);
  if (realm === "customer") {
    schedule(context, reportCustomerEvent(context.env, context.env.DB, identity, {
      eventType: "session.heartbeat",
      title: "Active Planyx customer session",
      category: "authentication",
      outcome: "active",
      severity: "information",
      session: {
        id: identity.tokenHash,
        status: "active",
        lastSeenAt: new Date().toISOString(),
        deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
        ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
      }
    }));
    schedule(context, reportPlatformHeartbeat(context.env, context.env.DB, { trigger: "session_heartbeat" }));
    schedule(context, flushCustomerOpsOutbox(context.env, context.env.DB));
  }
  return json({ success: true, action: "heartbeat", realm, session_reference: session?.session_reference || null, access: "allowed" });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
