import { readGateSettings, renderLaunchGate } from "../_shared/site-gates.js";

async function preserveLegacyHeadline(DB, config) {
  if (!DB) return config;
  try {
    const [headline, highlight] = await Promise.all([
      DB.prepare("SELECT value FROM site_settings WHERE key='coming_soon_headline'").first(),
      DB.prepare("SELECT value FROM site_settings WHERE key='coming_soon_highlight'").first(),
    ]);
    if (headline && !highlight) config.launch.highlight = "";
  } catch {
    // The shared defaults remain safe if the compatibility lookup fails.
  }
  return config;
}

export async function onRequestGet({ env }) {
  const config = await preserveLegacyHeadline(env.DB, await readGateSettings(env.DB));
  return new Response(renderLaunchGate(config), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  return new Response(null, { status: response.status, headers: response.headers });
}
