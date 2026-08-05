const DEFAULT_CONFIG = {
  success: true,
  headline: "Your next experience starts here.",
  subtext: "We are shaping a smarter, calmer way to turn ideas into experiences worth remembering.",
  launchDate: "",
  countdownEnabled: false,
  platformName: "Sousa Murray Planeia",
  description: "Build plans around the people, places and moments that matter—then keep everything together in one beautifully organised space.",
  features: [
    "Guided experience planning",
    "Ideas shaped around you",
    "Places worth discovering",
    "Plans kept in one place",
    "Less admin, more living",
    "Designed to feel effortless"
  ]
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

async function readSiteSetting(env, key) {
  if (!env?.DB) return { found: false, value: null };
  try {
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?").bind(key).first();
    return row ? { found: true, value: typeof row.value === "string" ? row.value.trim() : "" } : { found: false, value: null };
  } catch (error) {
    console.warn(JSON.stringify({
      message: "Coming soon setting lookup failed",
      key,
      error: error instanceof Error ? error.message : String(error)
    }));
    return { found: false, value: null };
  }
}

const LEGACY_COPY = {
  "Coming Soon": DEFAULT_CONFIG.headline,
  "We are putting the finishing touches on something great.": DEFAULT_CONFIG.subtext,
  "Sousa Murray Planeia is a self-service experience planning platform that helps you build, save and manage everyday, travel and support planning outputs.": DEFAULT_CONFIG.description
};

function refreshLegacyCopy(value, fallback) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return LEGACY_COPY[cleaned] || cleaned || fallback;
}

function parseFeatures(value) {
  if (!value) return DEFAULT_CONFIG.features;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.map((item) => String(item || "").trim()).filter(Boolean);
      if (cleaned.length) return cleaned;
    }
  } catch (_) {
    const cleaned = value.split("\n").map((item) => item.trim()).filter(Boolean);
    if (cleaned.length) return cleaned;
  }
  return DEFAULT_CONFIG.features;
}

export async function onRequestGet({ env }) {
  const [headline, subtext, launchDate, countdownEnabled, description, features] = await Promise.all([
    readSiteSetting(env, "coming_soon_headline"),
    readSiteSetting(env, "coming_soon_subtext"),
    readSiteSetting(env, "coming_soon_launch_date"),
    readSiteSetting(env, "coming_soon_countdown_enabled"),
    readSiteSetting(env, "coming_soon_description"),
    readSiteSetting(env, "coming_soon_features")
  ]);

  return json({
    ...DEFAULT_CONFIG,
    headline: refreshLegacyCopy(headline.value, DEFAULT_CONFIG.headline),
    subtext: refreshLegacyCopy(subtext.value, DEFAULT_CONFIG.subtext),
    launchDate: launchDate.found ? launchDate.value : "",
    countdownEnabled: countdownEnabled.found && countdownEnabled.value === "true",
    description: refreshLegacyCopy(description.value, DEFAULT_CONFIG.description),
    features: parseFeatures(features.value)
  });
}
