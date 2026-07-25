import { readPartnerGalleryConfig } from "../_shared/partner-galleries.js";

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

export async function onRequestGet({ request, env }) {
  const provider = new URL(request.url).searchParams.get("provider");
  const config = await readPartnerGalleryConfig(env.DB);
  if (provider === "headout" || provider === "getyourguide") {
    return json({ success: true, provider, config: config[provider] });
  }
  return json({ success: true, config });
}

export async function onRequest() {
  return json({ success: false, error: "Method not allowed." }, 405);
}
