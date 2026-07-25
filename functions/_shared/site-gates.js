const LAUNCH_FEATURES = [
  "Guided experience planning",
  "Ideas shaped around you",
  "Places worth discovering",
  "Plans kept in one place",
  "Less admin, more living",
  "Designed to feel effortless",
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/legal/privacy/" },
  { label: "Terms of Service", href: "/legal/terms/" },
  { label: "Cookie Policy", href: "/legal/cookies/" },
  { label: "Accessibility", href: "/accessibility-support/" },
];

export const DEFAULT_GATE_CONFIG = {
  siteStatus: "normal",
  launch: {
    logoUrl: "/assets/brand/planyx-logo.svg?v=1",
    statusLabel: "Planyx is nearly ready",
    headline: "Your next experience",
    highlight: "starts here.",
    subtext: "We are shaping a smarter, calmer way to turn ideas into experiences worth remembering.",
    description: "Build plans around the people, places and moments that matter—then keep everything together in one beautifully organised space.",
    featuresEnabled: true,
    features: LAUNCH_FEATURES,
    countdownEnabled: false,
    countdownLabel: "The experience begins in",
    launchDate: "",
    customHtml: "",
    customCss: "",
    ownerEnabled: true,
    ownerPrompt: "Owner of this website?",
    ownerButtonLabel: "SIGN IN HERE",
    ownerUrl: "/admin",
    footerText: `Copyright ${new Date().getFullYear()} JA Group Services Ltd and/or its Licensors – All Rights Reserved.`,
    legalLinks: LEGAL_LINKS,
    seoTitle: "Something memorable is taking shape — Planyx",
    seoDescription: "Planyx is preparing a new way to build experiences, shape plans and create memories.",
  },
  maintenance: {
    logoUrl: "/assets/brand/planyx-logo.svg?v=1",
    statusLabel: "Maintenance in progress",
    reason: "Planned platform maintenance",
    title: "We are making Planyx even better",
    message: "Planyx is temporarily unavailable while our team completes essential improvements.",
    start: "",
    expectedReturn: "",
    timelineEnabled: true,
    contactEnabled: true,
    contactText: "Need help while we are away? Contact planyx@jagroupservices.co.uk or call 020 3834 2790.",
    customHtml: "",
    customCss: "",
    ownerEnabled: true,
    ownerPrompt: "Owner of this website?",
    ownerButtonLabel: "SIGN IN HERE",
    ownerUrl: "/admin",
    footerText: `© ${new Date().getFullYear()} Planyx · Operated by JA Group Services Ltd`,
    legalLinks: LEGAL_LINKS.slice(0, 3),
    seoTitle: "Planyx maintenance",
    seoDescription: "Planyx is temporarily unavailable while essential maintenance is completed.",
  },
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value, fallback = "", max = 4000) {
  const cleaned = String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
  return cleaned || fallback;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function safeUrl(value, fallback = "/") {
  const candidate = text(value, fallback, 1000);
  if (/^(?:\/|https:\/\/|mailto:|tel:)/i.test(candidate) && !/^javascript:/i.test(candidate)) return candidate;
  return fallback;
}

function safeCss(value) {
  return text(value, "", 50000)
    .replace(/@import[^;]+;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function safeHtml(value) {
  return text(value, "", 50000)
    .replace(/<\/?(?:script|iframe|object|embed|meta|base|link)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function parseArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return String(value).split("\n").map((item) => item.trim()).filter(Boolean);
  }
}

function featureList(value) {
  return parseArray(value, LAUNCH_FEATURES).map((item) => text(item, "", 180)).filter(Boolean).slice(0, 12);
}

function legalLinks(value, fallback) {
  return parseArray(value, fallback)
    .map((item) => ({ label: text(item?.label, "", 80), href: safeUrl(item?.href, "/") }))
    .filter((item) => item.label)
    .slice(0, 10);
}

export async function readGateSettings(DB) {
  const defaults = DEFAULT_GATE_CONFIG;
  if (!DB) return structuredClone(defaults);
  let rows = [];
  try {
    const result = await DB.prepare("SELECT key,value FROM site_settings").all();
    rows = result.results || [];
  } catch {
    return structuredClone(defaults);
  }
  const s = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const siteStatus = ["normal", "coming_soon", "maintenance"].includes(s.site_status)
    ? s.site_status
    : bool(s.maintenance_enabled) ? "maintenance" : bool(s.launchgateway_enabled) ? "coming_soon" : "normal";

  return {
    siteStatus,
    launch: {
      logoUrl: safeUrl(s.coming_soon_logo_url || s.logo_url, defaults.launch.logoUrl),
      statusLabel: text(s.coming_soon_status_label, defaults.launch.statusLabel, 160),
      headline: text(s.coming_soon_headline, defaults.launch.headline, 220),
      highlight: text(s.coming_soon_highlight, defaults.launch.highlight, 160),
      subtext: text(s.coming_soon_subtext, defaults.launch.subtext, 900),
      description: text(s.coming_soon_description, defaults.launch.description, 1500),
      featuresEnabled: bool(s.coming_soon_features_enabled, defaults.launch.featuresEnabled),
      features: featureList(s.coming_soon_features),
      countdownEnabled: bool(s.coming_soon_countdown_enabled, defaults.launch.countdownEnabled),
      countdownLabel: text(s.coming_soon_countdown_label, defaults.launch.countdownLabel, 160),
      launchDate: text(s.coming_soon_launch_date, "", 100),
      customHtml: safeHtml(s.coming_soon_custom_html),
      customCss: safeCss(s.coming_soon_custom_css),
      ownerEnabled: bool(s.coming_soon_owner_enabled, defaults.launch.ownerEnabled),
      ownerPrompt: text(s.coming_soon_owner_prompt, defaults.launch.ownerPrompt, 120),
      ownerButtonLabel: text(s.coming_soon_owner_button_label, defaults.launch.ownerButtonLabel, 80),
      ownerUrl: safeUrl(s.coming_soon_owner_url, defaults.launch.ownerUrl),
      footerText: text(s.coming_soon_footer_text, defaults.launch.footerText, 500),
      legalLinks: legalLinks(s.coming_soon_legal_links, defaults.launch.legalLinks),
      seoTitle: text(s.coming_soon_seo_title, defaults.launch.seoTitle, 180),
      seoDescription: text(s.coming_soon_seo_description, defaults.launch.seoDescription, 400),
    },
    maintenance: {
      logoUrl: safeUrl(s.maintenance_logo_url || s.logo_url, defaults.maintenance.logoUrl),
      statusLabel: text(s.maintenance_status_label, defaults.maintenance.statusLabel, 160),
      reason: text(s.maintenance_reason, defaults.maintenance.reason, 220),
      title: text(s.maintenance_title, defaults.maintenance.title, 220),
      message: text(s.maintenance_message, defaults.maintenance.message, 1500),
      start: text(s.maintenance_start, "", 100),
      expectedReturn: text(s.maintenance_expected_return, "", 100),
      timelineEnabled: bool(s.maintenance_timeline_enabled, defaults.maintenance.timelineEnabled),
      contactEnabled: bool(s.maintenance_contact_enabled, defaults.maintenance.contactEnabled),
      contactText: text(s.maintenance_contact_text, defaults.maintenance.contactText, 900),
      customHtml: safeHtml(s.maintenance_custom_html),
      customCss: safeCss(s.maintenance_custom_css),
      ownerEnabled: bool(s.maintenance_owner_enabled, defaults.maintenance.ownerEnabled),
      ownerPrompt: text(s.maintenance_owner_prompt, defaults.maintenance.ownerPrompt, 120),
      ownerButtonLabel: text(s.maintenance_owner_button_label, defaults.maintenance.ownerButtonLabel, 80),
      ownerUrl: safeUrl(s.maintenance_owner_url, defaults.maintenance.ownerUrl),
      footerText: text(s.maintenance_footer_text, defaults.maintenance.footerText, 500),
      legalLinks: legalLinks(s.maintenance_legal_links, defaults.maintenance.legalLinks),
      seoTitle: text(s.maintenance_seo_title, defaults.maintenance.seoTitle, 180),
      seoDescription: text(s.maintenance_seo_description, defaults.maintenance.seoDescription, 400),
    },
  };
}

export function normaliseGateConfig(input = {}) {
  const defaults = DEFAULT_GATE_CONFIG;
  const launch = input.launch || {};
  const maintenance = input.maintenance || {};
  return {
    siteStatus: ["normal", "coming_soon", "maintenance"].includes(input.siteStatus) ? input.siteStatus : defaults.siteStatus,
    launch: {
      logoUrl: safeUrl(launch.logoUrl, defaults.launch.logoUrl),
      statusLabel: text(launch.statusLabel, defaults.launch.statusLabel, 160),
      headline: text(launch.headline, defaults.launch.headline, 220),
      highlight: text(launch.highlight, defaults.launch.highlight, 160),
      subtext: text(launch.subtext, defaults.launch.subtext, 900),
      description: text(launch.description, defaults.launch.description, 1500),
      featuresEnabled: bool(launch.featuresEnabled, defaults.launch.featuresEnabled),
      features: featureList(launch.features),
      countdownEnabled: bool(launch.countdownEnabled, false),
      countdownLabel: text(launch.countdownLabel, defaults.launch.countdownLabel, 160),
      launchDate: text(launch.launchDate, "", 100),
      customHtml: safeHtml(launch.customHtml),
      customCss: safeCss(launch.customCss),
      ownerEnabled: bool(launch.ownerEnabled, true),
      ownerPrompt: text(launch.ownerPrompt, defaults.launch.ownerPrompt, 120),
      ownerButtonLabel: text(launch.ownerButtonLabel, defaults.launch.ownerButtonLabel, 80),
      ownerUrl: safeUrl(launch.ownerUrl, defaults.launch.ownerUrl),
      footerText: text(launch.footerText, defaults.launch.footerText, 500),
      legalLinks: legalLinks(launch.legalLinks, defaults.launch.legalLinks),
      seoTitle: text(launch.seoTitle, defaults.launch.seoTitle, 180),
      seoDescription: text(launch.seoDescription, defaults.launch.seoDescription, 400),
    },
    maintenance: {
      logoUrl: safeUrl(maintenance.logoUrl, defaults.maintenance.logoUrl),
      statusLabel: text(maintenance.statusLabel, defaults.maintenance.statusLabel, 160),
      reason: text(maintenance.reason, defaults.maintenance.reason, 220),
      title: text(maintenance.title, defaults.maintenance.title, 220),
      message: text(maintenance.message, defaults.maintenance.message, 1500),
      start: text(maintenance.start, "", 100),
      expectedReturn: text(maintenance.expectedReturn, "", 100),
      timelineEnabled: bool(maintenance.timelineEnabled, true),
      contactEnabled: bool(maintenance.contactEnabled, true),
      contactText: text(maintenance.contactText, defaults.maintenance.contactText, 900),
      customHtml: safeHtml(maintenance.customHtml),
      customCss: safeCss(maintenance.customCss),
      ownerEnabled: bool(maintenance.ownerEnabled, true),
      ownerPrompt: text(maintenance.ownerPrompt, defaults.maintenance.ownerPrompt, 120),
      ownerButtonLabel: text(maintenance.ownerButtonLabel, defaults.maintenance.ownerButtonLabel, 80),
      ownerUrl: safeUrl(maintenance.ownerUrl, defaults.maintenance.ownerUrl),
      footerText: text(maintenance.footerText, defaults.maintenance.footerText, 500),
      legalLinks: legalLinks(maintenance.legalLinks, defaults.maintenance.legalLinks),
      seoTitle: text(maintenance.seoTitle, defaults.maintenance.seoTitle, 180),
      seoDescription: text(maintenance.seoDescription, defaults.maintenance.seoDescription, 400),
    },
  };
}

export function gateSettingsEntries(config) {
  const c = normaliseGateConfig(config);
  return {
    site_status: c.siteStatus,
    launchgateway_enabled: String(c.siteStatus === "coming_soon"),
    maintenance_enabled: String(c.siteStatus === "maintenance"),
    maintenance_mode: String(c.siteStatus === "maintenance"),
    coming_soon_logo_url: c.launch.logoUrl,
    coming_soon_status_label: c.launch.statusLabel,
    coming_soon_headline: c.launch.headline,
    coming_soon_highlight: c.launch.highlight,
    coming_soon_subtext: c.launch.subtext,
    coming_soon_description: c.launch.description,
    coming_soon_features_enabled: String(c.launch.featuresEnabled),
    coming_soon_features: JSON.stringify(c.launch.features),
    coming_soon_countdown_enabled: String(c.launch.countdownEnabled),
    coming_soon_countdown_label: c.launch.countdownLabel,
    coming_soon_launch_date: c.launch.launchDate,
    coming_soon_custom_html: c.launch.customHtml,
    coming_soon_custom_css: c.launch.customCss,
    coming_soon_owner_enabled: String(c.launch.ownerEnabled),
    coming_soon_owner_prompt: c.launch.ownerPrompt,
    coming_soon_owner_button_label: c.launch.ownerButtonLabel,
    coming_soon_owner_url: c.launch.ownerUrl,
    coming_soon_footer_text: c.launch.footerText,
    coming_soon_legal_links: JSON.stringify(c.launch.legalLinks),
    coming_soon_seo_title: c.launch.seoTitle,
    coming_soon_seo_description: c.launch.seoDescription,
    maintenance_logo_url: c.maintenance.logoUrl,
    maintenance_status_label: c.maintenance.statusLabel,
    maintenance_reason: c.maintenance.reason,
    maintenance_title: c.maintenance.title,
    maintenance_message: c.maintenance.message,
    maintenance_start: c.maintenance.start,
    maintenance_expected_return: c.maintenance.expectedReturn,
    maintenance_timeline_enabled: String(c.maintenance.timelineEnabled),
    maintenance_contact_enabled: String(c.maintenance.contactEnabled),
    maintenance_contact_text: c.maintenance.contactText,
    maintenance_custom_html: c.maintenance.customHtml,
    maintenance_custom_css: c.maintenance.customCss,
    maintenance_owner_enabled: String(c.maintenance.ownerEnabled),
    maintenance_owner_prompt: c.maintenance.ownerPrompt,
    maintenance_owner_button_label: c.maintenance.ownerButtonLabel,
    maintenance_owner_url: c.maintenance.ownerUrl,
    maintenance_footer_text: c.maintenance.footerText,
    maintenance_legal_links: JSON.stringify(c.maintenance.legalLinks),
    maintenance_seo_title: c.maintenance.seoTitle,
    maintenance_seo_description: c.maintenance.seoDescription,
  };
}

function legalMarkup(links) {
  return links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("");
}

function ownerMarkup(config) {
  if (!config.ownerEnabled) return "";
  return `<div class="owner-access"><span>${escapeHtml(config.ownerPrompt)}</span><a class="owner-button" href="${escapeHtml(config.ownerUrl)}">${escapeHtml(config.ownerButtonLabel)}</a></div>`;
}

function countdownMarkup(config) {
  if (!config.countdownEnabled || !config.launchDate) return "";
  return `<section class="countdown" data-launch-date="${escapeHtml(config.launchDate)}" aria-live="polite"><p class="countdown-label">${escapeHtml(config.countdownLabel)}</p><div class="countdown-grid"><div><strong data-unit="days">00</strong><span>Days</span></div><div><strong data-unit="hours">00</strong><span>Hours</span></div><div><strong data-unit="minutes">00</strong><span>Minutes</span></div><div><strong data-unit="seconds">00</strong><span>Seconds</span></div></div></section>`;
}

function countdownScript() {
  return `<script>(function(){var root=document.querySelector('[data-launch-date]');if(!root)return;var target=new Date(root.dataset.launchDate).getTime();if(!target||isNaN(target)){root.hidden=true;return}function tick(){var remaining=target-Date.now();if(remaining<=0){root.hidden=true;return}var total=Math.floor(remaining/1000),parts={days:Math.floor(total/86400),hours:Math.floor((total%86400)/3600),minutes:Math.floor((total%3600)/60),seconds:total%60};Object.keys(parts).forEach(function(key){var el=root.querySelector('[data-unit="'+key+'"]');if(el)el.textContent=String(parts[key]).padStart(2,'0')})}tick();setInterval(tick,1000)})();document.querySelectorAll('[data-date]').forEach(function(el){var d=new Date(el.dataset.date);if(!isNaN(d))el.textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(d)});</script>`;
}

export function renderLaunchGate(input) {
  const c = normaliseGateConfig(input).launch;
  const features = c.featuresEnabled && c.features.length
    ? `<ul class="features">${c.features.map((item) => `<li><span class="feature-dot"></span>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.seoTitle)}</title><meta name="description" content="${escapeHtml(c.seoDescription)}"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#060b1a"><link rel="icon" href="/assets/brand/planyx-icon.png?v=1"><style>
*{box-sizing:border-box}html{min-width:320px;color-scheme:dark}body{margin:0;min-height:100vh;background:#060b1a;color:#f5f8ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.page{position:relative;min-height:100vh;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(circle at 50% -10%,rgba(79,140,255,.2),transparent 36%),radial-gradient(circle at 88% 42%,rgba(66,214,223,.09),transparent 27%),radial-gradient(circle at 8% 72%,rgba(136,108,255,.10),transparent 30%),linear-gradient(155deg,#070d1e,#050916 58%,#071020)}.page:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.28;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:52px 52px;mask-image:linear-gradient(to bottom,#000,transparent 78%)}header,footer{width:min(1160px,calc(100% - 2.5rem));margin:auto}header{min-height:84px;display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.06)}header img{height:50px;max-width:min(72vw,250px);filter:brightness(0) invert(1);object-fit:contain}main{position:relative;flex:1;display:grid;place-items:center;padding:clamp(3rem,7vw,6rem) 1.25rem}.hero{width:min(920px,100%);text-align:center}.signal{width:66px;height:66px;margin:0 auto 1.6rem;display:grid;place-items:center;border:1px solid rgba(99,168,255,.28);border-radius:50%;background:linear-gradient(145deg,rgba(79,140,255,.15),rgba(66,214,223,.07));box-shadow:0 0 0 9px rgba(79,140,255,.035),0 22px 65px rgba(30,91,190,.19);color:#72b8ff;font-size:30px}.eyebrow{display:inline-flex;align-items:center;gap:.55rem;margin:0 0 1.1rem;color:#86b9ff;font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.eyebrow:before{content:"";width:6px;height:6px;border-radius:50%;background:#42d6df;box-shadow:0 0 15px #42d6df}h1{max-width:790px;margin:0 auto;font-size:clamp(2.5rem,6.5vw,4.6rem);font-weight:650;line-height:1.04;letter-spacing:-.055em;text-wrap:balance}h1 span{background:linear-gradient(90deg,#72a7ff 10%,#60d9e5 55%,#a18aff);background-clip:text;-webkit-background-clip:text;color:transparent}.subtext{max-width:680px;margin:1.4rem auto 0;color:#d5def0;font-size:clamp(1rem,2.2vw,1.22rem);line-height:1.65}.description{max-width:680px;margin:.7rem auto 0;color:#9ba9c6;font-size:.94rem;line-height:1.7}.countdown{max-width:680px;margin:2.2rem auto 0;padding:1.1rem 1.25rem 1.25rem;border:1px solid rgba(139,164,214,.17);border-radius:22px;background:linear-gradient(135deg,rgba(15,27,55,.86),rgba(8,16,34,.72));box-shadow:0 25px 80px rgba(0,0,0,.28)}.countdown-label{margin:0 0 .9rem;color:#91a8d0;font-size:.7rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase}.countdown-grid{display:grid;grid-template-columns:repeat(4,1fr)}.countdown-grid div{display:flex;flex-direction:column;gap:.35rem;padding:.2rem .5rem;border-right:1px solid rgba(139,164,214,.14)}.countdown-grid div:last-child{border-right:0}.countdown-grid strong{font-size:clamp(1.8rem,5vw,2.65rem);font-weight:550}.countdown-grid span{color:#7f91b2;font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}.features{max-width:780px;margin:2rem auto 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;padding:0;list-style:none;text-align:left}.features li{min-height:66px;display:flex;align-items:center;gap:.7rem;padding:.85rem .95rem;border:1px solid rgba(132,160,213,.13);border-radius:14px;background:rgba(13,23,46,.54);color:#b7c4db;font-size:.8rem;line-height:1.4}.feature-dot{width:9px;height:9px;flex:0 0 auto;border-radius:50%;background:linear-gradient(135deg,#4f8cff,#42d6df);box-shadow:0 0 0 5px rgba(79,140,255,.08)}.custom{max-width:780px;margin:1.5rem auto 0;color:#c9d6eb}.owner-access{display:flex;flex-direction:column;align-items:center;gap:.5rem;margin:2rem auto .4rem;color:#7f91b2;font-size:.72rem}.owner-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:.5rem .9rem;border:1px solid rgba(114,167,255,.34);border-radius:999px;background:rgba(79,140,255,.09);color:#dbe7ff;text-decoration:none;font-size:.68rem;font-weight:800;letter-spacing:.09em}.owner-button:hover{background:rgba(79,140,255,.18)}footer{border-top:1px solid rgba(255,255,255,.06);padding:1.1rem 0 1.5rem;color:#7483a1;font-size:.7rem}.footer-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}.footer-links{display:flex;flex-wrap:wrap;gap:.55rem 1rem}.footer-links a{color:#8392ad;text-decoration:none}:focus-visible{outline:3px solid rgba(79,140,255,.6);outline-offset:4px}@media(max-width:720px){header{min-height:72px}header img{height:44px}.features{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-row{align-items:flex-start;flex-direction:column}}@media(max-width:500px){.features{grid-template-columns:1fr}.countdown{padding:1rem .45rem}.countdown-grid strong{font-size:1.7rem}.signal{width:58px;height:58px}}${c.customCss}
</style></head><body><div class="page"><header><img src="${escapeHtml(c.logoUrl)}" alt="Planyx"></header><main><section class="hero"><div class="signal" aria-hidden="true">⌁</div><p class="eyebrow">${escapeHtml(c.statusLabel)}</p><h1>${escapeHtml(c.headline)}${c.highlight ? ` <span>${escapeHtml(c.highlight)}</span>` : ""}</h1><p class="subtext">${escapeHtml(c.subtext)}</p><p class="description">${escapeHtml(c.description)}</p>${countdownMarkup(c)}${features}${c.customHtml ? `<div class="custom">${c.customHtml}</div>` : ""}${ownerMarkup(c)}</section></main><footer><div class="footer-row"><span>${escapeHtml(c.footerText)}</span><nav class="footer-links">${legalMarkup(c.legalLinks)}</nav></div></footer></div>${countdownScript()}</body></html>`;
}

export function renderMaintenanceGate(input) {
  const c = normaliseGateConfig(input).maintenance;
  const timeline = c.timelineEnabled && (c.start || c.expectedReturn)
    ? `<div class="timeline">${c.start ? `<div><small>Work started</small><strong data-date="${escapeHtml(c.start)}">${escapeHtml(c.start)}</strong></div>` : ""}${c.expectedReturn ? `<div><small>Expected return</small><strong data-date="${escapeHtml(c.expectedReturn)}">${escapeHtml(c.expectedReturn)}</strong></div>` : ""}</div>`
    : "";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.seoTitle)}</title><meta name="description" content="${escapeHtml(c.seoDescription)}"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#07101f"><link rel="icon" href="/assets/brand/planyx-icon.png?v=1"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#07101f;color:#eef6ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 15%,rgba(37,99,235,.24),transparent 34%),radial-gradient(circle at 85% 75%,rgba(6,182,212,.14),transparent 32%)}.shell{position:relative;min-height:100vh;display:flex;flex-direction:column}.top,footer{width:min(1120px,calc(100% - 2rem));margin:0 auto}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.4rem 0;border-bottom:1px solid rgba(148,163,184,.16)}.logo{height:42px;max-width:190px;filter:brightness(0) invert(1)}.status{display:inline-flex;align-items:center;gap:.55rem;color:#a9c3e6;font-size:.8rem}.dot{width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.1)}main{flex:1;display:grid;place-items:center;width:min(920px,calc(100% - 2rem));margin:0 auto;padding:clamp(3rem,8vw,7rem) 0}.card{width:100%;border:1px solid rgba(96,165,250,.22);border-radius:24px;background:linear-gradient(145deg,rgba(15,30,51,.88),rgba(9,20,37,.92));box-shadow:0 28px 90px rgba(0,0,0,.28);padding:clamp(1.5rem,5vw,3.5rem)}.eyebrow{display:inline-flex;margin:0 0 1.15rem;color:#7dd3fc;font-size:.76rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase}h1{max-width:760px;margin:0;font-size:clamp(2rem,5vw,4.2rem);font-weight:600;line-height:1.06;letter-spacing:-.045em}.message{max-width:700px;margin:1.35rem 0 0;color:#b9cbe2;font-size:clamp(1rem,2vw,1.15rem);line-height:1.75}.timeline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:2rem;overflow:hidden;border:1px solid rgba(148,163,184,.17);border-radius:16px;background:rgba(148,163,184,.17)}.timeline div{padding:1rem 1.15rem;background:rgba(6,16,31,.74)}.timeline small{display:block;margin-bottom:.35rem;color:#7187a5;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.timeline strong{font-size:.94rem;font-weight:520;color:#ddecff}.contact{margin:1.25rem 0 0;padding:1rem 1.15rem;border-left:2px solid #3b82f6;border-radius:0 12px 12px 0;background:rgba(37,99,235,.09);color:#a9c3e6;font-size:.9rem;line-height:1.65}.custom{margin-top:1.4rem;color:#cbdcf1}.owner-access{display:flex;flex-direction:column;align-items:center;gap:.5rem;margin:2rem auto 0;color:#8294b0;font-size:.72rem}.owner-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:.5rem .9rem;border:1px solid rgba(114,167,255,.34);border-radius:999px;background:rgba(79,140,255,.09);color:#dbe7ff;text-decoration:none;font-size:.68rem;font-weight:800;letter-spacing:.09em}footer{padding:1.4rem 0 2rem;border-top:1px solid rgba(148,163,184,.16);display:flex;justify-content:space-between;gap:1rem;color:#7187a5;font-size:.76rem}footer nav{display:flex;gap:1rem;flex-wrap:wrap}footer a{color:#9ab7da;text-decoration:none}@media(max-width:640px){.top{padding-top:1rem}.logo{height:34px}.timeline{grid-template-columns:1fr}footer{flex-direction:column}.status{font-size:.72rem}}${c.customCss}
</style></head><body><div class="shell"><header class="top"><img class="logo" src="${escapeHtml(c.logoUrl)}" alt="Planyx"><div class="status"><span class="dot"></span>${escapeHtml(c.statusLabel)}</div></header><main><section class="card"><p class="eyebrow">${escapeHtml(c.reason)}</p><h1>${escapeHtml(c.title)}</h1><p class="message">${escapeHtml(c.message)}</p>${timeline}${c.contactEnabled ? `<p class="contact">${escapeHtml(c.contactText)}</p>` : ""}${c.customHtml ? `<div class="custom">${c.customHtml}</div>` : ""}${ownerMarkup(c)}</section></main><footer><span>${escapeHtml(c.footerText)}</span><nav>${legalMarkup(c.legalLinks)}</nav></footer></div>${countdownScript()}</body></html>`;
}
