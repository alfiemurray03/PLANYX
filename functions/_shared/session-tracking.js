const SESSION_RETENTION_DAYS = 365;

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function requestMetadata(request) {
  const forwarded = clean(request.headers.get("x-forwarded-for"), 500).split(",")[0]?.trim();
  const ipAddress = clean(request.headers.get("CF-Connecting-IP") || forwarded || "", 80);
  return {
    ipAddress,
    userAgent: clean(request.headers.get("User-Agent"), 600),
    country: clean(request.headers.get("CF-IPCountry"), 8),
    colo: clean(request.cf?.colo || request.headers.get("CF-Colo"), 24),
    requestId: clean(request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID(), 120)
  };
}

export function sessionReference(realm, tokenHash) {
  const hash = clean(tokenHash, 256);
  const prefix = realm === "admin" ? "ADM" : "CUS";
  return `SES-${prefix}-${hash.slice(0, 8).toUpperCase()}-${hash.slice(-6).toUpperCase()}`;
}

export async function ensureSessionTrackingTables(DB) {
  if (!DB) return;
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id TEXT PRIMARY KEY,
      session_reference TEXT UNIQUE NOT NULL,
      token_hash TEXT NOT NULL,
      realm TEXT NOT NULL,
      email TEXT,
      subject TEXT,
      tenant_id TEXT,
      microsoft_object_id TEXT,
      display_name TEXT,
      linked_user_type TEXT,
      linked_user_id TEXT,
      linked_user_name TEXT,
      linked_user_role TEXT,
      linked_user_status TEXT,
      match_basis TEXT,
      auth_method TEXT DEFAULT 'Microsoft OIDC',
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
      idle_expires_at TEXT,
      absolute_expires_at TEXT,
      revoked_at TEXT,
      ip_address TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      country_code TEXT,
      cf_colo TEXT,
      request_id TEXT,
      legal_hold INTEGER DEFAULT 0,
      legal_hold_reason TEXT,
      retained_until TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS auth_session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      session_reference TEXT,
      event_type TEXT NOT NULL,
      result TEXT DEFAULT 'Success',
      realm TEXT,
      email TEXT,
      actor_email TEXT,
      ip_address TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      request_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(lower(email))`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_seen ON auth_sessions(last_seen_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_session_events_session ON auth_session_events(session_id, created_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_session_events_email ON auth_session_events(lower(email), created_at DESC)`)
  ]);
}

async function safeFirst(DB, sql, bindings = []) {
  try {
    return await DB.prepare(sql).bind(...bindings).first();
  } catch {
    return null;
  }
}

async function resolveLinkedUser(DB, identity, realm) {
  const email = cleanEmail(identity?.email);
  const objectId = clean(identity?.objectId, 180);
  if (realm === "admin") {
    const admin = await safeFirst(DB, `
      SELECT email, name, role, status FROM admin_users
      WHERE lower(email) = lower(?) LIMIT 1
    `, [email]);
    return {
      type: "Administrator",
      id: clean(admin?.email || email, 254),
      name: clean(admin?.name || identity?.name || email, 180),
      role: clean(admin?.role || "Administrator", 100),
      status: clean(admin?.status || "Active", 80),
      matchBasis: admin ? "Admin email" : "Microsoft verified email"
    };
  }

  const profile = await safeFirst(DB, `
    SELECT email, verified_name, display_name, admin_customer_status, microsoft_object_id
    FROM profiles
    WHERE lower(email) = lower(?)
       OR (? != '' AND microsoft_object_id = ?)
    ORDER BY CASE WHEN lower(email) = lower(?) THEN 0 ELSE 1 END
    LIMIT 1
  `, [email, objectId, objectId, email]);
  return {
    type: "Customer",
    id: clean(profile?.email || email, 254),
    name: clean(profile?.display_name || profile?.verified_name || identity?.name || email, 180),
    role: clean(profile?.admin_customer_status || "Customer", 100),
    status: clean(profile ? "Linked" : "Unlinked", 80),
    matchBasis: profile ? (cleanEmail(profile.email) === email ? "Verified email" : "Microsoft object ID") : "No matching customer profile"
  };
}

