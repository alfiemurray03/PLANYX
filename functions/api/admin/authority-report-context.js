import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import { ensureSessionTrackingTables, recordSessionHeartbeat, writeSessionEvent } from "../../_shared/session-tracking.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const POLICE_API = "https://data.police.uk/api";
const POSTCODE_API = "https://api.postcodes.io/postcodes";

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

async function tableExists(DB, table) {
  const row = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first().catch(() => null);
  return Boolean(row?.name);
}

async function isAuthorisedAdmin(env, identity) {
  const email = cleanEmail(identity?.email);
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!(await tableExists(env.DB, "admin_users"))) return false;
  const row = await env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)").bind(email).first().catch(() => null);
  const status = clean(row?.status || "Active", 80).toLowerCase();
  return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status);
}

async function authenticate(context) {
  if (!context.env.DB) return { error: json({ success: false, error: "Investigation-link storage is unavailable." }, 503) };
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity) return { error: json({ success: false, error: "Administrator session required." }, 401) };
  if (!(await isAuthorisedAdmin(context.env, identity))) return { error: json({ success: false, error: "Administrator access was denied." }, 403) };
  await recordSessionHeartbeat(context.env.DB, context.request, identity, "admin");
  return { identity };
}

async function requestBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function safeAll(DB, sql, bindings = []) {
  try {
    const statement = DB.prepare(sql);
    const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
    return result.results || [];
  } catch {
    return [];
  }
}

