import { getNativeSession } from "../../_shared/oidc.js";
import { ensureSessionTrackingTables, recordSessionHeartbeat } from "../../_shared/session-tracking.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";

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

async function tableExists(DB, table) {
  const row = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(table).first().catch(() => null);
  return Boolean(row?.name);
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

async function safeFirst(DB, sql, bindings = []) {
  try {
    return await DB.prepare(sql).bind(...bindings).first();
  } catch {
    return null;
  }
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

async function authorised(DB, env, identity) {
  const email = cleanEmail(identity?.email);
  if (!email) return false;
  if (configuredAdmins(env).includes(email)) return true;
  if (!(await tableExists(DB, "admin_users"))) return false;
  const row = await safeFirst(DB, "SELECT status FROM admin_users WHERE lower(email)=lower(?)", [email]);
  return Boolean(row) && !["blocked", "closed", "disabled", "inactive", "suspended"]
    .includes(clean(row.status || "Active", 80).toLowerCase());
}

async function authenticate(context) {
  if (!context.env.DB) return { error: json({ success: false, error: "User directory storage is unavailable." }, 503) };
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity) return { error: json({ success: false, error: "Administrator session required." }, 401) };
  if (!(await authorised(context.env.DB, context.env, identity))) return { error: json({ success: false, error: "Administrator access was denied." }, 403) };
  await ensureSessionTrackingTables(context.env.DB);
  await recordSessionHeartbeat(context.env.DB, context.request, identity, "admin");
  return { identity };
}

function profileName(profile) {
  return clean(profile?.display_name || profile?.verified_name || profile?.customer_name || profile?.email, 180);
}

function profileAddress(profile) {
  const address = {
    line1: clean(profile?.street_address || profile?.address_line1 || profile?.address || profile?.office_location, 300),
    line2: clean(profile?.address_line2, 300),
    city: clean(profile?.city || profile?.town, 160),
    county: clean(profile?.county || profile?.region, 160),
    country: clean(profile?.country || "United Kingdom", 100),
    postcode: clean(profile?.postcode || profile?.postal_code, 20).toUpperCase()
  };
  return { ...address, formatted: [address.line1, address.line2, address.city, address.county, address.postcode, address.country].filter(Boolean).join(", ") };
}

async function subscriptionFor(DB, email) {
  if (!(await tableExists(DB, "stripe_subscriptions"))) return null;
  return safeFirst(DB, `SELECT * FROM stripe_subscriptions WHERE lower(customer_email)=lower(?)
    ORDER BY datetime(COALESCE(updated_at, current_period_end, trial_end, created_at)) DESC LIMIT 1`, [email]);
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
    line1: clean(source.line1, 300), line2: clean(source.line2, 300), city: clean(source.city, 160),
    county: clean(source.state, 160), country: clean(source.country || "United Kingdom", 100),
    postcode: clean(source.postal_code, 20).toUpperCase()
  };
  if (!address.postcode && !address.line1) return null;
  return { ...address, formatted: [address.line1, address.line2, address.city, address.county, address.postcode, address.country].filter(Boolean).join(", ") };
}

function mergeIdentity(map, identity) {
  const email = cleanEmail(identity.email);
  if (!email) return;
  const existing = map.get(email);
  if (!existing || identity.priority > existing.priority) map.set(email, { ...identity, email });
  else {
    map.set(email, {
      ...existing,
      name: existing.name || identity.name,
      company: existing.company || identity.company,
      postcode: existing.postcode || identity.postcode,
      addressAvailable: existing.addressAvailable || identity.addressAvailable
    });
  }
}

async function searchDirectory(DB, query) {
  const plain = clean(query, 120);
  const like = `%${plain.replaceAll("%", "").replaceAll("_", "")}%`;
  const identities = new Map();

  if (await tableExists(DB, "profiles")) {
    const rows = await safeAll(DB, `SELECT * FROM profiles
      WHERE lower(COALESCE(email,'')) LIKE lower(?)
         OR lower(COALESCE(display_name,'')) LIKE lower(?)
         OR lower(COALESCE(verified_name,'')) LIKE lower(?)
         OR lower(COALESCE(customer_name,'')) LIKE lower(?)
         OR lower(COALESCE(company,'')) LIKE lower(?)
      LIMIT 50`, [like, like, like, like, like]);
    for (const row of rows) {
      const address = profileAddress(row);
      mergeIdentity(identities, {
        priority: 3,
        id: clean(row.customer_id || row.email, 254), email: row.email, name: profileName(row),
        company: clean(row.company || row.microsoft_company_name, 180), postcode: address.postcode,
        addressAvailable: Boolean(address.postcode || address.line1), accountStatus: clean(row.admin_customer_status || "Active", 80),
        accountType: clean(row.account_type || row.usage_type || "Individual customer", 80), recordType: "Customer"
      });
    }
  }

  if (await tableExists(DB, "admin_users")) {
    const rows = await safeAll(DB, `SELECT * FROM admin_users
      WHERE lower(COALESCE(email,'')) LIKE lower(?) OR lower(COALESCE(name,'')) LIKE lower(?)
         OR lower(COALESCE(role,'')) LIKE lower(?) LIMIT 50`, [like, like, like]);
    for (const row of rows) mergeIdentity(identities, {
      priority: 2,
      id: clean(row.id || row.email, 254), email: row.email, name: clean(row.name || row.email, 180),
      company: "JA Group Services Ltd", postcode: "", addressAvailable: false,
      accountStatus: clean(row.status || "Active", 80), accountType: clean(row.role || "Administrator", 80), recordType: "Administrator"
    });
  }

  const sessionRows = await safeAll(DB, `SELECT email, display_name, linked_user_name, linked_user_type, linked_user_role,
      linked_user_status, linked_user_id, realm, MAX(last_seen_at) AS last_seen_at
    FROM auth_sessions
    WHERE lower(COALESCE(email,'')) LIKE lower(?) OR lower(COALESCE(display_name,'')) LIKE lower(?)
       OR lower(COALESCE(linked_user_name,'')) LIKE lower(?)
    GROUP BY lower(email) LIMIT 50`, [like, like, like]);
  for (const row of sessionRows) {
    const recordType = clean(row.linked_user_type || (row.realm === "admin" ? "Administrator" : "Customer"), 80);
    mergeIdentity(identities, {
      priority: 1,
      id: clean(row.linked_user_id || row.email, 254), email: row.email,
      name: clean(row.linked_user_name || row.display_name || row.email, 180), company: "", postcode: "", addressAvailable: false,
      accountStatus: clean(row.linked_user_status || "Tracked identity", 80),
      accountType: clean(row.linked_user_role || recordType, 80), recordType
    });
  }

  return [...identities.values()]
    .sort((a, b) => Number(cleanEmail(b.email) === cleanEmail(plain)) - Number(cleanEmail(a.email) === cleanEmail(plain)) || a.name.localeCompare(b.name, "en-GB"))
    .slice(0, 50)
    .map(({ priority, ...identity }) => identity);
}

