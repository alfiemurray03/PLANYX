import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  BadgePoundSterling,
  CheckCircle2,
  Eye,
  EyeOff,
  ListRestart,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  StarOff,
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
  const pricePence = Number(plan.price_pence || 0);
  return {
    ...plan,
    price_pence: pricePence,
    sort_order: Number(plan.sort_order || 100),
    is_active: Number(plan.is_active || 0) === 1,
    is_featured: Number(plan.is_featured || 0) === 1,
    stripe_product_id: plan.stripe_product_id || '',
    stripe_price_id: plan.stripe_price_id || '',
    delivery_time: plan.delivery_time || '',
    revisions: plan.revisions || '',
    description: plan.description || '',
    button_label: plan.button_label || 'Start 30-day free trial',
    price_label: plan.price_label || `£${(pricePence / 100).toFixed(2)}`,
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

function displayUpdatedAt(value?: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [savedPlans, setSavedPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verification, setVerification] = useState<Record<string, VerifyResult>>({});

  const dirty = useMemo(() => serialisePlans(plans) !== serialisePlans(savedPlans), [plans, savedPlans]);
  const activePlans = plans.filter(plan => Boolean(plan.is_active)).length;
  const featuredPlans = plans.filter(plan => Boolean(plan.is_featured)).length;
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || plans[0] || null;
  const selectedVerification = selectedPlan ? verification[selectedPlan.id] : undefined;

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
      setSavedPlans(loaded);
      setSelectedPlanId(current => loaded.some(plan => plan.id === current) ? current : loaded[0]?.id || '');
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

  function clearPlanVerification(id?: string) {
    setVerification(current => {
      if (!id) return {};
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updatePlan(id: string, change: Partial<SubscriptionPlan>) {
    setPlans(current => current.map(plan => plan.id === id ? { ...plan, ...change } : plan));
    setError('');
    setSuccess('');
    clearPlanVerification(id);
  }

  function updatePrice(id: string, poundsValue: string) {
    const pounds = Number(poundsValue);
    const pence = Number.isFinite(pounds) ? Math.max(0, Math.round(pounds * 100)) : 0;
    updatePlan(id, { price_pence: pence, price_label: `£${(pence / 100).toFixed(2)}` });
  }

  function prepareBulkChange(
    message: string,
    transform: (plan: SubscriptionPlan, index: number) => SubscriptionPlan,
    confirmation?: string,
  ) {
    if (confirmation && !window.confirm(confirmation)) return;
    setPlans(current => current.map(transform));
    setVerification({});
    setError('');
    setSuccess(`${message} Review the plans, then select Save all to publish the change.`);
  }

  function restoreSavedChanges() {
    if (!dirty) return;
    if (!window.confirm('Discard every unsaved subscription-plan change on this page?')) return;
    setPlans(savedPlans.map(plan => ({ ...plan })));
    setVerification({});
    setError('');
    setSuccess('All unsaved plan changes were discarded.');
  }

  function validatePlans() {
    for (const plan of plans) {
      if (!plan.id.trim()) return 'Every plan requires a permanent plan ID.';
      if (!plan.plan_name.trim()) return `Enter a plan name for ${plan.id}.`;
      if (!plan.plan_type.trim()) return `Enter a plan type for ${plan.plan_name}.`;
      if (!plan.price_label.trim()) return `Enter a public price label for ${plan.plan_name}.`;
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
      setSavedPlans(saved);
      setSuccess(`Saved ${saved.length} complete subscription plans. The public pricing page and checkout now use these settings.`);
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
        setError(`${data.summary?.valid ?? 0} of ${data.summary?.total ?? 0} core Stripe prices passed verification. Select the marked plans to review them.`);
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
      <AdminLayout title="Subscription Plans" subtitle="Edit every plan setting, universal availability and Stripe billing references">
        <div className="mx-auto w-full max-w-7xl space-y-4 pb-20">
          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-white via-blue-50/70 to-violet-50/60 shadow-lg dark:border-blue-500/30 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/50">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
            <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-200">
                  <BadgePoundSterling className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.14em]">Complete pricing control</span>
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Edit every plan without the endless scrolling</h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Choose any plan, edit all of its customer-facing and Stripe settings, or apply a universal control to the full catalogue.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{plans.length} plans</span>
                <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">{activePlans} live</span>
                <span className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">{featuredPlans} featured</span>
              </div>
            </div>
          </section>

          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="universal-plan-controls">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 id="universal-plan-controls" className="text-sm font-black text-slate-950 dark:text-white">Universal controls for every plan</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">These prepare bulk changes. Nothing goes live until you select Save all.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={loading || saving} onClick={() => prepareBulkChange('Every plan has been marked as active.', plan => ({ ...plan, is_active: true }))}>
                  <Eye className="h-4 w-4" /> Activate all
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10" disabled={loading || saving} onClick={() => prepareBulkChange('Every plan has been marked as hidden.', plan => ({ ...plan, is_active: false }), 'Disable every subscription plan? Customers will see no active paid plans after you save.') }>
                  <EyeOff className="h-4 w-4" /> Disable all
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={loading || saving} onClick={() => prepareBulkChange('Every plan has been marked as featured.', plan => ({ ...plan, is_featured: true }))}>
                  <Sparkles className="h-4 w-4" /> Feature all
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={loading || saving} onClick={() => prepareBulkChange('Featured status has been removed from every plan.', plan => ({ ...plan, is_featured: false }))}>
                  <StarOff className="h-4 w-4" /> Clear featured
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={loading || saving} onClick={() => prepareBulkChange('Plan display order has been reset.', (plan, index) => ({ ...plan, sort_order: (index + 1) * 10 }))}>
                  <ListRestart className="h-4 w-4" /> Reset order
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-2" disabled={!dirty || loading || saving} onClick={restoreSavedChanges}>
                  <RefreshCw className="h-4 w-4" /> Discard unsaved
                </Button>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="px-1">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{dirty ? 'Unsaved plan changes' : 'All changes saved'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Changes apply to the public pricing page and Stripe checkout.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadPlans()} disabled={loading || saving || verifying} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Reload
              </Button>
              <Button variant="outline" size="sm" onClick={() => void verifyAll()} disabled={loading || saving || verifying} className="gap-2">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify all
              </Button>
              <Button size="sm" onClick={() => void saveAll()} disabled={loading || saving || verifying || !dirty} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save all
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
          ) : (
            <>
              <section aria-label="Choose subscription plan" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {plans.map(plan => {
                  const selected = selectedPlan?.id === plan.id;
                  const result = verification[plan.id];
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative rounded-2xl border p-4 text-left shadow-sm transition ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'}`}
                      aria-pressed={selected}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slate-950 dark:text-white">{plan.plan_name}</span>
                          <span className="mt-1 block text-xl font-black text-blue-700 dark:text-blue-300">{plan.price_label}</span>
                        </span>
                        {result && <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${result.valid ? 'bg-emerald-500' : 'bg-red-500'}`} title={result.valid ? 'Stripe verified' : 'Stripe verification failed'} />}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${Boolean(plan.is_active) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {Boolean(plan.is_active) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{Boolean(plan.is_active) ? 'Live' : 'Hidden'}
                        </span>
                        {Boolean(plan.is_featured) && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold uppercase text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Sparkles className="h-3 w-3" /> Featured</span>}
                      </div>
                    </button>
                  );
                })}
              </section>

              {selectedPlan && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
                  <CardContent className="p-5 sm:p-6">
                    <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">Editing {selectedPlan.plan_name}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Every stored plan setting is editable below. The permanent ID remains locked to protect checkout and existing subscriptions.</p>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2"><Label htmlFor={`${selectedPlan.id}-active`} className="text-sm">Live</Label><Switch id={`${selectedPlan.id}-active`} checked={Boolean(selectedPlan.is_active)} onCheckedChange={checked => updatePlan(selectedPlan.id, { is_active: checked })} /></div>
                        <div className="flex items-center gap-2"><Label htmlFor={`${selectedPlan.id}-featured`} className="text-sm">Featured</Label><Switch id={`${selectedPlan.id}-featured`} checked={Boolean(selectedPlan.is_featured)} onCheckedChange={checked => updatePlan(selectedPlan.id, { is_featured: checked })} /></div>
                      </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-name`}>Plan name</Label><Input id={`${selectedPlan.id}-name`} value={selectedPlan.plan_name} onChange={event => updatePlan(selectedPlan.id, { plan_name: event.target.value })} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-type`}>Plan type</Label><Input id={`${selectedPlan.id}-type`} value={selectedPlan.plan_type} onChange={event => updatePlan(selectedPlan.id, { plan_type: event.target.value })} /></div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-price`}>Monthly price (£)</Label><Input id={`${selectedPlan.id}-price`} type="number" min="0" step="0.01" value={Number((selectedPlan.price_pence / 100).toFixed(2))} onChange={event => updatePrice(selectedPlan.id, event.target.value)} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-label`}>Public price label</Label><Input id={`${selectedPlan.id}-label`} value={selectedPlan.price_label} onChange={event => updatePlan(selectedPlan.id, { price_label: event.target.value })} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-sort`}>Display order</Label><Input id={`${selectedPlan.id}-sort`} type="number" min="0" step="1" value={selectedPlan.sort_order} onChange={event => updatePlan(selectedPlan.id, { sort_order: Number(event.target.value || 0) })} /></div>
                        </div>

                        <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-description`}>Public description</Label><Textarea id={`${selectedPlan.id}-description`} rows={3} value={selectedPlan.description} onChange={event => updatePlan(selectedPlan.id, { description: event.target.value })} /></div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-benefit-one`}>Benefit line 1</Label><Input id={`${selectedPlan.id}-benefit-one`} value={selectedPlan.delivery_time} onChange={event => updatePlan(selectedPlan.id, { delivery_time: event.target.value })} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-benefit-two`}>Benefit line 2</Label><Input id={`${selectedPlan.id}-benefit-two`} value={selectedPlan.revisions} onChange={event => updatePlan(selectedPlan.id, { revisions: event.target.value })} /></div>
                        </div>

                        <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-button`}>Purchase button wording</Label><Input id={`${selectedPlan.id}-button`} value={selectedPlan.button_label} onChange={event => updatePlan(selectedPlan.id, { button_label: event.target.value })} /></div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200"><ShieldCheck className="h-5 w-5" /><h3 className="font-bold">Stripe billing references</h3></div>
                          <p className="mt-1 text-xs leading-5 text-blue-900/70 dark:text-blue-100/70">These IDs control live checkout for this plan.</p>
                          <div className="mt-4 space-y-3">
                            <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-product`}>Stripe Product ID</Label><Input id={`${selectedPlan.id}-product`} value={selectedPlan.stripe_product_id} onChange={event => updatePlan(selectedPlan.id, { stripe_product_id: event.target.value.trim() })} placeholder="prod_..." className="font-mono text-xs" /></div>
                            <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-stripe-price`}>Stripe Price ID</Label><Input id={`${selectedPlan.id}-stripe-price`} value={selectedPlan.stripe_price_id} onChange={event => updatePlan(selectedPlan.id, { stripe_price_id: event.target.value.trim() })} placeholder="price_..." className="font-mono text-xs" /></div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                          <div className="space-y-1.5"><Label htmlFor={`${selectedPlan.id}-permanent-id`}>Permanent internal plan ID</Label><Input id={`${selectedPlan.id}-permanent-id`} value={selectedPlan.id} readOnly aria-readonly="true" className="font-mono text-xs" /></div>
                          <p className="mt-2">This ID cannot be renamed because customer checkout links, billing records and subscription metadata rely on it.</p>
                          <p className="mt-2"><strong>Last database update:</strong> {displayUpdatedAt(selectedPlan.updated_at)}</p>
                        </div>

                        {selectedVerification ? (
                          <div className={`rounded-2xl border p-4 text-sm ${selectedVerification.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'}`}>
                            <p className="font-bold">{selectedVerification.valid ? 'Stripe verification passed' : 'Stripe verification failed'}</p>
                            <p className="mt-1 leading-6">{selectedVerification.valid ? `${selectedVerification.product || 'Product'} · ${selectedVerification.currency || 'GBP'} · ${typeof selectedVerification.amount === 'number' ? `£${(selectedVerification.amount / 100).toFixed(2)}` : 'Amount unavailable'} · ${selectedVerification.interval || 'interval unavailable'}` : selectedVerification.error || 'Review this Price ID in Stripe.'}</p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Select <strong>Verify all</strong> to check this plan against Stripe.</div>
                        )}

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                          <strong>Important:</strong> Stripe does not allow the amount of an existing Price ID to be edited. When changing the monthly price, create the matching recurring Price in Stripe and paste its new Price ID here.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <div className="sticky bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <p className="text-sm font-semibold text-slate-950 dark:text-white">{dirty ? 'Unsaved changes across the plan catalogue' : 'Every plan is saved'}</p>
            <Button size="sm" onClick={() => void saveAll()} disabled={loading || saving || verifying || !dirty} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save all
            </Button>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
