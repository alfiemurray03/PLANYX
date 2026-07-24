import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  BadgePoundSterling,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface SubscriptionPlan {
  id: string;
  plan_name: string;
  plan_type: string;
  price_label: string;
  price_pence: number;
  stripe_product_id: string;
  stripe_price_id: string;
  delivery_time: string;
  revisions: string;
  description: string;
  button_label: string;
  is_active: number | boolean;
  is_featured: number | boolean;
  sort_order: number;
  updated_at?: string | null;
}

interface PlansResponse {
  plans?: SubscriptionPlan[];
  saved?: boolean;
  error?: string;
}

interface VerifyResult {
  set?: boolean;
  valid?: boolean;
  label?: string;
  id?: string;
  source?: string;
  product?: string;
  amount?: number | null;
  currency?: string;
  interval?: string;
  active?: boolean;
  error?: string;
}

interface VerifyResponse {
  success?: boolean;
  prices?: Record<string, VerifyResult>;
  summary?: { valid: number; total: number; allValid: boolean };
  error?: string;
}

function normalisePlan(plan: SubscriptionPlan): SubscriptionPlan {
  return {
    ...plan,
    price_pence: Number(plan.price_pence || 0),
    sort_order: Number(plan.sort_order || 100),
    is_active: Number(plan.is_active || 0) === 1,
    is_featured: Number(plan.is_featured || 0) === 1,
    stripe_product_id: plan.stripe_product_id || '',
    stripe_price_id: plan.stripe_price_id || '',
    delivery_time: plan.delivery_time || '',
    revisions: plan.revisions || '',
    description: plan.description || '',
    button_label: plan.button_label || 'Start 30-day free trial',
    price_label: plan.price_label || `£${(Number(plan.price_pence || 0) / 100).toFixed(2)}`,
  };
}

function serialisePlans(plans: SubscriptionPlan[]) {
  return JSON.stringify(plans.map(plan => ({
    ...plan,
    is_active: Boolean(plan.is_active),
    is_featured: Boolean(plan.is_featured),
    price_pence: Number(plan.price_pence || 0),
    sort_order: Number(plan.sort_order || 100),
  })));
}

function priceInPounds(plan: SubscriptionPlan) {
  return (Number(plan.price_pence || 0) / 100).toFixed(2);
}

