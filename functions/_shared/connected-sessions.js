function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function baseUrl(env) {
  const value = clean(env.CUSTOMEROPS_BASE_URL || 'https://customerops.jagroupservices.co.uk', 500).replace(/\/$/, '');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('CUSTOMEROPS_BASE_URL must use HTTPS.');
  }
  return url.origin;
}

function apiKey(env) {
  const value = clean(env.CUSTOMEROPS_API_KEY, 500);
  if (value.length < 20) throw Object.assign(new Error('The secure CustomerOps connector is not configured.'), { code: 'CUSTOMEROPS_NOT_CONFIGURED' });
  return value;
}

async function requestCustomerOps(env, path, init = {}, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 8_000));
  try {
    const response = await fetch(`${baseUrl(env)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey(env)}`,
        Accept: 'application/json',
        'User-Agent': 'Sousa Murray Planeia-Connected-Sessions/1.0',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (options.allow404 && response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(clean(payload?.error?.message || payload?.message || `CustomerOps returned HTTP ${response.status}.`, 1000));
      error.code = clean(payload?.error?.code || payload?.code || 'CUSTOMEROPS_REQUEST_FAILED', 120);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('CustomerOps did not respond within the session-control timeout.'), { code: 'CUSTOMEROPS_TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function browserName(userAgent) {
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/Firefox\//i.test(userAgent)) return 'Mozilla Firefox';
  if (/Chrome|CriOS/i.test(userAgent)) return 'Google Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Web browser';
}

function operatingSystem(userAgent) {
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS or iPadOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown operating system';
}

function clientDetails(request) {
  const userAgent = clean(request.headers.get('User-Agent'), 500);
  const browser = browserName(userAgent);
  const os = operatingSystem(userAgent);
  const category = /iPad|Tablet/i.test(userAgent) ? 'tablet'
    : /Mobi|iPhone|Android/i.test(userAgent) ? 'mobile' : 'computer';
  const cf = request.cf || {};
  return {
    device: {
      category,
      name: `${browser} on ${os}`,
      browser,
      operatingSystem: os,
      userAgentSummary: `${browser} · ${os} · ${category}`,
    },
    location: {
      countryCode: clean(cf.country || request.headers.get('CF-IPCountry'), 8),
      countryName: clean(cf.country || request.headers.get('CF-IPCountry'), 100),
      region: clean(cf.region, 120),
      city: clean(cf.city, 120),
    },
  };
}

async function profileReference(DB, identity) {
  const profile = await DB.prepare(`SELECT universal_customer_number,planyx_account_id,microsoft_object_id,microsoft_tenant_id
    FROM profiles WHERE lower(email)=lower(?) OR (?<>'' AND microsoft_object_id=?)
    ORDER BY CASE WHEN lower(email)=lower(?) THEN 0 ELSE 1 END LIMIT 1`)
    .bind(identity.email, identity.objectId || '', identity.objectId || '', identity.email).first();
  return {
    customerNumber: clean(profile?.universal_customer_number, 40) || undefined,
    platformCustomerId: clean(profile?.planyx_account_id, 180) || undefined,
    tenantId: clean(identity.tenantId || profile?.microsoft_tenant_id, 120) || undefined,
    objectId: clean(identity.objectId || profile?.microsoft_object_id || identity.subject, 180) || undefined,
  };
}

async function localSessionTimes(DB, identity) {
  const row = await DB.prepare(`SELECT created_at,last_seen_at,absolute_expires_at
    FROM customer_oidc_sessions WHERE token_hash=? AND revoked_at IS NULL LIMIT 1`)
    .bind(identity.tokenHash).first();
  const now = new Date().toISOString();
  return {
    startedAt: row?.created_at || now,
    lastSeenAt: row?.last_seen_at || now,
    expiresAt: row?.absolute_expires_at || null,
  };
}

export function externalSessionReference(identity) {
  return identity?.tokenHash ? `plx-${identity.tokenHash}` : '';
}

export async function registerPlanyxSession(env, DB, request, identity) {
  if (!identity?.tokenHash || !DB) return null;
  const [customer, times] = await Promise.all([
    profileReference(DB, identity),
    localSessionTimes(DB, identity),
  ]);
  return requestCustomerOps(env, '/api/platform/sessions', {
    method: 'POST',
    body: JSON.stringify({
      customer,
      session: {
        externalSessionId: externalSessionReference(identity),
        status: 'active',
        ...times,
        lastSeenAt: new Date().toISOString(),
        ...clientDetails(request),
        metadata: {
          service: 'Sousa Murray Planeia',
          source: 'planyx_customer_security_heartbeat',
        },
      },
    }),
  });
}

export async function closePlanyxSession(env, identity, reason = 'Customer signed out of Sousa Murray Planeia.') {
  const reference = externalSessionReference(identity);
  if (!reference) return null;
  return requestCustomerOps(env, `/api/platform/sessions/${encodeURIComponent(reference)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason: clean(reason, 500) }),
  }, { allow404: true });
}
