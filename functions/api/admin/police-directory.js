import { getNativeSession } from "../../_shared/oidc.js";

const DEFAULT_ADMIN_EMAIL = "alfieholywoodmurray@jagroupservices.co.uk";
const POLICE_API = "https://data.police.uk/api";
const GOVUK_CONTENT_API = "https://www.gov.uk/api/content/government/publications/ninja-sword-surrender-and-compensation-scheme/list-of-designated-police-stations-accessible";
const GOVUK_PUBLIC_URL = "https://www.gov.uk/government/publications/ninja-sword-surrender-and-compensation-scheme/list-of-designated-police-stations-accessible";
const CACHE_SECONDS = 6 * 60 * 60;

const SPECIALIST = {
  "police-scotland": {
    name: "Police Scotland",
    officialUrl: "https://www.scotland.police.uk/your-community/police-stations/",
    guidance: "Police Scotland station records are not supplied through the Police.uk neighbourhood API or the England and Wales Home Office list. Use the official Police Scotland station finder and verify the address manually."
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

const GOVUK_FORCE_HEADINGS = {
  "avon-and-somerset": "Avon and Somerset Police",
  bedfordshire: "Bedfordshire Police",
  cambridgeshire: "Cambridgeshire Constabulary",
  cheshire: "Cheshire Constabulary",
  "city-of-london": "City of London Police",
  cleveland: "Cleveland Police",
  cumbria: "Cumbria Constabulary",
  derbyshire: "Derbyshire Constabulary",
  "devon-and-cornwall": "Devon and Cornwall Police",
  durham: "Durham Police",
  dorset: "Dorset Police",
  "dyfed-powys": "Dyfed Powys",
  essex: "Essex Police",
  gloucestershire: "Gloucestershire Constabulary",
  gwent: "Gwent Police",
  "greater-manchester": "Greater Manchester Police",
  hampshire: "Hampshire and Isle of Wight Constabulary",
  hertfordshire: "Hertfordshire Constabulary",
  humberside: "Humberside Police",
  kent: "Kent Police",
  lancashire: "Lancashire Police",
  leicestershire: "Leicestershire Police",
  lincolnshire: "Lincolnshire Police",
  merseyside: "Merseyside Police",
  metropolitan: "Metropolitan Police",
  norfolk: "Norfolk Constabulary",
  "north-wales": "North Wales Police",
  "north-yorkshire": "North Yorkshire Police",
  northamptonshire: "Northamptonshire Police",
  northumbria: "Northumbria Police",
  nottinghamshire: "Nottinghamshire Police",
  "south-wales": "South Wales Police",
  "south-yorkshire": "South Yorkshire Police",
  staffordshire: "Staffordshire Police",
  suffolk: "Suffolk Police",
  surrey: "Surrey Police",
  sussex: "Sussex Police",
  "thames-valley": "Thames Valley Police",
  warwickshire: "Warwickshire Police",
  "west-mercia": "West Mercia Police",
  "west-midlands": "West Midlands Police",
  "west-yorkshire": "West Yorkshire",
  wiltshire: "Wiltshire Police"
};

const METROPOLITAN_OFFICIAL_FALLBACK = [
  ["Acton Police Station", "250 High Street, London", "W3 9BH"],
  ["Bethnal Green Police Station", "2 Victoria Park Square, Bethnal Green, London", "E2 9NZ"],
  ["Brixton Police Station", "367 Brixton Road, Brixton, London", "SW9 7DD"],
  ["Bromley Police Station", "The High Street, Bromley, London", "BR1 1ER"],
  ["Charing Cross Police Station", "Agar Street, London", "WC2N 4JP"],
  ["Chingford Police Station", "Kings Head Hill, Chingford, London", "E4 7EA"],
  ["Colindale Police Station", "Grahame Park Way, London", "NW9 5TW"],
  ["Croydon Police Station", "71 Park Lane, Croydon", "CR9 1BP"],
  ["Dagenham Police Station", "561 Rainham Road South, London", "RM10 7TU"],
  ["Edmonton Police Station", "462 Fore Street, London", "N9 0PW"],
  ["Hammersmith Police Station", "226 Shepherds Bush Road, Hammersmith, London", "W6 7NX"],
  ["Hayes Police Station", "755 Uxbridge Road, Hayes End, Hayes", "UB4 8HU"],
  ["Islington Police Station", "2 Tolpuddle Street, The Angel, Islington, London", "N1 0YY"],
  ["Lavender Hill Police Station", "176 Lavender Hill, London", "SW11 1JX"],
  ["Lewisham Police Station", "43 Lewisham High Street, London", "SE13 5JZ"],
  ["Plumstead Police Station", "200 Plumstead High Street, Plumstead, London", "SE18 1JY"],
  ["Stoke Newington Police Station", "33 Stoke Newington High Street, London", "N16 8DS"],
  ["Sutton Police Station", "6 Carshalton Road, Sutton", "SM1 4RF"],
  ["Stratford Police Station", "18 West Ham Lane, London", "E15 4SG"],
  ["Twickenham Police Station", "41 London Road, Twickenham", "TW1 3SY"],
  ["Walworth Police Station", "12-28 Manor Place, London", "SE17 3BB"],
  ["Wembley Police Station", "603 Harrow Road, Wembley", "HA0 2HH"]
];

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

async function fetchJson(url, attempts = 2, sourceName = "Official data service") {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Sousa Murray Planeia-Authority-Reporting/1.1",
        },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`${sourceName} returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${sourceName} could not be reached.`);
}

