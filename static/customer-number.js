const API_URL = "/api/account/customer-number";

const card = document.getElementById("customerNumberCard");
const ucnValue = document.getElementById("ucnValue");
const connectionStatus = document.getElementById("connectionStatus");
const planyxAccount = document.getElementById("planyxAccount");
const lastSynchronised = document.getElementById("lastSynchronised");
const statusTitle = document.getElementById("statusTitle");
const statusDescription = document.getElementById("statusDescription");
const retryButton = document.getElementById("retryButton");

const STATUS_COPY = {
  synced: ["Connected", "Planyx is linked to your Head Office customer record."],
  pending: ["Pending", "Planyx is waiting to complete the Head Office connection."],
  not_configured: ["Not configured", "The secure Planyx connector has not been activated yet."],
  review_required: ["Head Office review", "The identity match needs Head Office staff review."],
  ucn_conflict: ["Head Office review", "Planyx protected the existing customer number because a different number was returned."],
  error: ["Temporarily unavailable", "The connection will retry automatically at the next sign-in."],
};

function formatDate(value) {
  if (!value) return "Not yet synchronised";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet synchronised";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function render(connection = {}) {
  const state = connection.status || "pending";
  const [title, description] = STATUS_COPY[state] || STATUS_COPY.pending;
  card.dataset.state = state;
  ucnValue.textContent = /^\d{10}$/.test(connection.ucn || "") ? connection.ucn : "Not allocated yet";
  connectionStatus.textContent = title;
  planyxAccount.textContent = connection.planyxAccountId || "Not linked yet";
  lastSynchronised.textContent = formatDate(connection.syncedAt);
  statusTitle.textContent = title;
  statusDescription.textContent = description;
  retryButton.hidden = state === "synced";
}

async function request(method = "GET") {
  card.dataset.state = "loading";
  retryButton.disabled = true;

  const response = await fetch(API_URL, {
    method,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });

  if (response.status === 401) {
    const returnTo = encodeURIComponent("/account/customer-number/");
    window.location.replace(`/account/login?return_to=${returnTo}`);
    return;
  }

  if (response.status === 403) {
    const payload = await response.json().catch(() => ({}));
    const destination = payload.logoutUrl === "/account/verification-required/"
      ? "/account/verification-required/"
      : "/account/access-restricted/";
    window.location.replace(destination);
    return;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok && !payload.connection && !payload.result) {
    throw new Error(payload.error || "The CustomerOps connection could not be checked.");
  }

  if (method === "POST") {
    await request("GET");
    return;
  }

  render(payload.connection || {});
  retryButton.disabled = false;
}

retryButton.addEventListener("click", () => {
  request("POST").catch(showFailure);
});

function showFailure(error) {
  card.dataset.state = "error";
  statusTitle.textContent = "Connection unavailable";
  statusDescription.textContent = error instanceof Error ? error.message : "The connection could not be checked.";
  retryButton.hidden = false;
  retryButton.disabled = false;
}

request().catch(showFailure);
