/**
 * Shared openid-client Issuer + Client singleton.
 * Discovered lazily on first use so startup is not blocked.
 *
 * This is a **server-side confidential** OIDC client.
 * The client secret is read from server secrets and never sent to the browser.
 *
 * Microsoft Entra External ID (CIAM) note
 * ─────────────────────────────────────────
 * CIAM tenants do NOT support the /common multi-tenant discovery endpoint.
 * The discovery URL must use the tenant-specific base:
 *
 *   https://<subdomain>.ciamlogin.com/<tenantId>/v2.0/.well-known/openid-configuration
 *
 * We derive this from OIDC_AUTHORITY by:
 *   1. Extracting the hostname (e.g. jagroupservicescustomerhub.ciamlogin.com)
 *   2. Using the OIDC_CLIENT_ID's tenant ID (643abcb7-…) from the authority path,
 *      OR falling back to the OIDC_TENANT_ID secret if set.
 *
 * The OIDC_AUTHORITY value "https://jagroupservicescustomerhub.ciamlogin.com/common"
 * is used only to derive the hostname — the /common path is replaced with the tenant ID.
 */
import { Issuer, type Client } from 'openid-client';
import { getSecret } from '#airo/secrets';

let _client: Client | null = null;
let _discovering = false;
let _queue: Array<{ resolve: (c: Client) => void; reject: (e: unknown) => void }> = [];

/** Hard-coded tenant ID for Sousa Murray Planeia's Entra External ID tenant. */
const TENANT_ID = '643abcb7-2f0d-4e72-a193-47ff1a0e63e1';

/**
 * Build the correct CIAM discovery URL.
 *
 * Microsoft Entra External ID (CIAM) requires the tenant-specific endpoint:
 *   https://<subdomain>.ciamlogin.com/<tenantId>/v2.0/.well-known/openid-configuration
 *
 * The /common endpoint returns HTTP 400 for CIAM tenants.
 */
function buildDiscoveryUrl(): string {
  const authority = (String(getSecret('OIDC_AUTHORITY') ?? '')).replace(/\/+$/, '');

  // Extract the hostname from the authority URL
  let hostname: string;
  try {
    hostname = new URL(authority).hostname; // e.g. jagroupservicescustomerhub.ciamlogin.com
  } catch {
    hostname = 'jagroupservicescustomerhub.ciamlogin.com';
  }

  return `https://${hostname}/${TENANT_ID}/v2.0/.well-known/openid-configuration`;
}

export async function getOidcClient(): Promise<Client> {
  if (_client) return _client;

  if (_discovering) {
    return new Promise((resolve, reject) => {
      _queue.push({ resolve, reject });
    });
  }

  _discovering = true;
  try {
    const clientId    = String(getSecret('OIDC_CLIENT_ID') ?? '');
    const secret      = String(getSecret('OIDC_CLIENT_SECRET') ?? '');
    const redirectUri = String(getSecret('OIDC_REDIRECT_URI') ?? '');

    const discoveryUrl = buildDiscoveryUrl();
    console.log('oidc.client: discovering from', discoveryUrl);

    const issuer = await Issuer.discover(discoveryUrl);
    console.log('oidc.client: discovered issuer', issuer.issuer);

    _client = new issuer.Client({
      client_id:                  clientId,
      client_secret:              secret,
      redirect_uris:              [redirectUri],
      response_types:             ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    });

    // Flush queue
    for (const { resolve } of _queue) resolve(_client);
    _queue = [];
    _discovering = false;
    return _client;
  } catch (err) {
    _discovering = false;
    _client = null;
    console.error('oidc.client: discovery failed', err);
    for (const { reject } of _queue) reject(err);
    _queue = [];
    throw err;
  }
}
