const CSM_GATEWAY = "https://api.atlassian.com/jsm/csm/cloudid";
const DEFAULT_TIMEOUT_MS = 10_000;

function clean(value, max = 1_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function extractError(payload, responseText = "") {
  const messages = [];
  const add = (value) => {
    const text = clean(value, 700);
    if (text && !messages.includes(text)) messages.push(text);
  };
  if (Array.isArray(payload?.errorMessages)) payload.errorMessages.forEach(add);
  if (payload?.errors && typeof payload.errors === "object") Object.values(payload.errors).forEach(add);
  add(payload?.message);
  add(payload?.errorMessage);
  add(payload?.error);
  add(payload?.code);
  if (!messages.length && responseText && !responseText.trim().startsWith("<")) add(responseText);
  return messages.join(" · ").slice(0, 900);
}

function csmProvisionHelp(status, detail = "") {
  const lower = clean(detail, 900).toLowerCase();
  if (status === 401 || lower.includes("scope")) {
    return "Recreate the scoped Atlassian service-account token with write:customer:jira-service-management, then replace ATLASSIAN_API_TOKEN in Cloudflare.";
  }
  if (status === 403) {
    return "Give the service account the Administer Jira global permission. The CSM customer-account API requires that permission to assign the CSM Customer product role.";
  }
  if (status === 400 && lower.includes("product role")) {
    return "The Atlassian account exists but is missing the CSM Customer product role. Customer provisioning must run with write:customer:jira-service-management and Administer Jira permission.";
  }
  return "Confirm the service-account token has write:customer:jira-service-management and the service account has Administer Jira permission, then retry the saved CRM case.";
}

export function isCsmCustomerRoleError(value) {
  const text = clean(value, 1_500).toLowerCase();
  return text.includes("csm customer product role")
    || text.includes("grant csm customer")
    || (text.includes("product role") && text.includes("customer"));
}

export async function ensureCsmCustomerAccount(env, input = {}) {
  const cloudId = clean(env?.ATLASSIAN_CLOUD_ID, 200);
  const token = String(env?.ATLASSIAN_API_TOKEN || "").trim();
  const email = cleanEmail(input.email || input.customerEmail);
  const displayName = clean(input.displayName || input.customerName || email, 160) || email;

  if (!cloudId || !token || !email) {
    const error = new Error("CSM customer provisioning is not configured.");
    error.code = "ATLASSIAN_CSM_CUSTOMER_NOT_CONFIGURED";
    error.status = 501;
    error.detail = "ATLASSIAN_CLOUD_ID, ATLASSIAN_API_TOKEN and a valid CRM customer email are required.";
    error.help = "Complete the Atlassian Cloudflare configuration and select a valid CRM customer.";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), Number(input.timeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(`${CSM_GATEWAY}/${encodeURIComponent(cloudId)}/api/v1/customer`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, displayName }),
      signal: controller.signal
    });

    const responseText = await response.text().catch(() => "");
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; }
    catch { payload = {}; }

    const detail = extractError(payload, responseText);
    const alreadyExists = [400, 409].includes(response.status)
      && /already exists|existing customer|customer exists|duplicate/i.test(detail);
    if (response.ok || alreadyExists) {
      return {
        ok: true,
        created: response.ok && !alreadyExists,
        existing: alreadyExists,
        customerId: clean(payload?.customerId || payload?.id || payload?.accountId, 300),
        email,
        displayName,
        status: response.status,
        authMode: "bearer"
      };
    }

    const error = new Error(detail || "Atlassian could not provision the CSM customer account.");
    error.code = `ATLASSIAN_CSM_CUSTOMER_HTTP_${response.status}`;
    error.status = response.status;
    error.detail = detail || "The CSM customer-account API rejected the request.";
    error.help = csmProvisionHelp(response.status, error.detail);
    throw error;
  } catch (error) {
    if (error?.name === "AbortError" || error === "timeout") {
      const timeoutError = new Error("Atlassian customer provisioning timed out.");
      timeoutError.code = "ATLASSIAN_CSM_CUSTOMER_TIMEOUT";
      timeoutError.status = 504;
      timeoutError.detail = "The CSM customer-account API did not respond within ten seconds.";
      timeoutError.help = "Retry the saved CRM case. No customer data or support case has been lost.";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
