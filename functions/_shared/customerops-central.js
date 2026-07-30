const UCN_PATTERN = /^\d{10}$/;
const OUTBOX_LIMIT = 25;
export const HEAD_OFFICE_AGE_CONTRACT = "ja-head-office-age-assurance-v1";
export const HEAD_OFFICE_SECURITY_CONTRACT = "ja-head-office-security-state-v1";

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function baseUrl(env) {
  const value = clean(env.CUSTOMEROPS_BASE_URL || "https://customerops.jagroupservices.co.uk", 500).replace(/\/$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("CUSTOMEROPS_BASE_URL must use HTTPS.");
  }
  return url.origin;
}

function apiKey(env) {
  return clean(env.CUSTOMEROPS_API_KEY, 400);
}

function safeJson(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); }
  catch { return JSON.stringify(fallback); }
}

async function customerOpsFetch(env, path, options = {}) {
  const key = apiKey(env);
  if (!key) throw Object.assign(new Error("The secure CustomerOps connector is not configured."), { code: "CUSTOMEROPS_NOT_CONFIGURED" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 8_000));
  const method = clean(options.method || "POST", 12).toUpperCase();
  try {
    const headers = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "User-Agent": "Planyx-Central-CustomerOps/1.1"
    };
    const request = { method, headers, signal: controller.signal };
    if (method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body || {});
    }
    const response = await fetch(`${baseUrl(env)}${path}`, request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(clean(payload?.error?.message || payload?.message || `CustomerOps returned HTTP ${response.status}.`, 1000));
      error.code = clean(payload?.error?.code || "CUSTOMEROPS_REQUEST_FAILED", 120);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("CustomerOps did not respond within the security timeout."), { code: "CUSTOMEROPS_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function customerOpsRequest(env, path, body, timeoutMs = 8_000) {
  return customerOpsFetch(env, path, { method: "POST", body, timeoutMs });
}

async function profileForIdentity(DB, identity) {
  const email = cleanEmail(identity?.email);
  const objectId = clean(identity?.objectId, 180);
  return DB.prepare(`SELECT * FROM profiles
    WHERE lower(email)=lower(?) OR (?<>'' AND microsoft_object_id=?)
    ORDER BY CASE WHEN lower(email)=lower(?) THEN 0 ELSE 1 END LIMIT 1`)
    .bind(email, objectId, objectId, email).first();
}

export async function profileForCustomerEmail(DB, email) {
  const target = cleanEmail(email);
  if (!target || !DB) return null;
  return DB.prepare("SELECT * FROM profiles WHERE lower(email)=lower(?) LIMIT 1").bind(target).first();
}

function customerReference(identity, profile) {
  return {
    customerNumber: UCN_PATTERN.test(String(profile?.universal_customer_number || "")) ? String(profile.universal_customer_number) : undefined,
    platformCustomerId: clean(profile?.planyx_account_id, 180) || undefined,
    entraTenantId: clean(identity?.tenantId, 120) || undefined,
    entraObjectId: clean(identity?.objectId || identity?.subject, 120) || undefined
  };
}

export function customerReferenceForProfile(profile) {
  return {
    customerNumber: UCN_PATTERN.test(String(profile?.universal_customer_number || "")) ? String(profile.universal_customer_number) : undefined,
    platformCustomerId: clean(profile?.planyx_account_id, 180) || undefined
  };
}

export async function customerReferenceForIdentity(DB, identity) {
  const profile = await profileForIdentity(DB, identity);
  return { profile, reference: customerReference(identity, profile) };
}

export function headOfficeAgeAuthorityReady(access) {
  const assurance = access?.ageAssurance;
  return assurance?.contractVersion === HEAD_OFFICE_AGE_CONTRACT
    && assurance?.configured === true
    && assurance?.deploymentKey === "PLANYX"
    && assurance?.platformCode === "PLANYX"
    && assurance?.minimumAge === 16
    && assurance?.accountPopulation === "customers_only"
    && assurance?.staffAccountsExcluded === true;
}

function enforceHeadOfficeAgeContract(access = {}) {
  if (headOfficeAgeAuthorityReady(access)) return access;
  return {
    ...access,
    decision: "review",
    action: "review",
    revokeSessions: true,
    reason: "Planyx could not confirm its governed 16+ deployment with Head Office. Customer access has been held safely rather than bypassing age assurance.",
    ageAssurance: {
      ...(access.ageAssurance || {}),
      expectedContractVersion: HEAD_OFFICE_AGE_CONTRACT,
      expectedDeploymentKey: "PLANYX",
      minimumAge: 16,
      accountPopulation: "customers_only",
      staffAccountsExcluded: true,
      authorityValid: false
    }
  };
}

export function blocksAccess(access) {
  if (!headOfficeAgeAuthorityReady(access)) return true;
  const decision = clean(access?.decision || access?.action, 40).toLowerCase();
  return decision === "deny" || decision === "step_up" || (decision === "review" && Boolean(access?.revokeSessions));
}

export function isHeadOfficeAgeStepUp(access) {
  const decision = clean(access?.decision || access?.action, 40).toLowerCase();
  const assurance = access?.ageAssurance;
  return headOfficeAgeAuthorityReady(access)
    && decision === "step_up"
    && assurance?.required === true;
}

export async function checkHeadOfficeAccessByReference(env, reference) {
  const payload = await customerOpsRequest(env, "/api/platform/access/decision", reference || {});
  const access = payload.access || { decision: "review", revokeSessions: true, reason: "Head Office did not return an access decision." };
  return {
    customer: payload.customer || null,
    access: enforceHeadOfficeAgeContract(access)
  };
}

export async function checkHeadOfficeAccess(env, DB, identity) {
  const { profile, reference } = await customerReferenceForIdentity(DB, identity);
  const result = await checkHeadOfficeAccessByReference(env, reference);
  return { profile, reference, ...result };
}

export async function readHeadOfficeSecurityState(env, reference = {}) {
  const customerNumber = clean(reference.customerNumber, 30);
  if (!UCN_PATTERN.test(customerNumber)) {
    throw Object.assign(new Error("The customer does not yet have a valid Universal Customer Number."), { code: "CUSTOMER_UCN_REQUIRED", status: 409 });
  }
  const payload = await customerOpsFetch(env, `/api/platform/security/state?ucn=${encodeURIComponent(customerNumber)}`, { method: "GET", timeoutMs: 8_000 });
  if (payload.contractVersion !== HEAD_OFFICE_SECURITY_CONTRACT) {
    throw Object.assign(new Error("Head Office returned an unsupported customer-security contract."), {
      code: "CUSTOMEROPS_SECURITY_CONTRACT_INVALID",
      status: 502,
      expected: HEAD_OFFICE_SECURITY_CONTRACT
    });
  }
  return payload;
}

export async function readHeadOfficeSecurityForEmail(env, DB, email) {
  const profile = await profileForCustomerEmail(DB, email);
  if (!profile) throw Object.assign(new Error("Customer not found."), { code: "CUSTOMER_NOT_FOUND", status: 404 });
  const reference = customerReferenceForProfile(profile);
  const state = await readHeadOfficeSecurityState(env, reference);
  return { profile, reference, state };
}

export async function requestHeadOfficeAgeAssuranceSession(env, reference, consentVersion) {
  return customerOpsRequest(env, "/api/platform/age-assurance/session", {
    ...(reference || {}),
    consentAccepted: true,
    consentVersion: clean(consentVersion, 80)
  }, 12_000);
}

export async function revokeLocalCustomerSession(DB, identity, reason = "Head Office access restriction") {
  if (!DB || !identity?.tokenHash) return;
  const now = new Date().toISOString();
  await DB.prepare(`UPDATE customer_oidc_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE token_hash=?`)
    .bind(now, identity.tokenHash).run().catch(() => null);
  await DB.prepare(`UPDATE auth_sessions SET status='Revoked by Head Office',revoked_at=COALESCE(revoked_at,?),updated_at=?
    WHERE realm='customer' AND token_hash=?`).bind(now, now, identity.tokenHash).run().catch(() => null);
  await DB.prepare(`INSERT INTO auth_session_events
    (id,session_id,session_reference,event_type,result,realm,email,details,created_at)
    VALUES (?,?,?,?,?,'customer',?,?,CURRENT_TIMESTAMP)`)
    .bind(crypto.randomUUID(), `customer:${identity.tokenHash}`, "", "Head Office session revocation", "Blocked",
      cleanEmail(identity.email), safeJson({ reason: clean(reason, 1000) }, {})).run().catch(() => null);
}

export async function ensureCustomerOpsOutbox(DB) {
  if (!DB) return;
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customerops_outbox (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
  )`).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customerops_outbox_pending
    ON customerops_outbox(status,next_attempt_at,created_at)`).run();
}

