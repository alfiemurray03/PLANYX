/**
 * GET /api/admin/auth/diagnostics
 *
 * Returns Microsoft OIDC configuration status and current session info
 * for the admin portal diagnostics panel.
 *
 * No secrets are exposed — only presence/absence of configuration is shown.
 */
import type { Request, Response } from 'express';
import { requireAdminSession } from '../../_admin-session.js';
import { getSecret } from '#airo/secrets';
import { ADMIN_OIDC_CLIENT_ID, ADMIN_OIDC_TENANT_ID } from '../oidc/_client.js';

export default async function handler(req: Request, res: Response) {
  const hasCookie   = !!req.cookies?.ja_admin_session;
  const identity    = await requireAdminSession(req);
  const hasSecret   = !!String(getSecret('ADMIN_OIDC_CLIENT_SECRET') ?? '');

  return res.json({
    success: true,
    auth: {
      hasCookie,
      sessionValid:  !!identity,
      authMethod:    'microsoft_oidc',
      operator:      'JA Group Services Ltd',
      admin: identity ? {
        email:  identity.email,
        name:   identity.name,
        roles:  identity.roles,
        tid:    identity.tid,
      } : null,
    },
    microsoftOidc: {
      tenantId:          ADMIN_OIDC_TENANT_ID,
      clientId:          ADMIN_OIDC_CLIENT_ID,
      clientSecretSet:   hasSecret,
      redirectUri:       'https://sousamurrayplaneia.jagroupservices.co.uk/auth/admin/oidc/callback',
      discoveryEndpoint: `https://login.microsoftonline.com/${ADMIN_OIDC_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      tenantName:        'JA Group Services Ltd',
    },
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  });
}
