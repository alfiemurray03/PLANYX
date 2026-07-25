import { readGateSettings, renderLaunchGate } from "../_shared/site-gates.js";

export async function onRequestGet({ env }) {
  const config = await readGateSettings(env.DB);
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
