const MINIMUM_AGE = 16;
const SETTINGS_ID = 1;
const VALID_STATUSES = new Set(["live", "maintenance", "paused"]);
const VALID_METHODS = new Set(["self_declaration", "independent_provider"]);
const VALID_DESIGNS = new Set(["standard", "compact", "assurance"]);

export const DEFAULT_AGE_VERIFICATION_SETTINGS = Object.freeze({
  serviceStatus: "live",
  verificationMethod: "self_declaration",
  providerName: "",
  allowSelfDeclarationFallback: true,
  allowExistingVerifiedAccess: true,
  designVariant: "standard",
  publicHeading: "Confirm you are aged 16 or over",
  publicDescription: "Sousa Murray Planeia is a 16+ planning service. Complete the age check before creating or using an account.",
  buttonLabel: "Confirm age and continue",
  maintenanceHeading: "Age verification is temporarily unavailable",
  maintenanceMessage: "New registrations are paused while the age-verification service is maintained. Existing verified customers may continue to sign in.",
  showPrivacyNotice: true,
  showSafetyLink: true,
  policyVersion: "planyx-16-plus-v1",
  dpiaReference: "",
  lawfulBasisNote: "Age assurance and safeguarding controls are used to enforce the 16+ eligibility rule and apply high-privacy defaults to users aged 16–17.",
  lastLegalReviewAt: "",
  nextLegalReviewAt: "",
  eventRetentionDays: 365,
  debugLogging: false,
});

function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function flag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function providerCapability(env) {
  const adapter = clean(env.AGE_PROVIDER_ADAPTER, 80).toLowerCase();
  const apiKeyConfigured = Boolean(clean(env.AGE_PROVIDER_API_KEY, 2000));
  const webhookSecretConfigured = Boolean(clean(env.AGE_PROVIDER_WEBHOOK_SECRET, 2000));
  const returnSecretConfigured = Boolean(clean(env.AGE_PROVIDER_RETURN_SECRET || env.AGE_PROVIDER_WEBHOOK_SECRET, 2000));
  const supportedAdapter = ["yoti", "generic_redirect"].includes(adapter);
  return {
    adapter: adapter || "not_configured",
    supportedAdapter,
    apiKeyConfigured,
    webhookSecretConfigured,
    returnSecretConfigured,
    ready: supportedAdapter && apiKeyConfigured && webhookSecretConfigured && returnSecretConfigured,
  };
}