export async function writeSessionEvent(DB, session, eventType, request, details = {}, actorEmail = "") {
  if (!DB) return;
  await ensureSessionTrackingTables(DB);
  const meta = requestMetadata(request);
  const ipHash = meta.ipAddress ? await sha256(meta.ipAddress) : "";
  await DB.prepare(`
    INSERT INTO auth_session_events (
      id, session_id, session_reference, event_type, result, realm, email, actor_email,
      ip_address, ip_hash, user_agent, request_id, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    clean(session?.session_id, 300),
    clean(session?.session_reference, 120),
    clean(eventType, 100),
    clean(details?.result || "Success", 40),
    clean(session?.realm, 30),
    cleanEmail(session?.email),
    cleanEmail(actorEmail),
    meta.ipAddress,
    ipHash,
    meta.userAgent,
    meta.requestId,
    JSON.stringify(details || {})
  ).run();
}

export async function recordSessionHeartbeat(DB, request, identity, realm) {
  if (!DB || !identity?.email || !identity?.tokenHash) return null;
  await ensureSessionTrackingTables(DB);
  const tokenHash = clean(identity.tokenHash, 256);
  const sessionId = `${realm}:${tokenHash}`;
  const reference = sessionReference(realm, tokenHash);
  const meta = requestMetadata(request);
  const ipHash = meta.ipAddress ? await sha256(meta.ipAddress) : "";
  const linked = await resolveLinkedUser(DB, identity, realm);
  const existing = await safeFirst(DB, `SELECT session_id, last_seen_at, revoked_at FROM auth_sessions WHERE session_id = ?`, [sessionId]);
  const expiresAt = Number(identity.exp || 0) > 0 ? new Date(Number(identity.exp)).toISOString() : null;

  await DB.prepare(`
    INSERT INTO auth_sessions (
      session_id, session_reference, token_hash, realm, email, subject, tenant_id,
      microsoft_object_id, display_name, linked_user_type, linked_user_id, linked_user_name,
      linked_user_role, linked_user_status, match_basis, auth_method, status,
      last_seen_at, absolute_expires_at, ip_address, ip_hash, user_agent, country_code,
      cf_colo, request_id, retained_until, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Microsoft OIDC', 'Active',
      CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      email = excluded.email,
      subject = excluded.subject,
      tenant_id = excluded.tenant_id,
      microsoft_object_id = excluded.microsoft_object_id,
      display_name = excluded.display_name,
      linked_user_type = excluded.linked_user_type,
      linked_user_id = excluded.linked_user_id,
      linked_user_name = excluded.linked_user_name,
      linked_user_role = excluded.linked_user_role,
      linked_user_status = excluded.linked_user_status,
      match_basis = excluded.match_basis,
      status = CASE WHEN auth_sessions.revoked_at IS NULL THEN 'Active' ELSE auth_sessions.status END,
      last_seen_at = CURRENT_TIMESTAMP,
      absolute_expires_at = COALESCE(excluded.absolute_expires_at, auth_sessions.absolute_expires_at),
      ip_address = excluded.ip_address,
      ip_hash = excluded.ip_hash,
      user_agent = excluded.user_agent,
      country_code = excluded.country_code,
      cf_colo = excluded.cf_colo,
      request_id = excluded.request_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    sessionId, reference, tokenHash, realm, cleanEmail(identity.email), clean(identity.subject, 300),
    clean(identity.tenantId, 180), clean(identity.objectId, 180), clean(identity.name || identity.email, 180),
    linked.type, linked.id, linked.name, linked.role, linked.status, linked.matchBasis,
    expiresAt, meta.ipAddress, ipHash, meta.userAgent, meta.country, meta.colo, meta.requestId,
    `+${SESSION_RETENTION_DAYS} days`
  ).run();

  const session = { session_id: sessionId, session_reference: reference, realm, email: identity.email };
  if (!existing) {
    await writeSessionEvent(DB, session, "Sign-in recorded", request, {
      result: "Success",
      linked_user_type: linked.type,
      linked_user_id: linked.id,
      match_basis: linked.matchBasis,
      authentication: "Microsoft OIDC"
    });
  } else {
    const lastSeen = existing.last_seen_at ? Date.parse(existing.last_seen_at) : 0;
    if (!lastSeen || Date.now() - lastSeen >= 15 * 60 * 1000) {
      await writeSessionEvent(DB, session, "Session activity", request, { result: "Success" });
    }
  }
  return session;
}

export async function recordSessionLogout(DB, request, identity, realm) {
  if (!DB || !identity?.tokenHash) return;
  await ensureSessionTrackingTables(DB);
  const tokenHash = clean(identity.tokenHash, 256);
  const sessionId = `${realm}:${tokenHash}`;
  const reference = sessionReference(realm, tokenHash);
  await DB.prepare(`
    UPDATE auth_sessions
    SET status = 'Signed out', revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
  `).bind(sessionId).run();
  await writeSessionEvent(DB, { session_id: sessionId, session_reference: reference, realm, email: identity.email }, "Sign-out recorded", request, { result: "Success" }, identity.email);
}

async function safeAll(DB, sql) {
  try {
    const result = await DB.prepare(sql).all();
    return result.results || [];
  } catch {
    return [];
  }
}

export async function importLegacySessions(DB) {
  if (!DB) return;
  await ensureSessionTrackingTables(DB);
  const sources = [
    { realm: "admin", table: "admin_oidc_sessions" },
    { realm: "customer", table: "customer_oidc_sessions" }
  ];

  for (const source of sources) {
    const rows = await safeAll(DB, `SELECT * FROM ${source.table} ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1000`);
    for (const row of rows) {
      const tokenHash = clean(row.token_hash, 256);
      if (!tokenHash) continue;
      const sessionId = `${source.realm}:${tokenHash}`;
      const reference = sessionReference(source.realm, tokenHash);
      const linked = await resolveLinkedUser(DB, {
        email: row.email,
        name: row.name,
        objectId: row.microsoft_object_id
      }, source.realm);
      await DB.prepare(`
        INSERT INTO auth_sessions (
          session_id, session_reference, token_hash, realm, email, subject, tenant_id,
          microsoft_object_id, display_name, linked_user_type, linked_user_id, linked_user_name,
          linked_user_role, linked_user_status, match_basis, auth_method, status, created_at,
          last_seen_at, idle_expires_at, absolute_expires_at, revoked_at, ip_hash, user_agent,
          retained_until, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Microsoft OIDC', ?,
          COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, ?), ?, ?, ?, ?, ?,
          datetime(COALESCE(?, CURRENT_TIMESTAMP), ?), CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET
          linked_user_type = excluded.linked_user_type,
          linked_user_id = excluded.linked_user_id,
          linked_user_name = excluded.linked_user_name,
          linked_user_role = excluded.linked_user_role,
          linked_user_status = excluded.linked_user_status,
          match_basis = excluded.match_basis,
          idle_expires_at = COALESCE(auth_sessions.idle_expires_at, excluded.idle_expires_at),
          absolute_expires_at = COALESCE(auth_sessions.absolute_expires_at, excluded.absolute_expires_at),
          revoked_at = COALESCE(auth_sessions.revoked_at, excluded.revoked_at),
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        sessionId, reference, tokenHash, source.realm, cleanEmail(row.email), clean(row.subject, 300),
        clean(row.tenant_id, 180), clean(row.microsoft_object_id, 180), clean(row.name || row.email, 180),
        linked.type, linked.id, linked.name, linked.role, linked.status, linked.matchBasis,
        row.revoked_at ? "Signed out" : "Historical",
        row.created_at || null, row.last_seen_at || null, row.created_at || null,
        row.idle_expires_at || null, row.absolute_expires_at || null, row.revoked_at || null,
        clean(row.ip_hash, 256), clean(row.user_agent, 600), row.created_at || null,
        `+${SESSION_RETENTION_DAYS} days`
      ).run();
    }
  }
}