export async function queueCustomerOpsEvent(DB, payload) {
  await ensureCustomerOpsOutbox(DB);
  const event = {
    externalEventId: clean(payload?.externalEventId || payload?.id || crypto.randomUUID(), 220),
    eventType: clean(payload?.eventType || payload?.type, 160),
    occurredAt: payload?.occurredAt || new Date().toISOString(),
    ...payload
  };
  if (!event.eventType) throw new Error("A CustomerOps event type is required.");
  await DB.prepare(`INSERT INTO customerops_outbox(id,event_type,payload_json,status,attempts,next_attempt_at,created_at)
    VALUES (?,?,?,'pending',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING`).bind(event.externalEventId, event.eventType, safeJson(event, {})).run();
  return event.externalEventId;
}

export async function flushCustomerOpsOutbox(env, DB, limit = OUTBOX_LIMIT) {
  await ensureCustomerOpsOutbox(DB);
  if (!apiKey(env)) return { sent: 0, failed: 0, remaining: 0 };
  const rows = await DB.prepare(`SELECT * FROM customerops_outbox
    WHERE status IN ('pending','failed') AND datetime(next_attempt_at)<=datetime('now')
    ORDER BY created_at LIMIT ?`).bind(Math.max(1, Math.min(100, Number(limit) || OUTBOX_LIMIT))).all();
  let sent = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    try {
      const payload = JSON.parse(row.payload_json);
      await customerOpsRequest(env, "/api/platform/events", payload, 6_000);
      await DB.prepare(`UPDATE customerops_outbox SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?`).bind(row.id).run();
      sent += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 6)));
      await DB.prepare(`UPDATE customerops_outbox SET status='failed',attempts=?,last_error=?,
        next_attempt_at=datetime('now',?) WHERE id=?`).bind(attempts, clean(error?.message || String(error), 1000), `+${delayMinutes} minutes`, row.id).run();
      failed += 1;
    }
  }
  const remaining = await DB.prepare(`SELECT COUNT(*) count FROM customerops_outbox WHERE status IN ('pending','failed')`).first();
  return { sent, failed, remaining: Number(remaining?.count || 0) };
}

