function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      "Location": location,
      "Cache-Control": "no-store"
    }
  });
}

function wantsJson(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("application/json");
}

function getAccessIdentity(request) {
  const nativeEmail = request.headers.get("x-ja-auth-email") || "";
  return {
    email: nativeEmail.trim().toLowerCase(),
    verifiedName: (request.headers.get("x-ja-auth-name") || nativeEmail).trim(),
    realm: (request.headers.get("x-ja-auth-realm") || "").trim(),
    subject: (request.headers.get("x-ja-auth-subject") || "").trim(),
    tenantId: (request.headers.get("x-ja-auth-tenant") || "").trim(),
    objectId: (request.headers.get("x-ja-auth-object-id") || "").trim(),
    givenName: (request.headers.get("x-ja-auth-given-name") || "").trim(),
    familyName: (request.headers.get("x-ja-auth-family-name") || "").trim(),
    preferredUsername: (request.headers.get("x-ja-auth-preferred-username") || "").trim(),
    locale: (request.headers.get("x-ja-auth-locale") || "").trim(),
    jobTitle: (request.headers.get("x-ja-auth-job-title") || "").trim(),
    department: (request.headers.get("x-ja-auth-department") || "").trim(),
    companyName: (request.headers.get("x-ja-auth-company-name") || "").trim(),
    mobilePhone: (request.headers.get("x-ja-auth-mobile-phone") || "").trim(),
    businessPhone: (request.headers.get("x-ja-auth-business-phone") || "").trim(),
    country: (request.headers.get("x-ja-auth-country") || "").trim(),
    preferredLanguage: (request.headers.get("x-ja-auth-preferred-language") || "").trim(),
    photoUrl: (request.headers.get("x-ja-auth-photo-url") || "").trim()
  };
}

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return clean(value, 254).toLowerCase();
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

async function hashToken(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlToBytes(value) {
  const normalised = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(normalised.length + ((4 - normalised.length % 4) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptionKey(env) {
  const secret = String(env.OIDC_TOKEN_ENCRYPTION_KEY || "");
  if (secret.length < 32) return null;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt: new TextEncoder().encode("ja-experiences-native-oidc-v1"),
    info: new TextEncoder().encode("refresh-token-storage")
  }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function decryptSecret(value, env) {
  if (!value) return "";
  const [iv, encrypted] = String(value).split(".");
  if (!iv || !encrypted) return "";
  const key = await encryptionKey(env);
  if (!key) return "";
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(encrypted)
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptSecret(value, env) {
  if (!value) return "";
  const key = await encryptionKey(env);
  if (!key) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function discoverOidc(env) {
  const issuer = String(env.CUSTOMER_OIDC_ISSUER || env.MICROSOFT_OIDC_ISSUER || env.OIDC_ISSUER || "").trim().replace(/\/$/, "");
  if (!issuer) return null;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!response.ok) return null;
  const metadata = await response.json().catch(() => null);
  if (!metadata?.token_endpoint) return null;
  return metadata;
}

async function getCurrentCustomerSession(DB, request) {
  const token = readCookie(request, "ja_customer_oidc_session");
  if (!token) return null;
  const tokenHash = await hashToken(token);
  try {
    return await DB.prepare(`
      SELECT token_hash, refresh_token_encrypted, access_token_encrypted, access_token_expires_at
      FROM customer_oidc_sessions
      WHERE token_hash = ? AND revoked_at IS NULL
    `).bind(tokenHash).first();
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_session_extended_columns_unavailable",
      error_message: error instanceof Error ? error.message : "Customer session query failed."
    }));
    try {
      return await DB.prepare(`
        SELECT token_hash, refresh_token_encrypted,
          NULL AS access_token_encrypted,
          NULL AS access_token_expires_at
        FROM customer_oidc_sessions
        WHERE token_hash = ? AND revoked_at IS NULL
      `).bind(tokenHash).first();
    } catch (fallbackError) {
      console.error(JSON.stringify({
        event: "customer_session_lookup_failed",
        error_message: fallbackError instanceof Error ? fallbackError.message : "Customer session fallback query failed."
      }));
      return null;
    }
  }
}

async function getCustomerRefreshToken(DB, request, env) {
  const session = await getCurrentCustomerSession(DB, request);
  try {
    return await decryptSecret(session?.refresh_token_encrypted || "", env);
  } catch (error) {
    console.error(JSON.stringify({
      event: "microsoft_session_token_decrypt_failed",
      token_type: "refresh_token",
      customer_email: "",
      error_message: error instanceof Error ? error.message : "Unknown decryption error"
    }));
    return "";
  }
}

function graphUrl(path, select = []) {
  const url = new URL(`https://graph.microsoft.com/v1.0${path}`);
  if (select.length) url.searchParams.set("$select", select.join(","));
  return url.toString();
}

function graphErrorPayload(bodyText) {
  try {
    const parsed = JSON.parse(bodyText || "{}");
    return {
      code: parsed?.error?.code || "",
      message: parsed?.error?.message || "",
      body: parsed
    };
  } catch {
    return {
      code: "",
      message: bodyText || "",
      body: bodyText
    };
  }
}

async function logGraphEvent(details) {
  console.log(JSON.stringify({
    event: "microsoft_graph_request",
    request_url: details.requestUrl,
    http_method: details.method,
    http_status: details.status,
    error_code: details.errorCode || "",
    error_message: details.errorMessage || "",
    request_id: details.requestId || "",
    client_request_id: details.clientRequestId || "",
    content_type: details.contentType || "",
    response_body: details.responseBody,
    customer_email: details.customerEmail || "",
    user_object_id: details.userObjectId || ""
  }));
}

async function graphRequest({ method, url, accessToken, body, customerEmail = "", userObjectId = "" }) {
  const clientRequestId = crypto.randomUUID();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "client-request-id": clientRequestId
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const responseBody = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type") || "";
  let parsedJson = null;
  if (responseBody.trim()) {
    try {
      parsedJson = JSON.parse(responseBody);
    } catch {
      parsedJson = null;
    }
  }
  const parsed = response.ok ? null : graphErrorPayload(responseBody);
  const requestId = response.headers.get("request-id") || response.headers.get("x-ms-request-id") || "";
  await logGraphEvent({
    requestUrl: url,
    method,
    status: response.status,
    errorCode: parsed?.code || "",
    errorMessage: parsed?.message || "",
    requestId,
    clientRequestId,
    responseBody: responseBody.slice(0, 500),
    contentType,
    customerEmail,
    userObjectId
  });
  return { response, responseBody, contentType, parsedJson, parsedError: parsed, requestId, clientRequestId };
}

async function refreshMicrosoftAccessToken(DB, request, env) {
  const metadata = await discoverOidc(env);
  if (!metadata) return null;
  const refreshToken = await getCustomerRefreshToken(DB, request, env);
  if (!refreshToken) return null;
  const clientId = String(env.CUSTOMER_OIDC_CLIENT_ID || env.MICROSOFT_OIDC_CLIENT_ID || env.OIDC_CLIENT_ID || "").trim();
  const clientSecret = String(env.CUSTOMER_OIDC_CLIENT_SECRET || env.MICROSOFT_OIDC_CLIENT_SECRET || env.OIDC_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;

  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }).toString()
  });
  const responseBody = await response.text().catch(() => "");
  if (!response.ok) {
    console.error(JSON.stringify({
      event: "microsoft_token_refresh_failed",
      request_url: metadata.token_endpoint,
      http_method: "POST",
      http_status: response.status,
      error_code: "",
      error_message: responseBody,
      request_id: response.headers.get("request-id") || response.headers.get("x-ms-request-id") || "",
      client_request_id: "",
      response_body: responseBody,
      customer_email: "",
      user_object_id: ""
    }));
    return null;
  }
  let payload = {};
  try {
    payload = JSON.parse(responseBody || "{}");
  } catch {
    payload = {};
  }
  if (!payload?.access_token) {
    console.error(JSON.stringify({
      event: "microsoft_token_refresh_failed",
      request_url: metadata.token_endpoint,
      http_method: "POST",
      http_status: response.status,
      error_code: "",
      error_message: "Microsoft token refresh response did not include an access token.",
      request_id: response.headers.get("request-id") || response.headers.get("x-ms-request-id") || "",
      client_request_id: "",
      response_body: responseBody,
      customer_email: "",
      user_object_id: ""
    }));
    return null;
  }

  const session = await getCurrentCustomerSession(DB, request);
  if (session?.token_hash) {
    const accessTokenEncrypted = await encryptSecret(payload.access_token, env);
    const accessTokenExpiresAt = payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : "";
    await DB.prepare(`
      UPDATE customer_oidc_sessions
      SET access_token_encrypted = COALESCE(NULLIF(?, ''), access_token_encrypted),
        access_token_expires_at = COALESCE(NULLIF(?, ''), access_token_expires_at)
      WHERE token_hash = ? AND revoked_at IS NULL
    `).bind(accessTokenEncrypted, accessTokenExpiresAt, session.token_hash).run();
  }

  return payload.access_token;
}

