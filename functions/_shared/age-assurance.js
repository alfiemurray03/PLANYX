import { linkAgeVerificationRecord } from "./age-verification-records.js";

const AGE_COOKIE = "planyx_age_assurance";
const POLICY_VERSION = "planyx-16-plus-v1";
const MINIMUM_AGE = 16;
const COOKIE_SECONDS = 365 * 24 * 60 * 60;

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalised = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalised.padEnd(normalised.length + ((4 - normalised.length % 4) % 4), "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (date.getTime() > Date.now()) return null;
  return { date, value: `${match[1]}-${match[2]}-${match[3]}` };
}

export function calculateAge(dateOfBirth, at = new Date()) {
  const parsed = parseBirthDate(dateOfBirth);
  if (!parsed) return -1;
  let age = at.getUTCFullYear() - parsed.date.getUTCFullYear();
  const monthDifference = at.getUTCMonth() - parsed.date.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && at.getUTCDate() < parsed.date.getUTCDate())) age -= 1;
  return age;
}

export function ageBandFor(dateOfBirth) {
  const age = calculateAge(dateOfBirth);
  if (age < 0) return "unknown";
  if (age < MINIMUM_AGE) return "under-16";
  if (age < 18) return "16-17";
  return "18+";
}

function adultOnFor(parsedBirthDate) {
  const adultDate = new Date(Date.UTC(
    parsedBirthDate.date.getUTCFullYear() + 18,
    parsedBirthDate.date.getUTCMonth(),
    parsedBirthDate.date.getUTCDate(),
  ));
  return adultDate.toISOString().slice(0, 10);
}

function isAdultTransitionReached(adultOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(adultOn, 10))) return false;
  return clean(adultOn, 10) <= new Date().toISOString().slice(0, 10);
}

function effectiveAgeBand(ageBand, adultOn) {
  if (ageBand === "16-17" && isAdultTransitionReached(adultOn)) return "18+";
  return ageBand;
}

function secretFor(env) {
  const secret = clean(env.AGE_ASSURANCE_SECRET || env.OIDC_TOKEN_ENCRYPTION_KEY, 2000);
  if (secret.length < 32) throw new Error("Age assurance is not configured securely.");
  return secret;
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretFor(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(encodedPayload, env) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(env),
    new TextEncoder().encode(encodedPayload),
  );
  return base64Url(new Uint8Array(signature));
}

function newVerificationId() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `AGE-${day}-${random}`;
}

export async function createAgeAssurance(dateOfBirth, env) {
  const parsed = parseBirthDate(dateOfBirth);
  if (!parsed) throw new Error("Enter a valid date of birth.");
  const age = calculateAge(parsed.value);
  if (age < MINIMUM_AGE) return { eligible: false, ageBand: "under-16", adultOn: "" };
  const now = Math.floor(Date.now() / 1000);
  const ageBand = age < 18 ? "16-17" : "18+";
  const adultOn = ageBand === "16-17" ? adultOnFor(parsed) : "";
  const verificationId = newVerificationId();
  const payload = {
    v: 1,
    policy: POLICY_VERSION,
    band: ageBand,
    adultOn,
    ref: verificationId,
    iat: now,
    exp: now + COOKIE_SECONDS,
  };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(encoded, env);
  return {
    eligible: true,
    ageBand,
    adultOn,
    verificationId,
    dateOfBirth: parsed.value,
    verifiedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date((now + COOKIE_SECONDS) * 1000).toISOString(),
    token: `${encoded}.${signature}`,
    payload,
  };
}

export async function readAgeAssurance(request, env) {
  const token = readCookie(request, AGE_COOKIE);
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      { name: "HMAC", hash: "SHA-256" },
      await hmacKey(env),
      decodeBase64Url(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || payload?.policy !== POLICY_VERSION || Number(payload?.exp || 0) <= now) return null;
    if (!["16-17", "18+"].includes(payload?.band)) return null;
    if (payload.band === "16-17" && !/^\d{4}-\d{2}-\d{2}$/.test(clean(payload.adultOn, 10))) return null;
    const ageBand = effectiveAgeBand(payload.band, payload.adultOn);
    return {
      eligible: true,
      ageBand,
      adultOn: ageBand === "16-17" ? clean(payload.adultOn, 10) : "",
      verificationId: clean(payload.ref, 80),
      policyVersion: POLICY_VERSION,
      verifiedAt: new Date(Number(payload.iat || now) * 1000).toISOString(),
      expiresAt: new Date(Number(payload.exp || now) * 1000).toISOString(),
      method: "Self-declared date of birth converted to a signed age band",
    };
  } catch {
    return null;
  }
}

