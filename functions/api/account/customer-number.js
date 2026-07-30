import { assertSameOrigin, getNativeSession } from "../../_shared/oidc.js";
import { getCustomerOpsConnection, syncCustomerWithHeadOffice } from "../../_shared/customerops.js";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function authenticatedCustomer(context) {
  const identity = await getNativeSession(context.request, context.env, "customer").catch(() => null);
  if (!identity?.email) return { response: json({ success: false, code: "NOT_SIGNED_IN", error: "Please sign in to continue." }, 401) };
  if (!context.env.DB) return { response: json({ success: false, code: "DATABASE_UNAVAILABLE", error: "Customer records are temporarily unavailable." }, 503) };

  // Customer access, including any age requirement, has already been decided by
  // Head Office in the customer middleware. Do not consult the retired local
  // date-of-birth eligibility record here.
  return { identity };
}

export async function onRequestGet(context) {
  const auth = await authenticatedCustomer(context);
  if (auth.response) return auth.response;

  const connection = await getCustomerOpsConnection(context.env.DB, auth.identity.email);
  return json({ success: true, connection });
}

export async function onRequestPost(context) {
  const auth = await authenticatedCustomer(context);
  if (auth.response) return auth.response;
  if (!assertSameOrigin(context.request)) {
    return json({ success: false, code: "INVALID_ORIGIN", error: "The request origin was rejected." }, 403);
  }

  const result = await syncCustomerWithHeadOffice(context, auth.identity).catch(error => ({
    ok: false,
    status: "error",
    error: error instanceof Error ? error.message : "CustomerOps connection failed."
  }));

  return json({ success: Boolean(result.ok), result }, result.ok ? 200 : 503);
}
