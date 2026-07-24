function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function contactServiceStatusFromSettings(settings = {}) {
  const enabled = bool(settings.contact_page_enabled, true);
  const configuredStatus = ["online", "maintenance", "offline"].includes(settings.contact_page_status)
    ? settings.contact_page_status
    : "online";
  const status = enabled ? configuredStatus : "offline";
  const maintenanceMessage = clean(
    settings.contact_maintenance_message ||
      "We are carrying out essential work on the Planyx contact service. Please check back shortly.",
    800
  );
  const offlineMessage = clean(
    settings.contact_offline_message ||
      "The Contact Us page is currently offline. Please use the published contact details if your enquiry cannot wait.",
    800
  );

  return {
    enabled,
    status,
    available: enabled && status === "online",
    message: status === "maintenance" ? maintenanceMessage : status === "offline" ? offlineMessage : "",
    maintenanceMessage,
    offlineMessage,
    emailEnabled: bool(settings.contact_email_enabled, true),
    telephoneEnabled: bool(settings.contact_telephone_enabled, true),
    supportEmail: clean(settings.contact_support_email || "planyx@jagroupservices.co.uk", 254),
    phoneDisplay: clean(settings.contact_phone_display || "020 3834 2790", 80),
    phoneHref: clean(settings.contact_phone_href || "tel:+442038342790", 100)
  };
}

export async function loadContactServiceStatus(DB) {
  if (!DB) return contactServiceStatusFromSettings({});
  try {
    const result = await DB.prepare("SELECT key,value FROM site_settings WHERE key LIKE 'contact_%'").all();
    const settings = Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
    return contactServiceStatusFromSettings(settings);
  } catch {
    return contactServiceStatusFromSettings({});
  }
}
