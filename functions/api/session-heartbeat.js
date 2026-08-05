import { assertSameOrigin, expireOidcCookie, getNativeSession } from "../_shared/oidc.js";
import { recordSessionHeartbeat, recordSessionLogout, sessionReference } from "../_shared/session-tracking.js";
import { issueCustomerAgeChallenge } from "../_shared/customerops-age-assurance.js";
import { blocksAccess, isHeadOfficeAgeStepUp } from "../_shared/customerops-access-policy.js";
import {
  checkHeadOfficeAccess,
  flushCustomerOpsOutbox,
  reportCustomerEvent,
  reportPlatformHeartbeat,
  revokeLocalCustomerSession
} from "../_shared/customerops-central.js";
import {
  closePlanyxSession,
  registerPlanyxSession
} from "../_shared/connected-sessions.js";

const HEARTBEAT_WRITE_INTERVAL_MS = 5 * 60 * 1000;

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

function centrallyRevoked(status) {
  return ["revocation_required", "revoked", "expired", "signed_out"].includes(String(status || "").toLowerCase());
}

function parsedTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const parsed = Date.parse(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function heartbeatState(DB, identity, realm) {
  const reference = sessionReference(realm, identity?.tokenHash || "");
  if (!DB || !identity?.tokenHash) return { due: true, reference };
  try {
    const row = await DB.prepare(`SELECT session_reference,last_seen_at FROM auth_sessions
      WHERE session_id=? LIMIT 1`).bind(`${realm}:${identity.tokenHash}`).first();
    const lastSeen = parsedTimestamp(row?.last_seen_at);
    return {
      due: !lastSeen || Date.now() - lastSeen >= HEARTBEAT_WRITE_INTERVAL_MS,
      reference: row?.session_reference || reference
    };
  } catch {
    return { due: true, reference };
  }
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
    if (realm === "customer") {
      await closePlanyxSession(context.env, identity, "Customer signed out of Sousa Murray Planeia.").catch(error => {
        console.error(JSON.stringify({
          event: "planyx_connected_session_close_failed",
          message: error instanceof Error ? error.message : "The central session could not be closed."
        }));
      });
      schedule(context, reportCustomerEvent(context.env, context.env.DB, identity, {
        eventType: "session.signed_out",
        title: "Customer signed out of Sousa Murray Planeia",
        category: "authentication",
        outcome: "signed_out",
        severity: "information",
        session: { id: identity.tokenHash, status: "signed_out", lastSeenAt: new Date().toISOString() }
      }));
    }
    return json({ success: true, action: "logout", realm });
  }

  const heartbeat = await heartbeatState(context.env.DB, identity, realm);
  if (!heartbeat.due) {
    return json({
      success: true,
      action: "heartbeat",
      realm,
      session_reference: heartbeat.reference,
      access: "allowed",
      protectionStatus: "recently_confirmed",
      persisted: false
    }, 200, { "X-Planyx-Heartbeat": "throttled" });
  }

  let protectionStatus = "confirmed";

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
          title: ageStepUp ? "Head Office age assurance required" : "Sousa Murray Planeia session revoked by Head Office",
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
      // Connector availability is not itself a Head Office restriction. Keep the
      // locally authenticated session active, record degraded protection and retry
      // on the next persisted heartbeat. Only an explicit Head Office decision may revoke it.
      protectionStatus = "temporarily_unavailable";
      console.error(JSON.stringify({
        event: "customerops_access_check_unavailable",
        email: identity.email,
        message: error instanceof Error ? error.message : "Head Office customer protection is unavailable."
      }));
    }

    try {
      const central = await registerPlanyxSession(context.env, context.env.DB, context.request, identity);
      const centralStatus = central?.session?.status || "active";
      if (centrallyRevoked(centralStatus)) {
        const reason = "This Sousa Murray Planeia device session was revoked through the JA Group Services central session register.";
        await revokeLocalCustomerSession(context.env.DB, identity, reason);
        await reportCustomerEvent(context.env, context.env.DB, identity, {
          eventType: "session.revoked",
          title: "Sousa Murray Planeia session revoked through the central register",
          category: "security",
          outcome: "revoked",
          severity: "high",
          reason,
          session: {
            id: identity.tokenHash,
            status: centralStatus,
            revokedAt: new Date().toISOString(),
            revocationReason: reason
          }
        }).catch(() => null);
        return blockedResponse({
          success: false,
          access: "session_revoked",
          decision: "deny",
          reason,
          staffAccountsAffected: false,
          logoutUrl: "/account/login?error=session_revoked"
        }, 401);
      }
    } catch (error) {
      if (protectionStatus === "confirmed") protectionStatus = "session_register_temporarily_unavailable";
      console.error(JSON.stringify({
        event: "planyx_connected_session_register_failed",
        email: identity.email,
        message: error instanceof Error ? error.message : "The central session register is unavailable."
      }));
    }
  }

  const session = await recordSessionHeartbeat(context.env.DB, context.request, identity, realm);
  if (realm === "customer") {
    schedule(context, reportCustomerEvent(context.env, context.env.DB, identity, {
      eventType: "session.heartbeat",
      title: "Active Sousa Murray Planeia customer session",
      category: "authentication",
      outcome: "active",
      severity: "information",
      session: {
        id: identity.tokenHash,
        status: "active",
        lastSeenAt: new Date().toISOString(),
        deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
        ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
      },
      metadata: { headOfficeProtectionStatus: protectionStatus }
    }));
    schedule(context, reportPlatformHeartbeat(context.env, context.env.DB, { trigger: "session_heartbeat" }));
    schedule(context, flushCustomerOpsOutbox(context.env, context.env.DB));
  }
  return json({
    success: true,
    action: "heartbeat",
    realm,
    session_reference: session?.session_reference || heartbeat.reference || null,
    access: "allowed",
    protectionStatus,
    persisted: true
  }, 200, { "X-Planyx-Heartbeat": "persisted" });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
