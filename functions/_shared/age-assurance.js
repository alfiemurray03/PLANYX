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

export async function createAgeAssurance(dateOfBirth, env) {
  const parsed = parseBirthDate(dateOfBirth);
  if (!parsed) throw new Error("Enter a valid date of birth.");
  const age = calculateAge(parsed.value);
  if (age < MINIMUM_AGE) return { eligible: false, age, ageBand: "under-16", dateOfBirth: parsed.value };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    policy: POLICY_VERSION,
    dob: parsed.value,
    band: age < 18 ? "16-17" : "18+",
    iat: now,
    exp: now + COOKIE_SECONDS,
  };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(encoded, env);
  return { eligible: true, age, ageBand: payload.band, dateOfBirth: parsed.value, token: `${encoded}.${signature}`, payload };
}

export async function readAgeAssurance(request, env) {
  const token = readCookie(request, AGE_COOKIE);
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env),
      decodeBase64Url(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || payload?.policy !== POLICY_VERSION || Number(payload?.exp || 0) <= now) return null;
    const age = calculateAge(payload.dob);
    if (age < MINIMUM_AGE) return null;
    return {
      eligible: true,
      dateOfBirth: clean(payload.dob, 10),
      age,
      ageBand: age < 18 ? "16-17" : "18+",
      policyVersion: POLICY_VERSION,
      verifiedAt: new Date(Number(payload.iat || now) * 1000).toISOString(),
      method: "Self-declared date of birth with signed server assurance",
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
    "date_of_birth TEXT",
    "age_band TEXT",
    "age_verified_at TEXT",
    "age_assurance_method TEXT",
    "age_policy_version TEXT",
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
  if (!DB || !email || !assurance?.dateOfBirth) throw new Error("Age assurance could not be linked to the account.");
  await ensureAgeSafeguardingColumns(DB);
  const currentAge = calculateAge(assurance.dateOfBirth);
  const eligible = currentAge >= MINIMUM_AGE;
  const ageBand = eligible ? (currentAge < 18 ? "16-17" : "18+") : "under-16";
  const minor = ageBand === "16-17" ? 1 : 0;
  await DB.prepare(`UPDATE profiles SET
    date_of_birth=?, age_band=?, age_verified_at=CURRENT_TIMESTAMP,
    age_assurance_method=?, age_policy_version=?, registration_eligible=?,
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
      assurance.dateOfBirth,
      ageBand,
      clean(assurance.method || "Self-declared date of birth with signed server assurance", 180),
      clean(assurance.policyVersion || POLICY_VERSION, 80),
      eligible ? 1 : 0,
      minor,
      minor,
      minor,
      minor,
      minor,
      minor,
      clean(email, 254).toLowerCase(),
    ).run();
  return { eligible, age: currentAge, ageBand, minorSafeguards: minor === 1 };
}

export async function profileAgeStatus(DB, email) {
  if (!DB || !email) return { eligible: false, reason: "missing-account" };
  await ensureAgeSafeguardingColumns(DB);
  const columns = await tableColumns(DB, "profiles");
  if (!columns.has("date_of_birth")) return { eligible: false, reason: "age-check-required" };
  const profile = await DB.prepare(`SELECT date_of_birth, age_band, age_verified_at, registration_eligible,
      minor_safeguards_enabled FROM profiles WHERE lower(email)=lower(?) LIMIT 1`)
    .bind(clean(email, 254).toLowerCase()).first().catch(() => null);
  if (!profile?.date_of_birth || !profile?.age_verified_at) return { eligible: false, reason: "age-check-required" };
  const age = calculateAge(profile.date_of_birth);
  if (age < MINIMUM_AGE || Number(profile.registration_eligible || 0) !== 1) {
    return { eligible: false, reason: "under-16", age, ageBand: "under-16" };
  }
  return {
    eligible: true,
    age,
    ageBand: age < 18 ? "16-17" : "18+",
    minorSafeguards: age < 18 || Number(profile.minor_safeguards_enabled || 0) === 1,
    verifiedAt: profile.age_verified_at,
  };
}

export { AGE_COOKIE, MINIMUM_AGE, POLICY_VERSION };
