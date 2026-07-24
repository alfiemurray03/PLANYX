import { ensureSessionTrackingTables } from "./session-tracking.js";

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function requestMetadata(request) {
  const forwarded = clean(request.headers.get("x-forwarded-for"), 500).split(",")[0]?.trim();
  return {
    ipAddress: clean(request.headers.get("CF-Connecting-IP") || forwarded || "", 80),
    userAgent: clean(request.headers.get("User-Agent"), 600),
    requestId: clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120)
  };
}

export async function recordAuthenticationFailure(DB, request, realm, error) {
  if (!DB) return;
  await ensureSessionTrackingTables(DB);
  const meta = requestMetadata(request);
  const ipHash = meta.ipAddress ? await sha256(meta.ipAddress) : "";
  const stage = clean(error?.authStage?.stage || "callback", 120);
  const details = {
    stage,
    message: clean(error instanceof Error ? error.message : "Authentication failed.", 1000),
    file: clean(error?.authStage?.file, 300),
    function: clean(error?.authStage?.function, 180),
    request_id: clean(error?.authStage?.requestId || meta.requestId, 120),
    redirect_uri: clean(error?.authStage?.redirectUri, 1000)
  };
  const reference = `ATT-${realm === "admin" ? "ADM" : "CUS"}-${meta.requestId.slice(0, 18).toUpperCase()}`;

  await DB.prepare(`
    INSERT INTO auth_session_events (
      id, session_id, session_reference, event_type, result, realm, email, actor_email,
      ip_address, ip_hash, user_agent, request_id, details
    ) VALUES (?, NULL, ?, 'Sign-in failed', 'Failed', ?, '', '', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), reference, realm, meta.ipAddress, ipHash, meta.userAgent,
    meta.requestId, JSON.stringify(details)
  ).run();
}
