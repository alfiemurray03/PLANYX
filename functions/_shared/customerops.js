const UCN_PATTERN = /^\d{10}$/;
const schemaPromises = new WeakMap();

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function safeError(error) {
  return clean(error instanceof Error ? error.message : String(error || "Unknown CustomerOps error"), 1000);
}

export function isUniversalCustomerNumber(value) {
  return UCN_PATTERN.test(String(value || ""));
}

function customerOpsBaseUrl(env) {
  const raw = clean(env.CUSTOMEROPS_BASE_URL || "https://customerops.jagroupservices.co.uk", 500).replace(/\/$/, "");
  const parsed = new URL(raw);
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) throw new Error("CUSTOMEROPS_BASE_URL must use HTTPS.");
  return parsed.origin;
}

async function profileColumns(DB) {
  const result = await DB.prepare("PRAGMA table_info(profiles)").all();
  return new Set((result.results || []).map((row) => String(row.name || "")));
}

export async function ensureCustomerOpsProfileSchema(DB) {
  if (!DB) throw new Error("The Sousa Murray Planeia customer database is unavailable.");
  if (schemaPromises.has(DB)) return schemaPromises.get(DB);

  const promise = (async () => {
    let columns = await profileColumns(DB);
    const additions = [
      ["planyx_account_id", "TEXT"],
      ["universal_customer_number", "TEXT"],
      ["customerops_sync_status", "TEXT NOT NULL DEFAULT 'pending'"],
      ["customerops_synced_at", "TEXT"],
      ["customerops_last_error", "TEXT"],
      ["customerops_matched_by", "TEXT"],
      ["customerops_enforcement_action", "TEXT"],
      ["customerops_restrictions_json", "TEXT NOT NULL DEFAULT '[]'"]
    ];

    for (const [column, definition] of additions) {
      if (columns.has(column)) continue;
      try {
        await DB.prepare(`ALTER TABLE profiles ADD COLUMN ${column} ${definition}`).run();
      } catch (error) {
        const message = String(error || "").toLowerCase();
        if (!message.includes("duplicate column") && !message.includes("already exists")) throw error;
      }
    }

    await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_planyx_account_id
      ON profiles(planyx_account_id) WHERE planyx_account_id IS NOT NULL AND planyx_account_id <> ''`).run();
    await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_universal_customer_number
      ON profiles(universal_customer_number) WHERE universal_customer_number IS NOT NULL AND universal_customer_number <> ''`).run();

    columns = await profileColumns(DB);
    return columns;
  })();

  schemaPromises.set(DB, promise);
  try {
    return await promise;
  } catch (error) {
    schemaPromises.delete(DB);
    throw error;
  }
}

async function getProfile(DB, email) {
  return DB.prepare(`SELECT * FROM profiles WHERE lower(email) = lower(?) LIMIT 1`).bind(email).first();
}

async function ensurePlanyxAccountId(DB, email) {
  let profile = await getProfile(DB, email);
  if (!profile) throw new Error("The Sousa Murray Planeia customer profile does not exist yet.");
  if (profile.planyx_account_id) return { profile, accountId: String(profile.planyx_account_id) };

  const proposed = crypto.randomUUID();
  await DB.prepare(`UPDATE profiles
    SET planyx_account_id = COALESCE(NULLIF(planyx_account_id, ''), ?), updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)`).bind(proposed, email).run();
  profile = await getProfile(DB, email);
  const accountId = clean(profile?.planyx_account_id, 160);
  if (!accountId) throw new Error("Sousa Murray Planeia could not allocate its internal customer account ID.");
  return { profile, accountId };
}

async function setSyncState(DB, email, {
  status,
  syncedAt = null,
  error = null,
  matchedBy = null,
  enforcementAction = null,
  restrictions = []
}) {
  await DB.prepare(`UPDATE profiles SET
    customerops_sync_status = ?,
    customerops_synced_at = ?,
    customerops_last_error = ?,
    customerops_matched_by = ?,
    customerops_enforcement_action = ?,
    customerops_restrictions_json = ?,
    updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)`).bind(
      clean(status, 80),
      syncedAt,
      error ? clean(error, 1000) : null,
      matchedBy ? clean(matchedBy, 120) : null,
      enforcementAction ? clean(enforcementAction, 120) : null,
      JSON.stringify(Array.isArray(restrictions) ? restrictions : []),
      email
    ).run();
}

function responseError(payload, status) {
  const code = clean(payload?.error?.code || payload?.code || "CUSTOMEROPS_REQUEST_FAILED", 120);
  const message = clean(payload?.error?.message || payload?.message || `CustomerOps returned HTTP ${status}.`, 800);
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  error.payload = payload;
  return error;
}

