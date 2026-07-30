const CHALLENGE_COOKIE = "planyx_head_office_age_challenge";
const CHALLENGE_SECONDS = 30 * 60;
const schemaReady = new WeakMap();

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cookieValue(request, name) {
  const prefix = `${name}=`;
  const match = (request.headers.get("Cookie") || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensureCustomerAgeChallengeSchema(DB) {
  if (!DB) throw new Error("The Planyx customer database is unavailable.");
  if (schemaReady.has(DB)) return schemaReady.get(DB);
  const promise = (async () => {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS customerops_age_assurance_challenges (
      token_hash TEXT PRIMARY KEY,
      customer_number TEXT,
      platform_customer_id TEXT,
      entra_tenant_id TEXT,
      entra_object_id TEXT,
      subject_email TEXT,
      required_age INTEGER NOT NULL DEFAULT 16,
      status TEXT NOT NULL DEFAULT 'pending',
      head_office_session_id TEXT,
      provider_session_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_checked_at TEXT,
      completed_at TEXT
    )`).run();
    await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_age_assurance_challenge_expiry
      ON customerops_age_assurance_challenges(status,expires_at)`).run();
    await DB.prepare(`DELETE FROM customerops_age_assurance_challenges
      WHERE datetime(expires_at)<datetime('now','-1 day')`).run().catch(() => null);
    return true;
  })();
  schemaReady.set(DB, promise);
  try { return await promise; }
  catch (error) { schemaReady.delete(DB); throw error; }
}

export function ageChallengeCookie(token) {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${CHALLENGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function expireAgeChallengeCookie() {
  return `${CHALLENGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function issueCustomerAgeChallenge(DB, identity, reference = {}, ageAssurance = {}) {
  await ensureCustomerAgeChallengeSchema(DB);
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_SECONDS * 1000).toISOString();
  const requiredAge = Math.max(13, Math.min(25, Number(ageAssurance?.minimumAge || ageAssurance?.requiredAge || 16) || 16));
  await DB.prepare(`INSERT INTO customerops_age_assurance_challenges
    (token_hash,customer_number,platform_customer_id,entra_tenant_id,entra_object_id,subject_email,
     required_age,status,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?,'pending',?,?)`)
    .bind(
      tokenHash,
      clean(reference.customerNumber, 20) || null,
      clean(reference.platformCustomerId, 180) || null,
      clean(reference.entraTenantId || identity?.tenantId, 120) || null,
      clean(reference.entraObjectId || identity?.objectId || identity?.subject, 120) || null,
      clean(identity?.email, 254).toLowerCase() || null,
      requiredAge,
      now.toISOString(),
      expiresAt
    ).run();
  return { token, cookie: ageChallengeCookie(token), expiresAt, requiredAge };
}

export async function readCustomerAgeChallenge(DB, request) {
  await ensureCustomerAgeChallengeSchema(DB);
  const token = cookieValue(request, CHALLENGE_COOKIE);
  if (!token || token.length > 200) return null;
  const row = await DB.prepare(`SELECT * FROM customerops_age_assurance_challenges
    WHERE token_hash=? AND status IN ('pending','started') AND datetime(expires_at)>datetime('now') LIMIT 1`)
    .bind(await sha256(token)).first();
  if (!row) return null;
  return {
    ...row,
    reference: {
      customerNumber: clean(row.customer_number, 20) || undefined,
      platformCustomerId: clean(row.platform_customer_id, 180) || undefined,
      entraTenantId: clean(row.entra_tenant_id, 120) || undefined,
      entraObjectId: clean(row.entra_object_id, 120) || undefined
    }
  };
}

export async function markCustomerAgeChallengeStarted(DB, row, session = {}) {
  if (!row?.token_hash) return;
  await DB.prepare(`UPDATE customerops_age_assurance_challenges SET status='started',
    head_office_session_id=?,provider_session_id=?,last_checked_at=CURRENT_TIMESTAMP WHERE token_hash=?`)
    .bind(clean(session.sessionId, 180) || null, clean(session.providerSessionId, 180) || null, row.token_hash).run();
}

export async function touchCustomerAgeChallenge(DB, row) {
  if (!row?.token_hash) return;
  await DB.prepare(`UPDATE customerops_age_assurance_challenges SET last_checked_at=CURRENT_TIMESTAMP WHERE token_hash=?`)
    .bind(row.token_hash).run();
}

export async function completeCustomerAgeChallenge(DB, row) {
  if (!row?.token_hash) return;
  await DB.prepare(`UPDATE customerops_age_assurance_challenges SET status='completed',completed_at=CURRENT_TIMESTAMP,
    last_checked_at=CURRENT_TIMESTAMP WHERE token_hash=?`).bind(row.token_hash).run();
}