export async function ensureAgeVerificationControlTables(DB) {
  if (!DB) throw new Error("Age verification database is unavailable.");
  await DB.prepare(`CREATE TABLE IF NOT EXISTS age_verification_settings (
    id INTEGER PRIMARY KEY,
    service_status TEXT NOT NULL DEFAULT 'live',
    verification_method TEXT NOT NULL DEFAULT 'self_declaration',
    provider_name TEXT DEFAULT '',
    allow_self_declaration_fallback INTEGER NOT NULL DEFAULT 1,
    allow_existing_verified_access INTEGER NOT NULL DEFAULT 1,
    design_variant TEXT NOT NULL DEFAULT 'standard',
    public_heading TEXT NOT NULL,
    public_description TEXT NOT NULL,
    button_label TEXT NOT NULL,
    maintenance_heading TEXT NOT NULL,
    maintenance_message TEXT NOT NULL,
    show_privacy_notice INTEGER NOT NULL DEFAULT 1,
    show_safety_link INTEGER NOT NULL DEFAULT 1,
    policy_version TEXT NOT NULL,
    dpia_reference TEXT DEFAULT '',
    lawful_basis_note TEXT DEFAULT '',
    last_legal_review_at TEXT DEFAULT '',
    next_legal_review_at TEXT DEFAULT '',
    event_retention_days INTEGER NOT NULL DEFAULT 365,
    debug_logging INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  )`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS age_verification_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    age_band TEXT DEFAULT '',
    subject_email TEXT DEFAULT '',
    method TEXT DEFAULT '',
    provider TEXT DEFAULT '',
    detail TEXT DEFAULT '',
    correlation_id TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const d = DEFAULT_AGE_VERIFICATION_SETTINGS;
  await DB.prepare(`INSERT OR IGNORE INTO age_verification_settings (
    id, service_status, verification_method, provider_name,
    allow_self_declaration_fallback, allow_existing_verified_access,
    design_variant, public_heading, public_description, button_label,
    maintenance_heading, maintenance_message, show_privacy_notice,
    show_safety_link, policy_version, dpia_reference, lawful_basis_note,
    last_legal_review_at, next_legal_review_at, event_retention_days,
    debug_logging, updated_by
  ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    d.serviceStatus, d.verificationMethod, d.providerName,
    d.allowSelfDeclarationFallback ? 1 : 0, d.allowExistingVerifiedAccess ? 1 : 0,
    d.designVariant, d.publicHeading, d.publicDescription, d.buttonLabel,
    d.maintenanceHeading, d.maintenanceMessage, d.showPrivacyNotice ? 1 : 0,
    d.showSafetyLink ? 1 : 0, d.policyVersion, d.dpiaReference, d.lawfulBasisNote,
    d.lastLegalReviewAt, d.nextLegalReviewAt, d.eventRetentionDays,
    d.debugLogging ? 1 : 0, "system-default"
  ).run();
}

function normaliseRow(row = {}) {
  const d = DEFAULT_AGE_VERIFICATION_SETTINGS;
  return {
    minimumAge: MINIMUM_AGE,
    minorSafeguardsLocked: true,
    serviceStatus: VALID_STATUSES.has(row.service_status) ? row.service_status : d.serviceStatus,
    verificationMethod: VALID_METHODS.has(row.verification_method) ? row.verification_method : d.verificationMethod,
    providerName: clean(row.provider_name, 120),
    allowSelfDeclarationFallback: flag(row.allow_self_declaration_fallback, d.allowSelfDeclarationFallback),
    allowExistingVerifiedAccess: flag(row.allow_existing_verified_access, d.allowExistingVerifiedAccess),
    designVariant: VALID_DESIGNS.has(row.design_variant) ? row.design_variant : d.designVariant,
    publicHeading: clean(row.public_heading, 160) || d.publicHeading,
    publicDescription: clean(row.public_description, 800) || d.publicDescription,
    buttonLabel: clean(row.button_label, 80) || d.buttonLabel,
    maintenanceHeading: clean(row.maintenance_heading, 160) || d.maintenanceHeading,
    maintenanceMessage: clean(row.maintenance_message, 800) || d.maintenanceMessage,
    showPrivacyNotice: flag(row.show_privacy_notice, d.showPrivacyNotice),
    showSafetyLink: flag(row.show_safety_link, d.showSafetyLink),
    policyVersion: clean(row.policy_version, 80) || d.policyVersion,
    dpiaReference: clean(row.dpia_reference, 160),
    lawfulBasisNote: clean(row.lawful_basis_note, 1200) || d.lawfulBasisNote,
    lastLegalReviewAt: clean(row.last_legal_review_at, 20),
    nextLegalReviewAt: clean(row.next_legal_review_at, 20),
    eventRetentionDays: Math.min(730, Math.max(90, Number(row.event_retention_days || d.eventRetentionDays))),
    debugLogging: flag(row.debug_logging, d.debugLogging),
    updatedAt: clean(row.updated_at, 80),
    updatedBy: clean(row.updated_by, 254),
  };
}

export async function getAgeVerificationSettings(DB, env = {}) {
  if (!DB) return { ...DEFAULT_AGE_VERIFICATION_SETTINGS, minimumAge: MINIMUM_AGE, minorSafeguardsLocked: true, provider: providerCapability(env) };
  await ensureAgeVerificationControlTables(DB);
  const row = await DB.prepare("SELECT * FROM age_verification_settings WHERE id=?").bind(SETTINGS_ID).first();
  const settings = normaliseRow(row || {});
  return { ...settings, provider: providerCapability(env) };
}

export async function saveAgeVerificationSettings(DB, env, input, actorEmail) {
  await ensureAgeVerificationControlTables(DB);
  const current = await getAgeVerificationSettings(DB, env);
  const requestedStatus = clean(input.serviceStatus || current.serviceStatus, 30).toLowerCase();
  const serviceStatus = requestedStatus === "off" || requestedStatus === "disabled" ? "paused" : requestedStatus;
  const verificationMethod = clean(input.verificationMethod || current.verificationMethod, 40).toLowerCase();
  const designVariant = clean(input.designVariant || current.designVariant, 40).toLowerCase();
  if (!VALID_STATUSES.has(serviceStatus)) throw new Error("Choose Live, Maintenance or Registrations paused.");
  if (!VALID_METHODS.has(verificationMethod)) throw new Error("Choose a supported verification method.");
  if (!VALID_DESIGNS.has(designVariant)) throw new Error("Choose a supported age-check design.");

  const provider = providerCapability(env);
  if (serviceStatus === "live" && verificationMethod === "independent_provider" && !provider.ready) {
    throw new Error("Independent provider mode cannot go live until the Cloudflare provider adapter and secrets are configured and pass diagnostics.");
  }

  const next = {
    ...current,
    serviceStatus,
    verificationMethod,
    providerName: clean(input.providerName ?? current.providerName, 120),
    allowSelfDeclarationFallback: flag(input.allowSelfDeclarationFallback, current.allowSelfDeclarationFallback),
    allowExistingVerifiedAccess: flag(input.allowExistingVerifiedAccess, current.allowExistingVerifiedAccess),
    designVariant,
    publicHeading: clean(input.publicHeading ?? current.publicHeading, 160),
    publicDescription: clean(input.publicDescription ?? current.publicDescription, 800),
    buttonLabel: clean(input.buttonLabel ?? current.buttonLabel, 80),
    maintenanceHeading: clean(input.maintenanceHeading ?? current.maintenanceHeading, 160),
    maintenanceMessage: clean(input.maintenanceMessage ?? current.maintenanceMessage, 800),
    showPrivacyNotice: flag(input.showPrivacyNotice, current.showPrivacyNotice),
    showSafetyLink: flag(input.showSafetyLink, current.showSafetyLink),
    policyVersion: clean(input.policyVersion ?? current.policyVersion, 80),
    dpiaReference: clean(input.dpiaReference ?? current.dpiaReference, 160),
    lawfulBasisNote: clean(input.lawfulBasisNote ?? current.lawfulBasisNote, 1200),
    lastLegalReviewAt: clean(input.lastLegalReviewAt ?? current.lastLegalReviewAt, 20),
    nextLegalReviewAt: clean(input.nextLegalReviewAt ?? current.nextLegalReviewAt, 20),
    eventRetentionDays: Math.min(730, Math.max(90, Number(input.eventRetentionDays ?? current.eventRetentionDays))),
    debugLogging: flag(input.debugLogging, current.debugLogging),
  };
  if (!next.publicHeading || !next.publicDescription || !next.buttonLabel) throw new Error("The public age-check wording cannot be blank.");
  if (!next.maintenanceHeading || !next.maintenanceMessage) throw new Error("The maintenance wording cannot be blank.");
  if (verificationMethod === "self_declaration") next.allowSelfDeclarationFallback = true;

  await DB.prepare(`UPDATE age_verification_settings SET
    service_status=?, verification_method=?, provider_name=?,
    allow_self_declaration_fallback=?, allow_existing_verified_access=?,
    design_variant=?, public_heading=?, public_description=?, button_label=?,
    maintenance_heading=?, maintenance_message=?, show_privacy_notice=?,
    show_safety_link=?, policy_version=?, dpia_reference=?, lawful_basis_note=?,
    last_legal_review_at=?, next_legal_review_at=?, event_retention_days=?,
    debug_logging=?, updated_at=CURRENT_TIMESTAMP, updated_by=? WHERE id=1`).bind(
    next.serviceStatus, next.verificationMethod, next.providerName,
    next.allowSelfDeclarationFallback ? 1 : 0, next.allowExistingVerifiedAccess ? 1 : 0,
    next.designVariant, next.publicHeading, next.publicDescription, next.buttonLabel,
    next.maintenanceHeading, next.maintenanceMessage, next.showPrivacyNotice ? 1 : 0,
    next.showSafetyLink ? 1 : 0, next.policyVersion, next.dpiaReference, next.lawfulBasisNote,
    next.lastLegalReviewAt, next.nextLegalReviewAt, next.eventRetentionDays,
    next.debugLogging ? 1 : 0, clean(actorEmail, 254).toLowerCase()
  ).run();
  return getAgeVerificationSettings(DB, env);
}

export async function recordAgeVerificationEvent(DB, request, event = {}) {
  if (!DB) return;
  await ensureAgeVerificationControlTables(DB);
  const settings = await getAgeVerificationSettings(DB, {});
  const ip = clean(request?.headers?.get?.("CF-Connecting-IP") || "", 80);
  const ua = clean(request?.headers?.get?.("User-Agent") || "", 500);
  await DB.prepare(`INSERT INTO age_verification_events
    (id,event_type,outcome,age_band,subject_email,method,provider,detail,correlation_id,ip_address,user_agent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), clean(event.eventType || "unknown", 80), clean(event.outcome || "unknown", 40),
    clean(event.ageBand, 30), clean(event.subjectEmail, 254).toLowerCase(), clean(event.method, 160),
    clean(event.provider, 120), clean(event.detail, 1000), clean(event.correlationId || request?.headers?.get?.("cf-ray"), 120),
    ip, ua
  ).run();
  await DB.prepare("DELETE FROM age_verification_events WHERE created_at < datetime('now', ?)")
    .bind(`-${settings.eventRetentionDays} days`).run().catch(() => null);
}

export async function ageVerificationDiagnostics(DB, env) {
  const settings = await getAgeVerificationSettings(DB, env);
  const secret = clean(env.AGE_ASSURANCE_SECRET || env.OIDC_TOKEN_ENCRYPTION_KEY, 2000);
  const checks = [
    { id: "database", label: "Age-verification database", ok: Boolean(DB), detail: DB ? "Available" : "Missing DB binding" },
    { id: "signing_secret", label: "Signed age-result secret", ok: secret.length >= 32, detail: secret.length >= 32 ? "Configured" : "AGE_ASSURANCE_SECRET or OIDC_TOKEN_ENCRYPTION_KEY must contain at least 32 characters" },
    { id: "minimum_age", label: "Minimum age lock", ok: settings.minimumAge === 16, detail: "Locked at 16" },
    { id: "young_person_defaults", label: "16–17 high-privacy defaults", ok: settings.minorSafeguardsLocked === true, detail: "Mandatory and cannot be disabled" },
    { id: "provider", label: "Independent provider readiness", ok: settings.provider.ready, warn: settings.verificationMethod !== "independent_provider", detail: settings.provider.ready ? `Ready (${settings.provider.adapter})` : "Provider adapter/secrets are not fully configured" },
    { id: "governance", label: "DPIA/governance reference", ok: Boolean(settings.dpiaReference && settings.lastLegalReviewAt), warn: true, detail: settings.dpiaReference && settings.lastLegalReviewAt ? "Recorded" : "DPIA reference and legal-review date should be completed" },
  ];
  return { settings, checks, healthy: checks.filter((item) => !item.warn).every((item) => item.ok) };
}

export { MINIMUM_AGE, providerCapability };