export async function syncCustomerWithHeadOffice(context, identity) {
  const DB = context.env.DB;
  await ensureCustomerOpsProfileSchema(DB);

  const email = cleanEmail(identity?.email);
  const tenantId = clean(identity?.tenantId, 100);
  const objectId = clean(identity?.objectId || identity?.subject, 100);
  if (!email || !tenantId || !objectId) {
    throw new Error("The verified Microsoft tenant ID, object ID and email are required for CustomerOps.");
  }

  const { profile, accountId } = await ensurePlanyxAccountId(DB, email);
  const apiKey = clean(context.env.CUSTOMEROPS_API_KEY, 300);
  if (!apiKey) {
    await setSyncState(DB, email, {
      status: "not_configured",
      error: "CUSTOMEROPS_API_KEY is not configured for Sousa Murray Planeia."
    });
    return { ok: false, status: "not_configured", accountId };
  }

  const endpoint = `${customerOpsBaseUrl(context.env)}/api/platform/customers/upsert`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response;
  let payload = {};

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Sousa Murray Planeia-CustomerOps-Connector/1.0"
      },
      body: JSON.stringify({
        entraTenantId: tenantId,
        entraObjectId: objectId,
        platformCustomerId: accountId,
        displayName: clean(identity?.name || profile.display_name || profile.verified_name || email, 160),
        givenName: clean(identity?.givenName || profile.microsoft_given_name, 100),
        surname: clean(identity?.familyName || profile.microsoft_family_name, 100),
        email,
        userPrincipalName: clean(identity?.preferredUsername || profile.microsoft_preferred_username || email, 254),
        accountEnabled: true,
        accountStatus: "active",
        createdAt: profile.created_at || null
      }),
      signal: controller.signal
    });
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    const message = error?.name === "AbortError" ? "CustomerOps did not respond within 8 seconds." : safeError(error);
    await setSyncState(DB, email, { status: "error", error: message });
    console.error(JSON.stringify({ event: "customerops_sync_failed", email, reason: message }));
    return { ok: false, status: "error", accountId, error: message };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = responseError(payload, response.status);
    const reviewRequired = error.code === "CUSTOMER_IDENTITY_REVIEW_REQUIRED" || response.status === 409;
    await setSyncState(DB, email, {
      status: reviewRequired ? "review_required" : "error",
      error: error.message
    });
    console.error(JSON.stringify({
      event: "customerops_sync_rejected",
      email,
      http_status: response.status,
      error_code: error.code
    }));
    return { ok: false, status: reviewRequired ? "review_required" : "error", accountId, error: error.message };
  }

  const ucn = clean(payload?.customer?.customerNumber, 20);
  if (!isUniversalCustomerNumber(ucn)) {
    const message = "CustomerOps returned an invalid UCN. A UCN must contain exactly 10 digits.";
    await setSyncState(DB, email, { status: "error", error: message });
    return { ok: false, status: "error", accountId, error: message };
  }

  const existingUcn = clean(profile.universal_customer_number, 20);
  if (existingUcn && existingUcn !== ucn) {
    const message = `Sousa Murray Planeia already stores UCN ${existingUcn}; CustomerOps returned a different number. Head Office review is required.`;
    await setSyncState(DB, email, {
      status: "ucn_conflict",
      error: message,
      matchedBy: payload?.matchedBy,
      enforcementAction: payload?.enforcement?.action,
      restrictions: payload?.enforcement?.restrictions
    });
    console.error(JSON.stringify({ event: "customerops_ucn_conflict", email, stored_ucn: existingUcn, returned_ucn: ucn }));
    return { ok: false, status: "ucn_conflict", accountId, ucn: existingUcn, error: message };
  }

  const syncedAt = new Date().toISOString();
  await DB.prepare(`UPDATE profiles SET
    universal_customer_number = COALESCE(NULLIF(universal_customer_number, ''), ?),
    customerops_sync_status = 'synced',
    customerops_synced_at = ?,
    customerops_last_error = NULL,
    customerops_matched_by = ?,
    customerops_enforcement_action = ?,
    customerops_restrictions_json = ?,
    updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)`).bind(
      ucn,
      syncedAt,
      clean(payload?.matchedBy, 120) || null,
      clean(payload?.enforcement?.action, 120) || "allow",
      JSON.stringify(Array.isArray(payload?.enforcement?.restrictions) ? payload.enforcement.restrictions : []),
      email
    ).run();

  console.info(JSON.stringify({
    event: "customerops_sync_succeeded",
    email,
    ucn,
    planyx_account_id: accountId,
    created: Boolean(payload?.created),
    matched_by: clean(payload?.matchedBy, 120)
  }));

  return {
    ok: true,
    status: "synced",
    accountId,
    ucn,
    created: Boolean(payload?.created),
    matchedBy: clean(payload?.matchedBy, 120),
    enforcement: payload?.enforcement || { action: "allow", restrictions: [] }
  };
}

export async function getCustomerOpsConnection(DB, email) {
  await ensureCustomerOpsProfileSchema(DB);
  const profile = await getProfile(DB, cleanEmail(email));
  if (!profile) return null;
  return {
    planyxAccountId: clean(profile.planyx_account_id, 160),
    ucn: isUniversalCustomerNumber(profile.universal_customer_number) ? String(profile.universal_customer_number) : "",
    status: clean(profile.customerops_sync_status || "pending", 80),
    syncedAt: profile.customerops_synced_at || null,
    matchedBy: clean(profile.customerops_matched_by, 120),
    enforcementAction: clean(profile.customerops_enforcement_action || "", 120),
    restrictions: (() => {
      try { return JSON.parse(profile.customerops_restrictions_json || "[]"); }
      catch { return []; }
    })()
  };
}
