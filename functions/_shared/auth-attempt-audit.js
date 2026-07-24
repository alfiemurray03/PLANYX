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
    requestId: clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120),
    country: clean(request.headers.get("CF-IPCountry"), 8),
    colo: clean(request.cf?.colo || request.headers.get("CF-Colo"), 24)
  };
}

export async function recordAuthenticationFailure(DB, request, realm, error) {
  if (!DB) return;
  await ensureSessionTrackingTables(DB);
  const meta = requestMetadata(request);
  const ipHash = meta.ipAddress ? await sha256(meta.ipAddress) : "";
  const attemptHash = await sha256(`${realm}:${meta.requestId}`);
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
  const sessionId = `attempt:${realm}:${attemptHash}`;

  await DB.prepare(`
    INSERT INTO auth_sessions (
      session_id, session_reference, token_hash, realm, linked_user_type, linked_user_name,
      linked_user_role, linked_user_status, match_basis, auth_method, status, created_at,
      last_seen_at, absolute_expires_at, ip_address, ip_hash, user_agent, country_code,
      cf_colo, request_id, retained_until, updated_at
    ) VALUES (?, ?, ?, ?, 'Unidentified sign-in attempt', 'Unidentified user',
      'Authentication attempt', 'Failed', ?, 'Microsoft OIDC', 'Failed sign-in',
      CURRENT_TIMESTAMP, '1970-01-01 00:00:00', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?,
      datetime('now', '+365 days'), CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      status = 'Failed sign-in',
      ip_address = excluded.ip_address,
      ip_hash = excluded.ip_hash,
      user_agent = excluded.user_agent,
      country_code = excluded.country_code,
      cf_colo = excluded.cf_colo,
      request_id = excluded.request_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    sessionId, reference, attemptHash, realm, `Failure at ${stage}`,
    meta.ipAddress, ipHash, meta.userAgent, meta.country, meta.colo, meta.requestId
  ).run();

  await DB.prepare(`
    INSERT INTO auth_session_events (
      id, session_id, session_reference, event_type, result, realm, email, actor_email,
      ip_address, ip_hash, user_agent, request_id, details
    ) VALUES (?, ?, ?, 'Sign-in failed', 'Failed', ?, '', '', ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), sessionId, reference, realm, meta.ipAddress, ipHash, meta.userAgent,
    meta.requestId, JSON.stringify(details)
  ).run();
}
