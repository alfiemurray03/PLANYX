import { assertSameOrigin, expireOidcCookie, getNativeSession } from "../_shared/oidc.js";
import { recordSessionHeartbeat, recordSessionLogout } from "../_shared/session-tracking.js";
import {
  blocksAccess,
  checkHeadOfficeAccess,
  flushCustomerOpsOutbox,
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
        await revokeLocalCustomerSession(context.env.DB, identity, reason);
        await reportCustomerEvent(context.env, context.env.DB, identity, {
          eventType: "session.revoked",
          title: "Planyx session revoked by Head Office",
          category: "security",
          outcome: "revoked",
          severity: "high",
          reason,
          session: {
            id: identity.tokenHash,
            status: "revoked",
            revokedAt: new Date().toISOString(),
            revocationReason: reason,
            deviceSummary: String(context.request.headers.get("User-Agent") || "").slice(0, 500),
            ipCountry: String(context.request.headers.get("CF-IPCountry") || "").slice(0, 8)
          },
          metadata: { decision: result.access.decision, restrictions: result.access.restrictions || [] }
        }).catch(() => null);
        return json({
          success: false,
          access: "denied",
          decision: result.access.decision,
          reason,
          logoutUrl: "/account/access-restricted/"
        }, 403, { "Set-Cookie": expireOidcCookie("customer") });
      }
    } catch (error) {
      // CustomerOps is the central security authority. An authenticated customer
      // session is not allowed to continue without a current access decision.
      const reason = error instanceof Error ? error.message : "Head Office customer protection is unavailable.";
      await revokeLocalCustomerSession(context.env.DB, identity, reason);
      return json({ success: false, access: "review", reason, logoutUrl: "/account/access-restricted/" }, 503, {
        "Set-Cookie": expireOidcCookie("customer")
      });
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
