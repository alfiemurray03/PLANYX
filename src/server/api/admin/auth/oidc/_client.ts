/**
 * Admin OIDC client — JA Group Services Ltd Microsoft 365 / Entra ID tenant.
 *
 * This is a SEPARATE client from the customer External ID client.
 * It uses the main corporate Entra tenant (not CIAM/External ID).
 *
 * Tenant:    JA Group Services Ltd
 * Tenant ID: 53477196-db21-46d2-8123-00be3d6882da
 * Client ID: b86a6d12-8552-4372-9756-be92cfd41991
 *
 * The client secret is read from ADMIN_OIDC_CLIENT_SECRET and never
 * sent to the browser.
 */
import { Issuer, type Client } from 'openid-client';
import { getSecret } from '#airo/secrets';

// Hard-coded — these are public, non-secret configuration values
export const ADMIN_OIDC_CLIENT_ID = 'b86a6d12-8552-4372-9756-be92cfd41991';
export const ADMIN_OIDC_TENANT_ID = '53477196-db21-46d2-8123-00be3d6882da';

const DISCOVERY_URL =
  `https://login.microsoftonline.com/${ADMIN_OIDC_TENANT_ID}/v2.0/.well-known/openid-configuration`;

/**
 * Build the redirect URI dynamically from the incoming request.
 * Pass `req` from the Express handler so the URI always matches
 * the host the browser is actually on (preview URL, custom domain, etc.).
 * Falls back to the production domain if no request is available.
 */
export function getAdminOidcRedirectUri(req?: { headers: Record<string, string | string[] | undefined>; protocol?: string }): string {
  if (req) {
    const host = (req.headers['x-forwarded-host'] as string | undefined)
      ?? (req.headers['host'] as string | undefined)
      ?? 'planyx.jagroupservices.co.uk';
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)
      ?? req.protocol
      ?? 'https';
    return `${proto}://${host}/auth/admin/oidc/callback`;
  }
  return `https://sousamurrayplaneia.jagroupservices.co.uk/auth/admin/oidc/callback`;
}

let _client: Client | null = null;
let _discovering = false;
let _queue: Array<{ resolve: (c: Client) => void; reject: (e: unknown) => void }> = [];

export async function getAdminOidcClient(): Promise<Client> {
  if (_client) return _client;

  if (_discovering) {
    return new Promise((resolve, reject) => {
      _queue.push({ resolve, reject });
    });
  }

  _discovering = true;
  try {
    const clientSecret = String(getSecret('ADMIN_OIDC_CLIENT_SECRET') ?? '');
    if (!clientSecret) {
      throw new Error('ADMIN_OIDC_CLIENT_SECRET is not configured');
    }

    console.log('admin.oidc.client: discovering from', DISCOVERY_URL);
    const issuer = await Issuer.discover(DISCOVERY_URL);
    console.log('admin.oidc.client: discovered issuer', issuer.issuer);

    // Note: redirect_uris is omitted here — we pass the redirect_uri
    // dynamically at callback time so it works on any host (preview, production).
    _client = new issuer.Client({
      client_id:                  ADMIN_OIDC_CLIENT_ID,
      client_secret:              clientSecret,
      response_types:             ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    });

    for (const { resolve } of _queue) resolve(_client);
    _queue = [];
    _discovering = false;
    return _client;
  } catch (err) {
    _discovering = false;
    _client = null;
    console.error('admin.oidc.client: discovery failed', err);
    for (const { reject } of _queue) reject(err);
    _queue = [];
    throw err;
  }
}
