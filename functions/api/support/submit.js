import { loadContactServiceStatus } from "../../_shared/contact-service-status.js";
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

export async function onRequest(context) {
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
  }

  return handleSupportRequest(context);
}
