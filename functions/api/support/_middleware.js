import { assertSameOrigin, getNativeSession, withIdentity } from "../../_shared/oidc.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isBlockedStatus(value) {
  return ["blocked", "closed", "disabled", "inactive", "suspended"]
    .includes(String(value || "").trim().toLowerCase());
}

function isAnonymousEnquirySubmission(request) {
  const url = new URL(request.url);
  return request.method === "POST" && url.pathname === "/api/support/submit";
}

/**
 * Customer authentication boundary for /api/support/*.
 *
 * New Contact Enquiries may be submitted by signed-in or anonymous visitors.
 * Ticket history, ticket messages and every other support route remain protected
 * by the customer JA Group Services ID session.
 */
export async function onRequest(context) {
  const { env, next } = context;
  let request = withIdentity(context.request, null);
  const publicSubmission = isAnonymousEnquirySubmission(request);

  if (!assertSameOrigin(request)) {
    return json({ success: false, error: "Request origin was rejected." }, 403);
  }

  let identity = null;
  try {
    identity = await getNativeSession(request, env, "customer");
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_customer_session_error",
      message: error instanceof Error ? error.message : String(error)
    }));

    // Anonymous enquiry submission must not depend on customer-session lookup.
    if (!publicSubmission) {
      return json({ success: false, error: "Customer support is temporarily unavailable. Please try again." }, 503);
    }
  }

  if (!identity && !publicSubmission) {
    return json({ success: false, error: "Please sign in to use customer support." }, 401);
  }

  request = withIdentity(request, identity);

  if (identity && env.DB) {
    try {
      const profile = await env.DB
        .prepare("SELECT admin_customer_status FROM profiles WHERE lower(email)=lower(?)")
        .bind(identity.email)
        .first();
      if (isBlockedStatus(profile?.admin_customer_status)) {
        return json({ success: false, error: "Your account is currently suspended. Please contact Sousa Murray Planeia for assistance." }, 403);
      }
    } catch {
      // A newly authenticated customer may not have been provisioned yet.
    }
  }

  return next(request);
}