async function loadMicrosoftGraphProfile(DB, request, env, identity, session = null, setStage = () => {}) {
  setStage(4, "decrypt tokens");
  let storedAccessToken = "";
  try {
    storedAccessToken = session?.access_token_encrypted ? await decryptSecret(session.access_token_encrypted, env) : "";
  } catch (error) {
    console.error(JSON.stringify({
      event: "microsoft_session_token_decrypt_failed",
      token_type: "access_token",
      customer_email: identity.email,
      error_message: error instanceof Error ? error.message : "Unknown decryption error"
    }));
    storedAccessToken = "";
  }
  const storedAccessTokenExpiry = session?.access_token_expires_at ? Date.parse(session.access_token_expires_at) : 0;
  const accessToken = storedAccessToken && storedAccessTokenExpiry > Date.now() + 60_000
    ? storedAccessToken
    : await refreshMicrosoftAccessToken(DB, request, env);
  if (!accessToken) return { ok: false, reason: "No Microsoft Graph access token was available.", status: 0, requestId: "", clientRequestId: "" };

  setStage(5, "call Graph GET /me");
  const { response, responseBody, contentType, parsedJson, parsedError, requestId, clientRequestId } = await graphRequest({
    method: "GET",
    url: graphUrl("/me", [
      "id",
      "displayName",
      "givenName",
      "surname",
      "preferredLanguage",
      "mobilePhone",
      "officeLocation",
      "city",
      "state",
      "country",
      "postalCode",
      "streetAddress",
      "mail",
      "identities",
      "otherMails"
    ]),
    accessToken,
    customerEmail: identity.email,
    userObjectId: identity.objectId || ""
  });

  setStage(6, "parse and compare Graph profile");
  console.log(JSON.stringify({
    event: "profile_graph_response",
    stage_number: 6,
    http_status: response.status,
    content_type: contentType,
    response_preview: responseBody.slice(0, 500),
    customer_email: identity.email,
    user_object_id: identity.objectId || ""
  }));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: parsedError?.message || "Microsoft Graph /me lookup failed.",
      errorCode: parsedError?.code || "",
      responseBody,
      requestId,
      clientRequestId
    };
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    return {
      ok: false,
      status: response.status,
      reason: responseBody ? "Microsoft Graph returned a non-JSON response." : "Microsoft Graph returned an empty response.",
      responseBody: responseBody.slice(0, 500),
      requestId,
      clientRequestId
    };
  }
  const profile = parsedJson;
  return { ok: true, status: response.status, profile, accessToken, requestId, clientRequestId };
}

function graphProfileFields(graph = {}) {
  return {
    microsoftDisplayName: clean(graph.displayName, 120),
    microsoftGivenName: clean(graph.givenName, 120),
    microsoftFamilyName: clean(graph.surname, 120),
    microsoftPreferredLanguage: clean(graph.preferredLanguage, 40),
    microsoftMobilePhone: clean(graph.mobilePhone, 80),
    microsoftOfficeLocation: clean(graph.officeLocation, 120),
    microsoftCity: clean(graph.city, 120),
    microsoftState: clean(graph.state, 120),
    microsoftCountry: clean(graph.country, 120),
    microsoftPostalCode: clean(graph.postalCode, 40),
    microsoftStreetAddress: clean(graph.streetAddress, 240),
    microsoftEmail: clean(graph.mail, 254)
  };
}

function graphProfileDiffers(existing, graphFields) {
  return Object.entries(graphFields).some(([key, value]) => clean(existing?.[key] || "", 500) !== value);
}

function emailUpdateAllowed(env) {
  return String(env.CUSTOMER_GRAPH_ALLOW_EMAIL_UPDATE || "").trim().toLowerCase() === "true";
}

