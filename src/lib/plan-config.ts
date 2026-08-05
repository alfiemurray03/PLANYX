/**
 * Central plan configuration for Sousa Murray Planeia.
 * All plan limits, features, and metadata live here.
 * Admin can override limits via system config (DB), but these are the defaults.
 */

export type PlanId =
  | 'free'
  | 'personal'
  | 'standard'
  | 'professional'
  | 'org_starter'
  | 'org_growth'
  | 'org_professional';

export type TemplateAccess = 'free' | 'personal' | 'standard' | 'professional' | 'organisation';

/** Template tiers — what plan is required to USE a template */
export const TEMPLATE_TIER_ORDER: TemplateAccess[] = ['free', 'personal', 'standard', 'professional', 'organisation'];

/** Which template tiers each plan can access */
export const PLAN_TEMPLATE_ACCESS: Record<PlanId, TemplateAccess[]> = {
  free:             [],          // free plan: 1 demo template only — enforced by PLAN_FREE_TEMPLATE_LIMIT
  personal:         ['free', 'personal', 'standard'],
  standard:         ['free', 'personal', 'standard'],
  professional:     ['free', 'personal', 'standard', 'professional'],
  org_starter:      ['free', 'personal', 'standard', 'professional', 'organisation'],
  org_growth:       ['free', 'personal', 'standard', 'professional', 'organisation'],
  org_professional: ['free', 'personal', 'standard', 'professional', 'organisation'],
};

/** Free plan: max number of free-tier templates accessible (demo limit) */
export const PLAN_FREE_TEMPLATE_LIMIT = 1;

/** Max saved drafts per plan (0 = no saving) */
export const PLAN_DRAFT_LIMIT: Record<PlanId, number> = {
  free:             0,
  personal:         3,
  standard:         5,
  professional:     10,
  org_starter:      10,
  org_growth:       10,
  org_professional: 10,
};

/** Document retention in days (null = no saving allowed) */
export const PLAN_RETENTION_DAYS: Record<PlanId, number | null> = {
  free:             null,
  personal:         14,
  standard:         14,
  professional:     30,
  org_starter:      30,
  org_growth:       30,
  org_professional: 30,
};

/** Max users per org plan (base seats before add-ons) */
export const ORG_BASE_SEATS: Record<PlanId, number> = {
  free:             1,
  personal:         1,
  standard:         1,
  professional:     1,
  org_starter:      2,
  org_growth:       5,
  org_professional: 10,
};

/** Human-readable plan labels */
export const PLAN_LABELS: Record<PlanId, string> = {
  free:             'No subscription',
  personal:         'Explore',
  standard:         'Plan',
  professional:     'Complete',
  org_starter:      'Together',
  org_growth:       'Legacy organisation growth',
  org_professional: 'Legacy organisation professional',
};

/** Short labels for badges */
export const PLAN_SHORT_LABELS: Record<PlanId, string> = {
  free:             'None',
  personal:         'Explore',
  standard:         'Plan',
  professional:     'Complete',
  org_starter:      'Together',
  org_growth:       'Legacy',
  org_professional: 'Legacy',
};

/** Pricing display */
export const PLAN_PRICE_DISPLAY: Record<PlanId, string> = {
  free:             '£0',
  personal:         '£5.99',
  standard:         '£7.99',
  professional:     '£14.99',
  org_starter:      '£39.99',
  org_growth:       '£59.99',
  org_professional: '£99.99',
};

/** Whether each current paid product has a 30-day trial. */
export const PLAN_HAS_TRIAL: Record<PlanId, boolean> = {
  free:             false,
  personal:         true,
  standard:         true,
  professional:     true,
  org_starter:      true,
  org_growth:       false,
  org_professional: false,
};

/** Is this an organisation plan? */
export function isOrgPlan(plan: PlanId): boolean {
  return plan === 'org_starter' || plan === 'org_growth' || plan === 'org_professional';
}

/** Can this plan save drafts? */
export function canSaveDrafts(plan: PlanId): boolean {
  return PLAN_DRAFT_LIMIT[plan] > 0;
}

