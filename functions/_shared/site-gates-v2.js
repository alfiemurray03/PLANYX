import {
  DEFAULT_GATE_CONFIG as BASE_DEFAULTS,
  escapeHtml,
  gateSettingsEntries as baseGateSettingsEntries,
  normaliseGateConfig as normaliseBase,
  readGateSettings as readBase,
  renderLaunchGate as renderBaseLaunch,
  renderMaintenanceGate as renderBaseMaintenance,
} from "./site-gates.js";

const VISIBILITY_DEFAULTS = {
  launch: {
    logoEnabled: true,
    signalEnabled: true,
    statusEnabled: true,
    headlineEnabled: true,
    subtextEnabled: true,
    descriptionEnabled: true,
    footerEnabled: true,
  },
  maintenance: {
    logoEnabled: true,
    statusEnabled: true,
    reasonEnabled: true,
    titleEnabled: true,
    messageEnabled: true,
    footerEnabled: true,
  },
};

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

async function readVisibility(DB) {
  if (!DB) return structuredClone(VISIBILITY_DEFAULTS);
  const keys = [
    "coming_soon_logo_enabled",
    "coming_soon_signal_enabled",
    "coming_soon_status_enabled",
    "coming_soon_headline_enabled",
    "coming_soon_subtext_enabled",
    "coming_soon_description_enabled",
    "coming_soon_footer_enabled",
    "maintenance_logo_enabled",
    "maintenance_status_enabled",
    "maintenance_reason_enabled",
    "maintenance_title_enabled",
    "maintenance_message_enabled",
    "maintenance_footer_enabled",
  ];
  try {
    const result = await DB.prepare(`SELECT key,value FROM site_settings WHERE key IN (${keys.map(() => "?").join(",")})`)
      .bind(...keys).all();
    const settings = Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
    return {
      launch: {
        logoEnabled: bool(settings.coming_soon_logo_enabled, true),
        signalEnabled: bool(settings.coming_soon_signal_enabled, true),
        statusEnabled: bool(settings.coming_soon_status_enabled, true),
        headlineEnabled: bool(settings.coming_soon_headline_enabled, true),
        subtextEnabled: bool(settings.coming_soon_subtext_enabled, true),
        descriptionEnabled: bool(settings.coming_soon_description_enabled, true),
        footerEnabled: bool(settings.coming_soon_footer_enabled, true),
      },
      maintenance: {
        logoEnabled: bool(settings.maintenance_logo_enabled, true),
        statusEnabled: bool(settings.maintenance_status_enabled, true),
        reasonEnabled: bool(settings.maintenance_reason_enabled, true),
        titleEnabled: bool(settings.maintenance_title_enabled, true),
        messageEnabled: bool(settings.maintenance_message_enabled, true),
        footerEnabled: bool(settings.maintenance_footer_enabled, true),
      },
    };
  } catch {
    return structuredClone(VISIBILITY_DEFAULTS);
  }
}

export const DEFAULT_GATE_CONFIG = {
  ...BASE_DEFAULTS,
  launch: { ...BASE_DEFAULTS.launch, ...VISIBILITY_DEFAULTS.launch },
  maintenance: { ...BASE_DEFAULTS.maintenance, ...VISIBILITY_DEFAULTS.maintenance },
};

export async function readGateSettings(DB) {
  const [base, visibility] = await Promise.all([readBase(DB), readVisibility(DB)]);
  return {
    ...base,
    launch: { ...base.launch, ...visibility.launch },
    maintenance: { ...base.maintenance, ...visibility.maintenance },
  };
}

export function normaliseGateConfig(input = {}) {
  const base = normaliseBase(input);
  const launch = input.launch || {};
  const maintenance = input.maintenance || {};
  return {
    ...base,
    launch: {
      ...base.launch,
      logoEnabled: bool(launch.logoEnabled, true),
      signalEnabled: bool(launch.signalEnabled, true),
      statusEnabled: bool(launch.statusEnabled, true),
      headlineEnabled: bool(launch.headlineEnabled, true),
      subtextEnabled: bool(launch.subtextEnabled, true),
      descriptionEnabled: bool(launch.descriptionEnabled, true),
      footerEnabled: bool(launch.footerEnabled, true),
    },
    maintenance: {
      ...base.maintenance,
      logoEnabled: bool(maintenance.logoEnabled, true),
      statusEnabled: bool(maintenance.statusEnabled, true),
      reasonEnabled: bool(maintenance.reasonEnabled, true),
      titleEnabled: bool(maintenance.titleEnabled, true),
      messageEnabled: bool(maintenance.messageEnabled, true),
      footerEnabled: bool(maintenance.footerEnabled, true),
    },
  };
}