async function patchMicrosoftGraphProfile(DB, request, env, identity, desired) {
  const session = await getCurrentCustomerSession(DB, request);
  let storedAccessToken = "";
  try {
    storedAccessToken = session?.access_token_encrypted ? await decryptSecret(session.access_token_encrypted, env) : "";
  } catch (error) {
    console.error(JSON.stringify({
      event: "microsoft_session_token_decrypt_failed",
      token_type: "access_token",
      customer_email: identity.email,
      error_message: error instanceof Error ? error.message : "Unknown decryption error"
    }));
    storedAccessToken = "";
  }
  const storedAccessTokenExpiry = session?.access_token_expires_at ? Date.parse(session.access_token_expires_at) : 0;
  let accessToken = storedAccessToken && storedAccessTokenExpiry > Date.now() + 60_000 ? storedAccessToken : "";
  if (!accessToken) {
    const refreshToken = await getCustomerRefreshToken(DB, request, env);
    if (!refreshToken) return { ok: false, status: 0, reason: "No valid Microsoft access or refresh token was available.", requestId: "", clientRequestId: "" };
    accessToken = await refreshMicrosoftAccessToken(DB, request, env);
  }
  if (!accessToken) return { ok: false, status: 0, reason: "Microsoft access token refresh failed.", requestId: "", clientRequestId: "" };

  const body = {
    displayName: clean(desired.displayName, 120) || undefined,
    givenName: clean(desired.microsoftGivenName, 120) || undefined,
    surname: clean(desired.microsoftFamilyName, 120) || undefined,
    preferredLanguage: clean(desired.microsoftPreferredLanguage, 40) || undefined,
    mobilePhone: clean(desired.microsoftMobilePhone, 80) || undefined,
    officeLocation: clean(desired.microsoftOfficeLocation, 120) || undefined,
    city: clean(desired.microsoftCity, 120) || undefined,
    state: clean(desired.microsoftState, 120) || undefined,
    country: clean(desired.microsoftCountry, 120) || undefined,
    postalCode: clean(desired.microsoftPostalCode, 40) || undefined,
    streetAddress: clean(desired.microsoftStreetAddress, 240) || undefined
  };
  if (clean(desired.microsoftCompanyName, 180)) body.companyName = clean(desired.microsoftCompanyName, 180);

  if (emailUpdateAllowed(env)) {
    if (clean(desired.mail, 254)) body.mail = clean(desired.mail, 254);
    if (Array.isArray(desired.identities) && desired.identities.length) body.identities = desired.identities;
  }

  for (const key of Object.keys(body)) {
    if (!body[key]) delete body[key];
  }

  if (!Object.keys(body).length) {
    return { ok: true, status: 200, skipped: true, reason: "No Graph-updatable fields were supplied.", requestId: "", clientRequestId: "" };
  }

  const { response, responseBody, parsedError, requestId, clientRequestId } = await graphRequest({
    method: "PATCH",
    url: graphUrl("/me"),
    accessToken,
    body,
    customerEmail: identity.email,
    userObjectId: identity.objectId || ""
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: parsedError?.message || "Microsoft Graph update failed.",
      errorCode: parsedError?.code || "",
      responseBody,
      requestId,
      clientRequestId
    };
  }

  return { ok: true, status: response.status, requestId, clientRequestId };
}

function profileHasEligibleAccess(row, plan) {
  const status = String(row?.admin_customer_status || "").trim().toLowerCase();
  return Boolean(
    Number(row?.admin_lifetime || 0) === 1 ||
    row?.admin_lifetime_plan_id ||
    plan?.id ||
    (status && !["standard", "free", "secure", "secure account"].includes(status))
  );
}

