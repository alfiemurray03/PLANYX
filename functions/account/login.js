import { beginLogin } from "../_shared/oidc.js";
import { backupCustomerOidcTransaction } from "../_shared/oidc-transaction-recovery.js";

export async function onRequestGet(context) {
  try {
    // Customer age assurance is now governed centrally by Head Office after
    // Microsoft has resolved the customer identity and UCN. Do not put the
    // retired Planyx self-declaration page in front of customer sign-in.
    const response = await beginLogin(context, "customer");

    try {
      const backedUp = await backupCustomerOidcTransaction(context.env, response);
      if (!backedUp) {
        console.error(JSON.stringify({
          event: "customer_oidc_transaction_backup_not_created",
          reason: "The redirect state or encrypted transaction cookie was not available."
        }));
      }
    } catch (error) {
      // The encrypted browser cookie remains the primary transaction carrier.
      // A backup write failure must not stop Microsoft sign-in from starting.
      console.error(JSON.stringify({
        event: "customer_oidc_transaction_backup_failed",
        message: error instanceof Error ? error.message : "Unknown transaction backup error"
      }));
    }

    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "customer_oidc_login_start_failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    return new Response("Customer authentication is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
