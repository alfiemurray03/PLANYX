function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function reconcileCustomerLock(context, url) {
  if (!context.env.DB || url.searchParams.get("section") !== "customer") return;
  const customerEmail = cleanEmail(url.searchParams.get("email"));
  const adminEmail = cleanEmail(context.request.headers.get("x-ja-auth-email"));
  if (!customerEmail || !adminEmail) return;
  try {
    const session = await context.env.DB.prepare(`SELECT id FROM customer_identity_verification_sessions
      WHERE lower(customer_email)=lower(?) AND lower(admin_email)=lower(?)
        AND ended_at IS NULL AND datetime(expires_at)>datetime('now')
      ORDER BY verified_at DESC LIMIT 1`).bind(customerEmail, adminEmail).first();
    if (!session) return;
    await context.env.DB.prepare(`UPDATE customer_identity_verification_locks
      SET cleared_at=CURRENT_TIMESTAMP,cleared_by=?,is_locked=0
      WHERE lower(customer_email)=lower(?) AND cleared_at IS NULL`).bind(adminEmail, customerEmail).run();
  } catch {
    // The compatibility lock table is additive. A missing legacy table must not block CRM access.
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname === "/admin/api" && url.searchParams.get("section") === "customer") {
    if (request.method === "GET") await reconcileCustomerLock(context, url);

    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      const action = String(body?.action || "").trim().toLowerCase();
      if (["admin_pin_override", "override_identity_lock"].includes(action)) {
        return json({
          saved: false,
          error: "This legacy Customer CRM override route has been retired. Use the governed customer-specific verification and supervisor approval workflow.",
          code: "GOVERNED_VERIFICATION_REQUIRED",
          replacement: "/api/admin/customer-verification",
        }, 410);
      }
    }
  }

  return context.next();
}