async function ensureProfileTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
      email TEXT PRIMARY KEY,
      verified_name TEXT,
      display_name TEXT,
      contact_email TEXT,
      phone TEXT,
      communication_preference TEXT,
      support_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_lifetime_plan_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN admin_customer_status TEXT DEFAULT 'Standard'`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_attempted_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_status TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_provider TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN signup_notification_to TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_object_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_tenant_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_display_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_given_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_family_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_email TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_preferred_username TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_locale TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_job_title TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_department TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_company_name TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_mobile_phone TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_business_phone TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_country TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_preferred_language TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_photo_url TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_updated_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_office_location TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_city TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_state TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_postal_code TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN microsoft_street_address TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_last_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_success INTEGER DEFAULT 0`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_failure_reason TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_last_http_status INTEGER`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_last_request_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN graph_sync_last_client_request_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_created_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN stripe_customer_synced_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN account_flags TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN membership_status TEXT DEFAULT 'Standard'`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN membership_renewal_at TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN support_notes TEXT`);
  await safeAlter(DB, `ALTER TABLE profiles ADD COLUMN privacy_preferences TEXT`);
}

async function ensureNotificationTables(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function safeAlter(DB, sql) {
  try {
    await DB.prepare(sql).run();
  } catch {
    // Existing D1 databases may already have this column.
  }
}

async function tableColumns(DB, tableName) {
  const result = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result.results || []).map((column) => String(column.name || "")));
}

async function updateGraphProfile(DB, identity, graphSync, graphFields = null) {
  const columns = await tableColumns(DB, "profiles");
  const assignments = [];
  const values = [];
  const noValue = Symbol("no-value");
  const add = (column, expression, value = noValue) => {
    if (!columns.has(column)) return;
    assignments.push(`${column} = ${expression}`);
    if (value !== noValue) values.push(value);
  };

  if (graphFields) {
    const optionalFields = [
      ["microsoft_display_name", graphFields.microsoftDisplayName],
      ["microsoft_given_name", graphFields.microsoftGivenName],
      ["microsoft_family_name", graphFields.microsoftFamilyName],
      ["microsoft_email", graphFields.microsoftEmail],
      ["microsoft_preferred_language", graphFields.microsoftPreferredLanguage],
      ["microsoft_mobile_phone", graphFields.microsoftMobilePhone],
      ["microsoft_office_location", graphFields.microsoftOfficeLocation],
      ["microsoft_city", graphFields.microsoftCity],
      ["microsoft_state", graphFields.microsoftState],
      ["microsoft_country", graphFields.microsoftCountry],
      ["microsoft_postal_code", graphFields.microsoftPostalCode],
      ["microsoft_street_address", graphFields.microsoftStreetAddress]
    ];
    for (const [column, value] of optionalFields) add(column, "COALESCE(NULLIF(?, ''), " + column + ")", value);
    add("microsoft_updated_at", "CURRENT_TIMESTAMP");
  }

  add("graph_sync_last_at", "CURRENT_TIMESTAMP");
  add("graph_sync_success", "?", graphSync.ok ? 1 : 0);
  if (graphSync.ok) add("graph_sync_failure_reason", "NULL");
  else add("graph_sync_failure_reason", "?", clean(graphSync.reason || "Microsoft Graph profile refresh failed.", 1000));
  add("graph_sync_last_http_status", "?", graphSync.status || 0);
  add("graph_sync_last_request_id", "?", graphSync.requestId || "");
  add("graph_sync_last_client_request_id", "?", graphSync.clientRequestId || "");
  add("updated_at", "CURRENT_TIMESTAMP");

  if (!assignments.length) return { skipped: true, reason: "No supported Graph profile columns exist." };
  values.push(identity.email);
  await DB.prepare(`UPDATE profiles SET ${assignments.join(", ")} WHERE lower(email) = lower(?)`).bind(...values).run();
  return { skipped: false };
}

async function settingMap(DB, keys, defaults = {}) {
  try {
    const placeholders = keys.map(() => "?").join(", ");
    const result = await DB.prepare(`SELECT key, value FROM site_settings WHERE key IN (${placeholders})`).bind(...keys).all();
    const settings = { ...defaults };
    for (const row of result.results || []) settings[row.key] = row.value;
    return settings;
  } catch {
    return { ...defaults };
  }
}

async function providerSettings(DB, env) {
  const stored = await settingMap(DB, ["email_provider", "email_api_key", "email_api_endpoint", "smtp_from_name", "smtp_from_email", "admin_notification_email"], {});
  const provider = (stored.email_provider || env.EMAIL_PROVIDER || "resend").toLowerCase();
  const apiKey = stored.email_api_key || env.EMAIL_API_TOKEN || env.RESEND_API_KEY || env.SENDGRID_API_KEY || env.POSTMARK_API_KEY || env.BREVO_API_KEY || "";

  return {
    provider,
    apiKey,
    endpoint: stored.email_api_endpoint || env.EMAIL_API_ENDPOINT || "",
    fromName: stored.smtp_from_name || "Sousa Murray Planeia",
    fromEmail: stored.smtp_from_email || env.ENQUIRY_FROM_EMAIL || "noreply@jagroupservices.co.uk",
    to: stored.admin_notification_email || env.ADMIN_NOTIFICATION_EMAIL || env.ENQUIRY_TO_EMAIL || ""
  };
}

async function sendProviderEmail(DB, env, message) {
  const settings = await providerSettings(DB, env);
  const to = cleanEmail(message.to || settings.to);
  if (!to) throw new Error("Recipient email is not configured.");
  if (!settings.apiKey && settings.provider !== "mailchannels") throw new Error("Email API key is not configured.");

  const from = settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail;
  let endpoint = settings.endpoint;
  const headers = { "Content-Type": "application/json" };
  let body;

  if (settings.provider === "sendgrid") {
    endpoint ||= "https://api.sendgrid.com/v3/mail/send";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else if (settings.provider === "postmark") {
    endpoint ||= "https://api.postmarkapp.com/email";
    headers["X-Postmark-Server-Token"] = settings.apiKey;
    body = { From: from, To: to, Subject: message.subject, TextBody: message.text };
  } else if (settings.provider === "brevo") {
    endpoint ||= "https://api.brevo.com/v3/smtp/email";
    headers["api-key"] = settings.apiKey;
    body = { sender: { name: settings.fromName, email: settings.fromEmail }, to: [{ email: to }], subject: message.subject, textContent: message.text };
  } else if (settings.provider === "mailchannels") {
    endpoint ||= "https://api.mailchannels.net/tx/v1/send";
    body = { personalizations: [{ to: [{ email: to }] }], from: { email: settings.fromEmail, name: settings.fromName }, subject: message.subject, content: [{ type: "text/plain", value: message.text }] };
  } else {
    endpoint ||= "https://api.resend.com/emails";
    headers.Authorization = `Bearer ${settings.apiKey}`;
    body = { from, to, subject: message.subject, text: message.text };
  }

  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const responseText = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 240)}`);

  return { provider: settings.provider, to, status: response.status };
}

