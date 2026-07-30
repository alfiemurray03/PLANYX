const AGE_CONTRACT = "ja-head-office-age-assurance-v1";

function decisionOf(access = {}) {
  return String(access?.decision || access?.action || "allow").trim().toLowerCase();
}

function hasRestrictions(access = {}) {
  return Array.isArray(access?.restrictions) && access.restrictions.length > 0;
}

function inactiveAgeDeployment(access = {}) {
  const assurance = access?.ageAssurance;
  return Boolean(
    assurance
    && assurance.authorityValid === false
    && assurance.required !== true
    && assurance.configured !== true
  );
}

export function headOfficeAgeAuthorityReady(access = {}) {
  const assurance = access?.ageAssurance;
  return assurance?.contractVersion === AGE_CONTRACT
    && assurance?.configured === true
    && assurance?.deploymentKey === "PLANYX"
    && assurance?.platformCode === "PLANYX"
    && assurance?.minimumAge === 16
    && assurance?.accountPopulation === "customers_only"
    && assurance?.staffAccountsExcluded === true;
}

export function blocksAccess(access = {}) {
  const decision = decisionOf(access);

  // Confirmed security denials always take effect.
  if (decision === "deny" || decision === "step_up") return true;

  if (decision !== "review") return false;

  // A disabled or not-yet-configured age-assurance deployment is the agreed
  // safe pre-launch state. It must not be converted into a customer lockout.
  if (inactiveAgeDeployment(access) && !hasRestrictions(access)) return false;

  // Reviews only terminate access where Head Office explicitly requires active
  // sessions to be revoked.
  return access?.revokeSessions === true;
}

export function isHeadOfficeAgeStepUp(access = {}) {
  const assurance = access?.ageAssurance;
  return headOfficeAgeAuthorityReady(access)
    && decisionOf(access) === "step_up"
    && assurance?.required === true;
}