async function ensureTables(DB) {
  await ensureSessionTrackingTables(DB);
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS authority_report_sessions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      report_reference TEXT,
      session_id TEXT NOT NULL,
      session_reference TEXT,
      linked_user_email TEXT,
      linked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      linked_by TEXT,
      UNIQUE(report_id, session_id)
    )`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_report_sessions_report ON authority_report_sessions(report_id, linked_at DESC)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS idx_authority_report_sessions_user ON authority_report_sessions(lower(linked_user_email), linked_at DESC)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
}

function displayName(profile) {
  return clean(profile.display_name || profile.verified_name || profile.customer_name || profile.email, 180);
}

function profileAddress(profile) {
  const address = {
    line1: clean(profile.street_address || profile.address_line1 || profile.address || profile.office_location, 300),
    line2: clean(profile.address_line2, 300),
    city: clean(profile.city || profile.town, 160),
    county: clean(profile.county || profile.region, 160),
    country: clean(profile.country || "United Kingdom", 100),
    postcode: clean(profile.postcode || profile.postal_code, 20).toUpperCase()
  };
  return { ...address, formatted: [address.line1, address.line2, address.city, address.county, address.postcode, address.country].filter(Boolean).join(", ") };
}

async function subscriptionFor(DB, email) {
  if (!(await tableExists(DB, "stripe_subscriptions"))) return null;
  return DB.prepare(`SELECT * FROM stripe_subscriptions WHERE lower(customer_email)=lower(?)
    ORDER BY datetime(COALESCE(updated_at, current_period_end, trial_end, created_at)) DESC LIMIT 1`)
    .bind(email).first().catch(() => null);
}

async function stripeBillingAddress(env, subscription) {
  const customerId = clean(subscription?.stripe_customer_id || subscription?.customer_id, 180);
  const secret = clean(env.STRIPE_SECRET_KEY, 500);
  if (!customerId || !secret) return null;
  const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return null;
  const customer = await response.json().catch(() => null);
  const source = customer?.address || customer?.shipping?.address || null;
  if (!source) return null;
  const address = {
    line1: clean(source.line1, 300),
    line2: clean(source.line2, 300),
    city: clean(source.city, 160),
    county: clean(source.state, 160),
    country: clean(source.country || "United Kingdom", 100),
    postcode: clean(source.postal_code, 20).toUpperCase()
  };
  if (!address.postcode && !address.line1) return null;
  return { ...address, formatted: [address.line1, address.line2, address.city, address.county, address.postcode, address.country].filter(Boolean).join(", ") };
}

async function userDetail(DB, env, email) {
  const profile = await DB.prepare("SELECT * FROM profiles WHERE lower(email)=lower(?) LIMIT 1").bind(email).first().catch(() => null);
  if (!profile) return null;
  const subscription = await subscriptionFor(DB, email);
  const stripeAddress = await stripeBillingAddress(env, subscription);
  const savedAddress = profileAddress(profile);
  const address = stripeAddress || savedAddress;
  const addressSource = stripeAddress ? "Stripe billing address" : (savedAddress.postcode || savedAddress.line1 ? "Saved Sousa Murray Planeia account address" : "No saved address");
  const sessions = await safeAll(DB, `SELECT session_id, session_reference, realm, email, linked_user_name, status,
      created_at, last_seen_at, revoked_at, ip_address, country_code, user_agent, legal_hold, legal_hold_reason
    FROM auth_sessions
    WHERE lower(email)=lower(?) OR lower(linked_user_id)=lower(?)
    ORDER BY datetime(COALESCE(last_seen_at, created_at)) DESC LIMIT 150`, [email, email]);
  const reports = await safeAll(DB, `SELECT id, reference, report_type, urgency, status, summary, updated_at
    FROM authority_reports WHERE lower(linked_user_email)=lower(?) ORDER BY datetime(updated_at) DESC LIMIT 100`, [email]);
  return {
    id: clean(profile.customer_id || profile.email, 254),
    email: cleanEmail(profile.email),
    name: displayName(profile),
    company: clean(profile.company || profile.microsoft_company_name, 180),
    phone: clean(profile.phone || profile.mobile_phone || profile.business_phone, 80),
    accountStatus: clean(profile.admin_customer_status || "Active", 80),
    accountType: clean(profile.account_type || profile.usage_type || "individual", 80),
    address,
    addressSource,
    stripeCustomerId: clean(subscription?.stripe_customer_id || subscription?.customer_id, 180),
    sessions: sessions.map(session => ({
      id: clean(session.session_id, 300),
      reference: clean(session.session_reference, 120),
      realm: clean(session.realm, 30),
      status: clean(session.revoked_at ? "Signed out" : session.status || "Active", 80),
      createdAt: session.created_at || null,
      lastSeenAt: session.last_seen_at || null,
      ipAddress: clean(session.ip_address, 80),
      countryCode: clean(session.country_code, 8),
      userAgent: clean(session.user_agent, 600),
      legalHold: Number(session.legal_hold || 0) === 1,
      legalHoldReason: clean(session.legal_hold_reason, 500)
    })),
    reports
  };
}

async function searchUsers(DB, query) {
  const value = `%${clean(query, 120).replaceAll("%", "").replaceAll("_", "")}%`;
  const rows = await safeAll(DB, `SELECT * FROM profiles
    WHERE lower(COALESCE(email,'')) LIKE lower(?)
       OR lower(COALESCE(display_name,'')) LIKE lower(?)
       OR lower(COALESCE(verified_name,'')) LIKE lower(?)
       OR lower(COALESCE(customer_name,'')) LIKE lower(?)
       OR lower(COALESCE(company,'')) LIKE lower(?)
    ORDER BY CASE WHEN lower(email)=lower(?) THEN 0 ELSE 1 END,
      datetime(COALESCE(last_activity, updated_at, created_at)) DESC LIMIT 30`, [value, value, value, value, value, cleanEmail(query)]);
  return rows.map(profile => {
    const address = profileAddress(profile);
    return {
      id: clean(profile.customer_id || profile.email, 254),
      email: cleanEmail(profile.email),
      name: displayName(profile),
      company: clean(profile.company || profile.microsoft_company_name, 180),
      postcode: address.postcode,
      addressAvailable: Boolean(address.postcode || address.line1),
      accountStatus: clean(profile.admin_customer_status || "Active", 80),
      accountType: clean(profile.account_type || profile.usage_type || "individual", 80)
    };
  });
}

function radians(value) {
  return Number(value) * Math.PI / 180;
}

function distanceMiles(aLat, aLon, bLat, bLon) {
  const earthMiles = 3958.7613;
  const dLat = radians(Number(bLat) - Number(aLat));
  const dLon = radians(Number(bLon) - Number(aLon));
  const left = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(left), Math.sqrt(1 - left));
}

function isStation(location) {
  const type = clean(location?.type, 120).toLowerCase();
  const name = clean(location?.name, 180).toLowerCase();
  return type.includes("station") || type.includes("police") || name.includes("police station");
}

function stationRecord(force, forceDetails, location, origin) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const distance = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? distanceMiles(origin.latitude, origin.longitude, latitude, longitude)
    : null;
  return {
    forceId: force,
    forceName: clean(forceDetails?.name || force, 180),
    stationName: clean(location?.name || "Police station or contact point", 180),
    address: clean(location?.address, 500),
    postcode: clean(location?.postcode, 20).toUpperCase(),
    telephone: clean(location?.telephone, 80),
    stationType: clean(location?.type || "Police station", 120),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    distanceMiles: distance === null ? null : Math.round(distance * 10) / 10,
    sourceUrl: clean(forceDetails?.url || forceDetails?.engagement_methods?.url || "https://www.police.uk/pu/contact-us/find-force-local-policing-team/", 1000),
    checkedAt: new Date().toISOString()
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error(`Official location service returned HTTP ${response.status}.`);
  return response.json();
}

async function collectForceStations(force, forceDetails, origin, preferredNeighbourhood) {
  const found = new Map();
  const addLocations = detail => {
    for (const location of detail?.locations || []) {
      if (!isStation(location)) continue;
      const station = stationRecord(force, forceDetails, location, origin);
      const key = [station.stationName, station.address, station.postcode].join("|").toLowerCase();
      found.set(key, station);
    }
  };
  if (preferredNeighbourhood) {
    const detail = await fetchJson(`${POLICE_API}/${encodeURIComponent(force)}/${encodeURIComponent(preferredNeighbourhood)}`).catch(() => null);
    if (detail) addLocations(detail);
  }
  if (found.size < 3) {
    const neighbourhoods = await fetchJson(`${POLICE_API}/${encodeURIComponent(force)}/neighbourhoods`).catch(() => []);
    const batchSize = 12;
    for (let index = 0; index < neighbourhoods.length; index += batchSize) {
      const batch = neighbourhoods.slice(index, index + batchSize);
      const details = await Promise.all(batch.map(item => fetchJson(`${POLICE_API}/${encodeURIComponent(force)}/${encodeURIComponent(item.id)}`).catch(() => null)));
      details.filter(Boolean).forEach(addLocations);
      if (found.size >= 50) break;
    }
  }
  return [...found.values()]
    .sort((a, b) => (a.distanceMiles ?? 99999) - (b.distanceMiles ?? 99999) || a.stationName.localeCompare(b.stationName, "en-GB"))
    .slice(0, 12);
}

async function resolvePolice(DB, env, body) {
  const email = cleanEmail(body.email);
  const detail = email ? await userDetail(DB, env, email) : null;
  const postcode = clean(body.postcode || detail?.address?.postcode, 20).replace(/\s+/g, "").toUpperCase();
  if (!postcode) throw new Error("No billing or account postcode is available. Enter and verify the postcode manually.");
  const postcodeResult = await fetchJson(`${POSTCODE_API}/${encodeURIComponent(postcode)}`);
  const latitude = Number(postcodeResult?.result?.latitude);
  const longitude = Number(postcodeResult?.result?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("The saved postcode does not have usable geographic coordinates.");
  const country = clean(postcodeResult?.result?.country, 80);
  const origin = { latitude, longitude, postcode: clean(postcodeResult?.result?.postcode || postcode, 20), country };
  const located = await fetchJson(`${POLICE_API}/locate-neighbourhood?q=${encodeURIComponent(`${latitude},${longitude}`)}`).catch(() => null);
  if (!located?.force) {
    return {
      origin,
      force: null,
      stations: [],
      guidance: country === "Scotland"
        ? "Police.uk does not provide complete Police Scotland station assignment. Use the official Police Scotland station finder and verify the station manually."
        : "The official Police.uk service could not determine a responsible territorial force for this postcode. Verify the force manually."
    };
  }
  const forceDetails = await fetchJson(`${POLICE_API}/forces/${encodeURIComponent(located.force)}`).catch(() => ({ id: located.force, name: located.force }));
  const stations = await collectForceStations(located.force, forceDetails, origin, located.neighbourhood);
  return {
    origin,
    force: {
      id: clean(located.force, 120),
      name: clean(forceDetails?.name || located.force, 180),
      neighbourhood: clean(located.neighbourhood, 180),
      source: "Police.uk locate-neighbourhood"
    },
    stations,
    guidance: stations.length
      ? "The force is assigned from the postcode location. Distances are straight-line estimates from the postcode centroid; verify the station and reporting route before use."
      : "The responsible force was identified, but no station location was published through Police.uk. Use the force's official station finder."
  };
}

async function linkedSessions(DB, reportId) {
  return safeAll(DB, `SELECT ars.*, s.status, s.created_at, s.last_seen_at, s.user_agent, s.ip_address, s.country_code, s.legal_hold
    FROM authority_report_sessions ars
    LEFT JOIN auth_sessions s ON s.session_id=ars.session_id
    WHERE ars.report_id=? ORDER BY datetime(COALESCE(s.last_seen_at, ars.linked_at)) DESC`, [reportId]);
}

async function syncSessions(DB, body, identity, request) {
  const reportId = clean(body.report_id, 180);
  const email = cleanEmail(body.email);
  const requested = [...new Set((Array.isArray(body.session_ids) ? body.session_ids : []).map(value => clean(value, 300)).filter(Boolean))].slice(0, 100);
  const report = await DB.prepare("SELECT * FROM authority_reports WHERE id=? OR reference=? LIMIT 1").bind(reportId, reportId).first();
  if (!report) throw new Error("Save the authority report before attaching sessions.");
  const allowed = requested.length ? await safeAll(DB, `SELECT * FROM auth_sessions WHERE session_id IN (${requested.map(() => "?").join(",")})
    AND (lower(email)=lower(?) OR lower(linked_user_id)=lower(?))`, [...requested, email, email]) : [];
  if (allowed.length !== requested.length) throw new Error("One or more selected sessions do not belong to the linked user.");

  const existing = await linkedSessions(DB, report.id);
  const removed = existing.filter(row => !requested.includes(row.session_id));
  for (const row of removed) {
    await DB.prepare("DELETE FROM authority_report_sessions WHERE report_id=? AND session_id=?").bind(report.id, row.session_id).run();
  }

  for (const session of allowed) {
    await DB.prepare(`INSERT INTO authority_report_sessions
      (id, report_id, report_reference, session_id, session_reference, linked_user_email, linked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id, session_id) DO UPDATE SET session_reference=excluded.session_reference,
        linked_user_email=excluded.linked_user_email, linked_by=excluded.linked_by`)
      .bind(crypto.randomUUID(), report.id, report.reference, session.session_id, session.session_reference, email, cleanEmail(identity.email)).run();
    await DB.prepare(`UPDATE auth_sessions SET legal_hold=1, legal_hold_reason=?, retained_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE session_id=?`)
      .bind(`Linked to authority report ${report.reference}`, session.session_id).run();
    await writeSessionEvent(DB, session, "Evidence hold applied by authority report", request, {
      result: "Success",
      report_reference: report.reference,
      report_type: report.report_type
    }, identity.email);
  }

  const primary = allowed[0] || null;
  await DB.prepare(`UPDATE authority_reports SET linked_user_email=?, linked_user_name=COALESCE(NULLIF(?,''),linked_user_name),
      linked_user_type=COALESCE(NULLIF(?,''),linked_user_type), linked_session_id=?, linked_session_reference=?,
      legal_hold=CASE WHEN ? > 0 THEN 1 ELSE legal_hold END, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(email, clean(body.user_name, 180), clean(body.user_type || "Customer", 80), primary?.session_id || "", primary?.session_reference || "", allowed.length, cleanEmail(identity.email), report.id).run();

  if (await tableExists(DB, "authority_report_events")) {
    await DB.prepare(`INSERT INTO authority_report_events (id, report_id, report_reference, event_type, actor_email, details)
      VALUES (?, ?, ?, 'Linked sessions updated', ?, ?)`)
      .bind(crypto.randomUUID(), report.id, report.reference, cleanEmail(identity.email), JSON.stringify({ linked_user_email: email, session_references: allowed.map(item => item.session_reference), removed: removed.map(item => item.session_reference) })).run();
  }
  await DB.prepare(`INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, 'authority_report_sessions_sync', 'authority_report', ?, ?, ?)`)
    .bind(crypto.randomUUID(), cleanEmail(identity.email), report.reference, `Updated linked sessions for ${report.reference}.`, JSON.stringify({ linked_user_email: email, session_count: allowed.length })).run();

  return { reportId: report.id, reportReference: report.reference, sessions: await linkedSessions(DB, report.id) };
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  await ensureTables(context.env.DB);
  const url = new URL(context.request.url);
  const query = clean(url.searchParams.get("q"), 120);
  const email = cleanEmail(url.searchParams.get("email"));
  const reportId = clean(url.searchParams.get("report_id"), 180);
  if (query) return json({ success: true, users: await searchUsers(context.env.DB, query) });
  if (email) {
    const user = await userDetail(context.env.DB, context.env, email);
    return user ? json({ success: true, user }) : json({ success: false, error: "Customer could not be found." }, 404);
  }
  if (reportId) return json({ success: true, sessions: await linkedSessions(context.env.DB, reportId) });
  return json({ success: true, users: [] });
}

export async function onRequestPost(context) {
  if (!assertSameOrigin(context.request)) return json({ success: false, error: "Request origin was rejected." }, 403);
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  await ensureTables(context.env.DB);
  const body = await requestBody(context.request);
  try {
    if (body.action === "resolve_police") return json({ success: true, data: await resolvePolice(context.env.DB, context.env, body) });
    if (body.action === "sync_sessions") return json({ success: true, data: await syncSessions(context.env.DB, body, auth.identity, context.request) });
    return json({ success: false, error: "Unknown authority-report context action." }, 400);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Authority-report context could not be updated." }, 400);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