async function writeCustomerAudit(DB, identity, action, summary, metadata = {}) {
  await ensureNotificationTables(DB);
  await DB.prepare(`
    INSERT INTO admin_audit_log (id, actor_email, action, entity_type, entity_id, summary, metadata)
    VALUES (?, ?, ?, 'profiles', ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    cleanEmail(identity.email) || "system-account",
    clean(action, 120),
    cleanEmail(identity.email),
    clean(summary, 1000),
    JSON.stringify(metadata)
  ).run();
}

async function recordSignupNotification(DB, email, result) {
  await DB.prepare(`
    UPDATE profiles
    SET signup_notification_attempted_at = CURRENT_TIMESTAMP,
      signup_notification_status = ?,
      signup_notification_provider = ?,
      signup_notification_to = ?
    WHERE lower(email) = lower(?)
  `).bind(
    clean(result.status, 500),
    clean(result.provider, 80),
    cleanEmail(result.to),
    cleanEmail(email)
  ).run();
}

async function notifyCustomerSignup(DB, env, identity, profile) {
  await ensureNotificationTables(DB);

  const createdAt = new Date().toISOString();
  const customerName = profile.displayName || profile.verifiedName || identity.verifiedName || identity.email;

  try {
    const sent = await sendProviderEmail(DB, env, {
      subject: "New Sousa Murray Planeia customer signup",
      text: [
        "A new customer account has been created or first detected by Sousa Murray Planeia.",
        "",
        `Customer name: ${customerName || "Not provided"}`,
        `Customer email: ${identity.email}`,
        `Signup date/time: ${createdAt}`,
        `Account/customer ID: ${identity.email}`,
        "Source/provider: Microsoft Entra ID / JA customer CIAM"
      ].join("\n")
    });

    await recordSignupNotification(DB, identity.email, { status: "sent", provider: sent.provider, to: sent.to });
    await writeCustomerAudit(DB, identity, "customer_signup_notification_sent", "Sent new customer signup notification email.", { sent: true, provider: sent.provider, to: sent.to });
  } catch (error) {
    const settings = await providerSettings(DB, env);
    await recordSignupNotification(DB, identity.email, { status: `failed: ${error.message || "Unknown email error"}`, provider: settings.provider, to: settings.to });
    await writeCustomerAudit(DB, identity, "customer_signup_notification_failed", "Customer signup notification email failed.", { sent: false, provider: settings.provider, to: settings.to, error: error.message || "Unknown email error" });
  }
}

async function ensureConsentTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      email TEXT,
      source TEXT,
      reference TEXT,
      terms_accepted INTEGER DEFAULT 0,
      terms_version TEXT,
      terms_accepted_at TEXT,
      privacy_accepted INTEGER DEFAULT 0,
      privacy_version TEXT,
      privacy_accepted_at TEXT,
      marketing_consent INTEGER DEFAULT 0,
      marketing_consent_at TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getLatestConsent(DB, email) {
  await ensureConsentTable(DB);

  const consent = await DB.prepare(`
    SELECT terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
      marketing_consent, marketing_consent_at, source
    FROM consent_records
    WHERE lower(email) = lower(?)
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(email).first();

  return {
    termsAccepted: Number(consent?.terms_accepted || 0) === 1,
    termsAcceptedAt: consent?.terms_accepted_at || "",
    privacyAccepted: Number(consent?.privacy_accepted || 0) === 1,
    privacyAcceptedAt: consent?.privacy_accepted_at || "",
    marketingConsent: Number(consent?.marketing_consent || 0) === 1,
    marketingConsentAt: consent?.marketing_consent_at || "",
    source: consent?.source || ""
  };
}

async function getProfile(DB, identity, env = {}) {
  const existing = await DB.prepare(`
    SELECT * FROM profiles
    WHERE email = ?
  `).bind(identity.email).first();

  if (existing) {
    const plan = await getProfilePlan(DB, existing.admin_lifetime_plan_id);
    const eligibleAccess = profileHasEligibleAccess(existing, plan);
    return {
      email: existing.email,
      verifiedName: existing.verified_name || identity.verifiedName,
      displayName: existing.display_name || existing.verified_name || identity.verifiedName || identity.email,
      contactEmail: existing.contact_email || identity.email,
      phone: existing.phone || "",
      communicationPreference: existing.communication_preference || "Email",
      supportNotes: existing.support_notes || "",
      lifetimeAccess: Number(existing.admin_lifetime || 0) === 1,
      customerStatus: existing.admin_customer_status || "Standard",
      currentPlanId: plan?.id || existing.admin_lifetime_plan_id || "",
      currentPlan: plan?.plan_name || existing.admin_customer_status || "Standard",
      currentPlanType: plan?.plan_type || existing.admin_customer_status || "Standard",
      hasEligibleAccess: eligibleAccess,
      microsoftObjectId: existing.microsoft_object_id || identity.objectId || "",
      microsoftTenantId: existing.microsoft_tenant_id || identity.tenantId || "",
      microsoftDisplayName: existing.microsoft_display_name || existing.verified_name || identity.name || "",
      microsoftGivenName: existing.microsoft_given_name || identity.givenName || "",
      microsoftFamilyName: existing.microsoft_family_name || identity.familyName || "",
      microsoftEmail: existing.microsoft_email || identity.email || "",
      microsoftPreferredUsername: existing.microsoft_preferred_username || identity.preferredUsername || identity.email || "",
      microsoftLocale: existing.microsoft_locale || identity.locale || "",
      microsoftJobTitle: existing.microsoft_job_title || identity.jobTitle || "",
      microsoftDepartment: existing.microsoft_department || identity.department || "",
      microsoftCompanyName: existing.microsoft_company_name || identity.companyName || "",
      microsoftMobilePhone: existing.microsoft_mobile_phone || identity.mobilePhone || "",
      microsoftBusinessPhone: existing.microsoft_business_phone || identity.businessPhone || "",
      microsoftCountry: existing.microsoft_country || identity.country || "",
      microsoftPreferredLanguage: existing.microsoft_preferred_language || identity.preferredLanguage || "",
      microsoftOfficeLocation: existing.microsoft_office_location || "",
      microsoftCity: existing.microsoft_city || "",
      microsoftState: existing.microsoft_state || "",
      microsoftPostalCode: existing.microsoft_postal_code || "",
      microsoftStreetAddress: existing.microsoft_street_address || "",
      microsoftPhotoUrl: existing.microsoft_photo_url || identity.photoUrl || "",
      country: existing.microsoft_country || identity.country || countryFromLocale(existing.microsoft_locale || identity.locale || ""),
      photoUrl: existing.microsoft_photo_url || identity.photoUrl || "",
      verificationStatus: existing.microsoft_email || existing.microsoft_object_id ? "Verified" : "Unverified",
      microsoftUpdatedAt: existing.microsoft_updated_at || "",
      graphSyncLastAt: existing.graph_sync_last_at || "",
      graphSyncSuccess: Number(existing.graph_sync_success || 0) === 1,
      graphSyncFailureReason: existing.graph_sync_failure_reason || "",
      graphSyncLastHttpStatus: Number(existing.graph_sync_last_http_status || 0) || 0,
      graphSyncLastRequestId: existing.graph_sync_last_request_id || "",
      graphSyncLastClientRequestId: existing.graph_sync_last_client_request_id || "",
      stripeLinked: Boolean(existing.stripe_customer_id),
      stripeCustomerCreatedAt: existing.stripe_customer_created_at || "",
      stripeCustomerSyncedAt: existing.stripe_customer_synced_at || "",
      createdAt: existing.created_at,
      updatedAt: existing.updated_at
    };
  }

  const nowProfile = {
    email: identity.email,
    verifiedName: identity.verifiedName,
    displayName: identity.verifiedName || identity.email,
    contactEmail: identity.email,
    phone: "",
    communicationPreference: "Email",
    supportNotes: "",
    lifetimeAccess: false,
    customerStatus: "Standard",
    currentPlanId: "",
    currentPlan: "Standard",
    currentPlanType: "Standard",
    hasEligibleAccess: false,
    microsoftObjectId: identity.objectId || "",
    microsoftTenantId: identity.tenantId || "",
    microsoftDisplayName: identity.name || identity.verifiedName || "",
    microsoftGivenName: identity.givenName || "",
    microsoftFamilyName: identity.familyName || "",
    microsoftEmail: identity.email || "",
    microsoftPreferredUsername: identity.preferredUsername || identity.email || "",
    microsoftLocale: identity.locale || "",
    microsoftJobTitle: identity.jobTitle || "",
    microsoftDepartment: identity.department || "",
    microsoftCompanyName: identity.companyName || "",
    microsoftMobilePhone: identity.mobilePhone || "",
    microsoftBusinessPhone: identity.businessPhone || "",
    microsoftCountry: identity.country || "",
    microsoftPreferredLanguage: identity.preferredLanguage || "",
    microsoftOfficeLocation: "",
    microsoftCity: "",
    microsoftState: "",
    microsoftPostalCode: "",
    microsoftStreetAddress: "",
    microsoftPhotoUrl: identity.photoUrl || "",
    country: identity.country || countryFromLocale(identity.locale || ""),
    photoUrl: identity.photoUrl || "",
    verificationStatus: identity.email ? "Verified" : "Unverified",
    microsoftUpdatedAt: "",
    graphSyncLastAt: "",
    graphSyncSuccess: false,
    graphSyncFailureReason: "",
    graphSyncLastHttpStatus: 0,
    graphSyncLastRequestId: "",
    graphSyncLastClientRequestId: "",
    stripeLinked: false,
    stripeCustomerCreatedAt: "",
    stripeCustomerSyncedAt: "",
    createdAt: null,
    updatedAt: null
  };

  await DB.prepare(`
    INSERT INTO profiles (
      email,
      verified_name,
      display_name,
      contact_email,
      phone,
      communication_preference,
      support_notes,
      microsoft_object_id,
      microsoft_tenant_id,
      microsoft_display_name,
      microsoft_given_name,
      microsoft_family_name,
      microsoft_email,
      microsoft_preferred_username,
      microsoft_locale,
      microsoft_job_title,
      microsoft_department,
      microsoft_company_name,
      microsoft_mobile_phone,
      microsoft_business_phone,
      microsoft_country,
      microsoft_preferred_language,
      microsoft_office_location,
      microsoft_city,
      microsoft_state,
      microsoft_postal_code,
      microsoft_street_address,
      microsoft_photo_url,
      microsoft_updated_at,
      graph_sync_last_at,
      graph_sync_success,
      graph_sync_failure_reason,
      graph_sync_last_http_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nowProfile.email,
    nowProfile.verifiedName,
    nowProfile.displayName,
    nowProfile.contactEmail,
    nowProfile.phone,
    nowProfile.communicationPreference,
    nowProfile.supportNotes,
    identity.objectId || "",
    identity.tenantId || "",
    identity.name || identity.verifiedName || identity.email,
    identity.givenName || "",
    identity.familyName || "",
    identity.email || "",
    identity.preferredUsername || identity.email || "",
    identity.locale || "",
    identity.jobTitle || "",
    identity.department || "",
    identity.companyName || "",
    identity.mobilePhone || "",
    identity.businessPhone || "",
    identity.country || "",
    identity.preferredLanguage || "",
    "",
    "",
    "",
    "",
    "",
    identity.photoUrl || "",
    new Date().toISOString(),
    new Date().toISOString(),
    0,
    null,
    0
  ).run();

  await notifyCustomerSignup(DB, env, identity, nowProfile).catch(() => {});

  await ensureStripeCustomer(DB, env, identity, nowProfile).catch(() => {});

  return getProfile(DB, identity, env);
}

async function getProfilePlan(DB, planId) {
  if (!planId) return null;
  try {
    return await DB.prepare(`SELECT id, plan_name, plan_type FROM service_plans WHERE id = ?`).bind(planId).first();
  } catch {
    return null;
  }
}

async function saveProfile(DB, identity, body, request, env = {}) {
  await ensureProfileTable(DB);

  const current = await getProfile(DB, identity, env);

  const updated = {
    displayName: clean(body.displayName, 120) || current.displayName || identity.verifiedName || identity.email,
    contactEmail: clean(body.contactEmail, 180) || current.contactEmail || identity.email,
    phone: clean(body.phone, 80),
    communicationPreference: clean(body.communicationPreference, 80) || "Email",
    supportNotes: clean(body.supportNotes, 1000),
    microsoftGivenName: clean(body.givenName, 120) || current.microsoftGivenName || identity.givenName || "",
    microsoftFamilyName: clean(body.familyName, 120) || current.microsoftFamilyName || identity.familyName || "",
    microsoftPreferredLanguage: clean(body.preferredLanguage, 40) || current.microsoftPreferredLanguage || identity.preferredLanguage || "",
    microsoftMobilePhone: clean(body.mobilePhone, 80) || current.microsoftMobilePhone || identity.mobilePhone || "",
    microsoftOfficeLocation: clean(body.officeLocation, 120) || current.microsoftOfficeLocation || "",
    microsoftCity: clean(body.city, 120) || current.microsoftCity || "",
    microsoftState: clean(body.state, 120) || current.microsoftState || "",
    microsoftCountry: clean(body.country, 120) || current.microsoftCountry || identity.country || "",
    microsoftPostalCode: clean(body.postalCode, 40) || current.microsoftPostalCode || "",
    microsoftStreetAddress: clean(body.streetAddress, 240) || current.microsoftStreetAddress || "",
    microsoftCompanyName: clean(body.companyName || body.company, 180) || current.microsoftCompanyName || identity.companyName || "",
    microsoftMail: clean(body.email, 254) || current.microsoftEmail || identity.email || ""
  };
  const locale = identity.locale || current.microsoftLocale || "";

  await DB.prepare(`
    INSERT INTO profiles (
      email,
      verified_name,
      display_name,
      contact_email,
      phone,
      communication_preference,
      support_notes,
      microsoft_object_id,
      microsoft_tenant_id,
      microsoft_display_name,
      microsoft_given_name,
      microsoft_family_name,
      microsoft_email,
      microsoft_preferred_username,
      microsoft_locale,
      microsoft_job_title,
      microsoft_department,
      microsoft_company_name,
      microsoft_mobile_phone,
      microsoft_business_phone,
      microsoft_country,
      microsoft_preferred_language,
      microsoft_office_location,
      microsoft_city,
      microsoft_state,
      microsoft_postal_code,
      microsoft_street_address,
      microsoft_photo_url,
      microsoft_updated_at,
      graph_sync_last_at,
      graph_sync_success,
      graph_sync_failure_reason,
      graph_sync_last_http_status,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      verified_name = excluded.verified_name,
      display_name = excluded.display_name,
      contact_email = excluded.contact_email,
      phone = excluded.phone,
      communication_preference = excluded.communication_preference,
      support_notes = excluded.support_notes,
      microsoft_object_id = COALESCE(profiles.microsoft_object_id, excluded.microsoft_object_id),
      microsoft_tenant_id = COALESCE(profiles.microsoft_tenant_id, excluded.microsoft_tenant_id),
      microsoft_display_name = COALESCE(NULLIF(excluded.display_name, ''), profiles.microsoft_display_name),
      microsoft_given_name = COALESCE(NULLIF(excluded.microsoft_given_name, ''), profiles.microsoft_given_name),
      microsoft_family_name = COALESCE(NULLIF(excluded.microsoft_family_name, ''), profiles.microsoft_family_name),
      microsoft_email = COALESCE(profiles.microsoft_email, excluded.microsoft_email),
      microsoft_preferred_username = COALESCE(profiles.microsoft_preferred_username, excluded.microsoft_preferred_username),
      microsoft_locale = COALESCE(profiles.microsoft_locale, excluded.microsoft_locale),
      microsoft_job_title = COALESCE(profiles.microsoft_job_title, excluded.microsoft_job_title),
      microsoft_department = COALESCE(profiles.microsoft_department, excluded.microsoft_department),
      microsoft_company_name = COALESCE(NULLIF(excluded.microsoft_company_name, ''), profiles.microsoft_company_name),
      microsoft_mobile_phone = COALESCE(NULLIF(excluded.microsoft_mobile_phone, ''), profiles.microsoft_mobile_phone),
      microsoft_business_phone = COALESCE(profiles.microsoft_business_phone, excluded.microsoft_business_phone),
      microsoft_country = COALESCE(NULLIF(excluded.microsoft_country, ''), profiles.microsoft_country),
      microsoft_preferred_language = COALESCE(NULLIF(excluded.microsoft_preferred_language, ''), profiles.microsoft_preferred_language),
      microsoft_office_location = COALESCE(NULLIF(excluded.microsoft_office_location, ''), profiles.microsoft_office_location),
      microsoft_city = COALESCE(NULLIF(excluded.microsoft_city, ''), profiles.microsoft_city),
      microsoft_state = COALESCE(NULLIF(excluded.microsoft_state, ''), profiles.microsoft_state),
      microsoft_postal_code = COALESCE(NULLIF(excluded.microsoft_postal_code, ''), profiles.microsoft_postal_code),
      microsoft_street_address = COALESCE(NULLIF(excluded.microsoft_street_address, ''), profiles.microsoft_street_address),
      microsoft_photo_url = COALESCE(profiles.microsoft_photo_url, excluded.microsoft_photo_url),
      microsoft_updated_at = COALESCE(profiles.microsoft_updated_at, excluded.microsoft_updated_at),
      graph_sync_last_at = COALESCE(profiles.graph_sync_last_at, excluded.graph_sync_last_at),
      graph_sync_success = COALESCE(profiles.graph_sync_success, excluded.graph_sync_success),
      graph_sync_failure_reason = COALESCE(profiles.graph_sync_failure_reason, excluded.graph_sync_failure_reason),
      graph_sync_last_http_status = COALESCE(profiles.graph_sync_last_http_status, excluded.graph_sync_last_http_status),
      updated_at = CURRENT_TIMESTAMP
    `).bind(
    identity.email,
    updated.displayName,
    updated.displayName,
    updated.contactEmail,
    updated.phone,
    updated.communicationPreference,
    updated.supportNotes,
    identity.objectId || "",
    identity.tenantId || "",
    updated.displayName,
    updated.microsoftGivenName,
    updated.microsoftFamilyName,
    identity.email || "",
    identity.preferredUsername || identity.email || "",
    locale,
    identity.jobTitle || "",
    identity.department || "",
    updated.microsoftCompanyName,
    updated.microsoftMobilePhone || identity.mobilePhone || "",
    identity.businessPhone || "",
    updated.microsoftCountry || identity.country || "",
    updated.microsoftPreferredLanguage || identity.preferredLanguage || "",
    updated.microsoftOfficeLocation || "",
    updated.microsoftCity || "",
    updated.microsoftState || "",
    updated.microsoftPostalCode || "",
    updated.microsoftStreetAddress || "",
    identity.photoUrl || "",
    new Date().toISOString(),
    new Date().toISOString(),
    0,
    null,
    0
  ).run();

  const graphSync = await patchMicrosoftGraphProfile(DB, request, env, identity, updated).catch((error) => ({
    ok: false,
    status: 0,
    reason: error instanceof Error ? error.message : "Microsoft Graph update failed."
  }));

  if (graphSync?.ok) {
    await DB.prepare(`
      UPDATE profiles
      SET microsoft_display_name = COALESCE(NULLIF(?, ''), microsoft_display_name),
        microsoft_given_name = COALESCE(NULLIF(?, ''), microsoft_given_name),
        microsoft_family_name = COALESCE(NULLIF(?, ''), microsoft_family_name),
        microsoft_preferred_language = COALESCE(NULLIF(?, ''), microsoft_preferred_language),
        microsoft_mobile_phone = COALESCE(NULLIF(?, ''), microsoft_mobile_phone),
        microsoft_office_location = COALESCE(NULLIF(?, ''), microsoft_office_location),
        microsoft_city = COALESCE(NULLIF(?, ''), microsoft_city),
        microsoft_state = COALESCE(NULLIF(?, ''), microsoft_state),
        microsoft_country = COALESCE(NULLIF(?, ''), microsoft_country),
        microsoft_postal_code = COALESCE(NULLIF(?, ''), microsoft_postal_code),
        microsoft_street_address = COALESCE(NULLIF(?, ''), microsoft_street_address),
        microsoft_company_name = COALESCE(NULLIF(?, ''), microsoft_company_name),
        microsoft_updated_at = CURRENT_TIMESTAMP,
        graph_sync_last_at = CURRENT_TIMESTAMP,
        graph_sync_success = 1,
        graph_sync_failure_reason = NULL,
        graph_sync_last_http_status = ?,
        graph_sync_last_request_id = ?,
        graph_sync_last_client_request_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE lower(email) = lower(?)
    `).bind(
      updated.displayName,
      updated.microsoftGivenName,
      updated.microsoftFamilyName,
      updated.microsoftPreferredLanguage,
      updated.microsoftMobilePhone,
      updated.microsoftOfficeLocation,
      updated.microsoftCity,
      updated.microsoftState,
      updated.microsoftCountry,
      updated.microsoftPostalCode,
      updated.microsoftStreetAddress,
      updated.microsoftCompanyName,
      graphSync.status || 200,
      graphSync.requestId || "",
      graphSync.clientRequestId || "",
      identity.email
    ).run();
  } else {
    await DB.prepare(`
      UPDATE profiles
      SET graph_sync_last_at = CURRENT_TIMESTAMP,
        graph_sync_success = 0,
        graph_sync_failure_reason = ?,
        graph_sync_last_http_status = ?,
        graph_sync_last_request_id = ?,
        graph_sync_last_client_request_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE lower(email) = lower(?)
    `).bind(
      clean(graphSync.reason || "Microsoft Graph update failed.", 1000),
      graphSync.status || 0,
      graphSync.requestId || "",
      graphSync.clientRequestId || "",
      identity.email
    ).run();
  }

  if ([body.termsAccepted, body.privacyAccepted, body.marketingConsent].some((value) => typeof value === "boolean")) {
    const previous = await getLatestConsent(DB, identity.email);
    await storeConsent(DB, {
      email: identity.email,
      source: "account-profile",
      termsAccepted: typeof body.termsAccepted === "boolean" ? body.termsAccepted : Boolean(previous.termsAccepted),
      privacyAccepted: typeof body.privacyAccepted === "boolean" ? body.privacyAccepted : Boolean(previous.privacyAccepted),
      marketingConsent: typeof body.marketingConsent === "boolean" ? body.marketingConsent : Boolean(previous.marketingConsent),
      ipHash: await hashValue(request.headers.get("cf-connecting-ip") || ""),
      userAgent: clean(request.headers.get("user-agent") || "", 500)
    });
  }

  await ensureStripeCustomer(DB, env, identity, current).catch(() => {});

  return getProfile(DB, identity, env);
}

async function storeConsent(DB, consent) {
  await ensureConsentTable(DB);

  const now = new Date().toISOString();
  await DB.prepare(`
    INSERT INTO consent_records (
      id, email, source, reference, terms_accepted, terms_version, terms_accepted_at,
      privacy_accepted, privacy_version, privacy_accepted_at, marketing_consent,
      marketing_consent_at, ip_hash, user_agent
    ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    consent.email,
    consent.source,
    consent.termsAccepted ? 1 : 0,
    "1.0",
    consent.termsAccepted ? now : null,
    consent.privacyAccepted ? 1 : 0,
    "1.0",
    consent.privacyAccepted ? now : null,
    consent.marketingConsent ? 1 : 0,
    consent.marketingConsent ? now : null,
    consent.ipHash || "",
    consent.userAgent || ""
  ).run();
}

async function hashValue(value) {
  if (!value) return "";
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function countryFromLocale(locale) {
  const value = String(locale || "").trim().toLowerCase();
  if (value === "en-gb" || value.endsWith("-gb")) return "United Kingdom";
  if (value === "en-us" || value.endsWith("-us")) return "United States";
  return "";
}

async function ensureStripeCustomer(DB, env, identity, profile) {
  if (!env.STRIPE_SECRET_KEY) return null;

  const current = await DB.prepare(`
    SELECT stripe_customer_id, stripe_customer_synced_at
    FROM profiles
    WHERE lower(email) = lower(?)
  `).bind(identity.email).first();

  if (current?.stripe_customer_id && current.stripe_customer_synced_at) {
    return current.stripe_customer_id;
  }

  const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      email: profile.contactEmail || identity.email,
      name: profile.displayName || profile.verifiedName || identity.verifiedName || identity.email,
      "metadata[service_line]": "Sousa Murray Planeia",
      "metadata[customer_email]": identity.email,
      "metadata[profile_email]": profile.contactEmail || identity.email
    }).toString()
  });

  const payload = await customerResponse.json().catch(() => ({}));
  if (!customerResponse.ok || !payload.id) {
    throw new Error(payload?.error?.message || "Stripe customer provisioning failed.");
  }

  await DB.prepare(`
    UPDATE profiles
    SET stripe_customer_id = ?,
      stripe_customer_created_at = COALESCE(stripe_customer_created_at, CURRENT_TIMESTAMP),
      stripe_customer_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE lower(email) = lower(?)
  `).bind(payload.id, identity.email).run();

  return payload.id;
}

