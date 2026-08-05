import {
  ensureEnquiryTables,
  getEnquiryThread,
  isSameOriginRequest,
  listAdminEnquiries,
  updateEnquiryAsAdmin
} from "../_shared/enquiries.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const CLOSURE_STATUSES = ["Open", "In Progress", "Approved", "Rejected", "Completed"];
const DPR_STATUSES = ["Received", "Verifying Identity", "In Progress", "Ready to Send", "Sent", "Closed", "Rejected"];
const SYSTEM_REPORT_STATUSES = ["Open", "In Progress", "Resolved", "Rejected"];
const THEME_MODES = ["light", "dark", "system"];
const ADMIN_SCHEMA_VERSION = "2026-07-04-rc4.7-complete";
const PERMISSION_SECTIONS = {
  overview: ["view_dashboard"],
  health: ["view_dashboard", "manage_status", "manage_api", "manage_settings"],
  operations: ["view_dashboard", "manage_status", "manage_analytics", "manage_api", "manage_settings"],
  status: ["manage_status"],
  analytics: ["manage_analytics"],
  audit: ["manage_audit"],
  admins: ["manage_admins", "manage_roles", "manage_permissions"],
  roles: ["manage_roles", "manage_permissions"],
  sessions: ["manage_admins", "manage_audit", "manage_api"],
  customers: ["manage_users", "manage_crm"],
  customer: ["manage_users", "manage_crm"],
  builders: ["manage_plans", "manage_pricing", "manage_crm"],
  credits: ["manage_plans", "manage_pricing", "manage_crm"],
  usage: ["manage_users", "manage_crm"],
  addons: ["manage_plans", "manage_pricing", "manage_crm"],
  platformsettings: ["manage_plans", "manage_pricing", "manage_settings"],
  datarequests: ["manage_data_requests"],
  systemreports: ["manage_system_reports", "manage_audit"],
  closures: ["manage_closure_requests"],
  support: ["manage_support", "manage_crm"],
  enquiries: ["manage_support", "manage_crm"],
  notifications: ["manage_email", "manage_support", "manage_crm"],
  membership: ["manage_plans", "manage_pricing", "manage_crm"],
  security: ["manage_admins", "manage_audit", "manage_api"],
  cms: ["manage_content", "manage_branding", "manage_policies"],
  reports: ["manage_reports", "manage_analytics", "manage_audit"],
  system: ["manage_settings"],
  plans: ["manage_plans", "manage_pricing"],
  stripe: ["manage_stripe"],
  email: ["manage_email"],
  branding: ["manage_branding", "manage_content"],
  appearance: ["manage_settings"],
  affiliate: ["manage_content"],
  policies: ["manage_policies", "manage_content"],
  launchgateway: ["manage_content"],
  maintenance: ["manage_content"],
  systemsettings: ["manage_settings", "manage_status"]
};

async function healthCount(DB, sql, bindings = []) {
  try {
    const row = await DB.prepare(sql).bind(...bindings).first();
    return Number(row?.count || 0);
  } catch {
    return null;
  }
}

async function healthRows(DB, sql, bindings = []) {
  try {
    return await all(DB, sql, bindings);
  } catch {
    return [];
  }
}

async function checkRemoteService(url, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    return {
      reachable: response.status < 500,
      status: response.status,
      latency_ms: Date.now() - startedAt
    };
  } catch (error) {
    return {
      reachable: false,
      status: 0,
      latency_ms: Date.now() - startedAt,
      message: clean(error?.message || "Connection failed.", 160)
    };
  }
}

async function getStripeHealth(DB, env) {
  try {
    return await getStripe(DB, env, true);
  } catch (error) {
    const settings = await getStripeSettings(DB, env).catch(() => ({ secretKey: "" }));
    return {
      configured: Boolean(settings.secretKey),
      account: null,
      mode: settings.secretKey?.startsWith("sk_live_") ? "Live" : settings.secretKey?.startsWith("sk_test_") ? "Test" : "Unknown",
      message: clean(error?.message || "Stripe health check failed.", 180)
    };
  }
}