export function ageAssuranceCookie(token) {
  return `${AGE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function expireAgeAssuranceCookie() {
  return `${AGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function tableColumns(DB, table) {
  try {
    const result = await DB.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((result.results || []).map((row) => String(row.name || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function ensureAgeSafeguardingColumns(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS profiles (
    email TEXT PRIMARY KEY,
    verified_name TEXT,
    display_name TEXT,
    contact_email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const columns = [
    "age_band TEXT",
    "age_transition_at TEXT",
    "age_verified_at TEXT",
    "age_assurance_method TEXT",
    "age_policy_version TEXT",
    "age_verification_id TEXT",
    "registration_eligible INTEGER DEFAULT 0",
    "minor_safeguards_enabled INTEGER DEFAULT 0",
    "profile_visibility TEXT DEFAULT 'private'",
    "public_discovery_allowed INTEGER DEFAULT 0",
    "profiling_allowed INTEGER DEFAULT 0",
    "marketing_allowed INTEGER DEFAULT 0",
    "precise_location_default INTEGER DEFAULT 0",
    "safeguarding_review_required INTEGER DEFAULT 0"
  ];
  for (const column of columns) {
    try {
      await DB.prepare(`ALTER TABLE profiles ADD COLUMN ${column}`).run();
    } catch {
      // Existing databases may already have the safeguard column.
    }
  }
}

export async function persistAgeAssurance(DB, email, assurance) {
  if (!DB || !email || !assurance?.ageBand) throw new Error("Age assurance could not be linked to the account.");
  await ensureAgeSafeguardingColumns(DB);
  const requestedBand = clean(assurance.ageBand, 20);
  if (!["under-16", "16-17", "18+"].includes(requestedBand)) throw new Error("The age assurance result is invalid.");
  const ageBand = effectiveAgeBand(requestedBand, assurance.adultOn);
  const eligible = ageBand === "16-17" || ageBand === "18+";
  const minor = ageBand === "16-17" ? 1 : 0;
  const transitionAt = minor ? clean(assurance.adultOn, 10) : "";
  if (minor && !/^\d{4}-\d{2}-\d{2}$/.test(transitionAt)) throw new Error("The young-person safeguard transition date is missing.");
  const verificationId = clean(assurance.verificationId, 80);

  await DB.prepare(`UPDATE profiles SET
    age_band=?, age_transition_at=?, age_verified_at=CURRENT_TIMESTAMP,
    age_assurance_method=?, age_policy_version=?, age_verification_id=?, registration_eligible=?,
    minor_safeguards_enabled=?,
    profile_visibility=CASE WHEN ?=1 THEN 'private' ELSE COALESCE(NULLIF(profile_visibility,''),'private') END,
    public_discovery_allowed=CASE WHEN ?=1 THEN 0 ELSE COALESCE(public_discovery_allowed,0) END,
    profiling_allowed=CASE WHEN ?=1 THEN 0 ELSE COALESCE(profiling_allowed,0) END,
    marketing_allowed=CASE WHEN ?=1 THEN 0 ELSE COALESCE(marketing_allowed,0) END,
    precise_location_default=0,
    safeguarding_review_required=CASE WHEN ?=1 THEN 1 ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP
    WHERE lower(email)=lower(?)`)
    .bind(
      ageBand,
      transitionAt,
      clean(assurance.method || "Self-declared date of birth converted to an age band", 180),
      clean(assurance.policyVersion || POLICY_VERSION, 80),
      verificationId || null,
      eligible ? 1 : 0,
      minor,
      minor,
      minor,
      minor,
      minor,
      minor,
      clean(email, 254).toLowerCase(),
    ).run();
  if (verificationId) await linkAgeVerificationRecord(DB, email, verificationId).catch(() => null);
  return { eligible, ageBand, adultOn: transitionAt, minorSafeguards: minor === 1, verificationId };
}

export async function profileAgeStatus(DB, email) {
  if (!DB || !email) return { eligible: false, reason: "missing-account" };
  await ensureAgeSafeguardingColumns(DB);
  const columns = await tableColumns(DB, "profiles");
  if (!columns.has("age_band") || !columns.has("age_transition_at")) return { eligible: false, reason: "age-check-required" };
  const profile = await DB.prepare(`SELECT age_band, age_transition_at, age_verified_at, age_verification_id, registration_eligible,
      minor_safeguards_enabled FROM profiles WHERE lower(email)=lower(?) LIMIT 1`)
    .bind(clean(email, 254).toLowerCase()).first().catch(() => null);
  if (!profile?.age_band || !profile?.age_verified_at) return { eligible: false, reason: "age-check-required" };
  if (profile.age_band === "under-16" || Number(profile.registration_eligible || 0) !== 1) {
    return { eligible: false, reason: "under-16", ageBand: "under-16" };
  }

  const ageBand = effectiveAgeBand(clean(profile.age_band, 20), clean(profile.age_transition_at, 10));
  if (profile.age_band === "16-17" && ageBand === "18+") {
    await DB.prepare(`UPDATE profiles SET age_band='18+', age_transition_at='', minor_safeguards_enabled=0,
      safeguarding_review_required=0, updated_at=CURRENT_TIMESTAMP WHERE lower(email)=lower(?)`)
      .bind(clean(email, 254).toLowerCase()).run().catch(() => null);
  }
  if (ageBand === "16-17" && !/^\d{4}-\d{2}-\d{2}$/.test(clean(profile.age_transition_at, 10))) {
    return { eligible: false, reason: "age-check-required" };
  }
  return {
    eligible: true,
    ageBand,
    adultOn: ageBand === "16-17" ? clean(profile.age_transition_at, 10) : "",
    minorSafeguards: ageBand === "16-17" || Number(profile.minor_safeguards_enabled || 0) === 1,
    verifiedAt: profile.age_verified_at,
    verificationId: clean(profile.age_verification_id, 80),
  };
}

export { AGE_COOKIE, MINIMUM_AGE, POLICY_VERSION };
