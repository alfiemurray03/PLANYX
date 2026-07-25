import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const POLICE_API = "https://data.police.uk/api";
const CACHE_SECONDS = 6 * 60 * 60;
const SPECIALIST = {
  "police-scotland": {
    name: "Police Scotland",
    officialUrl: "https://www.scotland.police.uk/your-community/police-stations/",
    guidance: "Police Scotland station records are not supplied through the Police.uk neighbourhood API. Use the official Police Scotland station finder and verify the address manually."
  },
  btp: {
    name: "British Transport Police",
    officialUrl: "https://www.btp.police.uk/contact/find-a-police-station/",
    guidance: "British Transport Police is not included in the Police.uk territorial force API. Use the official BTP station finder."
  },
  cnc: {
    name: "Civil Nuclear Constabulary",
    officialUrl: "https://www.gov.uk/government/organisations/civil-nuclear-constabulary",
    guidance: "The Civil Nuclear Constabulary is a specialist force and does not operate ordinary public reporting counters."
  },
  mdp: {
    name: "Ministry of Defence Police",
    officialUrl: "https://www.gov.uk/government/organisations/ministry-of-defence-police",
    guidance: "The Ministry of Defence Police is a specialist force and does not publish an ordinary public station directory for general reporting."
  }
};

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function configuredAdmins(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function tableExists(DB, table) {
  const row = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(table).first().catch(() => null);
  return Boolean(row?.name);
}

async function authorised(context) {
  const identity = await getNativeSession(context.request, context.env, "admin").catch(() => null);
  if (!identity?.email) return null;
  const email = clean(identity.email, 254).toLowerCase();
  if (configuredAdmins(context.env).includes(email)) return identity;
  if (!context.env.DB || !(await tableExists(context.env.DB, "admin_users"))) return null;
  const row = await context.env.DB.prepare("SELECT status FROM admin_users WHERE lower(email)=lower(?)")
    .bind(email).first().catch(() => null);
  const status = clean(row?.status || "Active", 80).toLowerCase();
  return row && !["blocked", "closed", "disabled", "inactive", "suspended"].includes(status) ? identity : null;
}

async function fetchJson(url, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Planyx-Authority-Reporting/1.0",
        },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Police.uk returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The Police.uk service could not be reached.");
}

function normalise(value) {
  return clean(value, 500).replace(/\s+/g, " ");
}

function isStation(location) {
  const type = normalise(location?.type).toLowerCase();
  const name = normalise(location?.name).toLowerCase();
  return type.includes("station") || type.includes("police") || name.includes("police station") || name.includes("front counter");
}

function stationRecord(forceName, officialUrl, location, checkedAt) {
  return {
    forceName,
    stationName: normalise(location?.name) || "Police station or contact point",
    address: normalise(location?.address),
    postcode: normalise(location?.postcode).toUpperCase(),
    telephone: normalise(location?.telephone),
    stationType: normalise(location?.type) || "Police station",
    sourceUrl: officialUrl,
    checkedAt,
  };
}

async function loadForce(forceId) {
  const specialist = SPECIALIST[forceId];
  if (specialist) {
    return {
      force: { id: forceId, name: specialist.name, officialUrl: specialist.officialUrl },
      stations: [],
      guidance: specialist.guidance,
      source: "Official specialist-force website",
      checkedAt: new Date().toISOString(),
    };
  }

  if (!/^[a-z0-9-]{2,80}$/.test(forceId)) throw new Error("The police force identifier is invalid.");
  const [forceDetails, neighbourhoods] = await Promise.all([
    fetchJson(`${POLICE_API}/forces/${encodeURIComponent(forceId)}`),
    fetchJson(`${POLICE_API}/${encodeURIComponent(forceId)}/neighbourhoods`),
  ]);
  if (!Array.isArray(neighbourhoods)) throw new Error("Police.uk returned an invalid neighbourhood directory.");

  const checkedAt = new Date().toISOString();
  const forceName = normalise(forceDetails?.name || forceId);
  const officialUrl = normalise(forceDetails?.url) || "https://www.police.uk/pu/contact-us/find-force-local-policing-team/";
  const stations = new Map();
  const batchSize = 8;

  for (let index = 0; index < neighbourhoods.length; index += batchSize) {
    const batch = neighbourhoods.slice(index, index + batchSize);
    const details = await Promise.all(batch.map(async (neighbourhood) => {
      try {
        return await fetchJson(`${POLICE_API}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhood.id)}`, 1);
      } catch {
        return null;
      }
    }));
    for (const detail of details) {
      for (const location of detail?.locations || []) {
        if (!isStation(location)) continue;
        const station = stationRecord(forceName, officialUrl, location, checkedAt);
        const key = [station.stationName, station.address, station.postcode].join("|").toLowerCase();
        stations.set(key, station);
      }
    }
    if (stations.size >= 250) break;
  }

  const ordered = [...stations.values()].sort((a, b) => a.stationName.localeCompare(b.stationName, "en-GB"));
  return {
    force: { id: forceId, name: forceName, officialUrl },
    stations: ordered,
    guidance: ordered.length
      ? "Station and contact-point records were retrieved through the official Police.uk neighbourhood service. Verify public access and the reporting route on the force website."
      : "The force was found, but Police.uk did not publish station locations through its neighbourhood records. Use the official force station finder and enter the verified address manually.",
    source: "Police.uk API via the protected Planyx server",
    checkedAt,
  };
}

export async function onRequestGet(context) {
  if (!(await authorised(context))) return json({ success: false, error: "Administrator session required." }, 401);
  const url = new URL(context.request.url);
  const forceId = clean(url.searchParams.get("force"), 80).toLowerCase();
  if (!forceId) return json({ success: false, error: "Choose a police force." }, 400);

  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.delete("refresh");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (!forceRefresh) {
    const cached = await caches.default.match(cacheKey).catch(() => null);
    if (cached) return cached;
  }

  try {
    const data = await loadForce(forceId);
    const response = json({ success: true, data }, 200, { "Cache-Control": `private, max-age=${CACHE_SECONDS}` });
    context.waitUntil(caches.default.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "The official police directory could not be loaded.",
      fallbackUrl: "https://www.police.uk/pu/contact-us/find-force-local-policing-team/",
      guidance: "Use the official force finder and enter the verified station manually while the data service is unavailable.",
    }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ success: false, error: "Method not allowed." }, 405, { Allow: "GET" });
}
