import { assertSameOrigin, getNativeSession } from "../_shared/oidc.js";
import { recordSessionHeartbeat, recordSessionLogout } from "../_shared/session-tracking.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
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
    return json({ success: true, action: "logout", realm });
  }

  const session = await recordSessionHeartbeat(context.env.DB, context.request, identity, realm);
  return json({ success: true, action: "heartbeat", realm, session_reference: session?.session_reference || null });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
