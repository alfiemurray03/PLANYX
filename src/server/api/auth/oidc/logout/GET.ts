/**
 * GET /auth/logout
 *
 * Clears the local ja_session cookie + DB session row, then redirects the
 * browser to the Microsoft Entra front-channel logout endpoint so the Entra
 * session is also terminated.
 *
 * After Entra completes logout it redirects to OIDC_POST_LOGOUT_REDIRECT_URI
 * (configured as https://sousamurrayplaneia.jagroupservices.co.uk/sign-in).
 */
import type { Request, Response } from 'express';
import { getOidcClient } from '../_client.js';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { ja_sessions } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  // 1. Delete the DB session row
  const token = req.cookies?.ja_session as string | undefined;
  if (token) {
    try {
      await db.delete(ja_sessions).where(eq(ja_sessions.token, token));
    } catch (err) {
      console.error('oidc.logout: db delete session error', err);
    }
  }

  // 2. Clear the session cookie
  res.clearCookie('ja_session', { path: '/' });

  // 3. Build Entra end-session URL
  try {
    const client              = await getOidcClient();
    const postLogoutRedirect  = String(getSecret('OIDC_POST_LOGOUT_REDIRECT_URI') ?? '/sign-in');

    const endSessionUrl = client.endSessionUrl({
      post_logout_redirect_uri: postLogoutRedirect,
    });

    return res.redirect(endSessionUrl);
  } catch (err) {
    // If OIDC client is unavailable just redirect locally
    console.error('oidc.logout: end-session url error', err);
    const postLogoutRedirect = String(getSecret('OIDC_POST_LOGOUT_REDIRECT_URI') ?? '/sign-in');
    return res.redirect(postLogoutRedirect);
  }
}
