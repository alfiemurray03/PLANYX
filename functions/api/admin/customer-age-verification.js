import { latestAgeVerificationRecord, ensureAgeVerificationRecordTable } from "../../_shared/age-verification-records.js";
import { ensureAgeSafeguardingColumns } from "../../_shared/age-assurance.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function identityFrom(request) {
  return {
    email: clean(request.headers.get("x-ja-auth-email"), 254).toLowerCase(),
    name: clean(request.headers.get("x-ja-auth-name") || request.headers.get("x-ja-auth-email"), 180),
  };
}

function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("Referer");
  if (!referer) return true;
  try { return new URL(referer).origin === url.origin; } catch { return false; }
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "alfieholywoodmurray@jagroupservices.co.uk")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function permissionSet(DB, identity, env) {
  if (!identity.email) return new Set();
  if (configuredAdmins(env).includes(identity.email)) return new Set(["*"]);
  const admin = await DB.prepare(`SELECT role,status,permissions FROM admin_users WHERE lower(email)=lower(?) LIMIT 1`)
    .bind(identity.email).first().catch(() => null);
  if (!admin || ["blocked", "closed", "disabled", "inactive", "suspended"].includes(clean(admin.status || "Active", 80).toLowerCase())) return new Set();
  if (admin.role === "Platform Owner") return new Set(["*"]);
  const explicit = parsePermissions(admin.permissions);
  const rows = await DB.prepare(`SELECT permission_code FROM role_permissions WHERE role_name=?`)
    .bind(clean(admin.role || "Auditor", 100)).all().catch(() => ({ results: [] }));
  return new Set([...explicit, ...(rows.results || []).map((row) => row.permission_code).filter(Boolean)]);
}

function hasAny(permissions, values) {
  return permissions.has("*") || values.some((value) => permissions.has(value));
}