function displayUpdatedAt(value?: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('[]');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verification, setVerification] = useState<Record<string, VerifyResult>>({});

  const currentSnapshot = useMemo(() => serialisePlans(plans), [plans]);
  const dirty = currentSnapshot !== savedSnapshot;
  const activePlans = plans.filter(plan => Boolean(plan.is_active)).length;

  async function loadPlans() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/admin/api?section=plans', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as PlansResponse;
      if (!response.ok || !Array.isArray(data.plans)) {
        throw new Error(data.error || 'Subscription plans could not be loaded.');
      }
      const loaded = data.plans.map(normalisePlan);
      setPlans(loaded);
      setSavedSnapshot(serialisePlans(loaded));
      setExpanded(Object.fromEntries(loaded.map((plan, index) => [plan.id, index === 0])));
      setVerification({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Subscription plans could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function updatePlan(id: string, change: Partial<SubscriptionPlan>) {
    setPlans(current => current.map(plan => plan.id === id ? { ...plan, ...change } : plan));
    setSuccess('');
    setVerification(current => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updatePrice(id: string, value: string) {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const pounds = Number(cleaned || 0);
    const pence = Number.isFinite(pounds) ? Math.max(0, Math.round(pounds * 100)) : 0;
    updatePlan(id, { price_pence: pence, price_label: `£${(pence / 100).toFixed(2)}` });
  }

  function validatePlans() {
    for (const plan of plans) {
      if (!plan.id.trim()) return 'Every plan requires a permanent plan ID.';
      if (!plan.plan_name.trim()) return `Enter a plan name for ${plan.id}.`;
      if (!Number.isFinite(Number(plan.price_pence)) || Number(plan.price_pence) < 0) return `${plan.plan_name} has an invalid price.`;
      if (plan.stripe_price_id && !/^price_[A-Za-z0-9]+$/.test(plan.stripe_price_id.trim())) return `${plan.plan_name} has an invalid Stripe Price ID.`;
      if (plan.stripe_product_id && !/^prod_[A-Za-z0-9]+$/.test(plan.stripe_product_id.trim())) return `${plan.plan_name} has an invalid Stripe Product ID.`;
    }
    return '';
  }

  async function saveAll() {
    const validationError = validatePlans();
    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/admin/api?section=plans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: 'save_all',
          plans: plans.map(plan => ({
            ...plan,
            is_active: Boolean(plan.is_active),
            is_featured: Boolean(plan.is_featured),
            price_pence: Number(plan.price_pence || 0),
            sort_order: Number(plan.sort_order || 100),
          })),
        }),
      });
      const data = await response.json().catch(() => ({})) as PlansResponse;
      if (!response.ok || !data.saved || !Array.isArray(data.plans)) {
        throw new Error(data.error || 'Subscription plan changes could not be saved.');
      }
      const saved = data.plans.map(normalisePlan);
      setPlans(saved);
      setSavedSnapshot(serialisePlans(saved));
      setSuccess(`Saved ${saved.length} subscription plans. The website catalogue and checkout now use these settings.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Subscription plan changes could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function verifyAll() {
    const validationError = validatePlans();
    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }

    setVerifying(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/stripe/verify-prices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ prices: Object.fromEntries(plans.map(plan => [plan.id, plan.stripe_price_id])) }),
      });
      const data = await response.json().catch(() => ({})) as VerifyResponse;
      if (!response.ok || !data.success || !data.prices) {
        throw new Error(data.error || 'Stripe prices could not be verified.');
      }
      setVerification(data.prices);
      if (data.summary?.allValid) {
        setSuccess(`All ${data.summary.total} core Stripe prices are valid.`);
      } else {
        setError(`${data.summary?.valid ?? 0} of ${data.summary?.total ?? 0} core Stripe prices passed verification. Review the marked plans below.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Stripe prices could not be verified.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Subscription Plans - Planyx Admin Centre</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Subscription Plans" subtitle="Edit public pricing, plan availability and Stripe billing references">
        <div className="mx-auto w-full max-w-7xl space-y-6 pb-24">
          <section className="overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-white via-blue-50/70 to-violet-50/60 shadow-xl dark:border-blue-500/30 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/50">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
            <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.3fr_0.7fr] lg:items-center sm:px-8">
              <div>
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-200">
                  <BadgePoundSterling className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.15em]">Pricing control</span>
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Edit the plans customers see and purchase</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                  Changes save to the live plan catalogue used by the public pricing page and Stripe checkout. Hide a plan rather than deleting its permanent plan ID.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Plans</p>
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{plans.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live</p>
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{activePlans}</p>
                </div>
              </div>
            </div>
          </section>

          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950 dark:text-white">{dirty ? 'Unsaved plan changes' : 'All plan changes are saved'}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Verify checks the four core Planyx monthly prices directly with Stripe.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadPlans()} disabled={loading || saving || verifying} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Reload
              </Button>
              <Button variant="outline" onClick={() => void verifyAll()} disabled={loading || saving || verifying} className="gap-2">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify all Stripe prices
              </Button>
              <Button onClick={() => void saveAll()} disabled={loading || saving || verifying || !dirty} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save all changes
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
          ) : (
            <div className="space-y-4">
              {plans.map((plan, index) => {
                const isExpanded = expanded[plan.id] ?? false;
                const result = verification[plan.id];
                return (
                  <Card key={plan.id} className="overflow-hidden border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <div className={`h-1.5 ${Boolean(plan.is_featured) ? 'bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500' : 'bg-gradient-to-r from-blue-600 to-cyan-500'}`} />
                    <CardHeader className="p-0">
                      <button
                        type="button"
                        onClick={() => setExpanded(current => ({ ...current, [plan.id]: !isExpanded }))}
                        className="flex w-full items-start justify-between gap-4 p-5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        aria-expanded={isExpanded}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-xl font-bold text-slate-950 dark:text-white">{plan.plan_name || `Plan ${index + 1}`}</span>
                            {Boolean(plan.is_featured) && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Sparkles className="h-3 w-3" /> Featured</span>}
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${Boolean(plan.is_active) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {Boolean(plan.is_active) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{Boolean(plan.is_active) ? 'Live' : 'Hidden'}
                            </span>
                            {result && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${result.valid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'}`}>{result.valid ? 'Stripe verified' : 'Stripe check failed'}</span>}
                          </span>
                          <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{plan.id} · {plan.plan_type || 'Plan type not set'} · {plan.price_label}</span>
                        </span>
                        {isExpanded ? <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-400" />}
                      </button>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="border-t border-slate-200 p-5 dark:border-slate-700 sm:p-6">
                        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                          <div className="space-y-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-name`}>Plan name</Label>
                                <Input id={`${plan.id}-name`} value={plan.plan_name} onChange={event => updatePlan(plan.id, { plan_name: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-type`}>Plan type</Label>
                                <Input id={`${plan.id}-type`} value={plan.plan_type} onChange={event => updatePlan(plan.id, { plan_type: event.target.value })} placeholder="Monthly subscription" />
                              </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-price`}>Monthly price (£)</Label>
                                <div className="relative">
                                  <CircleDollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <Input id={`${plan.id}-price`} className="pl-9" inputMode="decimal" value={priceInPounds(plan)} onChange={event => updatePrice(plan.id, event.target.value)} />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Stored as {Number(plan.price_pence || 0)} pence. Display label: {plan.price_label}</p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-sort`}>Display order</Label>
                                <Input id={`${plan.id}-sort`} type="number" min="0" step="1" value={plan.sort_order} onChange={event => updatePlan(plan.id, { sort_order: Number(event.target.value || 0) })} />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`${plan.id}-description`}>Public description</Label>
                              <Textarea id={`${plan.id}-description`} rows={4} value={plan.description} onChange={event => updatePlan(plan.id, { description: event.target.value })} />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-benefit-one`}>Benefit line 1</Label>
                                <Input id={`${plan.id}-benefit-one`} value={plan.delivery_time} onChange={event => updatePlan(plan.id, { delivery_time: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`${plan.id}-benefit-two`}>Benefit line 2</Label>
                                <Input id={`${plan.id}-benefit-two`} value={plan.revisions} onChange={event => updatePlan(plan.id, { revisions: event.target.value })} />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`${plan.id}-button`}>Purchase button wording</Label>
                              <Input id={`${plan.id}-button`} value={plan.button_label} onChange={event => updatePlan(plan.id, { button_label: event.target.value })} />
                            </div>
                          </div>

                          <div className="space-y-5">
                            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200"><ShieldCheck className="h-5 w-5" /><h3 className="font-bold">Stripe billing references</h3></div>
                              <p className="mt-1 text-sm leading-6 text-blue-900/70 dark:text-blue-100/70">Saving updates both the live plan record and the checkout override used for this core plan.</p>
                              <div className="mt-4 space-y-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`${plan.id}-product`}>Stripe Product ID</Label>
                                  <Input id={`${plan.id}-product`} value={plan.stripe_product_id} onChange={event => updatePlan(plan.id, { stripe_product_id: event.target.value.trim() })} placeholder="prod_..." className="font-mono text-xs" />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${plan.id}-stripe-price`}>Stripe Price ID</Label>
                                  <Input id={`${plan.id}-stripe-price`} value={plan.stripe_price_id} onChange={event => updatePlan(plan.id, { stripe_price_id: event.target.value.trim() })} placeholder="price_..." className="font-mono text-xs" />
                                </div>
                              </div>
                              {result && (
                                <div className={`mt-4 rounded-xl border p-3 text-sm ${result.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'}`}>
                                  <p className="font-semibold">{result.valid ? 'Stripe verification passed' : 'Stripe verification failed'}</p>
                                  <p className="mt-1 leading-5">{result.valid ? `${result.product || 'Product'} · ${result.currency || 'GBP'} · ${typeof result.amount === 'number' ? `£${(result.amount / 100).toFixed(2)}` : 'Amount unavailable'} · ${result.interval || 'interval unavailable'}` : result.error || 'Review this Price ID in Stripe.'}</p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                              <h3 className="font-bold text-slate-950 dark:text-white">Visibility and presentation</h3>
                              <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div><Label htmlFor={`${plan.id}-active`}>Plan is live</Label><p className="text-xs text-slate-500 dark:text-slate-400">Show this plan on the public pricing page and allow checkout.</p></div>
                                  <Switch id={`${plan.id}-active`} checked={Boolean(plan.is_active)} onCheckedChange={checked => updatePlan(plan.id, { is_active: checked })} />
                                </div>
                                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                                  <div><Label htmlFor={`${plan.id}-featured`}>Featured plan</Label><p className="text-xs text-slate-500 dark:text-slate-400">Give this plan the highlighted public presentation.</p></div>
                                  <Switch id={`${plan.id}-featured`} checked={Boolean(plan.is_featured)} onCheckedChange={checked => updatePlan(plan.id, { is_featured: checked })} />
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                              <p><strong className="text-slate-700 dark:text-slate-200">Permanent plan ID:</strong> {plan.id}</p>
                              <p className="mt-1"><strong className="text-slate-700 dark:text-slate-200">Last database update:</strong> {displayUpdatedAt(plan.updated_at)}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <div className="sticky bottom-4 z-40 flex flex-col gap-3 rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950 dark:text-white">{dirty ? 'You have unsaved subscription-plan changes.' : 'Subscription plans are saved.'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Use Save all changes before leaving this page.</p>
            </div>
            <Button onClick={() => void saveAll()} disabled={loading || saving || verifying || !dirty} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save all changes
            </Button>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