/** Can this plan access a given template tier? */
export function canAccessTemplate(plan: PlanId, templateTier: TemplateAccess): boolean {
  if (plan === 'free') return false; // free plan: only 1 demo template, gated separately
  return PLAN_TEMPLATE_ACCESS[plan].includes(templateTier);
}

/**
 * Can a free-plan user access a specific template by index (0-based)?
 * Only the first free template (index 0) is accessible on the free plan.
 */
export function canFreeAccessTemplate(templateIndex: number): boolean {
  return templateIndex < PLAN_FREE_TEMPLATE_LIMIT;
}

/**
 * Can this plan access a builder template with the given planRequired value?
 * planRequired is a BuilderPlanRequired ('free' | 'personal' | 'standard' | 'professional').
 * This maps directly to TemplateAccess.
 */
export function canAccessBuilderTemplate(plan: PlanId, planRequired: string): boolean {
  return PLAN_TEMPLATE_ACCESS[plan].includes(planRequired as TemplateAccess);
}

/**
 * Maps each paid plan to the env-secret name that holds its Stripe Price ID.
 * All 6 paid plans are covered. STRIPE_PRICE_ORG is a legacy/alias price stored
 * separately but not used for checkout — org_starter uses STRIPE_PRICE_ORG_STARTER.
 */
export const PLAN_STRIPE_SECRET_KEY: Partial<Record<PlanId, string>> = {
  personal:         'STRIPE_PRICE_EXPLORE',
  standard:         'STRIPE_PRICE_PLAN',
  professional:     'STRIPE_PRICE_COMPLETE',
  org_starter:      'STRIPE_PRICE_TOGETHER',
  org_growth:       'STRIPE_PRICE_ORG_GROWTH',
  org_professional: 'STRIPE_PRICE_ORG_PROFESSIONAL',
};

/**
 * All 7 Stripe price secret names (including the legacy STRIPE_PRICE_ORG alias).
 * Used by admin diagnostics/verify-prices to show the full picture.
 */
export const ALL_STRIPE_PRICE_SECRETS: Array<{ secretKey: string; label: string; planId?: PlanId }> = [
  { secretKey: 'STRIPE_PRICE_EXPLORE',  label: 'Explore',  planId: 'personal' },
  { secretKey: 'STRIPE_PRICE_PLAN',     label: 'Plan',     planId: 'standard' },
  { secretKey: 'STRIPE_PRICE_COMPLETE', label: 'Complete', planId: 'professional' },
  { secretKey: 'STRIPE_PRICE_TOGETHER', label: 'Together', planId: 'org_starter' },
];

/** All paid plans in order */
export const PAID_PLANS: PlanId[] = [
  'personal', 'standard', 'professional', 'org_starter',
];

/** Plan upgrade order for comparison */
export const PLAN_TIER_ORDER: PlanId[] = [
  'free', 'personal', 'standard', 'professional', 'org_starter', 'org_growth', 'org_professional',
];

export function planTierIndex(plan: PlanId): number {
  return PLAN_TIER_ORDER.indexOf(plan);
}

// ── Document Signing feature ──────────────────────────────────────────────────

/**
 * Which plans have Document Signing access.
 * Document Signing is a paid add-on available from 'professional' upwards.
 * Admins can override this via system config.
 */
export const PLAN_SIGNING_ACCESS: Record<PlanId, boolean> = {
  free:             false,
  personal:         false,
  standard:         false,
  professional:     true,
  org_starter:      true,
  org_growth:       true,
  org_professional: true,
};

/** Max signing requests per plan (0 = no access) */
export const PLAN_SIGNING_LIMIT: Record<PlanId, number> = {
  free:             0,
  personal:         0,
  standard:         0,
  professional:     20,
  org_starter:      50,
  org_growth:       150,
  org_professional: 500,
};

/** Max signers per signing request per plan */
export const PLAN_SIGNING_MAX_SIGNERS: Record<PlanId, number> = {
  free:             0,
  personal:         0,
  standard:         0,
  professional:     5,
  org_starter:      10,
  org_growth:       20,
  org_professional: 50,
};

/** Can this plan use Document Signing? */
export function canUseSigning(plan: PlanId): boolean {
  return PLAN_SIGNING_ACCESS[plan] === true;
}