export function gateSettingsEntries(config) {
  const c = normaliseGateConfig(config);
  return {
    ...baseGateSettingsEntries(c),
    coming_soon_logo_enabled: String(c.launch.logoEnabled),
    coming_soon_signal_enabled: String(c.launch.signalEnabled),
    coming_soon_status_enabled: String(c.launch.statusEnabled),
    coming_soon_headline_enabled: String(c.launch.headlineEnabled),
    coming_soon_subtext_enabled: String(c.launch.subtextEnabled),
    coming_soon_description_enabled: String(c.launch.descriptionEnabled),
    coming_soon_footer_enabled: String(c.launch.footerEnabled),
    maintenance_logo_enabled: String(c.maintenance.logoEnabled),
    maintenance_status_enabled: String(c.maintenance.statusEnabled),
    maintenance_reason_enabled: String(c.maintenance.reasonEnabled),
    maintenance_title_enabled: String(c.maintenance.titleEnabled),
    maintenance_message_enabled: String(c.maintenance.messageEnabled),
    maintenance_footer_enabled: String(c.maintenance.footerEnabled),
  };
}

function remove(html, pattern) {
  return html.replace(pattern, "");
}

function relocateOwner(html) {
  const match = html.match(/<div class="owner-access">[\s\S]*?<\/div>/i);
  if (!match) return html;
  const without = html.replace(match[0], "");
  return without.replace("</main>", `</main><section class="owner-zone" aria-label="Website owner access">${match[0]}</section>`)
    .replace(".owner-access{", ".owner-zone{position:relative;z-index:2;display:grid;place-items:center;width:100%;padding:0 1rem 1.25rem}.owner-access{");
}

export function renderLaunchGate(input) {
  const c = normaliseGateConfig(input);
  let html = renderBaseLaunch(c);
  if (!c.launch.logoEnabled) html = remove(html, /<header><img[\s\S]*?<\/header>/i);
  if (!c.launch.signalEnabled) html = remove(html, /<div class="signal"[\s\S]*?<\/div>/i);
  if (!c.launch.statusEnabled) html = remove(html, /<p class="eyebrow">[\s\S]*?<\/p>/i);
  if (!c.launch.headlineEnabled) html = remove(html, /<h1>[\s\S]*?<\/h1>/i);
  if (!c.launch.subtextEnabled) html = remove(html, /<p class="subtext">[\s\S]*?<\/p>/i);
  if (!c.launch.descriptionEnabled) html = remove(html, /<p class="description">[\s\S]*?<\/p>/i);
  if (!c.launch.footerEnabled) html = remove(html, /<footer>[\s\S]*?<\/footer>/i);
  return relocateOwner(html);
}

export function renderMaintenanceGate(input) {
  const c = normaliseGateConfig(input);
  let html = renderBaseMaintenance(c);
  if (!c.maintenance.logoEnabled) html = remove(html, /<img class="logo"[\s\S]*?>/i);
  if (!c.maintenance.statusEnabled) html = remove(html, /<div class="status">[\s\S]*?<\/div>/i);
  if (!c.maintenance.reasonEnabled) html = remove(html, /<p class="eyebrow">[\s\S]*?<\/p>/i);
  if (!c.maintenance.titleEnabled) html = remove(html, /<h1>[\s\S]*?<\/h1>/i);
  if (!c.maintenance.messageEnabled) html = remove(html, /<p class="message">[\s\S]*?<\/p>/i);
  if (!c.maintenance.footerEnabled) html = remove(html, /<footer>[\s\S]*?<\/footer>/i);
  return relocateOwner(html);
}

export { escapeHtml };
