function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
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

function secretFor(env) {
  const secret = clean(
    env.AGE_RECORD_ENCRYPTION_KEY || env.AGE_ASSURANCE_SECRET || env.OIDC_TOKEN_ENCRYPTION_KEY,
    3000,
  );
  if (secret.length < 32) throw new Error("The age-verification record encryption key is not configured securely.");
  return secret;
}

async function encryptionKey(env) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretFor(env)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptValue(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(clean(value, 120)),
  );
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

async function decryptValue(value, env) {
  const [version, encodedIv, encodedCiphertext] = clean(value, 8000).split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("The encrypted age-verification value is invalid.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(encodedIv) },
    await encryptionKey(env),
    decodeBase64Url(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function verificationId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `AGE-${date}-${random}`;
}

function validDateOfBirth(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value, 10));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    && date.getTime() <= Date.now();
}

function maskedDate(value) {
  if (!validDateOfBirth(value)) return "Not recorded";
  const [year] = value.split("-");
  return `••/••/${year}`;
}

export async function ensureAgeVerificationRecordTable(DB) {
  if (!DB) throw new Error("The age-verification database is unavailable.");
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_age_verification_records (
    verification_id TEXT PRIMARY KEY,
    email TEXT,
    encrypted_date_of_birth TEXT NOT NULL,
    age_band TEXT NOT NULL,
    eligible INTEGER NOT NULL DEFAULT 0,
    verification_status TEXT NOT NULL DEFAULT 'Passed',
    verification_method TEXT NOT NULL,
    provider_name TEXT DEFAULT 'Sousa Murray Planeia',
    provider_reference TEXT DEFAULT '',
    policy_version TEXT DEFAULT '',
    verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT DEFAULT '',
    linked_at TEXT DEFAULT '',
    superseded_at TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_age_verification_email
    ON customer_age_verification_records(lower(email), verified_at DESC)`).run().catch(() => null);
}

export async function createAgeVerificationRecord(DB, env, input = {}) {
  await ensureAgeVerificationRecordTable(DB);
  const dateOfBirth = clean(input.dateOfBirth, 10);
  if (!validDateOfBirth(dateOfBirth)) throw new Error("A valid date of birth is required for the age-verification record.");
  const id = clean(input.verificationId, 80) || verificationId();
  const ageBand = clean(input.ageBand, 20);
  if (!["16-17", "18+"].includes(ageBand)) throw new Error("Only eligible age-verification results may be stored in a customer record.");
  const email = clean(input.email, 254).toLowerCase();
  const encryptedDob = await encryptValue(dateOfBirth, env);
  const verifiedAt = clean(input.verifiedAt, 40) || new Date().toISOString();
  const expiresAt = clean(input.expiresAt, 40);
  const method = clean(input.method || "Signed self-declaration", 180);
  const providerName = clean(input.providerName || "Sousa Murray Planeia", 120);
  const providerReference = clean(input.providerReference || id, 180);
  const policyVersion = clean(input.policyVersion, 100);

  await DB.prepare(`INSERT INTO customer_age_verification_records (
      verification_id,email,encrypted_date_of_birth,age_band,eligible,
      verification_status,verification_method,provider_name,provider_reference,
      policy_version,verified_at,expires_at,linked_at,updated_at
    ) VALUES (?,?,?,?,1,'Passed',?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(verification_id) DO UPDATE SET
      email=COALESCE(NULLIF(excluded.email,''), customer_age_verification_records.email),
      encrypted_date_of_birth=excluded.encrypted_date_of_birth,
      age_band=excluded.age_band,
      eligible=1,
      verification_status='Passed',
      verification_method=excluded.verification_method,
      provider_name=excluded.provider_name,
      provider_reference=excluded.provider_reference,
      policy_version=excluded.policy_version,
      verified_at=excluded.verified_at,
      expires_at=excluded.expires_at,
      linked_at=CASE WHEN excluded.email<>'' THEN CURRENT_TIMESTAMP ELSE customer_age_verification_records.linked_at END,
      updated_at=CURRENT_TIMESTAMP`).bind(
        id, email || null, encryptedDob, ageBand, method, providerName,
        providerReference, policyVersion, verifiedAt, expiresAt,
        email ? new Date().toISOString() : "",
      ).run();
  return { verificationId: id, maskedDateOfBirth: maskedDate(dateOfBirth), verifiedAt, expiresAt };
}

export async function linkAgeVerificationRecord(DB, email, verificationIdValue) {
  await ensureAgeVerificationRecordTable(DB);
  const emailValue = clean(email, 254).toLowerCase();
  const id = clean(verificationIdValue, 80);
  if (!emailValue || !id) return false;
  const result = await DB.prepare(`UPDATE customer_age_verification_records SET
      email=?, linked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE verification_id=?`).bind(emailValue, id).run();
  return Number(result?.meta?.changes || 0) > 0;
}

export async function latestAgeVerificationRecord(DB, env, email, options = {}) {
  await ensureAgeVerificationRecordTable(DB);
  const record = await DB.prepare(`SELECT verification_id,email,encrypted_date_of_birth,
      age_band,eligible,verification_status,verification_method,provider_name,
      provider_reference,policy_version,verified_at,expires_at,linked_at,
      superseded_at,created_at,updated_at
    FROM customer_age_verification_records
    WHERE lower(email)=lower(?) AND COALESCE(superseded_at,'')=''
    ORDER BY datetime(verified_at) DESC, datetime(created_at) DESC LIMIT 1`)
    .bind(clean(email, 254).toLowerCase()).first().catch(() => null);
  if (!record) return null;
  let dob = "";
  try { dob = await decryptValue(record.encrypted_date_of_birth, env); } catch { dob = ""; }
  return {
    verificationId: record.verification_id,
    email: record.email,
    dateOfBirthMasked: dob ? maskedDate(dob) : "Unavailable",
    dateOfBirth: options.reveal === true ? dob : undefined,
    ageBand: record.age_band,
    eligible: Number(record.eligible || 0) === 1,
    status: record.verification_status,
    method: record.verification_method,
    providerName: record.provider_name,
    providerReference: record.provider_reference,
    policyVersion: record.policy_version,
    verifiedAt: record.verified_at,
    expiresAt: record.expires_at,
    linkedAt: record.linked_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function supersedeAgeVerificationRecord(DB, verificationIdValue) {
  await ensureAgeVerificationRecordTable(DB);
  await DB.prepare(`UPDATE customer_age_verification_records SET
      verification_status='Superseded', superseded_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP WHERE verification_id=?`)
    .bind(clean(verificationIdValue, 80)).run();
}

export { maskedDate };