function requestCookie(request, name) {
  const entry = (request.headers.get("Cookie") || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function activeAdminPinSession(DB, request, email) {
  const token = requestCookie(request, "ja_admin_pin_session");
  if (!token) return false;
  const tokenHash = await sha256Hex(token);
  const session = await DB.prepare(`SELECT token_hash FROM admin_pin_sessions
    WHERE token_hash=? AND lower(admin_email)=lower(?)
      AND revoked_at IS NULL AND datetime(expires_at)>datetime('now') LIMIT 1`)
    .bind(tokenHash, email).first().catch(() => null);
  return Boolean(session?.token_hash);
}

async function ensureAuditTables(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, entity_type TEXT,
    entity_id TEXT, summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_timeline_events (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, event_type TEXT NOT NULL,
    title TEXT NOT NULL, detail TEXT, actor_type TEXT NOT NULL DEFAULT 'system',
    actor_email TEXT, metadata TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function audit(DB, identity, customerEmail, action, summary, metadata = {}) {
  await ensureAuditTables(DB);
  await DB.prepare(`INSERT INTO admin_audit_log
    (id,actor_email,action,entity_type,entity_id,summary,metadata)
    VALUES (?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), identity.email, action, "customer_age_verification",
      customerEmail, summary, JSON.stringify(metadata),
    ).run();
  await DB.prepare(`INSERT INTO customer_timeline_events
    (id,email,event_type,title,detail,actor_type,actor_email,metadata)
    VALUES (?,?,?,?,?,'admin',?,?)`).bind(
      crypto.randomUUID(), customerEmail, action,
      action === "age_dob_reveal" ? "Date of birth viewed by authorised administrator" : "Age-verification record accessed",
      summary, identity.email, JSON.stringify(metadata),
    ).run();
}

async function profileSummary(DB, email) {
  await ensureAgeSafeguardingColumns(DB);
  return DB.prepare(`SELECT email,age_band,age_transition_at,age_verified_at,
      age_assurance_method,age_policy_version,age_verification_id,
      registration_eligible,minor_safeguards_enabled,profile_visibility,
      public_discovery_allowed,profiling_allowed,marketing_allowed,
      precise_location_default,safeguarding_review_required
    FROM profiles WHERE lower(email)=lower(?) LIMIT 1`)
    .bind(email).first().catch(() => null);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ success: false, error: "The CRM database is unavailable." }, 500);
  const identity = identityFrom(request);
  if (!identity.email) return json({ success: false, error: "Administrator session required." }, 401);
  const permissions = await permissionSet(env.DB, identity, env);
  const canView = hasAny(permissions, ["manage_crm", "manage_users", "manage_age_verification", "manage_data_requests", "manage_audit"]);
  const canReveal = hasAny(permissions, ["manage_age_verification", "manage_data_requests", "manage_audit"]);
  if (!canView) return json({ success: false, error: "You do not have permission to view customer age-verification records." }, 403);

  const url = new URL(request.url);
  let email = clean(url.searchParams.get("email"), 254).toLowerCase();
  if (request.method === "POST") {
    if (!sameOrigin(request)) return json({ success: false, error: "This request could not be verified." }, 403);
    const body = await request.json().catch(() => ({}));
    email = clean(body.email || email, 254).toLowerCase();
    if (!email || !email.includes("@")) return json({ success: false, error: "A valid customer email is required." }, 400);
    if (clean(body.action, 40) !== "reveal_dob") return json({ success: false, error: "Unknown action." }, 400);
    if (!canReveal) return json({ success: false, error: "You do not have permission to reveal a customer's date of birth." }, 403);
    const reason = clean(body.reason, 500);
    if (reason.length < 10) return json({ success: false, error: "Enter a clear operational, safeguarding or legal reason of at least ten characters." }, 400);
    if (!(await activeAdminPinSession(env.DB, request, identity.email))) {
      return json({ success: false, error: "Unlock the Admin Centre with your personal PIN before revealing this protected value." }, 403);
    }
    await ensureAgeVerificationRecordTable(env.DB);
    const record = await latestAgeVerificationRecord(env.DB, env, email, { reveal: true });
    if (!record) return json({ success: false, error: "No encrypted date-of-birth record exists for this customer. A fresh age check is required." }, 404);
    await audit(env.DB, identity, email, "age_dob_reveal", `Authorised administrator revealed the encrypted date of birth for ${email}.`, {
      verification_id: record.verificationId,
      reason,
      date_of_birth_not_logged: true,
    });
    return json({ success: true, dateOfBirth: record.dateOfBirth, verificationId: record.verificationId, revealedAt: new Date().toISOString() });
  }

  if (request.method !== "GET") return json({ success: false, error: "Method not allowed." }, 405);
  if (!email || !email.includes("@")) return json({ success: false, error: "A valid customer email is required." }, 400);
  const [record, profile] = await Promise.all([
    latestAgeVerificationRecord(env.DB, env, email, { reveal: false }).catch(() => null),
    profileSummary(env.DB, email),
  ]);
  if (!profile) return json({ success: false, error: "Customer not found." }, 404);

  return json({
    success: true,
    record: record || (profile.age_verified_at ? {
      verificationId: profile.age_verification_id || "Legacy age result — recheck required",
      email,
      dateOfBirthMasked: "Not retained by the previous age-check version",
      ageBand: profile.age_band,
      eligible: Number(profile.registration_eligible || 0) === 1,
      status: "Legacy result",
      method: profile.age_assurance_method,
      providerName: "Planyx",
      providerReference: profile.age_verification_id || "",
      policyVersion: profile.age_policy_version,
      verifiedAt: profile.age_verified_at,
      expiresAt: "",
      linkedAt: "",
      legacy: true,
    } : null),
    safeguards: {
      ageBand: profile.age_band || "Not verified",
      registrationEligible: Number(profile.registration_eligible || 0) === 1,
      minorSafeguardsEnabled: Number(profile.minor_safeguards_enabled || 0) === 1,
      adultTransitionAt: profile.age_transition_at || "",
      profileVisibility: profile.profile_visibility || "private",
      publicDiscoveryAllowed: Number(profile.public_discovery_allowed || 0) === 1,
      profilingAllowed: Number(profile.profiling_allowed || 0) === 1,
      marketingAllowed: Number(profile.marketing_allowed || 0) === 1,
      preciseLocationDefault: Number(profile.precise_location_default || 0) === 1,
      safeguardingReviewRequired: Number(profile.safeguarding_review_required || 0) === 1,
    },
    permissions: { canView: true, canReveal },
    notice: "The exact date of birth is encrypted, masked by default and may only be revealed for a documented operational, safeguarding or legal need. Every reveal is audited.",
  });
}
