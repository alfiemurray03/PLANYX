const DEFAULT_PROVIDER = {
  enabled: true,
  eyebrow: "Affiliate activity partner",
  pageTitle: "Explore activities",
  intro: "Choose a destination and browse live tours, attractions, tickets and experiences without leaving Planyx.",
  galleryLabel: "Destination gallery",
  galleryHeading: "Where would you like to explore?",
  searchPlaceholder: "Search city or country",
  allDestinationsLabel: "All destinations",
  cardButtonLabel: "Open live gallery",
  liveGalleryLabel: "Live activity gallery for",
  currency: "GBP",
  language: "en",
  locale: "en-GB",
  resultCount: 5,
  maxCount: 100,
  showMore: true,
  partnerId: "",
  affiliateCode: "",
  affiliateWebsite: "https://japlanstudio.jagroupservices.co.uk",
  campaign: "planyx-discovery",
  destinations: [],
};

export const DEFAULT_PARTNER_GALLERY_CONFIG = {
  version: 1,
  headout: {
    ...DEFAULT_PROVIDER,
    eyebrow: "Primary affiliate partner",
    pageTitle: "Explore activities with Headout",
    liveGalleryLabel: "Live Headout gallery for",
    affiliateCode: "JL2D9u",
    affiliateWebsite: "https://tours.jagroupservices.co.uk",
  },
  getyourguide: {
    ...DEFAULT_PROVIDER,
    eyebrow: "Secondary affiliate partner",
    pageTitle: "Explore activities with GetYourGuide",
    liveGalleryLabel: "Live GetYourGuide gallery for",
    partnerId: "ZSEVDSG",
  },
};

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanUrl(value, max = 1200) {
  const url = clean(value, max);
  if (!url) return "";
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function numberWithin(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}

function normaliseDestination(value, index) {
  const source = value && typeof value === "object" ? value : {};
  const name = clean(source.name, 120) || `Destination ${index + 1}`;
  const slug = (clean(source.slug, 140) || name)
    .toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `destination-${index + 1}`;
  return {
    id: clean(source.id, 120) || slug,
    slug,
    name,
    country: clean(source.country, 120) || "Worldwide",
    code: clean(source.code, 12).toUpperCase() || "GL",
    badge: clean(source.badge, 80),
    imageUrl: cleanUrl(source.imageUrl),
    enabled: source.enabled !== false,
    featured: source.featured === true,
    providerLocationId: clean(source.providerLocationId, 160),
    searchQuery: clean(source.searchQuery, 240),
    sortOrder: numberWithin(source.sortOrder, index, 0, 10000),
  };
}

function normaliseProvider(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const destinations = Array.isArray(source.destinations)
    ? source.destinations.slice(0, 600).map(normaliseDestination)
    : fallback.destinations;
  return {
    enabled: source.enabled !== false,
    eyebrow: clean(source.eyebrow, 120) || fallback.eyebrow,
    pageTitle: clean(source.pageTitle, 180) || fallback.pageTitle,
    intro: clean(source.intro, 900) || fallback.intro,
    galleryLabel: clean(source.galleryLabel, 120) || fallback.galleryLabel,
    galleryHeading: clean(source.galleryHeading, 180) || fallback.galleryHeading,
    searchPlaceholder: clean(source.searchPlaceholder, 120) || fallback.searchPlaceholder,
    allDestinationsLabel: clean(source.allDestinationsLabel, 120) || fallback.allDestinationsLabel,
    cardButtonLabel: clean(source.cardButtonLabel, 120) || fallback.cardButtonLabel,
    liveGalleryLabel: clean(source.liveGalleryLabel, 160) || fallback.liveGalleryLabel,
    currency: clean(source.currency, 8).toUpperCase() || fallback.currency,
    language: clean(source.language, 12) || fallback.language,
    locale: clean(source.locale, 20) || fallback.locale,
    resultCount: numberWithin(source.resultCount, fallback.resultCount, 1, 20),
    maxCount: numberWithin(source.maxCount, fallback.maxCount, 1, 200),
    showMore: source.showMore !== false,
    partnerId: clean(source.partnerId, 180) || fallback.partnerId,
    affiliateCode: clean(source.affiliateCode, 180) || fallback.affiliateCode,
    affiliateWebsite: cleanUrl(source.affiliateWebsite) || fallback.affiliateWebsite,
    campaign: clean(source.campaign, 120) || fallback.campaign,
    destinations: destinations.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  };
}

export function normalisePartnerGalleryConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    headout: normaliseProvider(source.headout, DEFAULT_PARTNER_GALLERY_CONFIG.headout),
    getyourguide: normaliseProvider(source.getyourguide, DEFAULT_PARTNER_GALLERY_CONFIG.getyourguide),
  };
}

export async function readPartnerGalleryConfig(DB) {
  if (!DB) return normalisePartnerGalleryConfig(DEFAULT_PARTNER_GALLERY_CONFIG);
  try {
    const row = await DB.prepare("SELECT value FROM site_settings WHERE key='partner_gallery_config_v1'").first();
    if (!row?.value) return normalisePartnerGalleryConfig(DEFAULT_PARTNER_GALLERY_CONFIG);
    return normalisePartnerGalleryConfig(JSON.parse(row.value));
  } catch {
    return normalisePartnerGalleryConfig(DEFAULT_PARTNER_GALLERY_CONFIG);
  }
}

export async function savePartnerGalleryConfig(DB, value) {
  const config = normalisePartnerGalleryConfig(value);
  await DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const hasUpdatedAt = await DB.prepare("PRAGMA table_info(site_settings)").all()
    .then((result) => (result.results || []).some((row) => row.name === "updated_at"))
    .catch(() => false);
  const sql = hasUpdatedAt
    ? `INSERT INTO site_settings (key,value,updated_at) VALUES ('partner_gallery_config_v1',?,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`
    : `INSERT INTO site_settings (key,value) VALUES ('partner_gallery_config_v1',?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
  await DB.prepare(sql).bind(JSON.stringify(config)).run();
  return config;
}
