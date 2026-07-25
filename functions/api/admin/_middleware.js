function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function ensureLockTable(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS customer_identity_verification_locks (
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
  )`).run();
}

async function currentLock(DB, customerEmail) {
  const row = await DB.prepare(`SELECT * FROM customer_identity_verification_locks
    WHERE lower(customer_email)=lower(?) AND cleared_at IS NULL`).bind(customerEmail).first().catch(() => null);
  if (!row) return null;
  if (row.is_locked && row.locked_until && Date.parse(row.locked_until) <= Date.now()) {
    await DB.prepare(`UPDATE customer_identity_verification_locks
      SET is_locked=0,cleared_at=CURRENT_TIMESTAMP,cleared_by='automatic-expiry'
      WHERE lower(customer_email)=lower(?) AND cleared_at IS NULL`).bind(customerEmail).run();
    return null;
  }
  return row;
}

async function recordFailedPin(DB, customerEmail, adminEmail) {
  const row = await currentLock(DB, customerEmail);
  const attempts = Number(row?.failed_pin_attempts || 0) + 1;
  const locked = attempts >= 3;
  const lockedUntil = locked ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : "1970-01-01T00:00:00.000Z";
  await DB.prepare(`INSERT INTO customer_identity_verification_locks
    (customer_email,locked_until,is_locked,failed_pin_attempts,failed_security_attempts,reason,cleared_at,cleared_by,override_reason)
    VALUES (?,?,?,?,0,?,NULL,NULL,NULL)
    ON CONFLICT(customer_email) DO UPDATE SET
      locked_at=CASE WHEN excluded.is_locked=1 THEN CURRENT_TIMESTAMP ELSE locked_at END,
      locked_until=excluded.locked_until,is_locked=excluded.is_locked,
      failed_pin_attempts=excluded.failed_pin_attempts,reason=excluded.reason,
      cleared_at=NULL,cleared_by=NULL,override_reason=NULL`)
    .bind(customerEmail, lockedUntil, locked ? 1 : 0, attempts, locked ? "Support PIN locked after repeated failed attempts." : "Support PIN verification failed.").run();
  try {
    await DB.prepare(`INSERT INTO admin_audit_log
      (id,actor_email,action,entity_type,entity_id,summary,metadata)
      VALUES (?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), adminEmail, locked ? "customer_support_pin_locked" : "customer_support_pin_attempt_failed",
        "customer_identity_verification", customerEmail,
        locked ? `Support PIN verification was locked for ${customerEmail} after repeated failed attempts.` : `A Support PIN attempt failed for ${customerEmail}.`,
        JSON.stringify({ failed_pin_attempts: attempts, locked, locked_until: locked ? lockedUntil : null })
      ).run();
  } catch {
    // The primary verification endpoint already records the failed attempt.
  }
  return { attempts, locked, lockedUntil: locked ? lockedUntil : null };
}

async function clearLock(DB, customerEmail, adminEmail, reason) {
  await DB.prepare(`UPDATE customer_identity_verification_locks
    SET is_locked=0,cleared_at=CURRENT_TIMESTAMP,cleared_by=?,override_reason=?
    WHERE lower(customer_email)=lower(?) AND cleared_at IS NULL`)
    .bind(adminEmail || "system", clean(reason, 300), customerEmail).run().catch(() => null);
}

function withLock(payload, lock) {
  return {
    ...payload,
    verification: {
      ...(payload?.verification || {}),
      locked: Boolean(lock?.is_locked),
      lockedUntil: lock?.is_locked ? lock.locked_until : null,
      failedPinAttempts: Number(lock?.failed_pin_attempts || 0),
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/customer-verification" || !env.DB) return context.next();

  await ensureLockTable(env.DB);
  const adminEmail = cleanEmail(request.headers.get("x-ja-auth-email"));

  if (request.method === "GET") {
    const customerEmail = cleanEmail(url.searchParams.get("customer_email"));
    const response = await context.next();
    if (!customerEmail) return response;
    const payload = await response.clone().json().catch(() => null);
    if (!payload) return response;
    return json(withLock(payload, await currentLock(env.DB, customerEmail)), response.status);
  }

  if (request.method !== "POST") return context.next();
  const body = await request.clone().json().catch(() => ({}));
  const action = clean(body.action, 80);
  const customerEmail = cleanEmail(body.customerEmail || body.customer_email);

  if (action === "review_override") {
    const requestId = clean(body.requestId || body.request_id, 120);
    const requestRow = requestId
      ? await env.DB.prepare("SELECT customer_email FROM customer_identity_override_requests WHERE id=?").bind(requestId).first().catch(() => null)
      : null;
    if (!requestRow || cleanEmail(requestRow.customer_email) !== customerEmail) {
      return json({ success: false, error: "The supervisor approval request does not belong to the customer record currently open.", code: "CUSTOMER_SCOPE_MISMATCH" }, 400);
    }
  }

  if (action === "verify_support_pin" && customerEmail) {
    const lock = await currentLock(env.DB, customerEmail);
    if (lock?.is_locked) {
      return json({
        success: false,
        error: "Support PIN verification is temporarily locked after repeated failed attempts. Use the registered-email code or an approved supervisor override, or wait until the lock expires.",
        code: "SUPPORT_PIN_LOCKED",
        verification: { locked: true, lockedUntil: lock.locked_until, failedPinAttempts: Number(lock.failed_pin_attempts || 0) },
      }, 423);
    }
  }

  const response = await context.next();
  if (!customerEmail) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload) return response;

  if (action === "verify_support_pin") {
    if (response.ok && payload.saved && payload.verification?.verified) {
      await clearLock(env.DB, customerEmail, adminEmail, "Successful Support PIN verification.");
    } else if (/could not be verified|incorrect|mismatch/i.test(clean(payload.error, 300))) {
      const failure = await recordFailedPin(env.DB, customerEmail, adminEmail);
      if (failure.locked) {
        return json({
          ...payload,
          success: false,
          saved: false,
          error: "Support PIN verification is locked for 15 minutes after three failed attempts. Use the registered-email code or a governed supervisor override if support must continue.",
          code: "SUPPORT_PIN_LOCKED",
          verification: { ...(payload.verification || {}), locked: true, lockedUntil: failure.lockedUntil, failedPinAttempts: failure.attempts },
        }, 423);
      }
    }
  }

  if (["verify_email_code", "authorise_override"].includes(action) && response.ok && payload.saved && payload.verification?.verified) {
    await clearLock(env.DB, customerEmail, adminEmail, action === "verify_email_code" ? "Successful registered-email support verification." : "Governed administrator override authorised.");
  }

  return json(withLock(payload, await currentLock(env.DB, customerEmail)), response.status);
}
