import { syncPlaneiaCentralBilling } from "./_shared/central-payments.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const centralReturn = url.searchParams.get("central_payment");
  if (centralReturn !== "success") return context.next();

  const email = String(context.request.headers.get("x-ja-auth-email") || "").trim().toLowerCase();
  if (context.env.DB && email) {
    await syncPlaneiaCentralBilling(context.env, context.env.DB, email).catch(error => {
      console.error(JSON.stringify({
        event: "planeia_central_payment_return_sync_failed",
        email,
        message: error instanceof Error ? error.message : String(error),
      }));
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/account/membership/?payment=success",
      "Cache-Control": "no-store",
    },
  });
}
