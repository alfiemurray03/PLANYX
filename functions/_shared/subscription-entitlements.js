export const SUBSCRIPTION_ENTITLEMENTS = Object.freeze({
  personal: Object.freeze({ planCode: "personal", draftLimit: 3, retentionDays: 14, creditLimit: 350000, fiveHourLimit: 150000 }),
  standard: Object.freeze({ planCode: "standard", draftLimit: 5, retentionDays: 14, creditLimit: 750000, fiveHourLimit: 300000 }),
  professional: Object.freeze({ planCode: "professional", draftLimit: 10, retentionDays: 30, creditLimit: 1500000, fiveHourLimit: 600000 }),
  org_starter: Object.freeze({ planCode: "org_starter", draftLimit: 10, retentionDays: 30, creditLimit: null, fiveHourLimit: null }),
  trial: Object.freeze({ planCode: "trial", draftLimit: 3, retentionDays: 14, creditLimit: 30, fiveHourLimit: 30 })
});

const PLAN_ALIASES = Object.freeze({
  personal: "personal", explore: "personal", "explore-plan": "personal",
  "business-personal": "personal", "business-explore": "personal", "business-explore-plan": "personal",
  standard: "standard", plan: "standard", "plan-plan": "standard",
  "business-standard": "standard", "business-plan": "standard", "business-plan-plan": "standard",
  professional: "professional", complete: "professional", "complete-plan": "professional",
  "business-professional": "professional", "business-complete": "professional", "business-complete-plan": "professional",
  org_starter: "org_starter", "org-starter": "org_starter", together: "org_starter", "together-plan": "org_starter",
  "business-org-starter": "org_starter", "business-together": "org_starter", "business-together-plan": "org_starter",
  trial: "trial", "30-day-free-trial": "trial"
});

export function normalisePlanCode(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return PLAN_ALIASES[key] || "";
}

export function planEntitlements(value) {
  const code = normalisePlanCode(value);
  return SUBSCRIPTION_ENTITLEMENTS[code] || null;
}
