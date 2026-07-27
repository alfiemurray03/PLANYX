import { loadContactServiceStatus } from "../../_shared/contact-service-status.js";
import { ensureCsmCustomerAccount } from "../../_shared/csm-customer.js";
import { syncAtlassianSupportRequest } from "../../_shared/atlassian-support.js";
import { onRequest as handleSupportRequest } from "./[[path]].js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie"
    }
  });
}

function clean(value, max = 4_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function authenticatedCustomer(request) {
  const email = clean(request.headers.get("x-ja-auth-email"), 254).toLowerCase();
  const name = clean(request.headers.get("x-ja-auth-name") || email, 160);
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    name
  };
}

async function addAtlassianTicket(context, response, submittedBody) {
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.success || !payload?.reference) return response;

  const customer = authenticatedCustomer(context.request);
  // Public and signed-out enquiries remain in the existing Planyx/Teams route.
  // Only a validated customer session may be used for raiseOnBehalfOf.
  if (!customer.email) return response;

  try {
    await ensureCsmCustomerAccount(context.env, {
      email: customer.email,
      displayName: customer.name
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_csm_customer_provision_failed",
      customer_email: customer.email,
      error_code: clean(error?.code || "ATLASSIAN_CSM_CUSTOMER_FAILED", 120),
      http_status: Number(error?.status || 500)
    }));
    // Continue so the existing Planyx enquiry and Atlassian delivery record are
    // preserved with a retryable failure rather than losing the customer request.
  }

  const localReference = clean(payload.reference, 120);
  const atlassian = await syncAtlassianSupportRequest({
    env: context.env,
    DB: context.env.DB,
    localReference,
    enquiry: {
      customerEmail: customer.email,
      customerName: customer.name,
      subject: clean(submittedBody.subject, 255),
      message: clean(submittedBody.message, 28_000),
      category: clean(submittedBody.category, 120),
      priority: clean(submittedBody.priority, 40),
      source: clean(submittedBody.enquiryType, 160) || "Planyx Support Assistant",
      requestKind: clean(submittedBody.atlassianRequestKind || submittedBody.requestKind, 40)
    }
  });

  if (atlassian.status === "created" && atlassian.issueKey) {
    return json({
      ...payload,
      reference: atlassian.issueKey,
      planyxReference: localReference,
      atlassianReference: atlassian.issueKey,
      atlassianStatus: "created",
      atlassianRequestKind: atlassian.requestKind,
      atlassianPortalUrl: atlassian.portalUrl || undefined,
      message: payload.duplicate
        ? `This support request has already been received as ${atlassian.issueKey}.`
        : `Your support request has been created as ${atlassian.issueKey}.`
    }, response.status);
  }

  return json({
    ...payload,
    planyxReference: localReference,
    atlassianStatus: atlassian.status,
    atlassianRequestKind: atlassian.requestKind,
    // The original Planyx enquiry remains valid and routed to the team even if
    // Atlassian is temporarily unavailable. A later retry can reuse the local reference.
    message: payload.message
  }, response.status);
}

export async function onRequest(context) {
  let submittedBody = {};
  if (context.request.method === "POST") {
    const contact = await loadContactServiceStatus(context.env.DB);
    if (!contact.available) {
      return json({
        success: false,
        contactUnavailable: true,
        contactPageStatus: contact.status,
        error: contact.message || "Online Contact Enquiries are currently unavailable."
      }, 503);
    }
    submittedBody = await context.request.clone().json().catch(() => ({}));
  }

  const response = await handleSupportRequest(context);
  if (context.request.method !== "POST" || !response.ok) return response;

  try {
    return await addAtlassianTicket(context, response, submittedBody);
  } catch (error) {
    console.error(JSON.stringify({
      event: "atlassian_support_response_enrichment_failed",
      message: clean(error?.message || error, 200)
    }));
    // Never lose a successfully stored Planyx enquiry because an external API failed.
    return response;
  }
}