async function loadIdentity(DB, env, email) {
  const profile = await safeFirst(DB, "SELECT * FROM profiles WHERE lower(email)=lower(?) LIMIT 1", [email]);
  const admin = await safeFirst(DB, "SELECT * FROM admin_users WHERE lower(email)=lower(?) LIMIT 1", [email]);
  const sessionIdentity = await safeFirst(DB, `SELECT * FROM auth_sessions WHERE lower(email)=lower(?) OR lower(linked_user_id)=lower(?)
    ORDER BY datetime(COALESCE(last_seen_at, created_at)) DESC LIMIT 1`, [email, email]);
  if (!profile && !admin && !sessionIdentity) return null;

  const recordType = profile ? "Customer" : (clean(admin?.role || sessionIdentity?.linked_user_type || sessionIdentity?.realm, 80).toLowerCase().includes("admin") ? "Administrator" : "Customer");
  const subscription = profile ? await subscriptionFor(DB, email) : null;
  const stripeAddress = profile ? await stripeBillingAddress(env, subscription) : null;
  const savedAddress = profileAddress(profile || {});
  const address = stripeAddress || savedAddress;
  const addressSource = stripeAddress ? "Stripe billing address" : (savedAddress.postcode || savedAddress.line1 ? "Saved Planyx account address" : "No saved address");
  const sessions = await safeAll(DB, `SELECT session_id, session_reference, realm, email, linked_user_name, status,
      created_at, last_seen_at, revoked_at, ip_address, country_code, user_agent, legal_hold, legal_hold_reason
    FROM auth_sessions WHERE lower(email)=lower(?) OR lower(linked_user_id)=lower(?)
    ORDER BY datetime(COALESCE(last_seen_at, created_at)) DESC LIMIT 150`, [email, email]);
  const reports = await safeAll(DB, `SELECT id, reference, report_type, urgency, status, summary, updated_at
    FROM authority_reports WHERE lower(linked_user_email)=lower(?) ORDER BY datetime(updated_at) DESC LIMIT 100`, [email]);

  return {
    id: clean(profile?.customer_id || admin?.id || sessionIdentity?.linked_user_id || email, 254),
    email,
    name: profile ? profileName(profile) : clean(admin?.name || sessionIdentity?.linked_user_name || sessionIdentity?.display_name || email, 180),
    company: clean(profile?.company || profile?.microsoft_company_name || (recordType === "Administrator" ? "JA Group Services Ltd" : ""), 180),
    phone: clean(profile?.phone || profile?.mobile_phone || profile?.business_phone, 80),
    accountStatus: clean(profile?.admin_customer_status || admin?.status || sessionIdentity?.linked_user_status || "Active", 80),
    accountType: clean(profile?.account_type || profile?.usage_type || admin?.role || sessionIdentity?.linked_user_role || recordType, 80),
    recordType,
    address, addressSource,
    stripeCustomerId: clean(subscription?.stripe_customer_id || subscription?.customer_id, 180),
    sessions: sessions.map(session => ({
      id: clean(session.session_id, 300), reference: clean(session.session_reference, 120), realm: clean(session.realm, 30),
      status: clean(session.revoked_at ? "Signed out" : session.status || "Active", 80), createdAt: session.created_at || null,
      lastSeenAt: session.last_seen_at || null, ipAddress: clean(session.ip_address, 80), countryCode: clean(session.country_code, 8),
      userAgent: clean(session.user_agent, 600), legalHold: Number(session.legal_hold || 0) === 1,
      legalHoldReason: clean(session.legal_hold_reason, 500)
    })),
    reports
  };
}

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.error) return auth.error;
  const url = new URL(context.request.url);
  const query = clean(url.searchParams.get("q"), 120);
  const email = cleanEmail(url.searchParams.get("email"));
  if (query) return json({ success: true, users: await searchDirectory(context.env.DB, query) });
  if (email) {
    const user = await loadIdentity(context.env.DB, context.env, email);
    return user ? json({ success: true, user }) : json({ success: false, error: "No Planyx user or administrator matched that email address." }, 404);
  }
  return json({ success: true, users: [] });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ success: false, error: "Method not allowed." }, 405);
}
