import { onRequest as runStudioV5 } from "./website-studio-v5.js";

const LEGACY_MODELS = new Set([
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3-8b-instruct",
  "@hf/meta-llama/meta-llama-3-8b-instruct",
]);
const FULL_CAPABILITY_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function upgradeLegacyModel(env) {
  if (!env.DB) return;
  try {
    const row = await env.DB.prepare("SELECT config_json FROM website_builder_config WHERE id=1").first();
    if (!row) return;
    const config = parseJson(row.config_json, {});
    const configured = String(config.model || config.aiModel || "").trim();
    if (configured && !LEGACY_MODELS.has(configured)) return;
    config.model = FULL_CAPABILITY_MODEL;
    delete config.aiModel;
    await env.DB.prepare(`UPDATE website_builder_config
      SET config_json=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`)
      .bind(JSON.stringify(config), "Website Studio capability upgrade").run();
  } catch (error) {
    console.warn(JSON.stringify({
      event: "website_studio_model_upgrade_skipped",
      error: error instanceof Error ? error.message : "Unknown model-upgrade error",
    }));
  }
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method === "GET") {
    const response = await runStudioV5(context);
    await upgradeLegacyModel(context.env);
    return response;
  }

  if (request.method === "POST") {
    const body = await request.clone().json().catch(() => ({}));
    if (String(body.action || "").trim() === "chat") await upgradeLegacyModel(context.env);
  }
  return runStudioV5(context);
}
