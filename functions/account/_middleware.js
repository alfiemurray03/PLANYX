import { enforceCustomerAge } from "../_shared/age-gate-middleware.js";
import { getNativeSession } from "../_shared/oidc.js";
import { closePlanyxSession } from "../_shared/connected-sessions.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, "") || "/";

  if (path === "/account/logout") {
    const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
    if (identity) {
      await closePlanyxSession(context.env, identity, "Customer signed out of Planyx.").catch(error => {
        console.error(JSON.stringify({
          event: "planyx_connected_session_close_failed",
          message: error instanceof Error ? error.message : "The central session could not be closed."
        }));
      });
    }
    return context.next();
  }

  if (["/account/login", "/account/auth/callback"].includes(path)) return context.next();
  return enforceCustomerAge(context);
}
