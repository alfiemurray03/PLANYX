export async function onRequestGet({ env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff"
  };

  if (!env.DB) {
    return new Response(JSON.stringify({ status: "maintenance" }), { status: 503, headers });
  }

  try {
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'site_status'").first();
    const status = ["normal", "coming_soon", "maintenance"].includes(row?.value) ? row.value : "normal";
    return new Response(JSON.stringify({ status }), { headers });
  } catch {
    return new Response(JSON.stringify({ status: "maintenance" }), { status: 503, headers });
  }
}