async function getProductionHealth(DB, env) {
  const adminIssuer = String(env.ADMIN_OIDC_ISSUER || "");
  const adminIssuerBase = adminIssuer.endsWith("/") ? adminIssuer.slice(0, -1) : adminIssuer;
  const [settings, email, stripe, entra, graph, customers, activeMemberships, openSupport, pendingGdpr, recentErrors, webhookTotal, webhookFailures, latestWebhook] = await Promise.all([
    settingMap(DB, ["maintenance_enabled", "launchgateway_enabled"], {}),
    getEmailSettings(DB, env).catch(() => ({ configured: false, email_provider: "unknown" })),
    getStripeHealth(DB, env),
    checkRemoteService(adminIssuerBase + "/.well-known/openid-configuration"),
    checkRemoteService("https://graph.microsoft.com/v1.0/$metadata", { method: "HEAD" }),
    healthCount(DB, "SELECT COUNT(*) AS count FROM profiles"),
    healthCount(DB, "SELECT COUNT(*) AS count FROM stripe_subscriptions WHERE lower(status) IN ('active', 'trialing')"),
    healthCount(DB, "SELECT COUNT(*) AS count FROM support_tickets WHERE lower(status) NOT IN ('closed', 'resolved')"),
    healthCount(DB, "SELECT COUNT(*) AS count FROM data_protection_requests WHERE lower(status) NOT IN ('closed', 'sent', 'rejected', 'completed')"),
    healthRows(DB, "SELECT id, title, severity, status, created_at, updated_at FROM system_events WHERE lower(COALESCE(status, 'open')) NOT IN ('closed', 'resolved') ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 10"),
    healthCount(DB, "SELECT COUNT(*) AS count FROM stripe_webhook_events"),
    healthCount(DB, "SELECT COUNT(*) AS count FROM stripe_webhook_events WHERE lower(COALESCE(status, '')) IN ('failed', 'error', 'retrying')"),
    healthRows(DB, "SELECT event_id, event_type, status, received_at, processed_at FROM stripe_webhook_events ORDER BY COALESCE(processed_at, received_at) DESC LIMIT 1")
  ]);

  const maintenanceEnabled = String(settings.maintenance_enabled).toLowerCase() === "true";
  const launchGatewayEnabled = String(settings.launchgateway_enabled).toLowerCase() === "true";
  const emailConfigured = Boolean(email.configured);
  const webhookConfigured = Boolean((await getStripeSettings(DB, env)).webhookSecret);
  const databaseSize = await healthRows(DB, "PRAGMA page_count");
  const databasePageSize = await healthRows(DB, "PRAGMA page_size");
  const pageCount = Number(databaseSize[0]?.page_count || 0);
  const pageSize = Number(databasePageSize[0]?.page_size || 0);

  return {
    checked_at: new Date().toISOString(),
    services: {
      website: { status: maintenanceEnabled ? "maintenance" : launchGatewayEnabled ? "launch-gateway" : "operational", message: maintenanceEnabled ? "Maintenance mode is enabled." : launchGatewayEnabled ? "Launch Gateway is enabled." : "Public mode is enabled." },
      entra: { status: entra.reachable ? "operational" : "degraded", message: entra.reachable ? "OIDC discovery responded in " + entra.latency_ms + " ms." : entra.message || "OIDC discovery is unavailable." },
      graph: { status: graph.reachable ? "operational" : "degraded", message: graph.reachable ? "Microsoft Graph responded in " + graph.latency_ms + " ms." : graph.message || "Microsoft Graph is unavailable." },
      stripe: { status: stripe.account ? "operational" : stripe.configured ? "degraded" : "unavailable", message: stripe.message, mode: stripe.mode },
      stripe_webhooks: { status: !webhookConfigured || webhookTotal === null ? "unavailable" : Number(webhookFailures || 0) > 0 ? "degraded" : "operational", message: !webhookConfigured ? "Webhook signing secret is not configured." : webhookTotal === null ? "No webhook event table is present, so delivery history cannot be verified." : webhookTotal + " deliveries recorded; " + (webhookFailures || 0) + " marked failed or retrying.", latest: latestWebhook[0] || null },
      workers: { status: "operational", message: "This authenticated Worker health request completed successfully." },
      database: { status: customers === null ? "degraded" : "operational", message: customers === null ? "The profiles query failed." : "D1 queries completed successfully." },
      email: { status: emailConfigured ? "configured" : "unavailable", message: emailConfigured ? "Provider " + email.email_provider + " is configured; delivery is not tested by this read-only check." : "Outbound email settings are incomplete." },
      launch_gateway: { status: launchGatewayEnabled ? "enabled" : "disabled", message: launchGatewayEnabled ? "Launch Gateway is enabled." : "Launch Gateway is disabled." },
      maintenance: { status: maintenanceEnabled ? "enabled" : "disabled", message: maintenanceEnabled ? "Maintenance mode is enabled." : "Maintenance mode is disabled." }
    },
    metrics: {
      active_customers: customers,
      active_memberships: activeMemberships,
      open_support_requests: openSupport,
      pending_gdpr_requests: pendingGdpr,
      recent_system_errors: recentErrors.length,
      worker_error_rate: null,
      database_bytes: pageCount && pageSize ? pageCount * pageSize : null
    },
    recent_errors: recentErrors,
    limitations: ["Worker error rate requires Cloudflare observability access and is not inferred from application records.", "D1 storage size requires account-level Cloudflare telemetry when page-size pragmas are unavailable to the Worker.", "Email status confirms configuration only; use the Email test action to verify delivery."]
  };
}
const DEFAULT_ROLE_PERMISSIONS = {
  "Platform Owner": ["*"],
  "Senior Administrator": [
    "view_dashboard","manage_admins","manage_roles","manage_permissions","manage_users","manage_crm","manage_plans","manage_pricing","manage_stripe","manage_support","manage_status","manage_analytics","manage_content","manage_branding","manage_email","manage_reports","manage_policies","manage_settings","manage_audit","manage_api","manage_data_requests","manage_closure_requests","manage_system_reports","manage_travel","manage_bookings","manage_refunds"
  ],
  Administrator: ["view_dashboard","manage_users","manage_crm","manage_plans","manage_pricing","manage_content","manage_status","manage_system_reports","manage_support","manage_analytics"],
  "Travel Consultant": ["view_dashboard","manage_users","manage_crm","manage_travel","manage_bookings"],
  Finance: ["view_dashboard","manage_stripe","manage_refunds","manage_reports"],
  "Customer Support": ["view_dashboard","manage_users","manage_crm","manage_support","manage_data_requests","manage_closure_requests","manage_system_reports"],
  "Marketing & Content": ["view_dashboard","manage_content","manage_policies","manage_branding"],
  "Compliance & Data Protection": ["view_dashboard","manage_data_requests","manage_audit","manage_policies","manage_reports"],
  "Auditor": ["view_only"]
};
const PERMISSION_CATALOG = {
  Platform: ["view_dashboard", "manage_admins", "manage_roles", "manage_permissions", "manage_api", "manage_settings"],
  "Customer Operations": ["manage_users", "manage_crm", "manage_travel", "manage_bookings"],
  Finance: ["manage_stripe", "manage_payments", "manage_refunds", "manage_subscriptions", "manage_reports"],
  Content: ["manage_content", "manage_branding", "manage_policies", "manage_email"],
  Compliance: ["manage_audit", "manage_data_requests", "manage_closure_requests", "manage_reports", "manage_policies"],
  Communications: ["manage_email", "manage_support"],
  Website: ["manage_content", "manage_status", "manage_plans", "manage_pricing", "manage_branding"],
  Analytics: ["manage_analytics", "manage_reports"],
  System: ["manage_settings", "manage_api", "manage_status"],
  Support: ["manage_support", "manage_data_requests", "manage_closure_requests", "manage_system_reports"],
  Travel: ["manage_travel", "manage_bookings"]
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function jsonWithHeaders(data, headers, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function getAccessIdentity(request) {
  return {
    email: String(request.headers.get("x-ja-auth-email") || "").trim().toLowerCase(),
    name: String(request.headers.get("x-ja-auth-name") || request.headers.get("x-ja-auth-email") || "").trim()
  };
}

function configuredAdmins(env) {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return String(raw).split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function clean(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function requestCookie(request, name) {
  const raw = request?.headers?.get("Cookie") || "";
  const match = raw.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hasActiveAdminPinSession(DB, request, adminEmail) {
  const token = requestCookie(request, "ja_admin_pin_session");
  if (!token) return false;
  try {
    const session = await DB.prepare(`
      SELECT token_hash FROM admin_pin_sessions
      WHERE token_hash = ? AND lower(admin_email) = lower(?)
        AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).bind(await sha256Hex(token), cleanEmail(adminEmail)).first();
    return Boolean(session);
  } catch {
    return false;
  }
}

async function ensureAdminPinTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_security_pins (
    admin_email TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_pin_sessions (
    token_hash TEXT PRIMARY KEY, admin_email TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL, revoked_at TEXT
  )`).run();
}

async function adminPinStatus(DB, request, adminEmail) {
  await ensureAdminPinTables(DB);
  const record = await DB.prepare(`SELECT failed_attempts, locked_until FROM admin_security_pins WHERE lower(admin_email) = lower(?)`).bind(cleanEmail(adminEmail)).first();
  const token = requestCookie(request, "ja_admin_pin_session");
  const session = token ? await DB.prepare(`SELECT expires_at FROM admin_pin_sessions WHERE token_hash = ? AND lower(admin_email) = lower(?) AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`).bind(await sha256Hex(token), cleanEmail(adminEmail)).first() : null;
  const locked = Boolean(record?.locked_until && Date.parse(record.locked_until) > Date.now());
  return { configured: Boolean(record), unlocked: Boolean(session), expiresAt: session?.expires_at || null, locked, lockedUntil: locked ? record.locked_until : null, attemptsRemaining: Math.max(0, 5 - Number(record?.failed_attempts || 0)) };
}

async function adminPinMac(env, pin, salt) {
  const pepper = clean(env.ADMIN_PIN_PEPPER || env.ADMIN_OIDC_CLIENT_SECRET, 1000);
  if (!pepper) throw new Error("Administrator PIN security is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseAdminPinHash(storedHash) {
  const value = clean(storedHash, 500);
  const [scheme, salt, expected] = value.split("$");
  if (scheme === "hmac_sha256" && salt && expected) return { scheme, salt, expected, legacy: false };
  const legacyPrefix = "hmac_sha256";
  if (value.startsWith(legacyPrefix) && value.length === legacyPrefix.length + 36 + 64) {
    return {
      scheme: legacyPrefix,
      salt: value.slice(legacyPrefix.length, legacyPrefix.length + 36),
      expected: value.slice(legacyPrefix.length + 36),
      legacy: true
    };
  }
  return null;
}

async function verifyAdminPin(env, pin, storedHash) {
  const parsed = parseAdminPinHash(storedHash);
  if (parsed) return timingSafeEqual(await adminPinMac(env, pin, parsed.salt), parsed.expected);
  return verifySecretHash(pin, storedHash);
}

async function handleAdminPinPost(DB, env, request, identity, body) {
  await ensureAdminPinTables(DB);
  const email = cleanEmail(identity.email);
  const action = clean(body.action, 20) || "verify";
  const pin = clean(body.pin, 4);
  if (action === "lock") {
    const token = requestCookie(request, "ja_admin_pin_session");
    if (token) await DB.prepare(`UPDATE admin_pin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?`).bind(await sha256Hex(token)).run();
    await writeAudit(DB, identity, "admin_pin_session_locked", "admin_security_pin", email, "Administrator locked their PIN session.", {});
    return jsonWithHeaders({ success: true, configured: true, unlocked: false }, { "Set-Cookie": "ja_admin_pin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
  }
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "Enter exactly four numbers." }, 400);
  const existing = await DB.prepare(`SELECT * FROM admin_security_pins WHERE lower(admin_email) = lower(?)`).bind(email).first();
  if (action === "setup" || action === "reset") {
    if (action === "setup" && existing) return json({ success: false, error: "A PIN already exists. Use Replace PIN instead." }, 409);
    const salt = crypto.randomUUID();
    const pinHash = ["hmac_sha256", salt, await adminPinMac(env, pin, salt)].join("$");
    if (existing) {
      await DB.prepare(`UPDATE admin_security_pins SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(pinHash, email).run();
      await DB.prepare(`UPDATE admin_pin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?) AND revoked_at IS NULL`).bind(email).run();
    } else {
      await DB.prepare(`INSERT INTO admin_security_pins (admin_email, pin_hash) VALUES (?, ?)`).bind(email, pinHash).run();
    }
    await writeAudit(DB, identity, action === "reset" ? "admin_pin_reset" : "admin_pin_created", "admin_security_pin", email, action === "reset" ? "Administrator replaced their CRM override PIN after Microsoft authentication." : "Created an individual administrator CRM override PIN.", {});
  } else {
    if (!existing) return json({ success: false, error: "Create your administrator PIN first." }, 409);
    if (existing.locked_until && Date.parse(existing.locked_until) > Date.now()) return json({ success: false, error: "PIN access is temporarily locked.", lockedUntil: existing.locked_until }, 423);
    if (!(await verifyAdminPin(env, pin, existing.pin_hash))) {
      const attempts = Number(existing.failed_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await DB.prepare(`UPDATE admin_security_pins SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(lockedUntil ? 0 : attempts, lockedUntil, email).run();
      await writeAudit(DB, identity, "admin_pin_verification_failed", "admin_security_pin", email, "Administrator PIN verification failed.", { attempts, locked: Boolean(lockedUntil) });
      return json({ success: false, error: lockedUntil ? "Too many attempts. PIN access is locked for 15 minutes." : "The administrator PIN is incorrect.", attemptsRemaining: lockedUntil ? 0 : 5 - attempts }, lockedUntil ? 423 : 401);
    }
    const parsedHash = parseAdminPinHash(existing.pin_hash);
    if (parsedHash?.legacy) {
      const normalisedHash = [parsedHash.scheme, parsedHash.salt, parsedHash.expected].join("$");
      await DB.prepare(`UPDATE admin_security_pins SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(normalisedHash, email).run();
    }
  }
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await DB.prepare(`UPDATE admin_security_pins SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE lower(admin_email) = lower(?)`).bind(email).run();
  await DB.prepare(`INSERT INTO admin_pin_sessions (token_hash, admin_email, expires_at) VALUES (?, ?, ?)`).bind(await sha256Hex(token), email, expiresAt).run();
  await writeAudit(DB, identity, "admin_pin_verified", "admin_security_pin", email, "Administrator PIN verified and privileged session opened.", { expires_at: expiresAt });
  return jsonWithHeaders({ success: true, configured: true, unlocked: true, expiresAt }, { "Set-Cookie": `ja_admin_pin_session=${encodeURIComponent(token)}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict` });
}

function parseAuditHistory(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveVerificationHash(value, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(value || "")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 210000, hash: "SHA-256" },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySecretHash(value, storedHash) {
  const hash = clean(storedHash, 500);
  if (!hash) return false;
  if (hash.startsWith("pbkdf2_sha256$")) {
    const [, iterations, salt, expected] = hash.split("$");
    if (!iterations || !salt || !expected) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(value || "")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: Number(iterations), hash: "SHA-256" },
      key,
      256
    );
    const actual = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return timingSafeEqual(actual, expected);
  }
  return timingSafeEqual(await hashPin(value), hash);
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] || 0) ^ (b[index] || 0);
  }
  return diff === 0;
}

export function isSupervisorContext(adminContext = {}) {
  const role = canonicalRoleName(adminContext.role || "");
  return role === "Supervisor" || role === "System Administrator" || role === "Platform Owner";
}

export async function verifySupportPinRecord(DB, env = {}, email, submittedPin, actorEmail) {
  const targetEmail = cleanEmail(email);
  const pin = clean(submittedPin, 12);
  if (!targetEmail || !pin) return { ok: false, error: "Customer email and PIN are required." };

  const current = await DB.prepare(`SELECT * FROM customer_support_pins_v2 WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 1`).bind(targetEmail).first();
  if (!current) return { ok: false, error: "No support PIN record was found for this customer." };
  if (current.revoked_at || current.status === "Revoked") return { ok: false, error: "The support PIN has been revoked." };
  if (current.used_at || current.status === "Verified" || current.status === "Used") return { ok: false, error: "The support PIN has already been used." };

  const now = new Date().toISOString();
  const expiresAt = current.expires_at ? new Date(current.expires_at) : null;
  const expired = expiresAt && expiresAt.getTime() < Date.now();
  const history = parseAuditHistory(current.audit_history);
  const baseEvent = {
    type: expired ? "verification_failed" : "verification_attempt",
    actor: actorEmail || targetEmail,
    at: now,
    outcome: expired ? "expired" : "pending"
  };

  if (expired) {
    const updatedHistory = [...history, { ...baseEvent, detail: "Support PIN expired before verification." }];
    await DB.prepare(`UPDATE customer_support_pins_v2 SET status = 'Expired', updated_at = CURRENT_TIMESTAMP, audit_history = ? WHERE id = ?`).bind(JSON.stringify(updatedHistory), current.id).run();
    await DB.prepare(`INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata) VALUES (?, ?, ?, 'customer_support_pins', ?, ?, ?)`).bind(
      crypto.randomUUID(),
      cleanEmail(actorEmail || targetEmail),
      "support_pin_verify_failed",
      current.id,
      `Support PIN verification failed because the PIN had expired for ${targetEmail}.`,
      JSON.stringify({ email: targetEmail, reason: "expired" })
    ).run();
    return { ok: false, error: "The support PIN has expired." };
  }

  const success = await verifySecretHash(pin, current.pin_hash);
  const nextHistory = [...history, {
    ...baseEvent,
    type: success ? "verification_success" : "verification_failed",
    outcome: success ? "success" : "mismatch",
    detail: success ? "Support PIN verified by an administrator." : "Support PIN verification failed due to a mismatch."
  }];

  if (success) {
    await DB.prepare(`UPDATE customer_support_pins_v2 SET status = 'Verified', used_at = ?, last_used_at = ?, updated_at = CURRENT_TIMESTAMP, audit_history = ? WHERE id = ?`).bind(now, now, JSON.stringify(nextHistory), current.id).run();
  } else {
    await DB.prepare(`UPDATE customer_support_pins_v2 SET updated_at = CURRENT_TIMESTAMP, audit_history = ? WHERE id = ?`).bind(JSON.stringify(nextHistory), current.id).run();
  }

  await DB.prepare(`INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata) VALUES (?, ?, ?, 'customer_support_pins', ?, ?, ?)`).bind(
    crypto.randomUUID(),
    cleanEmail(actorEmail || targetEmail),
    success ? "support_pin_verified" : "support_pin_verify_failed",
    current.id,
    success ? `Verified support PIN for ${targetEmail}.` : `Failed support PIN verification for ${targetEmail}.`,
    JSON.stringify({ email: targetEmail, success, pinLast4: clean(current.pin_last4 || "", 4) })
  ).run();

  return success ? { ok: true, recordId: current.id, message: "Support PIN verified." } : { ok: false, error: "The support PIN does not match the stored record." };
}

function cleanSlug(value) {
  return clean(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function maskSecret(value, prefixLength = 7, suffixLength = 4) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= prefixLength + suffixLength) return "••••••••";
  return `${text.slice(0, prefixLength)}••••••••${text.slice(-suffixLength)}`;
}

function safeJson(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))
  ].join("\n");
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // D1 throws if the column already exists. That is expected during safe migrations.
  }
}

export async function getProfilesColumns(DB) {
  try {
    const info = await all(DB, "PRAGMA table_info(profiles)");
    return new Set(info.map((row) => row.name));
  } catch {
    return new Set();
  }
}

async function ensureTables(DB, env) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
      email TEXT PRIMARY KEY,
      verified_name TEXT,
      display_name TEXT,
      contact_email TEXT,
      phone TEXT,
      communication_preference TEXT,
      support_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime_plan_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_customer_status TEXT DEFAULT 'Standard'`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_notes TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_updated_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_attempted_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_status TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_provider TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_to TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN suspended_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN suspended_by TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN suspension_reason TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN reactivated_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN reactivated_by TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN reactivation_reason TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_users (
      email TEXT PRIMARY KEY,
      name TEXT,
      role TEXT DEFAULT 'Admin',
      status TEXT DEFAULT 'Active',
      permissions TEXT,
      favourites TEXT,
      source TEXT DEFAULT 'portal',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      name TEXT PRIMARY KEY,
      description TEXT,
      is_system INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      code TEXT PRIMARY KEY,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_name TEXT,
      permission_code TEXT,
      PRIMARY KEY (role_name, permission_code)
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_preferences (
      email TEXT PRIMARY KEY,
      favourites TEXT DEFAULT '[]',
      dashboard_preferences TEXT DEFAULT '{}',
      notification_preferences TEXT DEFAULT '{}',
      recently_used TEXT DEFAULT '[]',
      preferred_landing_page TEXT DEFAULT 'overview',
      sidebar_collapsed INTEGER DEFAULT 0,
      theme_preference TEXT DEFAULT 'system',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'Admin'`);
  await safeAlter(DB, `ALTER TABLE admin_users ADD COLUMN status TEXT DEFAULT 'Active'`);
  await safeAlter(DB, `ALTER TABLE admin_users ADD COLUMN permissions TEXT`);
  await safeAlter(DB, `ALTER TABLE admin_users ADD COLUMN favourites TEXT`);
  await safeAlter(DB, `ALTER TABLE admin_preferences ADD COLUMN recently_used TEXT DEFAULT '[]'`);
  await safeAlter(DB, `ALTER TABLE admin_preferences ADD COLUMN preferred_landing_page TEXT DEFAULT 'overview'`);
  await safeAlter(DB, `ALTER TABLE admin_preferences ADD COLUMN sidebar_collapsed INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE admin_preferences ADD COLUMN theme_preference TEXT DEFAULT 'system'`);

  for (const email of configuredAdmins(env)) {
    await DB.prepare(`
      INSERT INTO admin_users (email, name, role, status, permissions, favourites, source, created_by, updated_at)
      VALUES (?, ?, 'Platform Owner', 'Active', '["*"]', '[]', 'default', 'system', CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        role = 'Platform Owner',
        permissions = '["*"]',
        source = CASE WHEN admin_users.source = 'portal' THEN admin_users.source ELSE 'default' END,
        updated_at = CURRENT_TIMESTAMP
    `).bind(email, email).run();
  }

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await DB.prepare(`
      INSERT INTO admin_roles (name, description, is_system, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `).bind(role, role).run();

    for (const permission of permissions) {
      await DB.prepare(`
        INSERT INTO admin_permissions (code, description, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(code) DO UPDATE SET
          description = excluded.description,
          updated_at = CURRENT_TIMESTAMP
      `).bind(permission, permission).run();

      await DB.prepare(`
        INSERT INTO role_permissions (role_name, permission_code)
        VALUES (?, ?)
        ON CONFLICT(role_name, permission_code) DO NOTHING
      `).bind(role, permission).run();
    }
  }

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS service_plans (
      id TEXT PRIMARY KEY,
      plan_name TEXT,
      plan_type TEXT,
      price_label TEXT,
      price_pence INTEGER,
      stripe_price_id TEXT,
      delivery_time TEXT,
      revisions TEXT,
      description TEXT,
      button_label TEXT,
      is_active INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 100,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE service_plans ADD COLUMN stripe_product_id TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS policy_pages (
      slug TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      content_type TEXT DEFAULT 'markdown',
      version TEXT DEFAULT '1.0',
      effective_date TEXT,
      status TEXT DEFAULT 'draft',
      is_published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN version TEXT DEFAULT '1.0'`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN effective_date TEXT`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN status TEXT DEFAULT 'draft'`);
  await safeAlter(DB, `ALTER TABLE policy_pages ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS company_branding (
      id TEXT PRIMARY KEY,
      business_name TEXT,
      trading_name TEXT,
      service_name TEXT,
      support_email TEXT,
      contact_email TEXT,
      phone TEXT,
      website TEXT,
      registered_notice TEXT,
      footer_notice TEXT,
      public_brand_text TEXT,
      logo_url TEXT,
      favicon_url TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN contact_email TEXT`);
  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN registered_notice TEXT`);
  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN footer_notice TEXT`);
  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN public_brand_text TEXT`);
  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN logo_url TEXT`);
  await safeAlter(DB, `ALTER TABLE company_branding ADD COLUMN favicon_url TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      customer_email TEXT,
      customer_name TEXT,
      category TEXT,
      department TEXT,
      assigned_admin TEXT,
      subject TEXT,
      status TEXT,
      priority TEXT,
      sla_target TEXT,
      notes TEXT,
      customer_replies TEXT DEFAULT '[]',
      attachments TEXT DEFAULT '[]',
      resolution_summary TEXT,
      audit_log TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN reference TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN customer_name TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN category TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN department TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN assigned_admin TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN sla_target TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN customer_replies TEXT DEFAULT '[]'`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN attachments TEXT DEFAULT '[]'`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN resolution_summary TEXT`);
  await safeAlter(DB, `ALTER TABLE support_tickets ADD COLUMN audit_log TEXT DEFAULT '[]'`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS system_events (
      id TEXT PRIMARY KEY,
      type TEXT,
      severity TEXT,
      title TEXT,
      message TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();


  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS data_protection_requests (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      user_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      request_type TEXT,
      customer_message TEXT,
      status TEXT DEFAULT 'New',
      submitted_at TEXT,
      due_at TEXT,
      completed_at TEXT,
      assigned_admin_id TEXT,
      internal_notes TEXT,
      attachments TEXT,
      audit_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await safeAlter(DB, `ALTER TABLE data_protection_requests ADD COLUMN request_type TEXT`);
  await safeAlter(DB, `ALTER TABLE data_protection_requests ADD COLUMN statutory_deadline TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS system_reports (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      user_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      issue_type TEXT,
      affected_url TEXT,
      device_browser TEXT,
      description TEXT,
      status TEXT DEFAULT 'New',
      priority TEXT DEFAULT 'Normal',
      submitted_at TEXT,
      resolved_at TEXT,
      assigned_admin_id TEXT,
      internal_notes TEXT,
      attachments TEXT,
      audit_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS closure_requests (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      customer_email TEXT,
      customer_name TEXT,
      requested_by TEXT,
      reason TEXT,
      status TEXT DEFAULT 'Open',
      assigned_admin_id TEXT,
      internal_notes TEXT,
      audit_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS affiliate_content_blocks (
      id TEXT PRIMARY KEY,
      source_key TEXT,
      block_type TEXT,
      title TEXT,
      body TEXT,
      widget_code TEXT,
      cta_label TEXT,
      cta_url TEXT,
      legal_notice TEXT,
      is_enabled INTEGER DEFAULT 1,
      is_published INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE affiliate_content_blocks ADD COLUMN source_key TEXT`);

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_internal_notes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      body TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      author_email TEXT,
      attachments TEXT DEFAULT '[]',
      edit_history TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

}

async function ensureNotificationTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_notifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT DEFAULT 'Normal',
      title TEXT NOT NULL,
      body TEXT,
      status TEXT DEFAULT 'Unread',
      archived_at TEXT,
      reference_type TEXT,
      reference_id TEXT,
      template_key TEXT,
      scheduled_for TEXT,
      sent_at TEXT,
      delivery_status TEXT DEFAULT 'Draft',
      read_at TEXT,
      acknowledged_at TEXT,
      send_history TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN archived_at TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN reference_type TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN reference_id TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN template_key TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN scheduled_for TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN sent_at TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN delivery_status TEXT DEFAULT 'Draft'`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN read_at TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN acknowledged_at TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_notifications ADD COLUMN send_history TEXT DEFAULT '[]'`);
}

async function ensureCustomerIdentityVerificationTables(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_identity_verification_sessions (
      id TEXT PRIMARY KEY,
      customer_email TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      method TEXT NOT NULL,
      verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      ended_at TEXT
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_identity_verification_locks (
      customer_email TEXT PRIMARY KEY,
      locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      locked_until TEXT NOT NULL,
      is_locked INTEGER DEFAULT 0,
      failed_pin_attempts INTEGER DEFAULT 0,
      failed_security_attempts INTEGER DEFAULT 0,
      reason TEXT,
      cleared_at TEXT,
      cleared_by TEXT,
      override_reason TEXT
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_security_questions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      question_label TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN failed_pin_attempts INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN failed_security_attempts INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN cleared_at TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN cleared_by TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN override_reason TEXT`);
  await safeAlter(DB, `ALTER TABLE customer_identity_verification_locks ADD COLUMN is_locked INTEGER DEFAULT 0`);
}

async function initialiseAdminSchema(DB, env) {
  // Idempotent column check to safely migrate site_settings table if needed
  try {
    const info = await all(DB, "PRAGMA table_info(site_settings)");
    const columns = new Set(info.map((row) => row.name));
    if (columns.size > 0 && !columns.has("updated_at")) {
      await safeAlter(DB, `ALTER TABLE site_settings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`);
    }
  } catch (_) {
    // Ignore if table does not exist yet (will be created in ensureTables)
  }

  // Unconditionally update legacy branding records in company_branding
  try {
    await DB.prepare(`
      UPDATE company_branding
      SET trading_name = 'Sousa Murray Planeia',
          service_name = 'Sousa Murray Planeia',
          registered_notice = 'Sousa Murray Planeia is a service line of JA Group Services Ltd.',
          footer_notice = 'Sousa Murray Planeia is operated by JA Group Services Ltd.'
      WHERE id = 'main' AND (trading_name LIKE '%Exper%' OR service_name LIKE '%Exper%' OR footer_notice LIKE '%Exper%')
    `).run();
  } catch (_) {}

  // Unconditionally update any site settings with old brand references
  try {
    const part1 = "Exper";
    const part2 = "iences";
    const oldBrandWithAmp = "JA " + part1 + part2 + " & Discovery";
    const oldBrandPlain = part1 + part2 + " & Discovery";
    const oldBrandAnd = "JA " + part1 + part2 + " and Discovery";
    const oldBrandPlainAnd = part1 + part2 + " and Discovery";
    const oldBrandJust = "JA " + part1 + part2;

    await DB.prepare(`
      UPDATE site_settings
      SET value = replace(replace(replace(replace(replace(value, ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia')
      WHERE value LIKE '%Exper%' AND (value LIKE '%Discovery%' OR value LIKE '%JA%')
    `).bind(oldBrandWithAmp, oldBrandPlain, oldBrandAnd, oldBrandPlainAnd, oldBrandJust).run();
  } catch (_) {}

  // Unconditionally update policy pages content that still contains old brand references
  try {
    const part1 = "Exper";
    const part2 = "iences";
    const oldBrandWithAmp = "JA " + part1 + part2 + " & Discovery";
    const oldBrandPlain = part1 + part2 + " & Discovery";
    const oldBrandAnd = "JA " + part1 + part2 + " and Discovery";
    const oldBrandPlainAnd = part1 + part2 + " and Discovery";
    const oldBrandJust = "JA " + part1 + part2;

    await DB.prepare(`
      UPDATE policy_pages
      SET content = replace(replace(replace(replace(replace(content, ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia'), ?, 'Sousa Murray Planeia')
      WHERE content LIKE '%Exper%' AND (content LIKE '%Discovery%' OR content LIKE '%JA%')
    `).bind(oldBrandWithAmp, oldBrandPlain, oldBrandAnd, oldBrandPlainAnd, oldBrandJust).run();
  } catch (_) {}

  // Keep the live catalogue authoritative even when the rest of the schema is already current.
  try {
    await seedServicePlans(DB);
  } catch (_) {
    // A brand-new database creates service_plans in ensureTables below.
  }

  const version = await DB.prepare(`SELECT value FROM site_settings WHERE key = 'admin_schema_version'`).first().catch(() => null);
  if (version?.value === ADMIN_SCHEMA_VERSION) return;

  const existingDatabase = await DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profiles'`).first().catch(() => null);
  if (!existingDatabase) {
    await ensureTables(DB, env);
    await ensureEnquiryTables(DB);
    await seedDefaults(DB);
  }

  await ensureNotificationTable(DB);
  await ensureCustomerIdentityVerificationTables(DB);
  await DB.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('admin_schema_version', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(ADMIN_SCHEMA_VERSION).run();
}

async function isAllowedAdmin(DB, identity, env) {
  if (!identity.email) return false;
  if (configuredAdmins(env).includes(identity.email)) return true;

  const row = await DB.prepare(`SELECT email FROM admin_users WHERE lower(email) = lower(?) AND COALESCE(status, 'Active') != 'Suspended'`).bind(identity.email).first();
  return Boolean(row);
}

async function getEffectivePermissions(DB, adminRow) {
  if (!adminRow) return ["*"];
  const role = canonicalRoleName(adminRow.role || "Auditor");
  if (role === "Platform Owner") return ["*"];

  const explicitPermissions = normalisePermissionList(safeJson(adminRow.permissions, []));
  if (explicitPermissions.length) return explicitPermissions;

  const defaults = await getRoleDefaultPermissions(DB, role);
  if (defaults.length) return defaults;
  return ["view_only"];
}

function allowedSectionsForPermissions(permissions) {
  const set = new Set(["overview"]);
  if (permissions.includes("*")) {
    Object.keys(PERMISSION_SECTIONS).forEach((section) => set.add(section));
    return [...set];
  }
  for (const [section, needed] of Object.entries(PERMISSION_SECTIONS)) {
    if (needed.some((permission) => permissions.includes(permission) || permissions.includes("*"))) set.add(section);
  }
  return [...set];
}

function canAccessSection(permissions, section) {
  if (permissions.includes("*")) return true;
  const needed = PERMISSION_SECTIONS[section];
  if (!needed) return true;
  return needed.some((permission) => permissions.includes(permission));
}

function requiresAnyPermission(permissions, required = []) {
  if (permissions.includes("*")) return true;
  return required.some((permission) => permissions.includes(permission));
}

function hasAnyPermission(permissions, required = []) {
  if (permissions.includes("*")) return true;
  return required.some((permission) => permissions.includes(permission));
}

function canonicalRoleName(role) {
  const normalised = clean(role, 80);
  if (normalised === "Admin") return "Senior Administrator";
  return normalised || "Auditor";
}

function ownerOrPermission(adminContext, required = []) {
  return ownerBypass(adminContext.permissions, adminContext) || required.some((permission) => adminContext.permissions.includes(permission));
}

function isPlatformOwner(adminRow) {
  return adminRow?.role === "Platform Owner";
}

function ownerBypass(permissions, adminRow = null) {
  if (permissions.includes("*")) return true;
  return isPlatformOwner(adminRow);
}

async function all(DB, sql, bindings = []) {
  const statement = DB.prepare(sql);
  const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
  return result.results || [];
}

async function safeAll(DB, sql, bindings = []) {
  try {
    return await all(DB, sql, bindings);
  } catch (error) {
    console.warn("Optional admin data is unavailable:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function safeFirst(statement, fallback = null) {
  try {
    return await statement.first();
  } catch (error) {
    console.warn("Optional admin summary is unavailable:", error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

async function getRoleDefaultPermissions(DB, role) {
  const roleRows = await DB.prepare(`SELECT permission_code FROM role_permissions WHERE role_name = ? ORDER BY permission_code ASC`).bind(canonicalRoleName(role)).all();
  return normalisePermissionList((roleRows.results || []).map((row) => row.permission_code));
}

async function settingMap(DB, keys, defaults = {}) {
  const placeholders = keys.map(() => "?").join(", ");
  const rows = await all(DB, `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`, keys);
  const settings = { ...defaults };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

async function saveSettings(DB, settings) {
  for (const [key, value] of Object.entries(settings)) {
    await DB.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  }
}

async function writeAudit(DB, identity, action, entityType, entityId, summary, metadata = {}) {
  await DB.prepare(`
    INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    auditActor(identity),
    clean(action, 120),
    clean(entityType, 120),
    clean(entityId, 180),
    clean(summary, 1000),
    JSON.stringify(metadata)
  ).run();
}

export async function getIdentityVerificationState(DB, customerEmail, adminEmail, adminContext = {}) {
  const email = cleanEmail(customerEmail);
  const actor = cleanEmail(adminEmail);
  const lock = await DB.prepare(`
    SELECT * FROM customer_identity_verification_locks
    WHERE lower(customer_email) = lower(?) AND cleared_at IS NULL AND COALESCE(is_locked, 0) = 1
  `).bind(email).first().catch(() => null);
  const session = await DB.prepare(`
    SELECT * FROM customer_identity_verification_sessions
    WHERE lower(customer_email) = lower(?)
      AND (lower(admin_email) = lower(?) OR lower(admin_email) = 'support-assistant')
      AND ended_at IS NULL AND datetime(expires_at) > datetime('now')
    ORDER BY verified_at DESC LIMIT 1
  `).bind(email, actor).first().catch(() => null);
  const questions = await all(DB, `
    SELECT id, question_label FROM customer_security_questions
    WHERE lower(email) = lower(?) AND COALESCE(status, 'Active') = 'Active'
    ORDER BY created_at ASC LIMIT 5
  `, [email]).catch(() => []);

  return {
    verified: Boolean(session) && !lock,
    method: session?.method || "",
    expires_at: session?.expires_at || null,
    locked: Boolean(lock),
    locked_until: lock?.locked_until || null,
    failed_pin_attempts: Number(lock?.failed_pin_attempts || 0),
    failed_security_attempts: Number(lock?.failed_security_attempts || 0),
    supervisor_override_available: Boolean(lock) && isSupervisorContext(adminContext),
    questions
  };
}

function protectCustomerPayload(customer, verification) {
  if (!customer) return customer;
  if (verification?.verified) return { ...customer, verification };
  return {
    ...customer,
    contact_email: "",
    phone: "",
    communication_preference: "",
    support_notes: "",
    admin_notes: "",
    admin_lifetime: 0,
    admin_lifetime_plan_id: "",
    flags: [],
    timeline: [],
    supportCases: [],
    notifications: [],
    pins: [],
    notes: [],
    builderOutputs: [],
    tokenLedger: [],
    savedItems: [],
    customerEnquiries: [],
    dataRequests: [],
    customerAudit: [],
    suspension_reason: "",
    reactivation_reason: "",
    billing: {},
    verification
  };
}

export async function createCustomerVerificationSession(DB, identity, customerEmail, method) {
  await DB.prepare(`
    UPDATE customer_identity_verification_sessions
    SET ended_at = CURRENT_TIMESTAMP
    WHERE lower(customer_email) = lower(?) AND lower(admin_email) = lower(?) AND ended_at IS NULL
  `).bind(cleanEmail(customerEmail), cleanEmail(identity.email)).run();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await DB.prepare(`
    INSERT INTO customer_identity_verification_sessions (id, customer_email, admin_email, method, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), cleanEmail(customerEmail), cleanEmail(identity.email), clean(method, 80), expiresAt).run();
  return expiresAt;
}

export async function clearCustomerVerificationSession(DB, identity, customerEmail) {
  await DB.prepare(`
    UPDATE customer_identity_verification_sessions
    SET ended_at = CURRENT_TIMESTAMP
    WHERE lower(customer_email) = lower(?) AND lower(admin_email) = lower(?) AND ended_at IS NULL
  `).bind(cleanEmail(customerEmail), cleanEmail(identity.email)).run();
}

export async function recordIdentityFailure(DB, identity, customerEmail, method, reason) {
  const email = cleanEmail(customerEmail);
  const current = await DB.prepare(`
    SELECT * FROM customer_identity_verification_locks
    WHERE lower(customer_email) = lower(?) AND cleared_at IS NULL
  `).bind(email).first().catch(() => null);
  const pinAttempts = Number(current?.failed_pin_attempts || 0) + (method === "Support PIN" ? 1 : 0);
  const securityAttempts = Number(current?.failed_security_attempts || 0) + (method === "Security Questions" ? 1 : 0);
  const shouldLock = pinAttempts >= 3 || method === "Security Questions";
  const lockedUntil = shouldLock ? "9999-12-31T23:59:59.999Z" : "1970-01-01T00:00:00.000Z";
  await DB.prepare(`
    INSERT INTO customer_identity_verification_locks (customer_email, locked_until, is_locked, failed_pin_attempts, failed_security_attempts, reason)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_email) DO UPDATE SET
      locked_at = CASE WHEN excluded.is_locked = 1 THEN CURRENT_TIMESTAMP ELSE locked_at END,
      locked_until = excluded.locked_until,
      is_locked = excluded.is_locked,
      failed_pin_attempts = excluded.failed_pin_attempts,
      failed_security_attempts = excluded.failed_security_attempts,
      reason = excluded.reason,
      cleared_at = NULL,
      cleared_by = NULL,
      override_reason = NULL
  `).bind(email, lockedUntil, shouldLock ? 1 : 0, pinAttempts, securityAttempts, clean(reason, 300)).run();

  await writeAudit(DB, identity, "customer_identity_verification_failed", "profiles", email, `Customer identity verification failed for ${email}.`, {
    method,
    reason,
    failed_pin_attempts: pinAttempts,
    failed_security_attempts: securityAttempts,
    lock_created: shouldLock
  });

  return { failed_pin_attempts: pinAttempts, failed_security_attempts: securityAttempts, locked: shouldLock, locked_until: shouldLock ? lockedUntil : null };
}

async function clearIdentityFailures(DB, customerEmail) {
  await DB.prepare(`
    UPDATE customer_identity_verification_locks
    SET cleared_at = CURRENT_TIMESTAMP, is_locked = 0
    WHERE lower(customer_email) = lower(?) AND cleared_at IS NULL
  `).bind(cleanEmail(customerEmail)).run();
}

export async function verifyCustomerSecurityQuestions(DB, body) {
  const email = cleanEmail(body.email);
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!email || !answers.length) return { ok: false, error: "Security question answers are required." };
  const rows = await all(DB, `
    SELECT id, question_label, answer_hash FROM customer_security_questions
    WHERE lower(email) = lower(?) AND COALESCE(status, 'Active') = 'Active'
    ORDER BY created_at ASC LIMIT 5
  `, [email]);
  if (!rows.length) return { ok: false, error: "No security questions are configured for this customer." };

  for (const row of rows) {
    const supplied = answers.find((answer) => clean(answer.id, 120) === row.id);
    if (!supplied || !(await verifySecretHash(clean(supplied.answer, 500).toLowerCase(), row.answer_hash))) {
      return { ok: false, error: "Security question verification failed.", questions_used: rows.map((item) => item.question_label) };
    }
  }
  return { ok: true, questions_used: rows.map((item) => item.question_label) };
}

export async function clearCustomerIdentityLock(DB, identity, customerEmail, reason) {
  const email = cleanEmail(customerEmail);
  await DB.prepare(`
    UPDATE customer_identity_verification_locks
    SET cleared_at = CURRENT_TIMESTAMP, cleared_by = ?, override_reason = ?
    WHERE lower(customer_email) = lower(?) AND cleared_at IS NULL
  `).bind(cleanEmail(identity.email), clean(reason, 500), email).run();
  await writeAudit(DB, identity, "customer_identity_lock_override", "profiles", email, `Cleared customer identity verification lock for ${email}.`, { reason: clean(reason, 500) });
}

async function seedServicePlans(DB) {
  const plans = [
    ["personal", "Explore", "Monthly subscription", "£5.99", 599, "", "", "Essential planning builders", "Save and revisit your plans", "A simple starting point for exploring ideas and building clear, practical plans.", "Subscribe to Explore", 1, 0, 10],
    ["standard", "Plan", "Monthly subscription", "£7.99", 799, "", "", "More builders and planning tools", "Download your finished plans", "For regularly creating detailed destination, itinerary, experience and everyday plans.", "Subscribe to Plan", 1, 1, 20],
    ["professional", "Complete", "Monthly subscription", "£14.99", 1499, "", "", "Full planning-builder access", "Enhanced planning and outputs", "Complete access for building and managing more comprehensive personalised plans.", "Subscribe to Complete", 1, 0, 30],
    ["org_starter", "Together", "Monthly subscription", "£39.99", 3999, "", "", "Shared planning for groups", "All builders and collaborative tools", "Shared planning for households, families and groups who want to build plans together.", "Subscribe to Together", 1, 0, 40]
  ];

  for (const plan of plans) {
    await DB.prepare(`
      INSERT INTO service_plans (
        id, plan_name, plan_type, price_label, price_pence, stripe_product_id, stripe_price_id,
        delivery_time, revisions, description, button_label, is_active, is_featured, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(...plan).run();
  }

  return plans;
}

async function seedDefaults(DB) {
  await seedServicePlans(DB);

  const branding = await DB.prepare(`SELECT id FROM company_branding WHERE id = 'main'`).first();
  if (!branding) {
    await DB.prepare(`
      INSERT INTO company_branding (
        id, business_name, trading_name, service_name, support_email, contact_email,
        phone, website, registered_notice, footer_notice, public_brand_text, logo_url, favicon_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      "main",
      "JA Group Services Ltd",
      "Sousa Murray Planeia",
      "Sousa Murray Planeia",
      "contact@jagroupservices.co.uk",
      "contact@jagroupservices.co.uk",
      "",
      "https://sousamurrayplaneia.jagroupservices.co.uk",
      "Sousa Murray Planeia is a service line of JA Group Services Ltd.",
      "Sousa Murray Planeia is operated by JA Group Services Ltd.",
      "Curated discovery, planning and experience guidance.",
      "",
      ""
    ).run();
  }

  const policies = [
    ["terms-of-service", "Terms of Service", "# Terms of Service\n\nThese terms explain the basis on which Sousa Murray Planeia provides discovery, planning and guidance services.", "markdown", "1.0", "2026-06-21", "published", 1],
    ["privacy-notice", "Privacy Notice", "# Privacy Notice\n\nThis notice explains how Sousa Murray Planeia handles customer account, enquiry and service information.", "markdown", "1.0", "2026-06-21", "published", 1],
    ["cookie-policy", "Cookie Policy", "# Cookie Policy\n\nThis policy explains how cookies and similar technologies are used by Sousa Murray Planeia.", "markdown", "1.0", "2026-06-21", "draft", 0],
    ["refund-policy", "Refund and Cancellation Policy", "# Refund and Cancellation Policy\n\nThis policy explains refunds, cancellations and service delivery boundaries for paid planning services.", "markdown", "1.0", "2026-06-21", "draft", 0],
    ["affiliate-disclosure", "Affiliate Disclosure", "# Affiliate Disclosure\n\nPlanyx may earn commission from third-party providers where customers book through affiliate links.", "markdown", "1.0", "2026-06-21", "draft", 0],
    ["important-information", "Important Information", "# Important Information\n\nPlanyx provides planning and guidance support only. Third-party bookings remain subject to provider terms.", "markdown", "1.0", "2026-06-21", "draft", 0]
  ];

  for (const policy of policies) {
    await DB.prepare(`
      INSERT OR IGNORE INTO policy_pages (slug, title, content, content_type, version, effective_date, status, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...policy).run();
  }
}

async function getOverview(DB) {
  const [customers, plans, activePlans, policies, tickets, openIssues, admins, dpr, systemReports, closures, lifetime] = await Promise.all([
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles`).first().catch(() => ({ count: 0 })),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM service_plans`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM service_plans WHERE is_active = 1`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM policy_pages`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM support_tickets`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM system_events WHERE lower(status) NOT IN ('resolved', 'closed')`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM admin_users`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM data_protection_requests WHERE lower(status) NOT IN ('completed', 'closed', 'refused / not applicable')`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM system_reports WHERE lower(status) NOT IN ('resolved', 'rejected', 'fixed', 'closed', 'duplicate / not reproducible')`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM closure_requests WHERE lower(status) NOT IN ('completed', 'rejected')`), { count: 0 }),
    safeFirst(DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE admin_lifetime = 1`), { count: 0 })
  ]);

  const launchgateway = await getLaunchGateway(DB);
  const maintenance = await getMaintenance(DB);
  const [recentAudit, latestCustomers, latestSupport, latestReports, sessions, activeAdmins] = await Promise.all([
    safeAll(DB, `SELECT action, actor_email, entity_type, entity_id, summary, metadata, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 8`),
    safeAll(DB, `SELECT email, verified_name, display_name, contact_email, updated_at FROM profiles ORDER BY updated_at DESC, created_at DESC LIMIT 6`),
    safeAll(DB, `SELECT id, subject, status, priority, updated_at FROM support_tickets ORDER BY updated_at DESC, created_at DESC LIMIT 6`),
    safeAll(DB, `SELECT id, issue_type AS title, status, updated_at FROM system_reports ORDER BY updated_at DESC, created_at DESC LIMIT 6`),
    safeAll(DB, `SELECT token_hash, email AS admin_email, created_at, absolute_expires_at AS expires_at, revoked_at, last_seen_at AS last_used_at FROM admin_oidc_sessions ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 6`),
    safeAll(DB, `SELECT email, name, role, status, updated_at FROM admin_users WHERE COALESCE(status, 'Active') = 'Active' ORDER BY updated_at DESC LIMIT 12`)
  ]);

  return {
    customers: customers?.count || 0,
    plans: plans?.count || 0,
    activePlans: activePlans?.count || 0,
    policies: policies?.count || 0,
    supportTickets: tickets?.count || 0,
    openIssues: openIssues?.count || 0,
    dataProtectionRequests: dpr?.count || 0,
    systemReports: systemReports?.count || 0,
    closureRequests: closures?.count || 0,
    lifetimeUsers: lifetime?.count || 0,
    admins: admins?.count || 0,
    launchGatewayStatus: launchgateway.launchgateway_enabled === "true" ? "On" : "Off",
    maintenanceStatus: maintenance.maintenance_enabled === "true" ? "On" : "Off",
    recentAudit,
    latestCustomers,
    latestSupport,
    latestReports,
    sessions,
    activeAdmins
  };
}

async function getAnalytics(DB) {
  const [
    users,
    newUsers,
    lifetimeUsers,
    freeUsers,
    paidUsers,
    enquiries,
    supportOpen,
    dprOpen,
    closureOpen,
    reports,
    planChanges,
    emailTests
  ] = await Promise.all([
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE created_at >= datetime('now', 'start of month')`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE admin_lifetime = 1`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE COALESCE(admin_lifetime, 0) = 0`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE admin_customer_status NOT IN ('Standard', 'Free')`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM enquiries`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM support_tickets WHERE lower(status) NOT IN ('resolved', 'closed')`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM data_protection_requests WHERE lower(status) NOT IN ('sent', 'closed', 'rejected', 'completed')`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM closure_requests WHERE lower(status) NOT IN ('completed', 'rejected')`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM system_reports`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM admin_audit_log WHERE action LIKE '%plan%' OR action LIKE '%lifetime%'`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'test_notification'`).first().catch(() => ({ count: 0 }))
  ]);

  return {
    totalUsers: users?.count || 0,
    newUsersThisMonth: newUsers?.count || 0,
    activeUsers: users?.count || 0,
    lifetimeUsers: lifetimeUsers?.count || 0,
    freeUsers: freeUsers?.count || 0,
    paidUsers: paidUsers?.count || 0,
    totalBookingsOrReferrals: 0,
    totalEnquiries: enquiries?.count || 0,
    openSupportRequests: supportOpen?.count || 0,
    openDataRequests: dprOpen?.count || 0,
    openClosureRequests: closureOpen?.count || 0,
    systemReportsSubmitted: reports?.count || 0,
    planChanges: planChanges?.count || 0,
    emailNotificationStatus: emailTests?.count ? `${emailTests.count} test attempts logged` : "No test attempts logged"
  };
}

async function getNotifications(DB) {
  const [notifications, unread, archived, categories] = await Promise.all([
    all(DB, `SELECT * FROM customer_notifications ORDER BY updated_at DESC, created_at DESC LIMIT 200`),
    DB.prepare(`SELECT COUNT(*) AS count FROM customer_notifications WHERE lower(status) = 'unread'`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM customer_notifications WHERE archived_at IS NOT NULL`).first().catch(() => ({ count: 0 })),
    all(DB, `SELECT category, COUNT(*) AS count FROM customer_notifications GROUP BY category ORDER BY count DESC`)
  ]);
  return { notifications, unread: unread?.count || 0, archived: archived?.count || 0, categories };
}

async function getMembership(DB) {
  const [members, lifetime, suspended, cancelled, trial, complimentary, history] = await Promise.all([
    all(DB, `SELECT email, display_name, contact_email, admin_customer_status, admin_lifetime, admin_lifetime_plan_id, updated_at FROM profiles ORDER BY updated_at DESC LIMIT 200`),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE admin_lifetime = 1`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE lower(admin_customer_status) = 'suspended'`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE lower(admin_customer_status) = 'cancelled'`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE lower(admin_customer_status) = 'trial'`).first().catch(() => ({ count: 0 })),
    DB.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE lower(admin_customer_status) = 'complimentary'`).first().catch(() => ({ count: 0 })),
    all(DB, `SELECT action, entity_id, summary, created_at FROM admin_audit_log WHERE action LIKE '%plan%' OR action LIKE '%lifetime%' ORDER BY created_at DESC LIMIT 50`)
  ]);
  return {
    members,
    summary: {
      lifetime: lifetime?.count || 0,
      suspended: suspended?.count || 0,
      cancelled: cancelled?.count || 0,
      trial: trial?.count || 0,
      complimentary: complimentary?.count || 0
    },
    history
  };
}

async function getSecurity(DB) {
  const [pins, sessions, history] = await Promise.all([
    safeAll(DB, `SELECT email, status, expires_at, used_at, revoked_at, last_used_at, updated_at, created_at FROM customer_support_pins_v2 ORDER BY updated_at DESC LIMIT 100`),
    safeAll(DB, `SELECT email AS admin_email, created_at, absolute_expires_at AS expires_at, revoked_at, last_seen_at AS last_used_at FROM admin_oidc_sessions ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 50`),
    safeAll(DB, `SELECT action, entity_type, entity_id, summary, created_at FROM admin_audit_log WHERE action LIKE '%session%' OR action LIKE '%pin%' ORDER BY created_at DESC LIMIT 50`)
  ]);
  return { pins, sessions, history };
}

async function getCms(DB) {
  const [branding, policies, affiliate, settings] = await Promise.all([
    DB.prepare(`SELECT * FROM company_branding WHERE id = 'main'`).first(),
    all(DB, `SELECT slug, title, status, is_published, updated_at FROM policy_pages ORDER BY updated_at DESC`),
    all(DB, `SELECT id, title, block_type, is_enabled, is_published, sort_order, updated_at FROM affiliate_content_blocks ORDER BY sort_order ASC, updated_at DESC`),
    all(DB, `SELECT key, value, updated_at FROM site_settings ORDER BY key ASC`)
  ]);
  return { branding, policies, affiliate, settings };
}

async function getAdmins(DB, env) {
  const rows = await all(DB, `SELECT * FROM admin_users ORDER BY email ASC`);
  const defaults = configuredAdmins(env);
  const seen = new Set(rows.map((row) => row.email));
  for (const email of defaults) {
    if (!seen.has(email)) {
      rows.push({ email, name: email, role: "Platform Owner", status: "Active", permissions: "[\"*\"]", favourites: "[]", source: "default", created_by: "system", created_at: null, updated_at: null });
    }
  }
  const withHistory = [];
  for (const row of rows.sort((a, b) => a.email.localeCompare(b.email))) {
    withHistory.push({
      ...row,
      login_history: await getAdminActivity(DB, row.email)
    });
  }
  return withHistory;
}

async function getRoles(DB) {
  const roles = await all(DB, `
    SELECT
      r.name,
      r.description,
      r.is_system,
      r.updated_at,
      COALESCE(users.assigned_count, 0) AS assigned_count
    FROM admin_roles r
    LEFT JOIN (
      SELECT role, COUNT(*) AS assigned_count
      FROM admin_users
      GROUP BY role
    ) users ON users.role = r.name
    ORDER BY r.is_system DESC, r.name ASC
  `);

  const permissionsByRole = await all(DB, `
    SELECT role_name, permission_code
    FROM role_permissions
    ORDER BY role_name ASC, permission_code ASC
  `);

  const grouped = new Map();
  for (const row of permissionsByRole) {
    if (!grouped.has(row.role_name)) grouped.set(row.role_name, []);
    grouped.get(row.role_name).push(row.permission_code);
  }

  return roles.map((role) => ({
    ...role,
    is_system: Number(role.is_system || 0),
    assigned_count: Number(role.assigned_count || 0),
    permissions: grouped.get(role.name) || []
  }));
}

async function ensureRoleWritable(DB, roleName) {
  const role = await DB.prepare(`SELECT name, is_system FROM admin_roles WHERE name = ?`).bind(roleName).first();
  if (!role) throw new Error("Role not found.");
  if (Number(role.is_system || 0) === 1 && role.name === "Platform Owner") throw new Error("The Platform Owner role cannot be modified.");
  return role;
}

function normalisePermissionList(permissions) {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.map((permission) => clean(permission, 80)).filter(Boolean))];
}

async function createRole(DB, body, identity) {
  const name = clean(body.name, 80);
  if (!name) throw new Error("Role name is required.");
  const description = clean(body.description, 240) || `${name} role`;
  const existing = await DB.prepare(`SELECT name FROM admin_roles WHERE name = ?`).bind(name).first();
  if (existing) throw new Error("A role with that name already exists.");
  const permissions = normalisePermissionList(body.permissions);

  await DB.prepare(`
    INSERT INTO admin_roles (name, description, is_system, updated_at)
    VALUES (?, ?, 0, CURRENT_TIMESTAMP)
  `).bind(name, description).run();

  for (const permission of permissions) {
    await DB.prepare(`
      INSERT INTO admin_permissions (code, description, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `).bind(permission, permission).run();
    await DB.prepare(`
      INSERT INTO role_permissions (role_name, permission_code)
      VALUES (?, ?)
      ON CONFLICT(role_name, permission_code) DO NOTHING
    `).bind(name, permission).run();
  }

  await writeAudit(DB, identity, "role_create", "admin_roles", name, `Created role ${name}.`, { permissions });
  return getRoles(DB);
}

async function updateRole(DB, body, identity) {
  const name = clean(body.name, 80);
  if (!name) throw new Error("Role name is required.");
  const role = await ensureRoleWritable(DB, name);
  const description = clean(body.description, 240) || role.description || `${name} role`;
  const permissions = normalisePermissionList(body.permissions);

  await DB.prepare(`
    UPDATE admin_roles
    SET description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE name = ?
  `).bind(description, name).run();

  await DB.prepare(`DELETE FROM role_permissions WHERE role_name = ?`).bind(name).run();
  for (const permission of permissions) {
    await DB.prepare(`
      INSERT INTO admin_permissions (code, description, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `).bind(permission, permission).run();
    await DB.prepare(`
      INSERT INTO role_permissions (role_name, permission_code)
      VALUES (?, ?)
      ON CONFLICT(role_name, permission_code) DO NOTHING
    `).bind(name, permission).run();
  }

  await writeAudit(DB, identity, "role_update", "admin_roles", name, `Updated role ${name}.`, { permissions });
  return getRoles(DB);
}

async function renameRole(DB, body, identity) {
  const from = clean(body.from, 80);
  const to = clean(body.to, 80);
  if (!from || !to) throw new Error("Both the current and new role names are required.");
  if (from === "Platform Owner") throw new Error("The Platform Owner role cannot be renamed.");
  if (from === to) return getRoles(DB);
  const existing = await DB.prepare(`SELECT name, is_system FROM admin_roles WHERE name = ?`).bind(from).first();
  if (!existing) throw new Error("Role not found.");
  const conflict = await DB.prepare(`SELECT name FROM admin_roles WHERE name = ?`).bind(to).first();
  if (conflict) throw new Error("A role with that name already exists.");

  await DB.prepare(`UPDATE admin_roles SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`).bind(to, from).run();
  await DB.prepare(`UPDATE role_permissions SET role_name = ? WHERE role_name = ?`).bind(to, from).run();
  await DB.prepare(`UPDATE admin_users SET role = ? WHERE role = ?`).bind(to, from).run();
  await writeAudit(DB, identity, "role_rename", "admin_roles", from, `Renamed role ${from} to ${to}.`, { from, to });
  return getRoles(DB);
}

async function cloneRole(DB, body, identity) {
  const source = clean(body.source, 80);
  const name = clean(body.name, 80);
  if (!source || !name) throw new Error("Source and new role names are required.");
  const existing = await DB.prepare(`SELECT name FROM admin_roles WHERE name = ?`).bind(name).first();
  if (existing) throw new Error("A role with that name already exists.");
  const role = await DB.prepare(`SELECT name, description FROM admin_roles WHERE name = ?`).bind(source).first();
  if (!role) throw new Error("Role not found.");
  const permissions = await all(DB, `SELECT permission_code FROM role_permissions WHERE role_name = ? ORDER BY permission_code ASC`, [source]);

  await DB.prepare(`
    INSERT INTO admin_roles (name, description, is_system, updated_at)
    VALUES (?, ?, 0, CURRENT_TIMESTAMP)
  `).bind(name, `${role.description || source} copy`).run();
  for (const row of permissions) {
    await DB.prepare(`
      INSERT INTO role_permissions (role_name, permission_code)
      VALUES (?, ?)
      ON CONFLICT(role_name, permission_code) DO NOTHING
    `).bind(name, row.permission_code).run();
  }
  await writeAudit(DB, identity, "role_clone", "admin_roles", name, `Cloned role ${source} to ${name}.`, { source, name });
  return getRoles(DB);
}

async function deleteRole(DB, body, identity) {
  const name = clean(body.name, 80);
  if (!name) throw new Error("Role name is required.");
  const role = await ensureRoleWritable(DB, name);
  if (Number(role.is_system || 0) === 1) throw new Error("System roles cannot be deleted.");
  const assigned = await DB.prepare(`SELECT COUNT(*) AS count FROM admin_users WHERE role = ?`).bind(name).first();
  if (Number(assigned?.count || 0) > 0) throw new Error("This role is still assigned to administrators.");
  await DB.prepare(`DELETE FROM role_permissions WHERE role_name = ?`).bind(name).run();
  await DB.prepare(`DELETE FROM admin_roles WHERE name = ?`).bind(name).run();
  await writeAudit(DB, identity, "role_delete", "admin_roles", name, `Deleted role ${name}.`, {});
  return getRoles(DB);
}

async function getRoleSummary(DB) {
  const roles = await getRoles(DB);
  return roles.map((role) => ({
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    assigned_count: role.assigned_count,
    permissions: role.permissions
  }));
}

function dashboardPresetForRole(role, permissions) {
  role = canonicalRoleName(role);
  if (role === "Platform Owner" || permissions.includes("*")) {
    return ["overview", "status", "analytics", "customers", "customer", "admins", "roles", "sessions", "builders", "plans", "credits", "usage", "addons", "platformsettings", "stripe", "enquiries", "support", "notifications", "membership", "security", "cms", "systemreports", "datarequests", "closures", "policies", "branding", "launchgateway", "maintenance", "audit", "email", "reports"];
  }
  if (role === "Senior Administrator") {
    return ["overview", "customers", "customer", "users", "builders", "plans", "credits", "usage", "addons", "platformsettings", "branding", "launchgateway", "maintenance", "status", "analytics", "enquiries", "support", "notifications", "membership", "security", "cms", "systemreports", "audit", "reports"];
  }
  if (role === "Finance") return ["overview", "stripe", "plans", "audit", "reports"];
  if (role === "Customer Support") return ["overview", "customers", "customer", "usage", "enquiries", "support", "notifications", "membership", "security", "datarequests", "closures", "systemreports", "audit"];
  if (role === "Marketing & Content") return ["overview", "branding", "cms", "launchgateway", "maintenance", "policies", "affiliate", "email"];
  if (role === "Compliance & Data Protection") return ["overview", "audit", "datarequests", "closures", "policies", "reports"];
  if (role === "Auditor") return ["overview", "audit"];
  return ["overview", "customers", "builders", "plans", "credits", "usage", "addons", "platformsettings", "status", "analytics", "enquiries", "support"];
}

function widgetCatalog() {
  return [
    { id: "live_status", label: "Live Website Status", section: "status", permission: "view_dashboard", tone: "online" },
    { id: "statuspage", label: "Statuspage Health", section: "status", permission: "manage_status", tone: "online" },
    { id: "worker_health", label: "Worker Health", section: "overview", permission: "view_dashboard", tone: "online" },
    { id: "database_health", label: "Database Health", section: "overview", permission: "view_dashboard", tone: "online" },
    { id: "stripe_health", label: "Stripe Health", section: "stripe", permission: "manage_stripe", tone: "warning" },
    { id: "api_health", label: "API Health", section: "overview", permission: "view_dashboard", tone: "online" },
    { id: "recent_audit", label: "Recent Audit Events", section: "audit", permission: "manage_audit", tone: "online" },
    { id: "active_admins", label: "Active Administrators", section: "admins", permission: "manage_admins", tone: "online" },
    { id: "active_sessions", label: "Active Sessions", section: "sessions", permission: "manage_api", tone: "online" },
    { id: "latest_customers", label: "Latest Customer Activity", section: "customers", permission: "manage_crm", tone: "online" },
    { id: "latest_support", label: "Latest Support Activity", section: "support", permission: "manage_support", tone: "online" },
    { id: "latest_reports", label: "Latest System Reports", section: "systemreports", permission: "manage_system_reports", tone: "warning" },
    { id: "latest_plans", label: "Latest Plan Changes", section: "plans", permission: "manage_plans", tone: "online" },
    { id: "latest_data_requests", label: "Latest Data Requests", section: "datarequests", permission: "manage_data_requests", tone: "online" },
    { id: "latest_closures", label: "Latest Closure Requests", section: "closures", permission: "manage_closure_requests", tone: "online" }
  ];
}

function widgetSetForRole(role, permissions) {
  role = canonicalRoleName(role);
  const allowed = new Set();
  const available = widgetCatalog();
  const preset = dashboardPresetForRole(role, permissions);
  for (const widget of available) {
    if (permissions.includes("*") || permissions.includes(widget.permission) || widget.permission === "view_dashboard") {
      if (preset.includes(widget.section) || role === "Platform Owner" || permissions.includes("*")) allowed.add(widget.id);
    }
  }
  return available.filter((widget) => allowed.has(widget.id));
}

async function addAdmin(DB, body, identity) {
  const email = cleanEmail(body.email);
  if (!isEmail(email)) throw new Error("Enter a valid admin email address.");
  const existing = await DB.prepare(`SELECT role FROM admin_users WHERE lower(email) = lower(?)`).bind(email).first();
  const nextRole = existing?.role === "Platform Owner" ? "Platform Owner" : clean(body.role, 80) || "Administrator";
  if (nextRole !== "Platform Owner") {
    const role = await DB.prepare(`SELECT name FROM admin_roles WHERE name = ?`).bind(nextRole).first();
    if (!role) throw new Error("Selected role does not exist.");
  }
  const nextPermissions = nextRole === "Platform Owner"
    ? ["*"]
    : (Array.isArray(body.permissions) && body.permissions.length ? normalisePermissionList(body.permissions) : await getRoleDefaultPermissions(DB, nextRole));

  await DB.prepare(`
    INSERT INTO admin_users (email, name, role, status, permissions, source, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, 'portal', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      role = CASE WHEN admin_users.role = 'Platform Owner' THEN 'Platform Owner' ELSE excluded.role END,
      status = CASE WHEN admin_users.role = 'Platform Owner' THEN 'Active' ELSE excluded.status END,
      permissions = CASE WHEN admin_users.role = 'Platform Owner' THEN '["*"]' ELSE excluded.permissions END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    email,
    clean(body.name || email, 180),
    nextRole,
    clean(body.status, 80) || "Active",
    JSON.stringify(nextPermissions),
    identity.email
  ).run();
}

async function updateAdmin(DB, body, identity, env) {
  const originalEmail = cleanEmail(body.original_email || body.email);
  const nextEmail = cleanEmail(body.email);
  if (!isEmail(originalEmail)) throw new Error("Admin email is required.");
  if (!isEmail(nextEmail)) throw new Error("New admin email is required.");
  const current = await DB.prepare(`SELECT email, role, status, permissions, source FROM admin_users WHERE lower(email) = lower(?)`).bind(originalEmail).first();
  if (!current) throw new Error("Administrator not found.");
  if (current.role === "Platform Owner") {
    await DB.prepare(`UPDATE admin_users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower(?)`).bind(clean(body.name || nextEmail, 180), originalEmail).run();
    return getAdmins(DB, env);
  }

  const nextRole = clean(body.role, 80) || current.role || "Administrator";
  if (nextRole === "Platform Owner") throw new Error("Only the existing Platform Owner can hold that role.");
  const roleExists = await DB.prepare(`SELECT name FROM admin_roles WHERE name = ?`).bind(nextRole).first();
  if (!roleExists) throw new Error("Selected role does not exist.");
  const nextStatus = ["Active", "Inactive", "Suspended"].includes(clean(body.status, 80)) ? clean(body.status, 80) : (current.status || "Active");
  const nextPermissions = nextRole === "Platform Owner"
    ? ["*"]
    : (Array.isArray(body.permissions) && body.permissions.length ? normalisePermissionList(body.permissions) : await getRoleDefaultPermissions(DB, nextRole));
  if (nextEmail !== originalEmail) {
    const emailExists = await DB.prepare(`SELECT email FROM admin_users WHERE lower(email) = lower(?)`).bind(nextEmail).first();
    if (emailExists) throw new Error("Another administrator already uses that email.");
  }

  await DB.prepare(`
    UPDATE admin_users SET
      email = ?,
      name = ?,
      role = ?,
      status = ?,
      permissions = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)
  `).bind(
    nextEmail,
    clean(body.name || nextEmail, 180),
    nextRole,
    nextStatus,
    JSON.stringify(nextPermissions),
    originalEmail
  ).run();

  await DB.prepare(`UPDATE admin_audit_log SET actor_email = ? WHERE lower(actor_email) = lower(?)`).bind(nextEmail, originalEmail).run();
  await DB.prepare(`UPDATE admin_preferences SET email = ? WHERE lower(email) = lower(?)`).bind(nextEmail, originalEmail).run();
  return getAdmins(DB, env);
}

async function removeAdmin(DB, body, identity, env) {
  const email = cleanEmail(body.email);
  if (!isEmail(email)) throw new Error("Admin email is required.");
  const current = await DB.prepare(`SELECT role FROM admin_users WHERE lower(email) = lower(?)`).bind(email).first();
  if (current?.role === "Platform Owner") throw new Error("The Platform Owner cannot be removed.");

  const admins = await getAdmins(DB, env);
  if (admins.length <= 1) throw new Error("The last remaining admin cannot be removed.");
  if (configuredAdmins(env).includes(email)) throw new Error("Default environment admins cannot be removed from the portal.");
  if (email === identity.email && admins.length <= 1) throw new Error("You cannot remove the final admin account.");

  await DB.prepare(`DELETE FROM admin_users WHERE lower(email) = lower(?)`).bind(email).run();
}

async function saveAdminPreferences(DB, body, identity) {
  const allowedSections = new Set(["overview", "operations", "status", "analytics", "audit", "admins", "roles", "sessions", "customers", "datarequests", "systemreports", "closures", "support", "enquiries", "system", "builders", "plans", "credits", "usage", "addons", "platformsettings", "stripe", "email", "branding", "appearance", "affiliate", "launchgateway", "maintenance", "policies", "systemsettings"]);
  const favourites = Array.isArray(body.favourites)
    ? body.favourites.map((item) => clean(item, 80)).filter((item) => allowedSections.has(item)).slice(0, 12)
    : [];
  const dashboardPreferences = safeJson(body.dashboard_preferences, {});
  const notificationPreferences = safeJson(body.notification_preferences, {});
  const recentlyUsed = Array.isArray(body.recently_used)
    ? body.recently_used.map((item) => clean(item, 80)).filter((item) => allowedSections.has(item)).slice(0, 12)
    : [];
  const preferredLandingPage = clean(body.preferred_landing_page, 80);
  const sidebarCollapsed = Boolean(body.sidebar_collapsed);
  const themePreference = ["light", "dark", "system"].includes(clean(body.theme_preference, 20)) ? clean(body.theme_preference, 20) : "system";

  await DB.prepare(`
    INSERT INTO admin_preferences (email, favourites, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      favourites = excluded.favourites,
      updated_at = CURRENT_TIMESTAMP
  `).bind(identity.email, JSON.stringify(favourites)).run();

  await DB.prepare(`
    UPDATE admin_preferences SET
      dashboard_preferences = ?,
      notification_preferences = ?,
      recently_used = ?,
      preferred_landing_page = ?,
      sidebar_collapsed = ?,
      theme_preference = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)
  `).bind(
    JSON.stringify(dashboardPreferences || {}),
    JSON.stringify(notificationPreferences || {}),
    JSON.stringify(recentlyUsed),
    preferredLandingPage || "overview",
    sidebarCollapsed ? 1 : 0,
    themePreference,
    identity.email
  ).run();

  return {
    favourites,
    dashboard_preferences: dashboardPreferences || {},
    notification_preferences: notificationPreferences || {},
    recently_used: recentlyUsed,
    preferred_landing_page: preferredLandingPage || "overview",
    sidebar_collapsed: sidebarCollapsed ? 1 : 0,
    theme_preference: themePreference
  };
}

async function getAdminPreferences(DB, identity) {
  const row = await DB.prepare(`SELECT favourites, dashboard_preferences, notification_preferences, recently_used, preferred_landing_page, sidebar_collapsed, theme_preference FROM admin_preferences WHERE lower(email) = lower(?)`).bind(identity.email).first();
  return {
    favourites: safeJson(row?.favourites, []).filter(Boolean),
    dashboard_preferences: safeJson(row?.dashboard_preferences, {}),
    notification_preferences: safeJson(row?.notification_preferences, {}),
    recently_used: safeJson(row?.recently_used, []).filter(Boolean),
    preferred_landing_page: row?.preferred_landing_page || "overview",
    sidebar_collapsed: Number(row?.sidebar_collapsed || 0) === 1,
    theme_preference: row?.theme_preference || "system"
  };
}

function defaultLandingPageForRole(role, permissions) {
  role = canonicalRoleName(role);
  if (role === "Platform Owner" || permissions.includes("*")) return "overview";
  if (role === "Senior Administrator") return "overview";
  if (role === "Finance") return "stripe";
  if (role === "Customer Support") return "support";
  if (role === "Marketing & Content") return "branding";
  if (role === "Compliance & Data Protection") return "audit";
  if (role === "Auditor") return "audit";
  return "overview";
}

function preparePlanSave(DB, body) {
  const id = clean(body.id, 120) || crypto.randomUUID();
  const planName = clean(body.plan_name, 180);
  if (!planName) throw new Error("Plan name is required.");

  return DB.prepare(`
    INSERT INTO service_plans (
      id, plan_name, plan_type, price_label, price_pence, stripe_product_id, stripe_price_id,
      delivery_time, revisions, description, button_label, is_active, is_featured, sort_order, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      plan_name = excluded.plan_name,
      plan_type = excluded.plan_type,
      price_label = excluded.price_label,
      price_pence = excluded.price_pence,
      stripe_product_id = excluded.stripe_product_id,
      stripe_price_id = excluded.stripe_price_id,
      delivery_time = excluded.delivery_time,
      revisions = excluded.revisions,
      description = excluded.description,
      button_label = excluded.button_label,
      is_active = excluded.is_active,
      is_featured = excluded.is_featured,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    planName,
    clean(body.plan_type, 80),
    clean(body.price_label, 40),
    Number(body.price_pence || 0),
    clean(body.stripe_product_id, 180),
    clean(body.stripe_price_id, 180),
    clean(body.delivery_time, 120),
    clean(body.revisions, 120),
    clean(body.description, 1000),
    clean(body.button_label, 80) || "Buy now securely",
    body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
    body.is_featured ? 1 : 0,
    Number(body.sort_order || 100)
  );
}

export async function savePlan(DB, body) {
  await preparePlanSave(DB, body).run();
  return all(DB, `SELECT * FROM service_plans ORDER BY sort_order ASC, plan_name ASC`);
}

export async function savePlans(DB, incoming) {
  const plans = Array.isArray(incoming) ? incoming : [];
  if (!plans.length) throw new Error("No plan changes were supplied.");

  for (const plan of plans) {
    if (!clean(plan.id, 120)) throw new Error("Every plan requires an ID.");
    if (!clean(plan.plan_name, 180)) throw new Error("Every plan requires a name.");
  }

  const statements = plans.map((plan) => preparePlanSave(DB, plan));
  if (typeof DB.batch === "function") await DB.batch(statements);
  else for (const statement of statements) await statement.run();
  return all(DB, `SELECT * FROM service_plans ORDER BY sort_order ASC, plan_name ASC`);
}

async function savePolicy(DB, body) {
  const slug = cleanSlug(body.slug);
  const originalSlug = cleanSlug(body.original_slug || body.slug);
  if (!slug) throw new Error("Policy slug is required.");

  const status = body.is_published || body.status === "published" ? "published" : "draft";

  if (originalSlug && originalSlug !== slug) {
    const existing = await DB.prepare(`SELECT slug FROM policy_pages WHERE slug = ?`).bind(slug).first();
    if (existing) throw new Error("A policy with this slug already exists.");
  }

  await DB.prepare(`
    INSERT INTO policy_pages (slug, title, content, content_type, version, effective_date, status, is_published, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      content_type = excluded.content_type,
      version = excluded.version,
      effective_date = excluded.effective_date,
      status = excluded.status,
      is_published = excluded.is_published,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    slug,
    clean(body.title, 180),
    clean(body.content, 20000),
    clean(body.content_type, 20) || "markdown",
    clean(body.version, 40) || "1.0",
    clean(body.effective_date, 40),
    status,
    status === "published" ? 1 : 0
  ).run();

  if (originalSlug && originalSlug !== slug) {
    await DB.prepare(`DELETE FROM policy_pages WHERE slug = ?`).bind(originalSlug).run();
  }

  return all(DB, `SELECT * FROM policy_pages ORDER BY title ASC`);
}

async function saveBranding(DB, body) {
  await DB.prepare(`
    INSERT INTO company_branding (
      id, business_name, trading_name, service_name, support_email, contact_email,
      phone, website, registered_notice, footer_notice, public_brand_text, logo_url, favicon_url, updated_at
    )
    VALUES ('main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      business_name = excluded.business_name,
      trading_name = excluded.trading_name,
      service_name = excluded.service_name,
      support_email = excluded.support_email,
      contact_email = excluded.contact_email,
      phone = excluded.phone,
      website = excluded.website,
      registered_notice = excluded.registered_notice,
      footer_notice = excluded.footer_notice,
      public_brand_text = excluded.public_brand_text,
      logo_url = excluded.logo_url,
      favicon_url = excluded.favicon_url,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    clean(body.business_name, 180),
    clean(body.trading_name, 180),
    clean(body.service_name, 180),
    "contact@jagroupservices.co.uk",
    "contact@jagroupservices.co.uk",
    "020 3834 2790",
    clean(body.website, 250),
    clean(body.registered_notice, 1000),
    clean(body.footer_notice, 1000),
    clean(body.public_brand_text, 500),
    clean(body.logo_url, 500),
    clean(body.favicon_url, 500)
  ).run();

  return DB.prepare(`SELECT * FROM company_branding WHERE id = 'main'`).first();
}

async function saveSupport(DB, body) {
  const id = clean(body.id, 120) || crypto.randomUUID();
  const reference = clean(body.reference, 80) || (await nextReference(DB, "support_tickets", "SUP"));
  const auditLog = addAudit(body.audit_log || "[]", { type: body.action === "create" ? "Case created" : "Case updated", actor: body.actor || "admin" });
  const subject = clean(body.subject, 250) || "Support case";
  await DB.prepare(`
    INSERT INTO support_tickets (id, reference, customer_email, customer_name, category, department, assigned_admin, subject, status, priority, sla_target, notes, customer_replies, attachments, resolution_summary, audit_log, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      reference = excluded.reference,
      customer_email = excluded.customer_email,
      customer_name = excluded.customer_name,
      category = excluded.category,
      department = excluded.department,
      assigned_admin = excluded.assigned_admin,
      subject = excluded.subject,
      status = excluded.status,
      priority = excluded.priority,
      sla_target = excluded.sla_target,
      notes = excluded.notes,
      customer_replies = excluded.customer_replies,
      attachments = excluded.attachments,
      resolution_summary = excluded.resolution_summary,
      audit_log = excluded.audit_log,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    reference,
    clean(body.customer_email, 180),
    clean(body.customer_name, 180),
    clean(body.category, 80) || "General Enquiry",
    clean(body.department, 80) || "Support",
    clean(body.assigned_admin, 254),
    subject,
    clean(body.status, 80) || "Open",
    clean(body.priority, 80) || "Normal",
    clean(body.sla_target, 80) || "48h",
    clean(body.notes, 4000),
    JSON.stringify(Array.isArray(body.customer_replies) ? body.customer_replies : []),
    JSON.stringify(Array.isArray(body.attachments) ? body.attachments : []),
    clean(body.resolution_summary, 4000),
    auditLog
  ).run();

  return {
    records: await all(DB, `SELECT * FROM support_tickets ORDER BY updated_at DESC, created_at DESC LIMIT 500`),
    saved: { id, reference, subject }
  };
}

async function saveSystemEvent(DB, body) {
  const id = clean(body.id, 120) || crypto.randomUUID();
  await DB.prepare(`
    INSERT INTO system_events (id, type, severity, title, message, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      severity = excluded.severity,
      title = excluded.title,
      message = excluded.message,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    clean(body.type, 100) || "General",
    clean(body.severity, 80) || "Info",
    clean(body.title, 250),
    clean(body.message, 4000),
    clean(body.status, 80) || "Open"
  ).run();

  return all(DB, `SELECT * FROM system_events ORDER BY updated_at DESC, created_at DESC LIMIT 500`);
}

function parseAuditLog(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addAudit(existing, event) {
  return JSON.stringify([
    ...parseAuditLog(existing),
    {
      ...event,
      timestamp: new Date().toISOString()
    }
  ]);
}

function auditActor(identity) {
  return identity.email || identity.name || "admin";
}

async function getDataProtectionRequests(DB) {
  return all(DB, `
    SELECT id, reference, user_id, customer_name, customer_email, request_type, customer_message,
      status, submitted_at, due_at, completed_at, assigned_admin_id, internal_notes,
      attachments, audit_log, created_at, updated_at
    FROM data_protection_requests
    ORDER BY submitted_at DESC, created_at DESC
    LIMIT 500
  `);
}

async function getSystemReports(DB) {
  return all(DB, `
    SELECT id, reference, user_id, customer_name, customer_email, issue_type, affected_url,
      device_browser, description, status, priority, submitted_at, resolved_at, assigned_admin_id,
      internal_notes, attachments, audit_log, created_at, updated_at
    FROM system_reports
    ORDER BY submitted_at DESC, created_at DESC
    LIMIT 500
  `);
}

async function getNotificationsAdmin(DB) {
  return all(DB, `
    SELECT id, email, category, priority, title, body, status, archived_at, reference_type, reference_id,
      template_key, scheduled_for, sent_at, delivery_status, read_at, acknowledged_at, send_history, created_at, updated_at
    FROM customer_notifications
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 500
  `);
}

export async function saveNotification(DB, body, identity) {
  const mode = clean(body.recipient_mode, 20) || "single";
  const recipients = [];
  if (mode === "all") {
    const rows = await all(DB, `SELECT lower(email) AS email FROM profiles WHERE email IS NOT NULL AND trim(email) != ''`);
    recipients.push(...rows.map((row) => cleanEmail(row.email)).filter(Boolean));
  } else if (mode === "multiple") {
    recipients.push(...String(body.recipient_emails || body.email || "").split(/[,;\n]+/).map((value) => cleanEmail(value)).filter(Boolean));
  } else {
    recipients.push(cleanEmail(body.email));
  }

  const recipientsToSave = [...new Set(recipients.filter(Boolean))];
  if (!recipientsToSave.length) {
    throw new Error("At least one customer recipient is required.");
  }

  const created = [];
  for (const email of recipientsToSave) {
    const id = clean(body.id, 120) || crypto.randomUUID();
    const current = await DB.prepare(`SELECT * FROM customer_notifications WHERE id = ?`).bind(id).first();
    const status = clean(body.status, 40) || "Draft";
    const deliveryStatus = clean(body.delivery_status, 40) || (status === "Scheduled" ? "Scheduled" : status === "Sent" ? "Sent" : "Draft");
    const sendHistory = addAudit(current?.send_history || "[]", { type: body.action || "save", actor: auditActor(identity), status, deliveryStatus, recipient: email });
    await DB.prepare(`
      INSERT INTO customer_notifications (
        id, email, category, priority, title, body, status, archived_at, reference_type, reference_id,
        template_key, scheduled_for, sent_at, delivery_status, read_at, acknowledged_at, send_history, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        category = excluded.category,
        priority = excluded.priority,
        title = excluded.title,
        body = excluded.body,
        status = excluded.status,
        archived_at = excluded.archived_at,
        reference_type = excluded.reference_type,
        reference_id = excluded.reference_id,
        template_key = excluded.template_key,
        scheduled_for = excluded.scheduled_for,
        sent_at = excluded.sent_at,
        delivery_status = excluded.delivery_status,
        read_at = excluded.read_at,
        acknowledged_at = excluded.acknowledged_at,
        send_history = excluded.send_history,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      `${id}-${email}`,
      email,
      clean(body.category, 80) || "General",
      clean(body.priority, 40) || "Normal",
      clean(body.title, 180),
      clean(body.body, 4000),
      status,
      body.archived_at || null,
      clean(body.reference_type, 80),
      clean(body.reference_id, 120),
      clean(body.template_key, 80),
      clean(body.scheduled_for, 40),
      clean(body.sent_at, 40),
      deliveryStatus,
      clean(body.read_at, 40),
      clean(body.acknowledged_at, 40),
      sendHistory
    ).run();
    created.push(email);
  }
  return getNotificationsAdmin(DB);
}

async function saveDataProtectionRequest(DB, body, identity, env = {}) {
  const current = await DB.prepare(`SELECT * FROM data_protection_requests WHERE id = ? OR reference = ?`).bind(clean(body.id, 120), clean(body.reference, 120)).first();
  if (!current) throw new Error("Data protection request not found.");

  const nextStatus = clean(body.status, 80) || current.status || "New";
  const nextNotes = clean(body.internal_notes, 6000);
  const nextAssigned = clean(body.assigned_admin_id, 254);
  const events = [];

  if (nextStatus !== current.status) {
    events.push({ type: "Status changed", actor: auditActor(identity), previousValue: current.status || "", newValue: nextStatus });
  }
  if (body.action === "export_customer_data") {
    events.push({ type: "Customer data exported", actor: auditActor(identity), newValue: clean(body.format, 20) || "json" });
  }
  if (body.action === "mark_sent") {
    events.push({ type: "Data sent to subject", actor: auditActor(identity) });
  }
  if (nextAssigned !== (current.assigned_admin_id || "")) {
    events.push({ type: "Assigned to admin", actor: auditActor(identity), previousValue: current.assigned_admin_id || "", newValue: nextAssigned });
  }
  if (nextNotes && nextNotes !== (current.internal_notes || "")) {
    events.push({ type: "Admin note added", actor: auditActor(identity) });
  }
  if (nextStatus === "Completed" && current.status !== "Completed") {
    events.push({ type: "Marked completed", actor: auditActor(identity) });
  }
  if (nextStatus === "Closed" && current.status !== "Closed") {
    events.push({ type: "Closed", actor: auditActor(identity) });
  }

  let auditLog = current.audit_log || "[]";
  for (const event of events) auditLog = addAudit(auditLog, event);

  if (body.action === "mark_sent") {
    const exportPayload = await exportCustomerData(DB, current.customer_email || current.user_id, "json");
    try {
      await sendProviderEmail(DB, env, {
        to: current.customer_email || current.user_id,
        subject: `Your Sousa Murray Planeia data request ${current.reference}`,
        text: `Please find below the exported customer data for request ${current.reference}.\n\n${exportPayload.content}`
      });
      auditLog = addAudit(auditLog, { type: "Data sent to subject", actor: auditActor(identity), newValue: "Sent by email provider" });
    } catch (error) {
      auditLog = addAudit(auditLog, { type: "Data send failed", actor: auditActor(identity), newValue: error.message || "Email failed" });
      throw new Error(`Data export generated, but email sending failed: ${error.message || "Email provider error"}`);
    }
  }

  const completedAt = nextStatus === "Completed" || nextStatus === "Closed"
    ? (current.completed_at || new Date().toISOString())
    : current.completed_at;

  await DB.prepare(`
    UPDATE data_protection_requests SET
      status = ?,
      assigned_admin_id = ?,
      internal_notes = ?,
      completed_at = ?,
      audit_log = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(nextStatus, nextAssigned, nextNotes, completedAt, auditLog, current.id).run();

  if (body.action === "export_customer_data") {
    await writeAudit(DB, identity, "data_request_export", "data_protection_requests", current.id, `Exported customer data for ${current.reference}.`, { reference: current.reference, format: clean(body.format, 20) || "json" });
  } else if (body.action === "mark_sent") {
    await writeAudit(DB, identity, "data_request_sent", "data_protection_requests", current.id, `Marked ${current.reference} as sent to data subject.`, { reference: current.reference });
  } else if (events.length) {
    await writeAudit(DB, identity, "data_request_update", "data_protection_requests", current.id, `Updated ${current.reference}.`, { reference: current.reference, status: nextStatus });
  }

  return getDataProtectionRequests(DB);
}

async function saveSystemReport(DB, body, identity) {
  const current = await DB.prepare(`SELECT * FROM system_reports WHERE id = ? OR reference = ?`).bind(clean(body.id, 120), clean(body.reference, 120)).first();
  if (!current) throw new Error("System report not found.");

  const nextStatus = clean(body.status, 80) || current.status || "New";
  const nextPriority = clean(body.priority, 40) || current.priority || "Normal";
  const nextNotes = clean(body.internal_notes, 6000);
  const nextAssigned = clean(body.assigned_admin_id, 254);
  const events = [];

  if (nextStatus !== current.status) {
    events.push({ type: "Status changed", actor: auditActor(identity), previousValue: current.status || "", newValue: nextStatus });
  }
  if (nextPriority !== current.priority) {
    events.push({ type: "Priority changed", actor: auditActor(identity), previousValue: current.priority || "", newValue: nextPriority });
  }
  if (nextAssigned !== (current.assigned_admin_id || "")) {
    events.push({ type: "Assigned to admin", actor: auditActor(identity), previousValue: current.assigned_admin_id || "", newValue: nextAssigned });
  }
  if (nextNotes && nextNotes !== (current.internal_notes || "")) {
    events.push({ type: "Admin note added", actor: auditActor(identity) });
  }
  if (nextStatus === "Fixed" && current.status !== "Fixed") {
    events.push({ type: "Marked fixed", actor: auditActor(identity) });
  }
  if (nextStatus === "Closed" && current.status !== "Closed") {
    events.push({ type: "Closed", actor: auditActor(identity) });
  }

  let auditLog = current.audit_log || "[]";
  for (const event of events) auditLog = addAudit(auditLog, event);

  const resolvedAt = nextStatus === "Fixed" || nextStatus === "Closed"
    ? (current.resolved_at || new Date().toISOString())
    : current.resolved_at;

  await DB.prepare(`
    UPDATE system_reports SET
      status = ?,
      priority = ?,
      assigned_admin_id = ?,
      internal_notes = ?,
      resolved_at = ?,
      audit_log = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(nextStatus, nextPriority, nextAssigned, nextNotes, resolvedAt, auditLog, current.id).run();

  if (events.length) {
    await writeAudit(DB, identity, "system_report_update", "system_reports", current.id, `Updated ${current.reference}.`, { reference: current.reference, status: nextStatus, priority: nextPriority });
  }

  return getSystemReports(DB);
}

async function getClosureRequests(DB) {
  return all(DB, `
    SELECT id, reference, customer_email, customer_name, requested_by, reason, status,
      assigned_admin_id, internal_notes, audit_log, created_at, updated_at, completed_at
    FROM closure_requests
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 500
  `);
}

async function nextReference(DB, table, prefix) {
  const row = await DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return `${prefix}-${String(Number(row?.count || 0) + 1).padStart(5, "0")}`;
}

async function saveClosureRequest(DB, body, identity) {
  const id = clean(body.id, 120);
  const status = CLOSURE_STATUSES.includes(clean(body.status, 80)) ? clean(body.status, 80) : "Open";
  const customerEmail = cleanEmail(body.customer_email);
  if (!customerEmail) throw new Error("Customer email is required for a closure request.");

  if (!id) {
    const reference = await nextReference(DB, "closure_requests", "CLR");
    const auditLog = addAudit("[]", { type: "Closure request created", actor: auditActor(identity), newValue: status });
    await DB.prepare(`
      INSERT INTO closure_requests (
        id, reference, customer_email, customer_name, requested_by, reason, status,
        assigned_admin_id, internal_notes, audit_log
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      reference,
      customerEmail,
      clean(body.customer_name, 180),
      auditActor(identity),
      clean(body.reason, 2000),
      status,
      clean(body.assigned_admin_id, 254),
      clean(body.internal_notes, 6000),
      auditLog
    ).run();
    await writeAudit(DB, identity, "closure_request_create", "closure_requests", reference, `Created closure request ${reference}.`, { customerEmail, status });
    return getClosureRequests(DB);
  }

  const current = await DB.prepare(`SELECT * FROM closure_requests WHERE id = ?`).bind(id).first();
  if (!current) throw new Error("Closure request not found.");

  let auditLog = current.audit_log || "[]";
  if (status !== current.status) auditLog = addAudit(auditLog, { type: "Status changed", actor: auditActor(identity), previousValue: current.status || "", newValue: status });
  if (clean(body.assigned_admin_id, 254) !== (current.assigned_admin_id || "")) auditLog = addAudit(auditLog, { type: "Assigned to admin", actor: auditActor(identity), previousValue: current.assigned_admin_id || "", newValue: clean(body.assigned_admin_id, 254) });
  if (clean(body.internal_notes, 6000) && clean(body.internal_notes, 6000) !== (current.internal_notes || "")) auditLog = addAudit(auditLog, { type: "Internal note added", actor: auditActor(identity) });

  await DB.prepare(`
    UPDATE closure_requests SET
      status = ?,
      assigned_admin_id = ?,
      internal_notes = ?,
      audit_log = ?,
      completed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    status,
    clean(body.assigned_admin_id, 254),
    clean(body.internal_notes, 6000),
    auditLog,
    status === "Completed" ? (current.completed_at || new Date().toISOString()) : current.completed_at,
    id
  ).run();

  await writeAudit(DB, identity, "closure_request_update", "closure_requests", id, `Updated closure request ${current.reference}.`, { reference: current.reference, status });
  return getClosureRequests(DB);
}

async function getAffiliateContent(DB) {
  return all(DB, `SELECT * FROM affiliate_content_blocks ORDER BY sort_order ASC, updated_at DESC LIMIT 500`);
}

function existingAffiliateBlocks() {
  return [
    {
      source_key: "headout-page-heading",
      block_type: "Page heading",
      title: "Headout Experiences",
      body: "Explore selected tours, attractions and activities by country, then choose a destination to view current Headout options.",
      cta_label: "Browse countries",
      cta_url: "/headout/#countries",
      legal_notice: "Headout is currently presented as the Primary Affiliate Partner for activities and experiences.",
      sort_order: 10
    },
    {
      source_key: "headout-affiliate-disclosure",
      block_type: "Disclaimer",
      title: "Headout affiliate disclosure",
      body: "Bookings made through Headout are made with Headout or the relevant third-party provider. JA Group Services Ltd may receive a commission where eligible. JA Group Services Ltd does not supply, control or guarantee third-party tours, activities, tickets or experiences.",
      cta_label: "Browse Headout experiences",
      cta_url: "/headout/",
      legal_notice: "Prices, availability, booking terms, cancellation rules and customer support are provided by the relevant provider.",
      sort_order: 20
    },
    {
      source_key: "headout-gallery-widget-template",
      block_type: "Widget",
      title: "Headout gallery widget template",
      body: "Reusable Headout activity gallery placement for destination and experience pages. Use this as the admin-managed source for Headout embedded activity sections.",
      widget_code: "<div data-affiliate-provider=\"headout\" data-hawt=\"gallery\" data-city=\"LONDON\" data-max-count=\"100\"></div>",
      cta_label: "Open Headout",
      cta_url: "/headout/",
      legal_notice: "Headout widget placements must remain accompanied by the affiliate disclosure and third-party provider notice.",
      sort_order: 25
    },
    {
      source_key: "headout-integration-code",
      block_type: "Integration code",
      title: "Headout affiliate integration code",
      body: "Primary Headout affiliate partner integration. Affiliate reference: JL2D9u. Keep script loading controlled by approved public page code; do not paste raw script tags into unmanaged content.",
      cta_label: "View Headout page",
      cta_url: "/headout/",
      legal_notice: "Affiliate references must not be hidden from the required disclosure wording.",
      sort_order: 28
    },
    {
      source_key: "getyourguide-page-heading",
      block_type: "Page heading",
      title: "GetYourGuide Activities",
      body: "Choose a country, select a city or area, then browse current GetYourGuide options for the destination you are interested in.",
      cta_label: "Browse countries",
      cta_url: "/getyourguide/#countries",
      legal_notice: "GetYourGuide is currently presented as the Secondary Affiliate Partner for activities and experiences.",
      sort_order: 30
    },
    {
      source_key: "getyourguide-affiliate-disclosure",
      block_type: "Disclaimer",
      title: "GetYourGuide affiliate disclosure",
      body: "Activities, attractions, tours, tickets, experiences, availability, prices, booking terms, cancellation rules and customer support are provided by GetYourGuide and/or the relevant third-party provider. JA Group Services Ltd may receive a commission for qualifying bookings made through links on this page.",
      cta_label: "Browse GetYourGuide activities",
      cta_url: "/getyourguide/",
      legal_notice: "JA Group Services Ltd does not supply, control or guarantee third-party tours, activities, tickets or experiences.",
      sort_order: 40
    },
    {
      source_key: "getyourguide-widget-template",
      block_type: "Widget",
      title: "GetYourGuide activity widget template",
      body: "Reusable GetYourGuide placement for destination and attraction activity sections. This record keeps the widget configuration visible and manageable in the admin centre.",
      widget_code: "<div data-affiliate-provider=\"getyourguide\" data-gyg-widget=\"activities\" data-gyg-locale=\"en-GB\" data-gyg-currency=\"GBP\"></div>",
      cta_label: "Open GetYourGuide",
      cta_url: "/getyourguide/",
      legal_notice: "GetYourGuide activity widgets must be shown with the affiliate disclosure and third-party booking notice.",
      sort_order: 45
    },
    {
      source_key: "getyourguide-integration-code",
      block_type: "Integration code",
      title: "GetYourGuide partner integration",
      body: "Secondary affiliate partner integration for activity, attraction and tour recommendations. Keep provider identifiers and widget placements managed through approved page templates and admin records.",
      cta_label: "View GetYourGuide page",
      cta_url: "/getyourguide/",
      legal_notice: "Third-party provider terms, prices, availability and cancellation rules apply.",
      sort_order: 48
    },
    {
      source_key: "experiences-provider-disclosure",
      block_type: "Referral notice",
      title: "Before booking",
      body: "The relevant third-party provider supplies the activity, price, availability, booking terms, cancellation rules and customer support. JA Group Services Ltd may receive commission from qualifying bookings.",
      cta_label: "Read the affiliate disclosure",
      cta_url: "/affiliate-disclosure/",
      sort_order: 50
    },
    {
      source_key: "affiliate-independent-providers",
      block_type: "Legal notice",
      title: "Affiliate links and independent providers",
      body: "Some activity links, partner content or referral links may earn JA Group Services Ltd a commission after a qualifying booking.",
      legal_notice: "Affiliate bookings are made with the relevant third-party provider. The third-party provider is responsible for its own service, booking terms, pricing, refunds, cancellations and service delivery.",
      sort_order: 60
    },
    {
      source_key: "destination-affiliate-browser-notice",
      block_type: "Destination block",
      title: "Destination activity browser notice",
      body: "Destination activity pages should help customers compare current third-party activity options by country, city and interest before leaving Sousa Murray Planeia for booking.",
      cta_label: "Browse activity partners",
      cta_url: "/activities/",
      legal_notice: "Customers should check suitability, accessibility, provider terms and cancellation conditions before booking.",
      sort_order: 70
    },
    {
      source_key: "affiliate-faq-provider-support",
      block_type: "FAQ block",
      title: "Who supports an affiliate booking?",
      body: "The third-party provider or affiliate marketplace supports bookings, amendments, cancellations, refunds and service delivery. JA Group Services Ltd provides discovery and guidance information only.",
      legal_notice: "JA Group Services Ltd is not the tour operator, travel agent or booking platform for third-party affiliate experiences.",
      sort_order: 80
    }
  ];
}

async function importAffiliateContent(DB, identity) {
  let imported = 0;
  for (const block of existingAffiliateBlocks()) {
    const existing = await DB.prepare(`SELECT id FROM affiliate_content_blocks WHERE source_key = ?`).bind(block.source_key).first();
    if (existing) continue;
    await DB.prepare(`
      INSERT INTO affiliate_content_blocks (
        id, source_key, block_type, title, body, widget_code, cta_label, cta_url, legal_notice,
        is_enabled, is_published, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, CURRENT_TIMESTAMP)
    `).bind(
      crypto.randomUUID(),
      block.source_key,
      block.block_type,
      block.title,
      block.body,
      block.widget_code || "",
      block.cta_label || "",
      block.cta_url || "",
      block.legal_notice || "",
      block.sort_order
    ).run();
    imported += 1;
  }

  await writeAudit(DB, identity, "affiliate_content_import", "affiliate_content_blocks", "existing-content", `Imported ${imported} existing affiliate content records.`, { imported });
  return { imported, records: await getAffiliateContent(DB) };
}

function sanitiseWidgetCode(value) {
  const code = clean(value, 8000);
  if (!code) return "";
  const lowered = code.toLowerCase();
  if (lowered.includes("<script") || lowered.includes("javascript:") || lowered.includes("onerror=") || lowered.includes("onload=")) {
    throw new Error("Unsafe widget code was blocked. Use approved embed snippets without script tags or inline event handlers.");
  }
  return code;
}

async function saveAffiliateContent(DB, body, identity) {
  const id = clean(body.id, 120) || crypto.randomUUID();
  if (body.action === "import_existing") {
    const imported = await importAffiliateContent(DB, identity);
    return imported.records;
  }

  if (body.action === "delete") {
    await DB.prepare(`DELETE FROM affiliate_content_blocks WHERE id = ?`).bind(id).run();
    await writeAudit(DB, identity, "affiliate_content_delete", "affiliate_content_blocks", id, "Deleted affiliate content block.", {});
    return getAffiliateContent(DB);
  }

  const title = clean(body.title, 180);
  if (!title) throw new Error("Content block title is required.");

  await DB.prepare(`
    INSERT INTO affiliate_content_blocks (
      id, source_key, block_type, title, body, widget_code, cta_label, cta_url, legal_notice,
      is_enabled, is_published, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      source_key = excluded.source_key,
      block_type = excluded.block_type,
      title = excluded.title,
      body = excluded.body,
      widget_code = excluded.widget_code,
      cta_label = excluded.cta_label,
      cta_url = excluded.cta_url,
      legal_notice = excluded.legal_notice,
      is_enabled = excluded.is_enabled,
      is_published = excluded.is_published,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    clean(body.source_key, 180),
    clean(body.block_type, 80) || "Content",
    title,
    clean(body.body, 12000),
    sanitiseWidgetCode(body.widget_code),
    clean(body.cta_label, 120),
    clean(body.cta_url, 500),
    clean(body.legal_notice, 4000),
    body.is_enabled ? 1 : 0,
    body.is_published ? 1 : 0,
    Number(body.sort_order || 100)
  ).run();

  await writeAudit(DB, identity, "affiliate_content_save", "affiliate_content_blocks", id, `Saved affiliate content block ${title}.`, { published: Boolean(body.is_published), enabled: Boolean(body.is_enabled) });
  return getAffiliateContent(DB);
}

async function getAppearance(DB) {
  return settingMap(DB, ["site_theme_mode"], { site_theme_mode: "dark" });
}

async function saveAppearance(DB, body, identity) {
  const mode = THEME_MODES.includes(clean(body.site_theme_mode, 20)) ? clean(body.site_theme_mode, 20) : "dark";
  await saveSettings(DB, { site_theme_mode: mode });
  await writeAudit(DB, identity, "appearance_update", "site_settings", "site_theme_mode", `Set site theme mode to ${mode}.`, { mode });
  return getAppearance(DB);
}

async function getEmailSettings(DB, env) {
  const settings = await settingMap(DB, [
    "smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from_name", "smtp_from_email", "smtp_security",
    "email_provider", "email_api_key", "email_api_endpoint", "admin_notification_email"
  ], {
    smtp_host: "smtp.jagroupservices.co.uk",
    smtp_port: "587",
    smtp_username: "noreply@jagroupservices.co.uk",
    smtp_from_name: "Sousa Murray Planeia",
    smtp_from_email: "noreply@jagroupservices.co.uk",
    smtp_security: "STARTTLS",
    email_provider: "resend"
  });

  return {
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port,
    smtp_username: settings.smtp_username,
    smtp_password_masked: maskSecret(settings.smtp_password || ""),
    smtp_from_name: settings.smtp_from_name,
    smtp_from_email: settings.smtp_from_email,
    smtp_security: settings.smtp_security,
    email_provider: settings.email_provider || "resend",
    email_api_endpoint: settings.email_api_endpoint || "",
    email_api_key_masked: maskSecret(settings.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY || ""),
    admin_notification_email: settings.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL || "",
    configured: Boolean((settings.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY) && (settings.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL))
  };
}

async function saveEmailSettings(DB, body, env, identity) {
  const current = await settingMap(DB, ["smtp_password", "email_api_key"], {});
  await saveSettings(DB, {
    smtp_host: clean(body.smtp_host, 250) || "smtp.jagroupservices.co.uk",
    smtp_port: clean(body.smtp_port, 10) || "587",
    smtp_username: clean(body.smtp_username, 254) || "noreply@jagroupservices.co.uk",
    smtp_password: clean(body.smtp_password, 500) || current.smtp_password || env.SMTP_PASSWORD || "",
    smtp_from_name: clean(body.smtp_from_name, 180) || "Sousa Murray Planeia",
    smtp_from_email: clean(body.smtp_from_email, 254) || "noreply@jagroupservices.co.uk",
    smtp_security: clean(body.smtp_security, 40) || "STARTTLS",
    email_provider: clean(body.email_provider, 40) || "resend",
    email_api_endpoint: clean(body.email_api_endpoint, 500),
    email_api_key: clean(body.email_api_key, 800) || current.email_api_key || env.EMAIL_API_TOKEN || "",
    admin_notification_email: cleanEmail(body.admin_notification_email) || env.ADMIN_NOTIFICATION_EMAIL || ""
  });
  await writeAudit(DB, identity, "smtp_settings_update", "site_settings", "email", "Updated Email (SMTP) and provider settings.", { host: clean(body.smtp_host, 250), username: clean(body.smtp_username, 254), provider: clean(body.email_provider, 40) });
  return getEmailSettings(DB, env);
}

async function providerSettings(DB, env) {
  const stored = await settingMap(DB, ["email_provider", "email_api_key", "email_api_endpoint", "smtp_from_name", "smtp_from_email", "admin_notification_email"], {});
  const provider = (stored.email_provider || env.EMAIL_PROVIDER || "resend").toLowerCase();
  const apiKey = stored.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY || "";
  return {
    provider,
    apiKey,
    endpoint: stored.email_api_endpoint || env.EMAIL_API_ENDPOINT || "",
    fromName: stored.smtp_from_name || "Sousa Murray Planeia",
    fromEmail: stored.smtp_from_email || "noreply@jagroupservices.co.uk",
    to: stored.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL || ""
  };
}

async function sendProviderEmail(DB, env, message) {
  const settings = await providerSettings(DB, env);
  const to = message.to || settings.to;
  if (!to) throw new Error("Recipient email is not configured.");
  if (!settings.apiKey && settings.provider !== "mailchannels") throw new Error("Email API key is not configured.");

  const from = settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail;
  let endpoint = settings.endpoint;
  let headers = { "Content-Type": "application/json" };
  let body;

  if (settings.provider === "sendgrid") {
    endpoint ||= "https://api.sendgrid.com/v3/mail/send";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else if (settings.provider === "postmark") {
    endpoint ||= "https://api.postmarkapp.com/email";
    headers["X-Postmark-Server-Token"] = settings.apiKey;
    body = { From: from, To: to, Subject: message.subject, TextBody: message.text };
  } else if (settings.provider === "brevo") {
    endpoint ||= "https://api.brevo.com/v3/smtp/email";
    headers["api-key"] = settings.apiKey;
    body = { sender: { name: settings.fromName, email: settings.fromEmail }, to: [{ email: to }], subject: message.subject, textContent: message.text };
  } else if (settings.provider === "mailchannels") {
    endpoint ||= "https://api.mailchannels.net/tx/v1/send";
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else {
    endpoint ||= "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { from, to, subject: message.subject, text: message.text };
  }

  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 240)}`);
  return { provider: settings.provider, to, status: response.status };
}

async function testNotification(DB, body, env, identity) {
  const notificationType = clean(body.notification_type, 80) || "New Signup";
  let result;
  try {
    const sent = await sendProviderEmail(DB, env, {
      subject: `Sousa Murray Planeia test notification: ${notificationType}`,
      text: `This is a ${notificationType} test notification from the Sousa Murray Planeia admin centre.`
    });
    result = {
      sent: true,
      message: `Test notification sent successfully using ${sent.provider}.`,
      to: sent.to,
      notificationType
    };
  } catch (error) {
    result = {
      sent: false,
      message: error.message || "Test notification failed.",
      to: (await providerSettings(DB, env)).to,
      notificationType
    };
  }

  await writeAudit(DB, identity, "test_notification", "email", notificationType, result.message, { sent: result.sent, to: result.to, notificationType });
  return result;
}

async function getAuditLog(DB, filters = {}) {
  const where = [];
  const bindings = [];
  if (filters.administrator) {
    where.push(`lower(actor_email) = lower(?)`);
    bindings.push(cleanEmail(filters.administrator));
  }
  if (filters.role) {
    where.push(`role = ?`);
    bindings.push(clean(filters.role, 80));
  }
  if (filters.action) {
    where.push(`action = ?`);
    bindings.push(clean(filters.action, 120));
  }
  if (filters.module) {
    where.push(`entity_type = ?`);
    bindings.push(clean(filters.module, 120));
  }
  if (filters.date_from) {
    where.push(`date(created_at) >= date(?)`);
    bindings.push(clean(filters.date_from, 40));
  }
  if (filters.date_to) {
    where.push(`date(created_at) <= date(?)`);
    bindings.push(clean(filters.date_to, 40));
  }
  if (filters.outcome) {
    where.push(`lower(COALESCE(json_extract(metadata, '$.outcome'), 'success')) = lower(?)`);
    bindings.push(clean(filters.outcome, 40));
  }
  const sql = `SELECT * FROM admin_audit_log${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 500`;
  return all(DB, sql, bindings);
}

async function getSessions(DB, request) {
  const nativeTokenHash = request?.headers.get("x-ja-auth-session") || "";
  let nativeSessions = [];
  try {
    nativeSessions = await all(DB, `
      SELECT token_hash, email AS admin_email, created_at, absolute_expires_at AS expires_at,
        revoked_at, last_seen_at AS last_used_at, user_agent, NULL AS ip_address, NULL AS location
      FROM admin_oidc_sessions
      ORDER BY COALESCE(last_seen_at, created_at) DESC
      LIMIT 200
    `);
  } catch {
    // The additive native OIDC migration has not been applied while Access remains active.
  }
  return nativeSessions
    .sort((left, right) => String(right.last_used_at || right.created_at).localeCompare(String(left.last_used_at || left.created_at)))
    .slice(0, 200)
    .map((session) => ({
      ...session,
      is_current: session.token_hash === nativeTokenHash
    }));
}

async function getLoginHistory(DB, email) {
  return all(DB, `
    SELECT action, entity_type, entity_id, summary, metadata, created_at, actor_email
    FROM admin_audit_log
    WHERE lower(actor_email) = lower(?)
      AND action IN ('admin_add', 'admin_remove', 'role_update', 'role_create', 'role_delete', 'role_clone', 'role_rename')
    ORDER BY created_at DESC
    LIMIT 50
  `, [email]);
}

async function getAdminActivity(DB, email) {
  return all(DB, `
    SELECT action, entity_type, entity_id, summary, metadata, created_at, actor_email
    FROM admin_audit_log
    WHERE lower(actor_email) = lower(?)
       OR lower(entity_id) = lower(?)
    ORDER BY created_at DESC
    LIMIT 50
  `, [email, email]);
}

async function adminPayload(DB, identity, env = {}) {
  const admin = await safeFirst(DB.prepare(`SELECT email, name, role, status, permissions, favourites, source, created_by, created_at, updated_at FROM admin_users WHERE lower(email) = lower(?)`).bind(identity.email));
  const storedRole = admin?.role || "Auditor";
  const ownerEmail = configuredAdmins(env).includes(identity.email);
  const role = ownerEmail ? "Platform Owner" : canonicalRoleName(storedRole);
  const effectiveAdmin = admin || { email: identity.email, role, permissions: "[\"*\"]", favourites: "[]" };
  const permissions = ownerEmail ? ["*"] : await getEffectivePermissions(DB, effectiveAdmin).catch(() => ["view_only"]);
  const preferences = await getAdminPreferences(DB, identity).catch(() => ({
    favourites: [], dashboard_preferences: {}, notification_preferences: {}, recently_used: [],
    preferred_landing_page: "overview", sidebar_collapsed: false, theme_preference: "system"
  }));
  const defaultLanding = defaultLandingPageForRole(role, permissions);
  return {
    email: identity.email,
    name: admin?.name || identity.name || identity.email,
    role: storedRole,
    effective_role: role,
    permissions,
    allowed_sections: allowedSectionsForPermissions(permissions),
    is_platform_owner: role === "Platform Owner",
    preferences: {
      ...preferences,
      preferred_landing_page: preferences.preferred_landing_page || defaultLanding,
      widget_layout: preferences.dashboard_preferences?.widget_layout || widgetSetForRole(role, permissions).map((widget) => widget.id)
    },
    roles: await getRoles(DB).catch(() => []),
    permission_catalog: PERMISSION_CATALOG,
    login_history: await getLoginHistory(DB, identity.email).catch(() => []),
    workspace: {
      default_landing_page: defaultLanding,
      widgets: widgetSetForRole(role, permissions)
    }
  };
}

async function exportCustomerData(DB, customerEmail, format = "json") {
  const email = cleanEmail(customerEmail);
  if (!email) throw new Error("Customer email is required.");
  const [profile, dataRequests, systemReports, closures] = await Promise.all([
    DB.prepare(`SELECT * FROM profiles WHERE lower(email) = lower(?)`).bind(email).first(),
    all(DB, `SELECT * FROM data_protection_requests WHERE lower(customer_email) = lower(?) OR lower(user_id) = lower(?)`, [email, email]),
    all(DB, `SELECT * FROM system_reports WHERE lower(customer_email) = lower(?) OR lower(user_id) = lower(?)`, [email, email]),
    all(DB, `SELECT * FROM closure_requests WHERE lower(customer_email) = lower(?)`, [email])
  ]);
  const payload = { profile, dataRequests, systemReports, closureRequests: closures };
  if (format === "csv") {
    return { format: "csv", filename: `${email}-customer-data.csv`, content: rowsToCsv([{ section: "profile", data: JSON.stringify(profile || {}) }, { section: "dataRequests", data: JSON.stringify(dataRequests) }, { section: "systemReports", data: JSON.stringify(systemReports) }, { section: "closureRequests", data: JSON.stringify(closures) }]) };
  }
  return { format: "json", filename: `${email}-customer-data.json`, content: JSON.stringify(payload, null, 2) };
}

async function getStatusPage(DB, prefix) {
  return settingMap(DB, [
    `${prefix}_enabled`,
    `${prefix}_content_mode`,
    `${prefix}_content`
  ], {
    [`${prefix}_enabled`]: "false",
    [`${prefix}_content_mode`]: "plain",
    [`${prefix}_content`]: ""
  });
}

async function saveStatusPage(DB, prefix, body) {
  const mode = body[`${prefix}_content_mode`] === "html" ? "html" : "plain";
  await saveSettings(DB, {
    [`${prefix}_enabled`]: body[`${prefix}_enabled`] ? "true" : "false",
    [`${prefix}_content_mode`]: mode,
    [`${prefix}_content`]: String(body[`${prefix}_content`] ?? "")
  });
  return getStatusPage(DB, prefix);
}

function getMaintenance(DB) {
  return getStatusPage(DB, "maintenance");
}

function saveMaintenance(DB, body) {
  return saveStatusPage(DB, "maintenance", body);
}

function getLaunchGateway(DB) {
  return getStatusPage(DB, "launchgateway");
}

function saveLaunchGateway(DB, body) {
  return saveStatusPage(DB, "launchgateway", body);
}

async function getPlans(DB) {
  return all(DB, `
    SELECT id, plan_name, plan_type, is_active, sort_order
    FROM service_plans
    ORDER BY sort_order ASC, plan_name ASC
  `);
}

async function getCustomerStripeBilling(DB, env, email) {
  const profile = await DB.prepare(`SELECT stripe_customer_id FROM profiles WHERE lower(email)=lower(?)`).bind(email).first();
  if (!profile?.stripe_customer_id) return { portalAvailable: false, stripeCustomerId: "", subscription: null };
  const settings = await getStripeSettings(DB, env);
  const subscription = await DB.prepare(`
    SELECT id, plan_code, plan_name, status, billing_status, current_period_end, cancel_at_period_end
    FROM stripe_subscriptions
    WHERE customer_id = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(profile.stripe_customer_id).first().catch(() => null);
  return {
    portalAvailable: Boolean(settings.secretKey),
    stripeCustomerId: profile.stripe_customer_id,
    subscription: subscription ? {
      id: subscription.id,
      plan: subscription.plan_name || subscription.plan_code || "Stripe membership",
      status: subscription.status || "Not available",
      billingStatus: subscription.billing_status || "Not available",
      nextRenewal: subscription.current_period_end || null,
      cancellationScheduled: Number(subscription.cancel_at_period_end || 0) === 1
    } : null
  };
}

async function createCustomerStripePortal(DB, env, email, origin) {
  const billing = await getCustomerStripeBilling(DB, env, email);
  if (!billing.stripeCustomerId) throw new Error("No Stripe customer is linked to this profile.");
  const settings = await getStripeSettings(DB, env);
  if (!settings.secretKey) throw new Error("Stripe billing is not configured.");
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer: billing.stripeCustomerId, return_url: `${origin}/admin/dashboard/?section=customers` }).toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) throw new Error(payload?.error?.message || "Stripe Billing Portal could not be opened.");
  return payload.url;
}

async function getStripeSettings(DB, env) {
  const stored = await settingMap(DB, [
    "stripe_publishable_key",
    "stripe_secret_key",
    "stripe_webhook_signing_secret"
  ], {});

  const publishableKey = stored.stripe_publishable_key || env.STRIPE_PUBLISHABLE_KEY || "";
  const secretKey = stored.stripe_secret_key || env.STRIPE_SECRET_KEY || "";
  const webhookSecret = stored.stripe_webhook_signing_secret || env.STRIPE_WEBHOOK_SECRET || "";

  return {
    publishableKey,
    secretKey,
    webhookSecret,
    source: {
      publishable: stored.stripe_publishable_key ? "D1" : publishableKey ? "environment" : "missing",
      secret: stored.stripe_secret_key ? "D1" : secretKey ? "environment" : "missing",
      webhook: stored.stripe_webhook_signing_secret ? "D1" : webhookSecret ? "environment" : "missing"
    }
  };
}

async function getStripe(DB, env, test = false) {
  const settings = await getStripeSettings(DB, env);
  const configured = Boolean(settings.secretKey);
  const stripe = {
    configured,
    mode: settings.secretKey.startsWith("sk_live_") ? "Live" : settings.secretKey.startsWith("sk_test_") ? "Test" : "Unknown",
    publishable_key_masked: maskSecret(settings.publishableKey, 10, 6),
    secret_key_masked: maskSecret(settings.secretKey),
    webhook_secret_masked: maskSecret(settings.webhookSecret, 7, 5),
    source: settings.source,
    account: null,
    products: [],
    message: configured ? "Stripe secret key is configured." : "Stripe secret key is not configured."
  };

  if (!configured || !test) return stripe;

  const accountResponse = await fetch("https://api.stripe.com/v1/account", {
    headers: { "Authorization": `Bearer ${settings.secretKey}` }
  });
  const account = await accountResponse.json();

  if (!accountResponse.ok) {
    stripe.message = account.error?.message || "Stripe account check failed.";
    return stripe;
  }

  const pricesResponse = await fetch("https://api.stripe.com/v1/prices?limit=20&expand[]=data.product", {
    headers: { "Authorization": `Bearer ${settings.secretKey}` }
  });
  const prices = await pricesResponse.json();

  stripe.account = {
    id: account.id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    country: account.country,
    default_currency: account.default_currency
  };
  stripe.products = (prices.data || []).map((price) => ({
    id: price.product?.id || price.product || "",
    name: price.product?.name || "Stripe product",
    active: price.active,
    price_id: price.id,
    currency: price.currency,
    amount: price.unit_amount,
    interval: price.recurring?.interval || price.type
  }));
  stripe.message = "Stripe connection checked successfully.";

  return stripe;
}

async function saveStripe(DB, body, env) {
  const current = await getStripeSettings(DB, env);
  const updates = {
    stripe_publishable_key: clean(body.publishable_key, 300) || current.publishableKey,
    stripe_secret_key: clean(body.secret_key, 300) || current.secretKey,
    stripe_webhook_signing_secret: clean(body.webhook_signing_secret, 300) || current.webhookSecret
  };

  await saveSettings(DB, updates);
  return getStripe(DB, env, Boolean(body.test_connection));
}

const DEFAULT_PLATFORM_BUILDERS = [
  ["day-trip", "Day Trip Builder", "Small", "Everyday experiences", 10, "trial,membership,plus,family", "trial", "Build a practical day trip outline with timings, budget prompts and checklist notes."],
  ["family-day-out", "Family Day Out Builder", "Standard", "Everyday experiences", 15, "trial,membership,plus,family", "trial", "Plan a family day out with pace, facilities, accessibility and weather alternatives."],
  ["school-holiday", "School Holiday Planner", "Standard", "Everyday experiences", 15, "membership,plus,family", "paid", "Organise school holiday ideas across dates, budgets and family priorities."],
  ["occasion", "Occasion Planner", "Standard", "Everyday experiences", 15, "membership,plus,family", "paid", "Plan a birthday, anniversary or special occasion with tasks and provider checks."],
  ["local-discovery", "Local Discovery Builder", "Small", "Everyday experiences", 10, "trial,membership,plus,family", "trial", "Create a local discovery shortlist with suitability checks."],
  ["budget-experience", "Budget Experience Builder", "Small", "Everyday experiences", 10, "membership,plus,family", "paid", "Shape ideas around a realistic budget and priority list."],
  ["rainy-day", "Rainy Day Plan Builder", "Small", "Everyday experiences", 10, "membership,plus,family", "paid", "Prepare an indoor or weather-resilient plan."],
  ["date-night", "Date Night Builder", "Small", "Everyday experiences", 10, "membership,plus,family", "paid", "Build a date-night plan with timings, budget and booking prompts."],
  ["birthday-plan", "Birthday Plan Builder", "Standard", "Everyday experiences", 15, "membership,plus,family", "paid", "Create a birthday plan with guests, venue checks and tasks."],
  ["travel-itinerary", "Travel Itinerary Builder", "Travel", "Travel experiences", 35, "plus,family", "paid", "Create a self-service travel itinerary outline and checklist."],
  ["country-brief", "Country Travel Brief Builder", "Travel", "Travel experiences", 35, "plus,family", "paid", "Summarise official-source checks a member should complete before travel."],
  ["europe-entry", "Europe Entry Readiness Builder", "Travel", "Travel experiences", 35, "plus,family", "paid", "Organise Europe entry-readiness prompts without immigration advice."],
  ["travel-checklist", "Travel Checklist Builder", "Travel", "Travel experiences", 35, "membership,plus,family", "paid", "Build a travel checklist for documents, packing, operator checks and responsibilities."],
  ["tube-notes", "Tube Planning Notes Builder", "Travel", "Travel experiences", 35, "plus,family", "paid", "Create general Tube planning notes; customers must check operators before travel."],
  ["bus-notes", "Bus Planning Notes Builder", "Travel", "Travel experiences", 35, "plus,family", "paid", "Create general bus planning notes; customers must check operators before travel."],
  ["destination-board", "Destination Board Builder", "Travel", "Travel experiences", 35, "membership,plus,family", "paid", "Create a destination board with ideas, notes and provider checks."],
  ["airport-assistance", "Airport Assistance Request Builder", "Accessibility/support", "Accessibility and support", 40, "plus,family", "paid", "Prepare general assistance request notes for the customer to check with providers."],
  ["accessible-travel-checklist", "Accessible Travel Checklist", "Accessibility/support", "Accessibility and support", 35, "plus,family", "paid", "Build a general accessible travel planning checklist."],
  ["mobility-equipment", "Mobility Equipment Planner", "Accessibility/support", "Accessibility and support", 40, "plus,family", "paid", "Organise mobility equipment planning prompts without medical or safety advice."],
  ["hidden-disabilities", "Hidden Disabilities Support Planner", "Accessibility/support", "Accessibility and support", 40, "plus,family", "paid", "Prepare general hidden-disability support planning notes."],
  ["accessible-destination", "Accessible Destination Checklist", "Accessibility/support", "Accessibility and support", 35, "plus,family", "paid", "Create accessibility checks for destinations and providers."],
  ["accessible-venue-questions", "Accessible Venue Questions Builder", "Accessibility/support", "Accessibility and support", 35, "plus,family", "paid", "Prepare questions to ask venues directly."],
  ["support-confirmation", "Support Confirmation Tracker", "Accessibility/support", "Accessibility and support", 35, "plus,family", "paid", "Track support confirmations and follow-up tasks."],
  ["my-plans", "My Plans", "Organisation", "Organisation tools", 0, "trial,membership,plus,family", "trial", "View and organise saved plans."],
  ["my-discovery-boards", "My Discovery Boards", "Organisation", "Organisation tools", 0, "trial,membership,plus,family", "trial", "View and organise discovery boards."],
  ["saved-experiences", "Saved Experiences", "Organisation", "Organisation tools", 0, "trial,membership,plus,family", "trial", "View saved experiences."],
  ["budget-planner", "Budget Planner", "Small", "Organisation tools", 10, "membership,plus,family", "paid", "Create a simple budget planning output."],
  ["booking-tracker", "Booking Tracker", "Small", "Organisation tools", 10, "membership,plus,family", "paid", "Create a booking tracker output for member-managed bookings."],
  ["checklists", "Checklists", "Small", "Organisation tools", 10, "trial,membership,plus,family", "trial", "Create a reusable checklist."],
  ["holiday-planner", "Holiday Planner", "Travel", "Travel", 5, "trial,membership,plus,family", "paid", "Organise holiday ideas, budgets and family priorities into a complete travel plan."]
];

const DEFAULT_TOKEN_ADDONS = [
  ["extra-10-tokens", "Extra 10 Builder Usage Tokens", 500, 10, "tokens"],
  ["extra-25-tokens", "Extra 25 Builder Usage Tokens", 1000, 25, "tokens"],
  ["extra-50-tokens", "Extra 50 Builder Usage Tokens", 1800, 50, "tokens"],
  ["extra-100-tokens", "Extra 100 Builder Usage Tokens", 3000, 100, "tokens"],
  ["quick-human-help", "Quick Human Help", 2500, 0, "human_support"],
  ["human-plan-review", "Human Plan Review", 5000, 0, "human_support"],
  ["human-made-plan", "Human-Made Experience Plan", 10000, 0, "human_support"]
];

async function ensureBuilderPlatformTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS experience_builders (id TEXT PRIMARY KEY, name TEXT NOT NULL, builder_type TEXT NOT NULL, category TEXT NOT NULL, token_cost INTEGER NOT NULL DEFAULT 15, plan_inclusion TEXT NOT NULL DEFAULT 'trial,membership,plus,family', status TEXT NOT NULL DEFAULT 'Active', visibility TEXT NOT NULL DEFAULT 'paid', description TEXT, form_schema TEXT NOT NULL DEFAULT '[]', usage_count INTEGER NOT NULL DEFAULT 0, blocked_attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();

  // Safe dynamic alters to add extended columns if they are not already present
  const tableInfo = await DB.prepare(`PRAGMA table_info(experience_builders)`).all().then(r => r.results || []);
  const columns = new Set(tableInfo.map(c => c.name));

  if (!columns.has('slug')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN slug TEXT`).run().catch(() => {});
  if (!columns.has('icon')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN icon TEXT DEFAULT '📋'`).run().catch(() => {});
  if (!columns.has('creates_description')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN creates_description TEXT`).run().catch(() => {});
  if (!columns.has('estimated_minutes')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN estimated_minutes INTEGER DEFAULT 10`).run().catch(() => {});
  if (!columns.has('trial_eligible')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN trial_eligible INTEGER DEFAULT 1`).run().catch(() => {});
  if (!columns.has('featured')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN featured INTEGER DEFAULT 0`).run().catch(() => {});
  if (!columns.has('display_order')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN display_order INTEGER DEFAULT 0`).run().catch(() => {});
  if (!columns.has('output_instructions')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN output_instructions TEXT DEFAULT ''`).run().catch(() => {});
  if (!columns.has('version')) await DB.prepare(`ALTER TABLE experience_builders ADD COLUMN version INTEGER DEFAULT 1`).run().catch(() => {});

  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    builder_id TEXT NOT NULL REFERENCES experience_builders(id) ON DELETE CASCADE,
    builder_version INTEGER NOT NULL DEFAULT 1,
    answers TEXT NOT NULL DEFAULT '{}',
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`).run().catch(() => {});

  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_outputs (id TEXT PRIMARY KEY, email TEXT NOT NULL, builder_id TEXT NOT NULL, builder_name TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Completed', token_cost INTEGER NOT NULL DEFAULT 0, input_payload TEXT NOT NULL DEFAULT '{}', output_payload TEXT NOT NULL DEFAULT '{}', request_id TEXT, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(email, request_id))`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_token_ledger (id TEXT PRIMARY KEY, email TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, source TEXT NOT NULL, reason TEXT NOT NULL, builder_output_id TEXT, builder_id TEXT, admin_email TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS builder_blocked_attempts (id TEXT PRIMARY KEY, email TEXT NOT NULL, builder_id TEXT, builder_name TEXT, reason TEXT NOT NULL, tokens_available INTEGER NOT NULL DEFAULT 0, tokens_required INTEGER NOT NULL DEFAULT 0, action_offered TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS trial_access_tokens (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'Active', activated_at TEXT NOT NULL, expires_at TEXT NOT NULL, token_allowance INTEGER NOT NULL DEFAULT 30, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS token_addon_packages (id TEXT PRIMARY KEY, name TEXT NOT NULL, price_pence INTEGER NOT NULL, token_amount INTEGER NOT NULL DEFAULT 0, package_type TEXT NOT NULL DEFAULT 'tokens', status TEXT NOT NULL DEFAULT 'Configuration Ready', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS manual_token_adjustments (id TEXT PRIMARY KEY, email TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, adjustment_type TEXT NOT NULL, admin_email TEXT NOT NULL, ledger_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();

  const experienceOnlyIds = new Set(["day-trip","family-day-out","school-holiday","occasion","local-discovery","budget-experience","rainy-day","date-night","birthday-plan","travel-itinerary","travel-checklist","destination-board","holiday-planner","accessible-travel-checklist","accessible-destination","accessible-venue-questions"]);
  // Never prune the shared catalogue from the admin read path. The customer
  // builder service owns catalogue seeding; admin opening this page previously
  // deleted every newly published template that was not in this legacy set.
  for (const row of DEFAULT_PLATFORM_BUILDERS.filter(item => experienceOnlyIds.has(item[0]))) {
    const [id, name, builder_type, category, token_cost, plan_inclusion, visibility, description] = row;
    const exists = await DB.prepare(`SELECT id FROM experience_builders WHERE id = ?`).bind(id).first();
    if (!exists) {
      await DB.prepare(`INSERT OR IGNORE INTO experience_builders (id, name, builder_type, category, token_cost, plan_inclusion, status, visibility, description, slug) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)`).bind(id, name, builder_type, category, token_cost, plan_inclusion, visibility, description, id).run();
    } else {
      await DB.prepare(`UPDATE experience_builders SET slug = COALESCE(slug, id) WHERE id = ?`).bind(id).run();
    }
  }
  for (const row of DEFAULT_TOKEN_ADDONS) await DB.prepare(`INSERT OR IGNORE INTO token_addon_packages (id, name, price_pence, token_amount, package_type) VALUES (?, ?, ?, ?, ?)`).bind(...row).run();
}

async function getBuilderPlatform(DB) {
  const [builders, outputs, ledger, attempts, addons, trials, manual_adjustments] = await Promise.all([
    all(DB, `SELECT * FROM experience_builders ORDER BY category, token_cost, name`),
    all(DB, `SELECT * FROM builder_outputs ORDER BY created_at DESC LIMIT 250`),
    all(DB, `SELECT * FROM builder_token_ledger ORDER BY created_at DESC LIMIT 250`),
    all(DB, `SELECT * FROM builder_blocked_attempts ORDER BY created_at DESC LIMIT 250`),
    all(DB, `SELECT * FROM token_addon_packages ORDER BY package_type DESC, price_pence ASC`),
    all(DB, `SELECT * FROM trial_access_tokens ORDER BY activated_at DESC LIMIT 250`),
    all(DB, `SELECT * FROM manual_token_adjustments ORDER BY created_at DESC LIMIT 250`).catch(() => [])
  ]);
  return { builders, outputs, ledger, attempts, addons, trials, manual_adjustments };
}

async function saveBuilderAdmin(DB, body, identity) {
  const name = clean(body.name, 160);
  const category = clean(body.category, 120);
  const tokenCost = Number(body.token_cost ?? body.credits ?? 15);
  if (!name) throw new Error("Builder name is required.");
  if (!category) throw new Error("Builder category is required.");
  if (!Number.isFinite(tokenCost) || tokenCost < 0) throw new Error("Token cost must be zero or higher.");
  const id = clean(body.id, 120) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Extract extended admin fields
  const slug = clean(body.slug || id, 120);
  const icon = clean(body.icon || "📋", 20);
  const creates_description = clean(body.creates_description || "", 1000);
  const estimated_minutes = Number(body.estimated_minutes ?? 10);
  const trial_eligible = Number(body.trial_eligible ?? 1);
  const featured = Number(body.featured ?? 0);
  const display_order = Number(body.display_order ?? 0);
  const output_instructions = clean(body.output_instructions || "", 4000);
  const form_schema = clean(body.form_schema || "[]", 50000);
  const version = Number(body.version ?? 1);

  await DB.prepare(`
    INSERT INTO experience_builders (
      id, name, builder_type, category, token_cost, plan_inclusion, status, visibility, description,
      slug, icon, creates_description, estimated_minutes, trial_eligible, featured, display_order, output_instructions, form_schema, version, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      builder_type = excluded.builder_type,
      category = excluded.category,
      token_cost = excluded.token_cost,
      plan_inclusion = excluded.plan_inclusion,
      status = excluded.status,
      visibility = excluded.visibility,
      description = excluded.description,
      slug = excluded.slug,
      icon = excluded.icon,
      creates_description = excluded.creates_description,
      estimated_minutes = excluded.estimated_minutes,
      trial_eligible = excluded.trial_eligible,
      featured = excluded.featured,
      display_order = excluded.display_order,
      output_instructions = excluded.output_instructions,
      form_schema = excluded.form_schema,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id, name, clean(body.builder_type, 80) || "Standard", category, tokenCost, clean(body.plan_inclusion, 300) || "membership,plus,family", clean(body.status, 80) || "Active", clean(body.visibility, 40) || "paid", clean(body.description, 1000),
    slug, icon, creates_description, estimated_minutes, trial_eligible, featured, display_order, output_instructions, form_schema, version
  ).run();

  await writeAudit(DB, identity, "builder_save", "experience_builders", id, `Saved builder ${name}.`, { token_cost: tokenCost });
  return getBuilderPlatform(DB);
}

async function saveManualTokenAdjustment(DB, body, identity) {
  const email = cleanEmail(body.email);
  const amount = Number(body.amount);
  const reason = clean(body.reason, 500);
  if (!email) throw new Error("Customer/account reference is required.");
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Adjustment amount must be a non-zero number.");
  if (!reason) throw new Error("Reason is required.");
  const current = await DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS balance FROM builder_token_ledger WHERE lower(email) = lower(?)`).bind(email).first();
  const balanceAfter = Number(current?.balance || 0) + amount;
  const ledgerId = crypto.randomUUID();
  await DB.prepare(`INSERT INTO builder_token_ledger (id, email, amount, balance_after, source, reason, admin_email, metadata) VALUES (?, ?, ?, ?, 'manual_adjustment', ?, ?, ?)`).bind(ledgerId, email, amount, balanceAfter, reason, identity.email, JSON.stringify({ adjustment_type: clean(body.adjustment_type, 80) || "Manual adjustment" })).run();
  await DB.prepare(`INSERT INTO manual_token_adjustments (id, email, amount, reason, adjustment_type, admin_email, ledger_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), email, amount, reason, clean(body.adjustment_type, 80) || "Manual adjustment", identity.email, ledgerId).run();
  await writeAudit(DB, identity, "builder_token_manual_adjustment", "builder_token_ledger", ledgerId, `Adjusted Builder Usage Tokens for ${email}.`, { amount, balance_after: balanceAfter });
  return getBuilderPlatform(DB);
}

async function getSiteStatus(DB) {
  try {
    const row = await DB.prepare("SELECT value FROM site_settings WHERE key = 'site_status'").first();
    return row?.value || "normal";
  } catch {
    return "normal";
  }
}

async function getCustomerCrmList(DB) {
  const cols = await getProfilesColumns(DB);
  const suspended_at_col = cols.has("suspended_at") ? "p.suspended_at" : "NULL AS suspended_at";
  const suspended_by_col = cols.has("suspended_by") ? "p.suspended_by" : "NULL AS suspended_by";
  const reactivated_at_col = cols.has("reactivated_at") ? "p.reactivated_at" : "NULL AS reactivated_at";
  const reactivated_by_col = cols.has("reactivated_by") ? "p.reactivated_by" : "NULL AS reactivated_by";

  const base = `SELECT p.email, p.email AS customer_id, p.verified_name, p.display_name, p.contact_email, p.phone,
    p.communication_preference, p.support_notes, p.admin_lifetime, p.admin_lifetime_plan_id,
    p.admin_customer_status, p.admin_notes, p.created_at, p.updated_at, ${suspended_at_col}, ${suspended_by_col},
    ${reactivated_at_col}, ${reactivated_by_col} FROM profiles p ORDER BY p.updated_at DESC, p.created_at DESC LIMIT 1000`;
  try {
    return await all(DB, `SELECT p.email, p.email AS customer_id, p.verified_name, p.display_name, p.contact_email, p.phone,
      p.communication_preference, p.support_notes, p.admin_lifetime, p.admin_lifetime_plan_id,
      p.admin_customer_status, p.admin_notes, p.created_at, p.updated_at, ${suspended_at_col}, ${suspended_by_col},
      ${reactivated_at_col}, ${reactivated_by_col},
      (SELECT s.plan_name FROM stripe_subscriptions s WHERE lower(s.customer_email)=lower(p.email) ORDER BY s.updated_at DESC LIMIT 1) AS subscription_plan,
      (SELECT s.status FROM stripe_subscriptions s WHERE lower(s.customer_email)=lower(p.email) ORDER BY s.updated_at DESC LIMIT 1) AS subscription_status,
      (SELECT s.trial_end FROM stripe_subscriptions s WHERE lower(s.customer_email)=lower(p.email) ORDER BY s.updated_at DESC LIMIT 1) AS trial_end,
      (SELECT t.status FROM trial_access_tokens t WHERE lower(t.email)=lower(p.email) LIMIT 1) AS trial_status,
      (SELECT COUNT(*) FROM builder_outputs o WHERE lower(o.email)=lower(p.email) AND o.archived_at IS NULL) AS builder_usage,
      (SELECT COALESCE(SUM(l.amount),0) FROM builder_token_ledger l WHERE lower(l.email)=lower(p.email)) AS token_balance,
      (SELECT MAX(e.created_at) FROM customer_timeline_events e WHERE lower(e.email)=lower(p.email)) AS last_activity
      FROM profiles p ORDER BY COALESCE(last_activity,p.updated_at,p.created_at) DESC LIMIT 1000`);
  } catch {
    return all(DB, base);
  }
}

export async function ensureSiteSettingsSchema(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const result = await DB.prepare("PRAGMA table_info(site_settings)").all();
  const columns = new Set((result.results || []).map((column) => column.name));
  if (!columns.has("key") || !columns.has("value")) {
    throw new Error("site_settings must contain key and value columns.");
  }
  if (!columns.has("updated_at")) {
    await DB.prepare("ALTER TABLE site_settings ADD COLUMN updated_at TEXT").run();
  }
}

export async function runSystemDiagnostics(DB, env, request) {
  const checkedAt = new Date().toISOString();
  const origin = new URL(request.url).origin;
  const safeCheck = async (check) => {
    try { return await check(); } catch { return "Check failed"; }
  };
  const [database, siteStatusApi, comingSoonApi, stripe, email, siteStatus, cols] = await Promise.all([
    safeCheck(async () => { await DB.prepare("SELECT 1 AS ok").first(); return "Operational"; }),
    safeCheck(async () => { const response = await fetch(`${origin}/api/site-status`, { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } }); return response.ok || response.status === 503 ? "Operational" : "Unavailable"; }),
    safeCheck(async () => { const response = await fetch(`${origin}/api/coming-soon-config`, { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } }); return response.ok ? "Operational" : "Unavailable"; }),
    safeCheck(async () => { const settings = await getStripeSettings(DB, env); return settings.secretKey ? "Operational" : "Configuration required"; }),
    safeCheck(async () => { const settings = await getEmailSettings(DB, env); return settings.configured ? "Operational" : "Configuration required"; }),
    safeCheck(async () => getSiteStatus(DB)),
    safeCheck(async () => await getProfilesColumns(DB))
  ]);
  const authConfigured = Boolean(env.ADMIN_OIDC_ISSUER && env.ADMIN_OIDC_CLIENT_ID && env.CUSTOMER_OIDC_ISSUER && env.CUSTOMER_OIDC_CLIENT_ID);

  const requiredCols = ["suspended_at", "suspended_by", "suspension_reason", "reactivated_at", "reactivated_by", "reactivation_reason"];
  let suspensionColumnsDiagnostic = "Unavailable";
  if (cols instanceof Set) {
    const missing = requiredCols.filter(col => !cols.has(col));
    suspensionColumnsDiagnostic = missing.length === 0 ? "All 6 Columns Exist" : `${6 - missing.length} / 6 Exist (Missing: ${missing.join(", ")})`;
  } else {
    suspensionColumnsDiagnostic = "Failed to query database columns";
  }

  return {
    checked_at: checkedAt,
    checks: {
      database,
      site_status_api: siteStatusApi,
      coming_soon_api: comingSoonApi,
      authentication: authConfigured ? "Operational" : "Configuration required",
      stripe,
      email
    },
    technical: {
      environment: clean(env.ENVIRONMENT || env.ENVIRONMENT_NAME, 80) || "Unavailable",
      version: clean(env.APP_VERSION || env.CF_PAGES_COMMIT_SHA, 100) || "Unavailable",
      d1_binding_detected: DB ? "Yes" : "No",
      site_status: ["normal", "coming_soon", "maintenance"].includes(siteStatus) ? siteStatus : "Unavailable",
      suspension_columns: suspensionColumnsDiagnostic
    }
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) return json({ error: "Database binding DB is missing." }, 500);

  try {
    // Production schema is owned by versioned D1 migrations. Running schema
    // creation and dozens of ALTER statements inside every admin request
    // overloads D1 and causes opaque internal-error references in the portal.
    const url = new URL(request.url);
    const section = url.searchParams.get("section") || "overview";

    const identity = getAccessIdentity(request);
    if (!identity.email) return json({ error: "Not signed in." }, 401);
    if (!(await isAllowedAdmin(env.DB, identity, env))) {
      return json({ error: "Forbidden.", signedInAs: identity.email }, 403);
    }
    const adminContext = await adminPayload(env.DB, identity, env);

    const ownerAccess = ownerBypass(adminContext.permissions, adminContext);

    if (request.method === "GET") {
      if (section === "adminpin") return json({ success: true, eligible: true, ...(await adminPinStatus(env.DB, request, identity.email)) });
      if (!ownerAccess && !canAccessSection(adminContext.permissions, section)) return json({ error: "Forbidden.", section }, 403);
      if (section === "overview") return json({ admin: adminContext, overview: await getOverview(env.DB) });
      if (section === "operations") return json({ admin: adminContext, operations: await getOverview(env.DB) });
      if (section === "status") return json({ admin: adminContext, status: await fetch(`${new URL(request.url).origin}/api/status`, { headers: { "Accept": "application/json" }, cf: { cacheTtl: 0 } }).then((response) => response.json()) });
      if (section === "analytics") return json({ admin: adminContext, analytics: await getAnalytics(env.DB) });
      if (section === "builders" || section === "credits" || section === "usage" || section === "addons") {
        return json({ admin: adminContext, platform: await getBuilderPlatform(env.DB) });
      }
      if (section === "audit") {
        return json({
          admin: adminContext,
          audit: await getAuditLog(env.DB, Object.fromEntries(url.searchParams.entries())),
          audit_filters: Object.fromEntries(url.searchParams.entries())
        });
      }
      if (section === "health") return json({ admin: adminContext, health: await getProductionHealth(env.DB, env) });
      if (section === "prefs") return json({ admin: adminContext, preferences: adminContext.preferences });
      if (section === "admins") return json({ admin: adminContext, admins: await getAdmins(env.DB, env), roles: await getRoles(env.DB), permission_catalog: PERMISSION_CATALOG });
      if (section === "roles") return json({ admin: adminContext, roles: await getRoles(env.DB), permission_catalog: PERMISSION_CATALOG });
      if (section === "sessions") return json({ admin: adminContext, sessions: await getSessions(env.DB, request) });
      if (section === "customers") {
        return json({
          admin: adminContext,
          customers: await getCustomerCrmList(env.DB)
        });
      }
      if (section === "customer") {
        const email = clean(url.searchParams.get("email"), 254);
        if (!email) return json({ error: "Customer email is required." }, 400);
        const cols = await getProfilesColumns(env.DB);
        const suspended_at_sel = cols.has("suspended_at") ? "suspended_at" : "NULL AS suspended_at";
        const suspended_by_sel = cols.has("suspended_by") ? "suspended_by" : "NULL AS suspended_by";
        const suspension_reason_sel = cols.has("suspension_reason") ? "suspension_reason" : "NULL AS suspension_reason";
        const reactivated_at_sel = cols.has("reactivated_at") ? "reactivated_at" : "NULL AS reactivated_at";
        const reactivated_by_sel = cols.has("reactivated_by") ? "reactivated_by" : "NULL AS reactivated_by";
        const reactivation_reason_sel = cols.has("reactivation_reason") ? "reactivation_reason" : "NULL AS reactivation_reason";

        const [customer, flags, timeline, supportCases, notifications, pins, plans, notes, billing, builderOutputs, tokenLedger, savedItems, customerEnquiries, dataRequests, customerAudit] = await Promise.all([
          env.DB.prepare(`
            SELECT
              email,
              verified_name,
              display_name,
              contact_email,
              phone,
              communication_preference,
              support_notes,
              admin_notes,
              admin_lifetime,
              admin_lifetime_plan_id,
              admin_customer_status,
              created_at,
              updated_at,
              admin_updated_at,
              ${suspended_at_sel}, ${suspended_by_sel}, ${suspension_reason_sel},
              ${reactivated_at_sel}, ${reactivated_by_sel}, ${reactivation_reason_sel}
            FROM profiles
            WHERE lower(email) = lower(?)
          `).bind(email).first(),
          all(env.DB, `SELECT * FROM customer_account_flags WHERE lower(email) = lower(?) ORDER BY updated_at DESC`, [email]),
          all(env.DB, `SELECT * FROM customer_timeline_events WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 200`, [email]),
          all(env.DB, `SELECT * FROM customer_support_cases WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 100`, [email]),
          all(env.DB, `SELECT * FROM customer_notifications WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 100`, [email]),
          all(env.DB, `SELECT * FROM customer_support_pins_v2 WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 20`, [email]),
          getPlans(env.DB),
          all(env.DB, `SELECT * FROM customer_internal_notes WHERE lower(email) = lower(?) ORDER BY pinned DESC, updated_at DESC LIMIT 100`, [email]),
          getCustomerStripeBilling(env.DB, env, email),
          all(env.DB, `SELECT id,builder_id,builder_name,title,status,token_cost,created_at,updated_at FROM builder_outputs WHERE lower(email)=lower(?) AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100`, [email]).catch(() => []),
          all(env.DB, `SELECT id,amount,balance_after,source,reason,created_at FROM builder_token_ledger WHERE lower(email)=lower(?) ORDER BY created_at DESC LIMIT 100`, [email]).catch(() => []),
          all(env.DB, `SELECT * FROM customer_saved_items WHERE lower(email)=lower(?) ORDER BY updated_at DESC LIMIT 100`, [email]).catch(() => []),
          all(env.DB, `SELECT reference,subject,status,created_at,updated_at FROM enquiries WHERE lower(email)=lower(?) ORDER BY created_at DESC LIMIT 100`, [email]).catch(() => []),
          all(env.DB, `SELECT reference,request_type,status,submitted_at,due_at FROM data_protection_requests WHERE lower(customer_email)=lower(?) ORDER BY created_at DESC LIMIT 100`, [email]).catch(() => []),
          all(env.DB, `SELECT action,actor_email,summary,created_at FROM admin_audit_log WHERE lower(entity_id)=lower(?) ORDER BY created_at DESC LIMIT 100`, [email]).catch(() => [])
        ]);
        const verification = await getIdentityVerificationState(env.DB, email, identity.email, adminContext);
        verification.admin_pin_override_available = await hasActiveAdminPinSession(env.DB, request, identity.email);
        const customerPayload = protectCustomerPayload({ ...customer, flags, timeline, supportCases, notifications, pins, notes, billing, builderOutputs, tokenLedger, savedItems, customerEnquiries, dataRequests, customerAudit }, verification);
        return json({ admin: adminContext, customer: customerPayload, plans, verification });
      }
      if (section === "plans") {
        return json({
          admin: adminContext,
          plans: await all(env.DB, `SELECT * FROM service_plans ORDER BY sort_order ASC, plan_name ASC`)
        });
      }
      if (section === "platformsettings" || section === "systemsettings") {
        if (section === "systemsettings" && url.searchParams.get("action") === "diagnostics") {
          return json({ admin: adminContext, diagnostics: await runSystemDiagnostics(env.DB, env, request) });
        }
        const platform = await getBuilderPlatform(env.DB);
        const generalSettings = await settingMap(env.DB, ["platform_name", "default_builder"], {});
        platform.name = generalSettings.platform_name || "Sousa Murray Planeia";
        platform.defaultBuilder = generalSettings.default_builder || "experience";
        const siteStatus = await getSiteStatus(env.DB);
        const [csHeadline, csSubtext, csLaunchDate, csCountdownEnabled, stripe, plans, email, appearance, policies] = await Promise.all([
          env.DB.prepare("SELECT value FROM site_settings WHERE key = 'coming_soon_headline'").first().then((r) => r?.value || "").catch(() => ""),
          env.DB.prepare("SELECT value FROM site_settings WHERE key = 'coming_soon_subtext'").first().then((r) => r?.value || "").catch(() => ""),
          env.DB.prepare("SELECT value FROM site_settings WHERE key = 'coming_soon_launch_date'").first().then((r) => r?.value || "").catch(() => ""),
          env.DB.prepare("SELECT value FROM site_settings WHERE key = 'coming_soon_countdown_enabled'").first().then((r) => r?.value === "true").catch(() => false),
          getStripe(env.DB, env, true).catch(() => ({ configured: false, message: "Stripe status unavailable." })),
          getPlans(env.DB).catch(() => []),
          getEmailSettings(env.DB, env).catch(() => ({ configured: false })),
          getAppearance(env.DB).catch(() => ({})),
          all(env.DB, `SELECT * FROM policy_pages ORDER BY title ASC`).catch(() => [])
        ]);
        return json({ admin: adminContext, platform, site_status: siteStatus, coming_soon: { headline: csHeadline, subtext: csSubtext, launchDate: csLaunchDate, countdownEnabled: csCountdownEnabled }, stripe, plans, email, appearance, policies });
      }
      if (section === "notifications") return json({ admin: adminContext, notifications: await getNotifications(env.DB) });
      if (section === "membership") return json({ admin: adminContext, membership: await getMembership(env.DB) });
      if (section === "security") return json({ admin: adminContext, security: await getSecurity(env.DB) });
      if (section === "cms") return json({ admin: adminContext, cms: await getCms(env.DB) });
      if (section === "policies") return json({ admin: adminContext, policies: await all(env.DB, `SELECT * FROM policy_pages ORDER BY title ASC`) });
      if (section === "branding") return json({ admin: adminContext, branding: await env.DB.prepare(`SELECT * FROM company_branding WHERE id = 'main'`).first() });
      if (section === "support") return json({ admin: adminContext, support: await all(env.DB, `SELECT * FROM support_tickets ORDER BY updated_at DESC, created_at DESC LIMIT 500`) });
      if (section === "enquiries") {
        const filters = Object.fromEntries(url.searchParams.entries());
        const enquiries = await listAdminEnquiries(env.DB, filters);
        const reference = clean(url.searchParams.get("reference"), 40);
        return json({ admin: adminContext, enquiries, thread: reference ? await getEnquiryThread(env.DB, reference, true) : null, filters });
      }
      if (section === "system") return json({ admin: adminContext, system: await all(env.DB, `SELECT * FROM system_events ORDER BY updated_at DESC, created_at DESC LIMIT 500`) });
      if (section === "datarequests") return json({ admin: adminContext, datarequests: await getDataProtectionRequests(env.DB) });
      if (section === "notifications") return json({ admin: adminContext, notifications: await getNotificationsAdmin(env.DB) });
      if (section === "systemreports") return json({ admin: adminContext, systemreports: await getSystemReports(env.DB) });
      if (section === "closures") return json({ admin: adminContext, closures: await getClosureRequests(env.DB) });
      if (section === "reports") return json({ admin: adminContext, overview: await getOverview(env.DB), analytics: await getAnalytics(env.DB), audit: await getAuditLog(env.DB, {}), notifications: await getNotifications(env.DB), membership: await getMembership(env.DB) });
      if (section === "affiliate") return json({ admin: adminContext, affiliate: await getAffiliateContent(env.DB) });
      if (section === "appearance") return json({ admin: adminContext, appearance: await getAppearance(env.DB) });
      if (section === "email") return json({ admin: adminContext, email: await getEmailSettings(env.DB, env) });
      if (section === "maintenance") return json({ admin: adminContext, maintenance: await getMaintenance(env.DB) });
      if (section === "launchgateway") return json({ admin: adminContext, launchgateway: await getLaunchGateway(env.DB) });
      if (section === "stripe") return json({ admin: adminContext, stripe: await getStripe(env.DB, env, true) });
    }

    if (request.method === "POST") {
      if (!isSameOriginRequest(request)) return json({ error: "This request could not be verified." }, 403);
      const body = await request.json().catch(() => ({}));
      if (section === "adminpin") return handleAdminPinPost(env.DB, env, request, identity, body);
      if (section === "prefs") return json({ preferences: await saveAdminPreferences(env.DB, body, identity), saved: true });
      if (section === "builders") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_plans", "manage_pricing", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        return json({ admin: adminContext, platform: await saveBuilderAdmin(env.DB, body, identity), saved: true });
      }
      if (section === "credits") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_plans", "manage_pricing", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        if (body.action === "manual_adjustment") return json({ admin: adminContext, platform: await saveManualTokenAdjustment(env.DB, body, identity), saved: true });
        return json({ admin: adminContext, platform: await getBuilderPlatform(env.DB), saved: false });
      }
      if (section === "platformsettings" || section === "systemsettings") {
        const requiredSettingsPermissions = section === "systemsettings" ? ["manage_settings", "manage_status"] : ["manage_plans", "manage_pricing", "manage_settings"];
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, requiredSettingsPermissions)) {
          return json({ error: "Forbidden.", section }, 403);
        }
        if (body.action === "update_general_settings") {
          const platformName = clean(body.platform_name, 120) || "Sousa Murray Planeia";
          const defaultBuilder = clean(body.default_builder, 80) || "experience";
          await saveSettings(env.DB, { platform_name: platformName, default_builder: defaultBuilder });
          await writeAudit(env.DB, identity, "general_settings_update", "site_settings", "general", "General system settings updated.", { platform_name: platformName, default_builder: defaultBuilder });
          return json({ general: { platform_name: platformName, default_builder: defaultBuilder }, saved: true });
        }

        if (body.action === "update_coming_soon_settings") {
          const headline = clean(body.headline, 200) || "Coming Soon";
          const subtext = clean(body.subtext, 500) || "We are putting the finishing touches on something great.";
          const countdownEnabled = body.countdown_enabled === true;
          let launchDate = clean(body.launch_date, 120);
          if (!Object.prototype.hasOwnProperty.call(body, "launch_date")) {
            const current = await settingMap(env.DB, ["coming_soon_launch_date"], { coming_soon_launch_date: "" });
            launchDate = clean(current.coming_soon_launch_date, 120);
          }
          if (countdownEnabled && !launchDate) {
            return json({ error: "A valid launch date and time is required when the countdown is enabled." }, 400);
          }
          if (body.launch_date) {
            const parsed = new Date(body.launch_date);
            if (Number.isNaN(parsed.getTime())) {
              return json({ error: "Launch date is not a valid date." }, 400);
            }
            launchDate = parsed.toISOString();
          }

          await saveSettings(env.DB, {
            coming_soon_headline: headline,
            coming_soon_subtext: subtext,
            coming_soon_launch_date: launchDate,
            coming_soon_countdown_enabled: countdownEnabled ? "true" : "false"
          });

          await writeAudit(env.DB, identity, "coming_soon_settings_update", "site_settings", "coming_soon", `Updated Coming Soon settings.`, {
            headline,
            subtext,
            launch_date: launchDate,
            countdown_enabled: countdownEnabled
          });

          return json({ coming_soon: { headline, subtext, launchDate, countdownEnabled }, saved: true });
        }
      }
      if (body.action === "export_customer_data") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_users", "manage_crm"])) {
          return json({ error: "Forbidden.", section }, 403);
        }
        const exported = await exportCustomerData(env.DB, body.customer_email || body.user_id, clean(body.format, 20) || "json");
        await writeAudit(env.DB, identity, "customer_data_export", "profiles", cleanEmail(body.customer_email || body.user_id), "Exported customer CRM data.", { format: exported.format });
        return json({ export: exported, saved: true });
      }
      if (section === "admins") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_admins", "manage_roles", "manage_permissions"])) {
          return json({ error: "Forbidden.", section }, 403);
        }
        if (body.action === "remove") {
          await removeAdmin(env.DB, body, identity, env);
          await writeAudit(env.DB, identity, "admin_remove", "admin_users", cleanEmail(body.email), `Removed admin access for ${cleanEmail(body.email)}.`, {});
        } else if (body.action === "suspend") {
          await updateAdmin(env.DB, { ...body, status: "Suspended" }, identity, env);
          await writeAudit(env.DB, identity, "admin_suspend", "admin_users", cleanEmail(body.email), `Suspended admin ${cleanEmail(body.email)}.`, {});
        } else if (body.action === "reactivate") {
          await updateAdmin(env.DB, { ...body, status: "Active" }, identity, env);
          await writeAudit(env.DB, identity, "admin_reactivate", "admin_users", cleanEmail(body.email), `Reactivated admin ${cleanEmail(body.email)}.`, {});
        } else if (body.action === "update") {
          await updateAdmin(env.DB, body, identity, env);
          await writeAudit(env.DB, identity, "admin_update", "admin_users", cleanEmail(body.email), `Updated admin ${cleanEmail(body.email)}.`, {});
        } else {
          await addAdmin(env.DB, body, identity);
          await writeAudit(env.DB, identity, "admin_add", "admin_users", cleanEmail(body.email), `Added admin ${cleanEmail(body.email)}.`, {});
        }
        return json({ admins: await getAdmins(env.DB, env), saved: true });
      }
      if (section === "roles") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_roles", "manage_permissions"])) {
          return json({ error: "Forbidden.", section }, 403);
        }
        if (body.action === "create") return json({ roles: await createRole(env.DB, body, identity), saved: true });
        if (body.action === "update") return json({ roles: await updateRole(env.DB, body, identity), saved: true });
        if (body.action === "rename") return json({ roles: await renameRole(env.DB, body, identity), saved: true });
        if (body.action === "clone") return json({ roles: await cloneRole(env.DB, body, identity), saved: true });
        if (body.action === "delete") return json({ roles: await deleteRole(env.DB, body, identity), saved: true });
        throw new Error("Unknown role action.");
      }
      if (section === "sessions") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_admins", "manage_audit", "manage_api"])) {
          return json({ error: "Forbidden.", section }, 403);
        }
        if (body.action === "revoke") {
          const requestedHash = clean(body.token_hash, 120);
          try {
            await DB.prepare(`UPDATE admin_oidc_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?`).bind(requestedHash).run();
          } catch {
            // Native session storage is additive and may not exist before migration.
          }
          await writeAudit(env.DB, identity, "session_revoke", "admin_sessions", requestedHash, "Revoked an admin session.", {});
          const nativeTokenHash = request.headers.get("x-ja-auth-session") || "";
          const headers = requestedHash === nativeTokenHash
            ? { "Set-Cookie": "ja_admin_session=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }
            : {};
          return headers["Set-Cookie"]
            ? jsonWithHeaders({ sessions: await getSessions(env.DB, request), saved: true }, headers)
            : json({ sessions: await getSessions(env.DB, request), saved: true });
        }
        if (body.action === "revoke_all") {
          try {
            await DB.prepare(`UPDATE admin_oidc_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE revoked_at IS NULL`).run();
          } catch {
            // Native session storage is additive and may not exist before migration.
          }
          await writeAudit(env.DB, identity, "session_revoke_all", "admin_sessions", "all", "Revoked all admin sessions.", {});
          return jsonWithHeaders(
            { sessions: await getSessions(env.DB, request), saved: true },
            { "Set-Cookie": "ja_admin_session=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }
          );
        }
        throw new Error("Unknown session action.");
      }
      if (section === "plans") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_plans", "manage_pricing"])) {
          return json({ error: "Forbidden.", section }, 403);
        }
        if (body.action === "save_all") {
          const plans = await savePlans(env.DB, body.plans);
          await writeAudit(env.DB, identity, "plans_save", "service_plans", "all", `Saved ${plans.length} complete plans.`, { count: plans.length });
          return json({ plans, saved: true });
        }
        const plans = await savePlan(env.DB, body);
        await writeAudit(env.DB, identity, "plan_save", "service_plans", clean(body.id, 120), `Saved plan ${clean(body.plan_name, 180)}.`, {});
        return json({ plans, saved: true });
      }
      if (section === "policies") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_policies", "manage_content"])) return json({ error: "Forbidden.", section }, 403);
        const policies = await savePolicy(env.DB, body);
        await writeAudit(env.DB, identity, "policy_save", "policy_pages", cleanSlug(body.slug), `Saved policy ${clean(body.title, 180)}.`, { status: clean(body.status, 80) });
        return json({ policies, saved: true });
      }
      if (section === "branding") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_branding", "manage_content"])) return json({ error: "Forbidden.", section }, 403);
        const branding = await saveBranding(env.DB, body);
        await writeAudit(env.DB, identity, "branding_update", "company_branding", "main", "Updated company branding.", { serviceName: clean(body.service_name, 180) });
        return json({ branding, saved: true });
      }
      if (section === "support") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_support", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        const result = await saveSupport(env.DB, body);
        const auditSummary = (body.action === "create" ? "Created" : "Updated") + " support ticket " + result.saved.reference + ": " + result.saved.subject + ".";
        await writeAudit(env.DB, identity, body.action === "create" ? "support_create" : "support_update", "support_tickets", result.saved.id, auditSummary, { reference: result.saved.reference, status: clean(body.status, 80), priority: clean(body.priority, 80) });
        return json({ support: result.records, saved: true });
      }
      if (section === "notifications") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_email", "manage_support", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        if (body.action === "delete") {
          await env.DB.prepare(`DELETE FROM customer_notifications WHERE id = ?`).bind(clean(body.id, 120)).run();
          await writeAudit(env.DB, identity, "notification_delete", "customer_notifications", clean(body.id, 120), "Deleted notification.", {});
          return json({ notifications: await getNotificationsAdmin(env.DB), saved: true });
        }
        const notifications = await saveNotification(env.DB, body, identity);
        await writeAudit(env.DB, identity, "notification_update", "customer_notifications", clean(body.id, 120), `Updated notification ${clean(body.title, 180)}.`, { status: clean(body.status, 80), category: clean(body.category, 80) });
        return json({ notifications, saved: true });
      }
      if (section === "enquiries") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_support", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        const thread = await updateEnquiryAsAdmin(env.DB, env, body, identity);
        await writeAudit(env.DB, identity, "enquiry_update", "enquiries", clean(body.reference, 40), `Updated enquiry ${clean(body.reference, 40)}.`, { status: clean(body.status, 80), priority: clean(body.priority, 80), replied: Boolean(clean(body.reply, 10)), internal_note: Boolean(clean(body.internalNote, 10)) });
        return json({ enquiries: await listAdminEnquiries(env.DB), thread, saved: true });
      }
      if (section === "system") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_settings"])) return json({ error: "Forbidden.", section }, 403);
        const system = await saveSystemEvent(env.DB, body);
        await writeAudit(env.DB, identity, "system_issue_update", "system_events", clean(body.id, 120), `Updated system issue ${clean(body.title, 250)}.`, { status: clean(body.status, 80), severity: clean(body.severity, 80) });
        return json({ system, saved: true });
      }
      if (section === "datarequests") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_data_requests"])) return json({ error: "Forbidden.", section }, 403);
        return json({ datarequests: await saveDataProtectionRequest(env.DB, body, identity, env), saved: true });
      }
      if (section === "systemreports") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_system_reports", "manage_audit"])) return json({ error: "Forbidden.", section }, 403);
        return json({ systemreports: await saveSystemReport(env.DB, body, identity), saved: true });
      }
      if (section === "closures") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_closure_requests"])) return json({ error: "Forbidden.", section }, 403);
        return json({ closures: await saveClosureRequest(env.DB, body, identity), saved: true });
      }
      if (section === "affiliate") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_content"])) return json({ error: "Forbidden.", section }, 403);
        return json({ affiliate: await saveAffiliateContent(env.DB, body, identity), saved: true });
      }
      if (section === "appearance") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_settings"])) return json({ error: "Forbidden.", section }, 403);
        return json({ appearance: await saveAppearance(env.DB, body, identity), saved: true });
      }
      if (section === "email") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_email"])) return json({ error: "Forbidden.", section }, 403);
        if (body.action === "test") return json({ email: await getEmailSettings(env.DB, env), test: await testNotification(env.DB, body, env, identity), saved: true });
        return json({ email: await saveEmailSettings(env.DB, body, env, identity), saved: true });
      }
      if (section === "maintenance") {
        return json({ error: "Legacy Maintenance controls are retired. Use System Settings > Site Status." }, 409);
      }
      if (section === "launchgateway") {
        return json({ error: "Legacy Launch Gateway controls are retired. Use System Settings > Site Status." }, 409);
      }
      if (section === "stripe") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_stripe"])) return json({ error: "Forbidden.", section }, 403);
        const stripe = await saveStripe(env.DB, body, env);
        await writeAudit(env.DB, identity, "stripe_settings_update", "site_settings", "stripe", "Updated Stripe API controls.", { tested: Boolean(body.test_connection), mode: stripe.mode });
        return json({ stripe, saved: true });
      }
      if (section === "customer") {
        if (!ownerAccess && !hasAnyPermission(adminContext.permissions, ["manage_users", "manage_crm"])) return json({ error: "Forbidden.", section }, 403);
        const email = cleanEmail(body.email);
        if (!email) return json({ error: "Customer email is required." }, 400);
        const verificationAction = ["verify_identity", "verify_pin", "clear_identity_verification", "override_identity_lock", "admin_pin_override"].includes(clean(body.action, 80));
        if (!verificationAction) {
          const verification = await getIdentityVerificationState(env.DB, email, identity.email, adminContext);
          if (!verification.verified) {
            await writeAudit(env.DB, identity, "customer_action_blocked_identity_required", "profiles", email, `Blocked customer action until identity verification for ${email}.`, { action: clean(body.action, 120), locked: verification.locked });
            return json({ error: "Identity Verification Required", verification }, 403);
          }
        }
        if (body.action === "clear_identity_verification") {
          await clearCustomerVerificationSession(env.DB, identity, email);
          await writeAudit(env.DB, identity, "customer_identity_verification_session_closed", "profiles", email, `Closed customer identity verification session for ${email}.`, {});
          return json({ saved: true, verification: await getIdentityVerificationState(env.DB, email, identity.email, adminContext) });
        }
        if (body.action === "override_identity_lock") {
          if (!isSupervisorContext(adminContext)) return json({ error: "Supervisor override is required." }, 403);
          const reason = clean(body.reason, 500);
          if (!reason) return json({ error: "A reason is required for supervisor override." }, 400);
          await clearCustomerIdentityLock(env.DB, identity, email, reason);
          const expiresAt = await createCustomerVerificationSession(env.DB, identity, email, "Supervisor Override");
          await writeAudit(env.DB, identity, "customer_identity_verification_override", "profiles", email, `Supervisor override verified customer identity for ${email}.`, { reason, expires_at: expiresAt });
          return json({ saved: true, verification: await getIdentityVerificationState(env.DB, email, identity.email, adminContext) });
        }
        if (body.action === "admin_pin_override") {
          if (!(await hasActiveAdminPinSession(env.DB, request, identity.email))) {
            await writeAudit(env.DB, identity, "customer_admin_pin_override_rejected", "profiles", email, `Rejected expired or unavailable administrator PIN override for ${email}.`, {});
            return json({ error: "Verify your administrator CRM override PIN and try again." }, 403);
          }
          const reason = clean(body.reason, 500);
          if (reason.length < 4) return json({ error: "Enter a reason of at least four characters for accessing this customer record." }, 400);
          const expiresAt = await createCustomerVerificationSession(env.DB, identity, email, "Administrator PIN override");
          await writeAudit(env.DB, identity, "customer_admin_pin_override", "profiles", email, `Administrator PIN override opened protected CRM data for ${email}.`, { reason, expires_at: expiresAt });
          return json({ saved: true, verification: { ...(await getIdentityVerificationState(env.DB, email, identity.email, adminContext)), admin_pin_override_available: true } });
        }
        if (body.action === "verify_identity" || body.action === "verify_pin") {
          const method = clean(body.method, 80) || (body.action === "verify_pin" ? "Support PIN" : "Support PIN");
          const lockedState = await getIdentityVerificationState(env.DB, email, identity.email, adminContext);
          if (lockedState.locked) {
            await writeAudit(env.DB, identity, "customer_identity_verification_blocked_locked", "profiles", email, `Blocked identity verification because ${email} is temporarily locked.`, { method });
            return json({ verification: lockedState, error: "Identity verification has failed. For security, this customer profile has been temporarily locked." }, 423);
          }

          const verificationResult = method === "Security Questions"
            ? await verifyCustomerSecurityQuestions(env.DB, { ...body, email })
            : await verifySupportPinRecord(env.DB, env, email, body.pin, identity.email);

          if (verificationResult.ok) {
            await clearIdentityFailures(env.DB, email);
            const expiresAt = await createCustomerVerificationSession(env.DB, identity, email, method);
            await writeAudit(env.DB, identity, "customer_identity_verified", "profiles", email, `Verified customer identity for ${email}.`, {
              method,
              questions_used: verificationResult.questions_used || [],
              success: true,
              expires_at: expiresAt
            });
          } else {
            const failure = await recordIdentityFailure(env.DB, identity, email, method, verificationResult.error || "Verification failed.");
            if (failure.locked) {
              return json({
                verification: await getIdentityVerificationState(env.DB, email, identity.email, adminContext),
                error: "Identity verification has failed. For security, this customer profile has been temporarily locked."
              }, 423);
            }
          }

          const verification = await getIdentityVerificationState(env.DB, email, identity.email, adminContext);
          return json({ saved: Boolean(verificationResult.ok), verification, error: verificationResult.ok ? "" : "The Support PIN could not be verified." });
        }
        if (body.action === "open_stripe_portal") {
          const portalUrl = await createCustomerStripePortal(env.DB, env, email, new URL(request.url).origin);
          await writeAudit(env.DB, identity, "stripe_portal_open", "profiles", email, `Opened Stripe Billing Portal for ${email}.`, {});
          return json({ url: portalUrl });
        }
        const cols = await getProfilesColumns(env.DB);
        if (body.action === "update_profile") {
          const verifiedName = clean(body.verified_name, 180);
          const displayName = clean(body.display_name, 180);
          const contactEmail = cleanEmail(body.contact_email);
          const phone = clean(body.phone, 60);
          const preference = clean(body.communication_preference, 80);
          const supportNotes = clean(body.support_notes, 4000);
          const adminNotes = clean(body.admin_notes, 4000);
          if (!verifiedName && !displayName) return json({ error: "A verified or display name is required." }, 400);
          if (body.contact_email && !contactEmail) return json({ error: "Enter a valid contact email address." }, 400);
          const current = await env.DB.prepare(`SELECT verified_name,display_name,contact_email,phone,communication_preference,support_notes,admin_notes FROM profiles WHERE lower(email)=lower(?)`).bind(email).first();
          if (!current) return json({ error: "Customer profile not found." }, 404);
          await env.DB.prepare(`UPDATE profiles SET verified_name=?,display_name=?,contact_email=?,phone=?,communication_preference=?,support_notes=?,admin_notes=?,admin_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`).bind(
            verifiedName || null, displayName || null, contactEmail || null, phone || null, preference || null, supportNotes || null, adminNotes || null, email
          ).run();
          const changedFields = ["verified_name","display_name","contact_email","phone","communication_preference","support_notes","admin_notes"].filter((field) => String(current[field] || "") !== String({ verified_name: verifiedName, display_name: displayName, contact_email: contactEmail, phone, communication_preference: preference, support_notes: supportNotes, admin_notes: adminNotes }[field] || ""));
          await env.DB.prepare(`INSERT INTO customer_timeline_events (id,email,event_type,title,detail,actor_type,actor_email,metadata) VALUES (?,?,'profile_amended','Customer profile amended','An authorised administrator corrected customer profile information.','admin',?,?)`).bind(crypto.randomUUID(), email, identity.email, JSON.stringify({ changed_fields: changedFields })).run();
          await writeAudit(env.DB, identity, "customer_profile_amended", "profiles", email, `Amended customer profile for ${email}.`, { changed_fields: changedFields });
          return json({ saved: true, changed_fields: changedFields });
        }
        if (body.action === "suspend_account" || body.action === "reactivate_account") {
          const reason = clean(body.reason, 1000);
          const note = clean(body.internal_note, 2000);
          if (!reason) return json({ error: `${body.action === "suspend_account" ? "Suspension" : "Reactivation"} reason is required.` }, 400);
          const requestId = clean(request.headers.get("cf-ray") || request.headers.get("x-request-id"), 120) || crypto.randomUUID();
          if (body.action === "suspend_account") {
            if (cols.has("suspended_at") && cols.has("suspended_by") && cols.has("suspension_reason")) {
              await env.DB.prepare(`UPDATE profiles SET admin_customer_status='Suspended', suspended_at=CURRENT_TIMESTAMP, suspended_by=?, suspension_reason=?, admin_notes=CASE WHEN ?='' THEN admin_notes ELSE ? END, admin_updated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`).bind(identity.email, reason, note, note, email).run();
            } else {
              await env.DB.prepare(`UPDATE profiles SET admin_customer_status='Suspended', admin_notes=CASE WHEN ?='' THEN admin_notes ELSE ? END, admin_updated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`).bind(note, note, email).run();
            }
            await env.DB.prepare(`INSERT INTO customer_timeline_events (id,email,event_type,title,detail,actor_type,actor_email,metadata) VALUES (?,?, 'account_suspended','Account suspended','Customer access was suspended by an authorised administrator.','admin',?,?)`).bind(crypto.randomUUID(), email, identity.email, JSON.stringify({ request_id: requestId })).run();
            await writeAudit(env.DB, identity, "customer_account_suspended", "profiles", email, `Suspended customer account ${email}.`, { reason, result: "success", request_id: requestId });
          } else {
            if (cols.has("reactivated_at") && cols.has("reactivated_by") && cols.has("reactivation_reason")) {
              await env.DB.prepare(`UPDATE profiles SET admin_customer_status='Active', reactivated_at=CURRENT_TIMESTAMP, reactivated_by=?, reactivation_reason=?, admin_notes=CASE WHEN ?='' THEN admin_notes ELSE ? END, admin_updated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`).bind(identity.email, reason, note, note, email).run();
            } else {
              await env.DB.prepare(`UPDATE profiles SET admin_customer_status='Active', admin_notes=CASE WHEN ?='' THEN admin_notes ELSE ? END, admin_updated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`).bind(note, note, email).run();
            }
            await env.DB.prepare(`INSERT INTO customer_timeline_events (id,email,event_type,title,detail,actor_type,actor_email,metadata) VALUES (?,?, 'account_reactivated','Account reactivated','Customer access was restored by an authorised administrator.','admin',?,?)`).bind(crypto.randomUUID(), email, identity.email, JSON.stringify({ request_id: requestId })).run();
            await writeAudit(env.DB, identity, "customer_account_reactivated", "profiles", email, `Reactivated customer account ${email}.`, { reason, result: "success", request_id: requestId });
          }
          return json({ saved: true, account_status: body.action === "suspend_account" ? "Suspended" : "Active", request_id: requestId });
        }
        if (body.action === "add_note") {
          const noteId = `note_${Date.now()}`;
          await DB.prepare(`
            INSERT INTO customer_internal_notes (id, email, category, body, pinned, author_email, attachments, edit_history, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', CURRENT_TIMESTAMP)
          `).bind(noteId, email, clean(body.category, 80) || "General", clean(body.body, 4000), body.pinned ? 1 : 0, identity.email, JSON.stringify(Array.isArray(body.attachments) ? body.attachments : [])).run();
          await writeAudit(env.DB, identity, "customer_note_create", "customer_internal_notes", email, `Added customer note for ${email}.`, { category: clean(body.category, 80) || "General" });
        }
        if (body.action === "send_notification") {
          const notificationPayload = {
            ...body,
            id: "",
            email,
            title: clean(body.title, 180) || "Customer update",
            body: clean(body.body, 4000) || "A new update is available for your account.",
            category: clean(body.category, 80) || "General",
            priority: clean(body.priority, 40) || "Normal",
            status: clean(body.status, 40) || "Sent",
            delivery_status: clean(body.delivery_status, 40) || "Sent",
            archived_at: null
          };
          const notifications = await saveNotification(env.DB, notificationPayload, identity);
          await writeAudit(env.DB, identity, "customer_notification_send", "customer_notifications", email, `Sent customer notification to ${email}.`, { title: notificationPayload.title, category: notificationPayload.category });
          return json({ notifications, saved: true, notification: { email } });
        }
        const suspended_at_sel = cols.has("suspended_at") ? "suspended_at" : "NULL AS suspended_at";
        const suspended_by_sel = cols.has("suspended_by") ? "suspended_by" : "NULL AS suspended_by";
        const suspension_reason_sel = cols.has("suspension_reason") ? "suspension_reason" : "NULL AS suspension_reason";
        const reactivated_at_sel = cols.has("reactivated_at") ? "reactivated_at" : "NULL AS reactivated_at";
        const reactivated_by_sel = cols.has("reactivated_by") ? "reactivated_by" : "NULL AS reactivated_by";
        const reactivation_reason_sel = cols.has("reactivation_reason") ? "reactivation_reason" : "NULL AS reactivation_reason";

        const [customer, flags, timeline, supportCases, notifications, pins, plans, notes, billing] = await Promise.all([
          DB.prepare(`
            SELECT
              email,
              verified_name,
              display_name,
              contact_email,
              phone,
              communication_preference,
              support_notes,
              admin_notes,
              admin_lifetime,
              admin_lifetime_plan_id,
              admin_customer_status,
              created_at,
              updated_at,
              admin_updated_at,
              ${suspended_at_sel}, ${suspended_by_sel}, ${suspension_reason_sel}, ${reactivated_at_sel}, ${reactivated_by_sel}, ${reactivation_reason_sel}
            FROM profiles
            WHERE lower(email) = lower(?)
          `).bind(email).first(),
          all(env.DB, `SELECT * FROM customer_account_flags WHERE lower(email) = lower(?) ORDER BY updated_at DESC`, [email]),
          all(env.DB, `SELECT * FROM customer_timeline_events WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 200`, [email]),
          all(env.DB, `SELECT * FROM customer_support_cases WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 100`, [email]),
          all(env.DB, `SELECT * FROM customer_notifications WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 100`, [email]),
          all(env.DB, `SELECT * FROM customer_support_pins_v2 WHERE lower(email) = lower(?) ORDER BY updated_at DESC LIMIT 20`, [email]),
          getPlans(env.DB),
          all(env.DB, `SELECT * FROM customer_internal_notes WHERE lower(email) = lower(?) ORDER BY pinned DESC, updated_at DESC LIMIT 100`, [email]),
          getCustomerStripeBilling(env.DB, env, email)
        ]);
        return json({ customer: { ...customer, flags, timeline, supportCases, notifications, pins, notes, billing }, plans, saved: true });
      }
    }

    return json({ error: "Method or section not allowed." }, 405);
  } catch (error) {
    return json({ error: error.message || "Admin API error." }, 500);
  }
}