export async function onRequest(context) {
  const { request, env } = context;
  let identity = { email: "", objectId: "" };
  let stage = { number: 1, name: "middleware complete" };
  const setStage = (number, name) => {
    stage = { number, name };
    console.log(JSON.stringify({
      event: "profile_request_stage",
      stage_number: number,
      stage: name,
      customer_email: identity.email || "",
      user_object_id: identity.objectId || ""
    }));
  };

  try {
    setStage(1, "middleware complete");
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (!env.DB) throw new Error("Profile database binding DB is missing.");

    identity = getAccessIdentity(request);
    if (!identity.email) return json({ success: false, stage: "load session", error: "Not signed in." }, 401);

    if (request.method === "GET") {
      setStage(2, "load session");
      const session = await getCurrentCustomerSession(env.DB, request);

      setStage(3, "read D1 profile");
      await ensureProfileTable(env.DB);
      const existing = await getProfile(env.DB, identity, env);

      const graphSync = await loadMicrosoftGraphProfile(env.DB, request, env, identity, session, setStage);
      setStage(7, "update D1 profile");
      // D1 is authoritative for customer-edited profile fields. Microsoft Graph can
      // be eventually consistent after PATCH /me; copying an older /me response
      // back into D1 here made freshly saved names appear to revert. GET records
      // Graph health only. Sign-in bootstrap and explicit POST keep the stores in
      // sync without allowing a delayed Graph read to undo a customer change.
      await updateGraphProfile(env.DB, identity, graphSync, null);

      const profile = await getProfile(env.DB, identity, env);
      await ensureStripeCustomer(env.DB, env, identity, profile).catch(() => {});
      if (!wantsJson(request)) return context.next();

      const consent = await getLatestConsent(env.DB, identity.email);
      const refreshedProfile = await getProfile(env.DB, identity, env);
      setStage(8, "return JSON");
      return json({ success: true, profile: refreshedProfile, consent });
    }

    if (request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      setStage(3, "read and update D1 profile");
      const profile = await saveProfile(env.DB, identity, body, request, env);
      const consent = await getLatestConsent(env.DB, identity.email);
      setStage(8, "return JSON");
      return json({ success: true, profile, consent, saved: true });
    }

    return json({ success: false, stage: "request method", error: "Method not allowed." }, 405);
  } catch (error) {
    const exception = error instanceof Error ? error : new Error(String(error || "Unknown profile error"));
    console.error(JSON.stringify({
      event: "profile_request_exception",
      stage_number: stage.number,
      stage: stage.name,
      exception_name: exception.name,
      exception_message: exception.message,
      stack_trace: exception.stack || "",
      line_number: (exception.stack || "").match(/profile\.js:(\d+):\d+/)?.[1] || "",
      customer_email: identity.email || "",
      user_object_id: identity.objectId || ""
    }));
    return json({ success: false, stage: stage.name, error: exception.message || "Profile request failed." }, exception.status || 500);
  }
}
