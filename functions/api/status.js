const STATUSPAGE_ORIGIN = "https://jagroupservices.statuspage.io";
const REFRESH_AFTER_SECONDS = 60;
const HISTORY_LIMIT = 20;

const STATUS_LABELS = {
  operational: "Operational",
  degraded_performance: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  under_maintenance: "Under maintenance"
};

const STATUS_TONES = {
  operational: "operational",
  degraded_performance: "warning",
  partial_outage: "warning",
  major_outage: "critical",
  under_maintenance: "maintenance"
};

const OVERALL_LABELS = {
  none: "All systems operational",
  minor: "Partial service disruption",
  major: "Major service disruption",
  critical: "Major service outage",
  maintenance: "Scheduled maintenance in progress"
};

const OVERALL_TONES = {
  none: "operational",
  minor: "warning",
  major: "critical",
  critical: "critical",
  maintenance: "maintenance"
};

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);

  try {
    const [summary, incidentHistory, maintenanceHistory] = await Promise.all([
      fetchStatuspageJson("/api/v2/summary.json"),
      fetchStatuspageJson("/api/v2/incidents.json").catch((error) => {
        logUpstreamWarning(requestUrl.pathname, "incident_history", error);
        return { incidents: [] };
      }),
      fetchStatuspageJson("/api/v2/scheduled-maintenances.json").catch((error) => {
        logUpstreamWarning(requestUrl.pathname, "maintenance_history", error);
        return { scheduled_maintenances: [] };
      })
    ]);

    const payload = transformStatuspageData(summary, incidentHistory, maintenanceHistory);
    return json(payload, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
  } catch (error) {
    console.error(JSON.stringify({
      message: "Statuspage summary request failed",
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error)
    }));

    return json({
      ok: false,
      message: "Live service status is temporarily unavailable. Please try again shortly.",
      officialStatuspageUrl: STATUSPAGE_ORIGIN,
      lastUpdated: new Date().toISOString(),
      refreshAfter: REFRESH_AFTER_SECONDS
    }, 503, "no-store");
  }
}

