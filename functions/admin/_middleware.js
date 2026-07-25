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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/admin/api" && url.searchParams.get("section") === "customer") {
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

  return context.next();
}