function normalise(value) {
  return clean(value, 500).replace(/\s+/g, " ");
}

function isStation(location) {
  const type = normalise(location?.type).toLowerCase();
  const name = normalise(location?.name).toLowerCase();
  return type.includes("station") || type.includes("police") || name.includes("police station") || name.includes("front counter");
}

function stationRecord(forceName, officialUrl, location, checkedAt, sourceUrl = officialUrl) {
  return {
    forceName,
    stationName: normalise(location?.name) || "Police station or contact point",
    address: normalise(location?.address),
    postcode: normalise(location?.postcode).toUpperCase(),
    telephone: normalise(location?.telephone),
    stationType: normalise(location?.type) || "Police station",
    sourceUrl,
    checkedAt,
  };
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlText(value) {
  return normalise(decodeHtml(String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ")));
}

function headingKey(value) {
  return htmlText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractPostcode(value) {
  const match = String(value || "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*[- ]?\s*(\d[A-Z]{2})\b/);
  return match ? `${match[1]} ${match[2]}` : "";
}

function govUkSection(body, heading) {
  const headings = [];
  const pattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  let match;
  while ((match = pattern.exec(body))) {
    headings.push({ name: headingKey(match[1]), start: pattern.lastIndex, tagStart: match.index });
  }
  const wanted = headingKey(heading);
  const index = headings.findIndex((item) => item.name === wanted);
  if (index < 0) return "";
  const end = headings[index + 1]?.tagStart ?? body.length;
  return body.slice(headings[index].start, end);
}

function parseGovUkStations(forceName, forceId, officialUrl, body, checkedAt) {
  const heading = GOVUK_FORCE_HEADINGS[forceId] || forceName;
  const section = govUkSection(body, heading);
  if (!section) return [];

  const records = [];
  const paragraphPattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let paragraph;
  while ((paragraph = paragraphPattern.exec(section))) {
    const raw = decodeHtml(paragraph[1])
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .split(/\n+/)
      .map((line) => normalise(line))
      .filter(Boolean);
    if (raw.length < 2) continue;
    if (/^opening hours?:/i.test(raw[0])) continue;

    let postcode = "";
    let postcodeIndex = -1;
    for (let index = raw.length - 1; index >= 0; index -= 1) {
      postcode = extractPostcode(raw[index]);
      if (postcode) { postcodeIndex = index; break; }
    }
    if (!postcode || postcodeIndex < 1) continue;

    const stationName = raw[0];
    if (/^(north|south|east|west).*(locations?|division)$/i.test(stationName)) continue;
    const addressParts = raw.slice(1, postcodeIndex + 1)
      .map((line) => line.replace(postcode, "").trim())
      .filter(Boolean)
      .filter((line) => !/^opening hours?:/i.test(line));
    records.push(stationRecord(forceName, officialUrl, {
      name: stationName,
      address: addressParts.join(", "),
      postcode,
      telephone: "",
      type: "Official designated police station",
    }, checkedAt, GOVUK_PUBLIC_URL));
  }
  return records;
}

function metropolitanStaticStations(forceName, officialUrl, checkedAt) {
  return METROPOLITAN_OFFICIAL_FALLBACK.map(([name, address, postcode]) => stationRecord(forceName, officialUrl, {
    name,
    address,
    postcode,
    telephone: "",
    type: "Official designated police station",
  }, checkedAt, GOVUK_PUBLIC_URL));
}

function mergeStations(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const station of group || []) {
      const key = [station.stationName, station.address, station.postcode].join("|").toLowerCase();
      const existing = merged.get(key);
      if (!existing || (!existing.address && station.address)) merged.set(key, station);
    }
  }
  return [...merged.values()].sort((a, b) => a.stationName.localeCompare(b.stationName, "en-GB"));
}

async function loadGovUkFallback(forceId, forceName, officialUrl, checkedAt) {
  if (!GOVUK_FORCE_HEADINGS[forceId]) return [];
  try {
    const content = await fetchJson(GOVUK_CONTENT_API, 2, "GOV.UK station directory");
    const body = String(content?.details?.body || "");
    return parseGovUkStations(forceName, forceId, officialUrl, body, checkedAt);
  } catch (error) {
    console.error(JSON.stringify({ event: "govuk_police_station_fallback_failed", forceId, message: error instanceof Error ? error.message : String(error) }));
    return [];
  }
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
    fetchJson(`${POLICE_API}/forces/${encodeURIComponent(forceId)}`, 2, "Police.uk"),
    fetchJson(`${POLICE_API}/${encodeURIComponent(forceId)}/neighbourhoods`, 2, "Police.uk"),
  ]);
  if (!Array.isArray(neighbourhoods)) throw new Error("Police.uk returned an invalid neighbourhood directory.");

  const checkedAt = new Date().toISOString();
  const forceName = normalise(forceDetails?.name || forceId);
  const officialUrl = normalise(forceDetails?.url) || "https://www.police.uk/pu/contact-us/find-force-local-policing-team/";
  const policeUkStations = new Map();
  const batchSize = 8;

  for (let index = 0; index < neighbourhoods.length; index += batchSize) {
    const batch = neighbourhoods.slice(index, index + batchSize);
    const details = await Promise.all(batch.map(async (neighbourhood) => {
      try {
        return await fetchJson(`${POLICE_API}/${encodeURIComponent(forceId)}/${encodeURIComponent(neighbourhood.id)}`, 1, "Police.uk");
      } catch {
        return null;
      }
    }));
    for (const detail of details) {
      for (const location of detail?.locations || []) {
        if (!isStation(location)) continue;
        const station = stationRecord(forceName, officialUrl, location, checkedAt);
        const key = [station.stationName, station.address, station.postcode].join("|").toLowerCase();
        policeUkStations.set(key, station);
      }
    }
    if (policeUkStations.size >= 250) break;
  }

  let govUkStations = [];
  if (policeUkStations.size < 5) govUkStations = await loadGovUkFallback(forceId, forceName, officialUrl, checkedAt);
  if (forceId === "metropolitan" && govUkStations.length === 0) {
    govUkStations = metropolitanStaticStations(forceName, officialUrl, checkedAt);
  }

  const ordered = mergeStations([...policeUkStations.values()], govUkStations);
  const usedPoliceUk = policeUkStations.size > 0;
  const usedGovUk = govUkStations.length > 0;
  const source = usedPoliceUk && usedGovUk
    ? "Police.uk neighbourhood records and the official Home Office/GOV.UK designated-station directory"
    : usedPoliceUk
      ? "Police.uk API via the protected Sousa Murray Planeia server"
      : usedGovUk
        ? "Official Home Office/GOV.UK designated-station directory via the protected Sousa Murray Planeia server"
        : "Official force website";

  return {
    force: { id: forceId, name: forceName, officialUrl },
    stations: ordered,
    guidance: ordered.length
      ? usedGovUk
        ? "Police.uk did not publish a complete station list for this force, so Sousa Murray Planeia also loaded official station addresses from the Home Office/GOV.UK directory. Verify current opening hours, public-counter access and the correct reporting route on the force website."
        : "Station and contact-point records were retrieved through the official Police.uk neighbourhood service. Verify public access and the reporting route on the force website."
      : "No machine-readable station locations were available from Police.uk or the official Home Office/GOV.UK directory. Use the official force station finder and enter the verified address manually.",
    source,
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