export async function reportCustomerEvent(env, DB, identity, payload) {
  const profile = identity ? await profileForIdentity(DB, identity) : null;
  const reference = identity ? customerReference(identity, profile) : {};
  const id = await queueCustomerOpsEvent(DB, { ...reference, ...payload });
  await flushCustomerOpsOutbox(env, DB, 10).catch(() => null);
  return id;
}

export async function reportPlatformHeartbeat(env, DB, extra = {}) {
  if (!apiKey(env) || !DB) return { skipped: true };
  const [customers, sessions, errors] = await DB.batch([
    DB.prepare("SELECT COUNT(*) count FROM profiles"),
    DB.prepare("SELECT COUNT(*) count FROM customer_oidc_sessions WHERE revoked_at IS NULL AND datetime(idle_expires_at)>datetime('now') AND datetime(absolute_expires_at)>datetime('now')"),
    DB.prepare("SELECT COUNT(*) count FROM customerops_outbox WHERE status='failed'")
  ]);
  const commit = clean(env.PLANYX_RELEASE_COMMIT || env.CF_PAGES_COMMIT_SHA, 120);
  return customerOpsRequest(env, "/api/platform/heartbeat", {
    publicUrl: clean(env.SITE_URL || "https://planyx.jagroupservices.co.uk", 500),
    environment: "production",
    hostingProvider: "Cloudflare Pages",
    releaseVersion: clean(env.PLANYX_RELEASE_VERSION || "Planyx production", 120),
    releaseCommit: commit || undefined,
    healthStatus: "operational",
    healthMessage: "Planyx customer authentication, subscriptions and CustomerOps enforcement are operational.",
    capabilities: ["customer_identity", "security_enforcement", "security_marker_display", "sessions", "subscriptions", "orders", "payments", "fraud_events", "head_office_age_assurance"],
    integrations: { customerIdentity: "JA Group Services ID", customerOps: "connected", ageAssurance: "head_office_controlled", securityMarkers: "head_office_controlled", stripe: env.STRIPE_SECRET_KEY ? "connected" : "not_configured" },
    customerCount: Number(customers.results?.[0]?.count || 0),
    activeSessionCount: Number(sessions.results?.[0]?.count || 0),
    openErrorCount: Number(errors.results?.[0]?.count || 0),
    deployment: commit ? { id: commit, environment: "production", version: clean(env.PLANYX_RELEASE_VERSION || "Planyx production", 120), commit, status: "active", deployedAt: new Date().toISOString() } : undefined,
    occurredAt: new Date().toISOString(),
    metadata: extra
  }, 6_000);
}

export async function reportCustomerSnapshot(env, DB, identity, extra = {}) {
  const profile = await profileForIdentity(DB, identity);
  if (!profile) return null;
  return customerOpsRequest(env, "/api/platform/customers/snapshot", {
    ...customerReference(identity, profile),
    accountStatus: clean(profile.admin_customer_status || "active", 60),
    planCode: clean(profile.plan || profile.subscription_plan, 100) || undefined,
    subscriptionStatus: clean(profile.membership_status, 80) || undefined,
    entitlements: extra.entitlements || {},
    registeredAt: profile.created_at || undefined,
    lastSignInAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    dataClassification: "customer_confidential",
    metadata: { source: "Planyx", ...extra.metadata }
  }, 6_000);
}

export async function profileReferenceForStripe(DB, object = {}) {
  const email = cleanEmail(object.customer_email || object.customer_details?.email || object.metadata?.customer_email);
  const stripeCustomerId = clean(typeof object.customer === "string" ? object.customer : object.customer?.id, 220);
  let profile = null;
  if (email) profile = await DB.prepare("SELECT * FROM profiles WHERE lower(email)=lower(?) LIMIT 1").bind(email).first();
  if (!profile && stripeCustomerId) profile = await DB.prepare("SELECT * FROM profiles WHERE stripe_customer_id=? LIMIT 1").bind(stripeCustomerId).first();
  return {
    profile,
    customerNumber: UCN_PATTERN.test(String(profile?.universal_customer_number || "")) ? String(profile.universal_customer_number) : undefined,
    platformCustomerId: clean(profile?.planyx_account_id, 180) || undefined,
    email: cleanEmail(profile?.email || email) || undefined
  };
}