async function fetchStatuspageJson(path) {
  const response = await fetch(`${STATUSPAGE_ORIGIN}${path}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Sousa Murray Planeia-Status-Centre/1.0"
    },
    cf: {
      cacheEverything: true,
      cacheTtl: REFRESH_AFTER_SECONDS,
      cacheTtlByStatus: {
        "200-299": REFRESH_AFTER_SECONDS,
        "400-599": 0
      }
    }
  });

  if (!response.ok) throw new Error(`Statuspage returned HTTP ${response.status}`);
  return response.json();
}

function transformStatuspageData(summary = {}, incidentHistory = {}, maintenanceHistory = {}) {
  const components = Array.isArray(summary.components)
    ? summary.components.filter((component) => !component.group).map(mapComponent)
    : [];

  const incidents = Array.isArray(incidentHistory.incidents) && incidentHistory.incidents.length
    ? incidentHistory.incidents
    : Array.isArray(summary.incidents) ? summary.incidents : [];
  const maintenance = Array.isArray(maintenanceHistory.scheduled_maintenances) && maintenanceHistory.scheduled_maintenances.length
    ? maintenanceHistory.scheduled_maintenances
    : Array.isArray(summary.scheduled_maintenances) ? summary.scheduled_maintenances : [];

  const activeIncidents = incidents.filter(isActiveIncident).map(mapEvent);
  const resolvedIncidents = incidents.filter((incident) => !isActiveIncident(incident)).slice(0, HISTORY_LIMIT).map(mapEvent);
  const activeMaintenance = maintenance.filter((event) => event.status === "in_progress" || event.status === "verifying").map(mapEvent);
  const scheduledMaintenance = maintenance.filter((event) => event.status === "scheduled").map(mapEvent);
  const completedMaintenance = maintenance
    .filter((event) => event.status === "completed" || event.status === "resolved")
    .slice(0, HISTORY_LIMIT)
    .map(mapEvent);

  const operationalCount = components.filter((component) => component.status === "operational").length;
  const totalComponents = components.length;
  const indicator = cleanToken(summary.status?.indicator, "unknown");
  const pageUpdatedAt = cleanDate(summary.page?.updated_at);

  return {
    ok: true,
    source: {
      name: cleanText(summary.page?.name, "JA Group Services Status Page", 160),
      url: STATUSPAGE_ORIGIN,
      updatedAt: pageUpdatedAt
    },
    overall: {
      indicator,
      label: OVERALL_LABELS[indicator] || cleanText(summary.status?.description, "Status available", 160),
      description: cleanText(summary.status?.description, "Live operational status from JA Group Services.", 240),
      tone: OVERALL_TONES[indicator] || "unknown"
    },
    summary: {
      totalComponents,
      operationalComponents: operationalCount,
      affectedComponents: Math.max(totalComponents - operationalCount, 0),
      currentAvailabilityPercent: totalComponents ? Math.round((operationalCount / totalComponents) * 1000) / 10 : null,
      activeIncidents: activeIncidents.length,
      activeMaintenance: activeMaintenance.length,
      scheduledMaintenance: scheduledMaintenance.length
    },
    components,
    incidents: {
      active: activeIncidents,
      history: resolvedIncidents
    },
    maintenance: {
      active: activeMaintenance,
      scheduled: scheduledMaintenance,
      history: completedMaintenance
    },
    lastUpdated: pageUpdatedAt || new Date().toISOString(),
    refreshAfter: REFRESH_AFTER_SECONDS,
    officialStatuspageUrl: STATUSPAGE_ORIGIN
  };
}

function mapComponent(component = {}) {
  const status = cleanToken(component.status, "unknown");
  return {
    id: cleanToken(component.id, "component"),
    name: cleanText(component.name, "Service component", 180),
    status,
    statusLabel: STATUS_LABELS[status] || humanise(status),
    tone: STATUS_TONES[status] || "unknown",
    description: cleanText(component.description, "", 500),
    updatedAt: cleanDate(component.updated_at)
  };
}

function mapEvent(event = {}) {
  return {
    id: cleanToken(event.id, "event"),
    name: cleanText(event.name, "Service update", 240),
    status: cleanToken(event.status, "unknown"),
    statusLabel: humanise(cleanToken(event.status, "unknown")),
    impact: cleanToken(event.impact, "none"),
    createdAt: cleanDate(event.created_at),
    updatedAt: cleanDate(event.updated_at),
    resolvedAt: cleanDate(event.resolved_at),
    scheduledFor: cleanDate(event.scheduled_for),
    scheduledUntil: cleanDate(event.scheduled_until),
    components: Array.isArray(event.components)
      ? event.components.filter((component) => !component.group).map((component) => cleanText(component.name, "", 180)).filter(Boolean)
      : [],
    updates: Array.isArray(event.incident_updates)
      ? event.incident_updates.slice(0, 12).map((update) => ({
          id: cleanToken(update.id, "update"),
          status: cleanToken(update.status, "update"),
          statusLabel: humanise(cleanToken(update.status, "update")),
          body: cleanText(update.body, "", 3000),
          displayedAt: cleanDate(update.display_at || update.created_at)
        }))
      : []
  };
}

function isActiveIncident(incident = {}) {
  return !incident.resolved_at && !["resolved", "postmortem", "completed"].includes(incident.status);
}

function cleanText(value, fallback = "", max = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
}

function cleanToken(value, fallback) {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9_-]{1,80}$/.test(token) ? token : fallback;
}

function cleanDate(value) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function humanise(value) {
  const text = String(value || "Status").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function logUpstreamWarning(path, source, error) {
  console.warn(JSON.stringify({
    message: "Optional Statuspage history request failed",
    path,
    source,
    error: error instanceof Error ? error.message : String(error)
  }));
}

function json(data, status, cacheControl) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
