/**
 * Admin Portal — Stripe Integration Management
 * Full management: status, keys, price IDs, trial settings, test tools.
 * Role-gated: PlatformOwner + SystemAdministrator + Admin = full access; SupportAdmin = view only.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink,
  Shield, Tag, Webhook, BarChart2, Activity, Eye, EyeOff,
  Save, TestTube2, Zap, Settings2, CreditCard, Lock, Info,
  ToggleLeft, ToggleRight, Package,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PriceSlotStatus {
  set: boolean;
  masked: string | null;
  id?: string;
  label: string;
}

interface StripeStatus {
  canEdit: boolean;
  isLiveMode: boolean;
  publishableIsLive: boolean;
  keys: {
    secretKey:      { set: boolean; masked: string | null };
    publishableKey: { set: boolean; masked: string | null };
    webhookSecret:  { set: boolean; masked: string | null };
  };
  prices: {
    personal:         PriceSlotStatus;
    standard:         PriceSlotStatus;
    professional:     PriceSlotStatus;
    org_starter:      PriceSlotStatus;
    org:              PriceSlotStatus;
    org_growth:       PriceSlotStatus;
    org_professional: PriceSlotStatus;
  };
  stripeConnected: boolean;
  stripeAccount: {
    id: string;
    businessName: string | null;
    country: string | null;
    defaultCurrency: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    email: string | null;
  } | null;
  subscriptionStats: { total: number; active: number; cancelled: number } | null;
  lastError: string | null;
}

// Ordered list of all 7 price slots for display
const PRICE_SLOT_KEYS: Array<keyof StripeStatus['prices']> = [
  'personal', 'standard', 'professional', 'org_starter', 'org', 'org_growth', 'org_professional',
];

interface VerifiedPrice {
  set: boolean;
  valid: boolean;
  id?: string;
  product?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  active?: boolean;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok)   return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
  if (warn) return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function StatusRow({ label, ok, warn, value }: { label: string; ok: boolean; warn?: boolean; value?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-700/50 last:border-0">
      <div className="flex items-center gap-2.5">
        <StatusDot ok={ok} warn={warn} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      {value && <span className="text-xs text-slate-400 font-mono">{value}</span>}
    </div>
  );
}

function MaskedField({ label, masked, hint }: { label: string; masked: string | null; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label className="text-xs text-slate-400 mb-1 block">{label}</Label>
      {hint && <p className="text-[11px] text-slate-500 mb-1">{hint}</p>}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-slate-300 min-h-[36px] flex items-center">
          {masked
            ? (show ? masked : masked.replace(/\*{4}[^*]+$/, s => '****'))
            : <span className="text-slate-600 italic">Not configured</span>
          }
        </div>
        {masked && (
          <button onClick={() => setShow(v => !v)} className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function SecretInput({
  label, placeholder, value, onChange, hint, warning,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  warning?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label className="text-xs text-slate-300 mb-1 block">{label}</Label>
      {hint && <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>}
      <div className="flex items-center gap-2">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 font-mono text-xs h-9"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="p-2 text-slate-500 hover:text-slate-300 transition-colors shrink-0">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {warning && value && (
        <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {warning}
        </p>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs mt-0.5 text-slate-400">{description}</p>}
      </div>
      <button onClick={() => onChange(!checked)} className="shrink-0 mt-0.5">
        {checked
          ? <ToggleRight className="w-8 h-8 text-primary" />
          : <ToggleLeft className="w-8 h-8 text-slate-600" />
        }
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminStripeDiagnostics() {
  const { admin } = useAdmin();
  // admin.roles is a string[] from Microsoft Entra — check array membership
  const roles = admin?.roles ?? [];
  const canEdit = admin?.isSystemAdministrator === true
    || roles.includes('PlatformOwner')
    || roles.includes('SystemAdministrator')
    || roles.includes('Admin')
    || roles.length === 0; // no roles configured → full access for any authenticated admin
  const canView = canEdit || roles.includes('SupportAdmin');

  const [status, setStatus]       = useState<StripeStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keys form
  const [secretKey,      setSecretKey]      = useState('');
  const [publishableKey, setPublishableKey] = useState('');
  const [webhookSecret,  setWebhookSecret]  = useState('');
  const [successUrl,     setSuccessUrl]     = useState('');
  const [cancelUrl,      setCancelUrl]      = useState('');
  const [portalReturnUrl, setPortalReturnUrl] = useState('');
  const [webhookEndpointUrl, setWebhookEndpointUrl] = useState('');
  const [keysSaving,     setKeysSaving]     = useState(false);
  const [keysSaved,      setKeysSaved]      = useState('');
  const [keysError,      setKeysError]      = useState('');
  const [showLiveWarning, setShowLiveWarning] = useState(false);

  // Prices form — the four live Sousa Murray Planeia subscriptions
  const [pricePersonal,        setPricePersonal]        = useState('');
  const [priceStandard,        setPriceStandard]        = useState('');
  const [priceProfessional,    setPriceProfessional]    = useState('');
  const [priceOrgStarter,      setPriceOrgStarter]      = useState('');
  const [trialEnabled,         setTrialEnabled]         = useState(true);
  const [trialDays,            setTrialDays]            = useState(30);
  const [pricesSaving,      setPricesSaving]      = useState(false);
  const [pricesSaved,       setPricesSaved]       = useState('');
  const [pricesError,       setPricesError]       = useState('');

  // Test tools
  const [testConnResult,  setTestConnResult]  = useState<{ success: boolean; account?: Record<string, unknown>; error?: string } | null>(null);
  const [testConnLoading, setTestConnLoading] = useState(false);
  const [verifyResult,    setVerifyResult]    = useState<Record<string, VerifiedPrice> | null>(null);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [checkoutResult,  setCheckoutResult]  = useState<{ success: boolean; sessionUrl?: string; sessionId?: string; error?: string } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutPlan,    setCheckoutPlan]    = useState('standard');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/stripe/status', { credentials: 'include' });
      if (res.status === 401) {
        setLoadError('Your admin session has expired. Please sign in again at /admin.');
        setLoading(false);
        return;
      }
      const data = await res.json() as { success: boolean; status?: StripeStatus; error?: string };
      if (data.success && data.status) {
        setStatus(data.status);
        // Pre-fill URL fields from status if available (they come from system_config)
      } else {
        setLoadError(data.error ?? 'Failed to load Stripe status.');
      }
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function saveKeys() {
    if (!canEdit) return;
    // Warn before saving live keys
    const isLive = secretKey.startsWith('sk_live_') || publishableKey.startsWith('pk_live_');
    if (isLive && !showLiveWarning) {
      setShowLiveWarning(true);
      return;
    }
    setShowLiveWarning(false);
    setKeysSaving(true);
    setKeysSaved('');
    setKeysError('');
    try {
      const res = await fetch('/api/admin/stripe/update-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          secretKey:         secretKey.trim()         || undefined,
          publishableKey:    publishableKey.trim()    || undefined,
          webhookSecret:     webhookSecret.trim()     || undefined,
          successUrl:        successUrl.trim()        || undefined,
          cancelUrl:         cancelUrl.trim()         || undefined,
          portalReturnUrl:   portalReturnUrl.trim()   || undefined,
          webhookEndpointUrl: webhookEndpointUrl.trim() || undefined,
        }),
      });
      const data = await res.json() as { success: boolean; updated?: string[]; errors?: string[]; error?: string };
      if (data.success) {
        setKeysSaved(`Saved: ${data.updated?.join(', ')}`);
        setSecretKey(''); setPublishableKey(''); setWebhookSecret('');
        setTimeout(() => { setKeysSaved(''); loadStatus(); }, 2500);
      } else {
        setKeysError(data.errors?.join('; ') ?? data.error ?? 'Failed to save.');
      }
    } catch (e) {
      setKeysError(String(e));
    } finally {
      setKeysSaving(false);
    }
  }

  async function savePrices() {
    if (!canEdit) return;
    setPricesSaving(true);
    setPricesSaved('');
    setPricesError('');
    try {
      const res = await fetch('/api/admin/stripe/update-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pricePersonal:        pricePersonal.trim()        || undefined,
          priceStandard:        priceStandard.trim()        || undefined,
          priceProfessional:    priceProfessional.trim()    || undefined,
          priceOrgStarter:      priceOrgStarter.trim()      || undefined,
          trialEnabled,
          trialDays,
        }),
      });
      const data = await res.json() as { success: boolean; updated?: string[]; errors?: string[]; error?: string };
      if (data.success) {
        setPricesSaved(`Saved: ${data.updated?.join(', ')}`);
        setPricePersonal(''); setPriceStandard(''); setPriceProfessional('');
        setPriceOrgStarter('');
        setTimeout(() => { setPricesSaved(''); loadStatus(); }, 2500);
      } else {
        setPricesError(data.errors?.join('; ') ?? data.error ?? 'Failed to save.');
      }
    } catch (e) {
      setPricesError(String(e));
    } finally {
      setPricesSaving(false);
    }
  }

  async function testConnection() {
    setTestConnLoading(true);
    setTestConnResult(null);
    try {
      const res = await fetch('/api/admin/stripe/test-connection', {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json() as { success: boolean; account?: Record<string, unknown>; error?: string };
      setTestConnResult(data);
    } catch (e) {
      setTestConnResult({ success: false, error: String(e) });
    } finally {
      setTestConnLoading(false);
    }
  }

  async function verifyPrices() {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/admin/stripe/verify-prices', {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json() as { success: boolean; prices?: Record<string, VerifiedPrice>; error?: string };
      if (data.success && data.prices) setVerifyResult(data.prices);
      else setVerifyResult({ _error: { set: false, valid: false, error: data.error ?? 'Failed' } });
    } catch (e) {
      setVerifyResult({ _error: { set: false, valid: false, error: String(e) } });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function createTestCheckout() {
    setCheckoutLoading(true);
    setCheckoutResult(null);
    try {
      const res = await fetch('/api/admin/stripe/test-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: checkoutPlan }),
      });
      const data = await res.json() as { success: boolean; sessionUrl?: string; sessionId?: string; error?: string };
      setCheckoutResult(data);
    } catch (e) {
      setCheckoutResult({ success: false, error: String(e) });
    } finally {
      setCheckoutLoading(false);
    }
  }

  const isLiveMode = status?.isLiveMode ?? false;
  const modeColor  = isLiveMode
    ? 'text-green-400 bg-green-500/10 border-green-500/30'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  if (!canView) {
    return (
      <>
        <Helmet>
          <title>Stripe Management — Admin Portal</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <AdminLayout title="Stripe Management" subtitle="Stripe integration settings and diagnostics">
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Lock className="w-12 h-12 text-slate-600" />
            <p className="text-slate-400 text-sm">You do not have permission to view Stripe settings.</p>
          </div>
        </AdminLayout>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Stripe Management — Admin Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Live key confirmation modal */}
      <Dialog open={showLiveWarning} onOpenChange={setShowLiveWarning}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" /> Saving Live Stripe Keys
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              You are about to save <strong className="text-white">live Stripe keys</strong>. This will affect real payments and real customers. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLiveWarning(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={() => { setShowLiveWarning(false); void saveKeys(); }}
              className="bg-amber-600 hover:bg-amber-700 text-white">
              Yes, Save Live Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminLayout title="Stripe Management" subtitle="API keys, price IDs, trial settings, and integration diagnostics">
        <div className="space-y-4">

          {/* Header bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {status && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${modeColor}`}>
                  {isLiveMode ? 'LIVE MODE' : 'TEST MODE'}
                </span>
              )}
              {status?.stripeConnected && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Connected
                </span>
              )}
              {!canEdit && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> View only
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading}
                className="border-slate-600 text-slate-300 bg-slate-800 hover:bg-slate-700 gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" asChild
                className="border-slate-600 text-slate-300 bg-slate-800 hover:bg-slate-700 gap-1.5">
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> Stripe Dashboard
                </a>
              </Button>
            </div>
          </div>

          {loadError && (
            <div className="flex items-start gap-3 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{loadError}</p>
            </div>
          )}

          {loading && !status && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
              <p className="text-slate-400 text-sm">Loading Stripe status…</p>
            </div>
          )}

          {(status || !loading) && (
            <Tabs defaultValue="status">
              <TabsList className="bg-slate-800 border border-slate-700 flex-wrap h-auto gap-1">
                <TabsTrigger value="status"    className="gap-1.5 text-xs data-[state=active]:bg-slate-700"><BarChart2 className="w-3.5 h-3.5" /> Status</TabsTrigger>
                {canEdit && <TabsTrigger value="keys"   className="gap-1.5 text-xs data-[state=active]:bg-slate-700"><Shield className="w-3.5 h-3.5" /> API Keys</TabsTrigger>}
                {canEdit && <TabsTrigger value="prices" className="gap-1.5 text-xs data-[state=active]:bg-slate-700"><Tag className="w-3.5 h-3.5" /> Price IDs</TabsTrigger>}
                <TabsTrigger value="tools"     className="gap-1.5 text-xs data-[state=active]:bg-slate-700"><TestTube2 className="w-3.5 h-3.5" /> Test Tools</TabsTrigger>
                <TabsTrigger value="webhook"   className="gap-1.5 text-xs data-[state=active]:bg-slate-700"><Webhook className="w-3.5 h-3.5" /> Webhook</TabsTrigger>
              </TabsList>

              {/* ── Status tab ── */}
              <TabsContent value="status" className="mt-4 space-y-4">
                {/* Setup checklist */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-white">Setup Checklist</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    {[
                      { label: 'Secret key configured',              ok: status?.keys.secretKey.set ?? false },
                      { label: 'Publishable key configured',         ok: status?.keys.publishableKey.set ?? false },
                      { label: 'Webhook secret configured',          ok: status?.keys.webhookSecret.set ?? false, warn: true },
                      { label: 'Stripe API reachable',               ok: status?.stripeConnected ?? false },
                      { label: 'Explore Plan price ID set',          ok: status?.prices.personal.set ?? false },
                      { label: 'Plan Plan price ID set',             ok: status?.prices.standard.set ?? false },
                      { label: 'Complete Plan price ID set',         ok: status?.prices.professional.set ?? false },
                      { label: 'Together Plan price ID set',         ok: status?.prices.org_starter.set ?? false },
                      { label: 'Key mode consistent',                ok: status?.isLiveMode === status?.publishableIsLive },
                      { label: 'Webhook handlers implemented',       ok: true },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 py-1.5 border-b border-slate-700/30 last:border-0">
                        <StatusDot ok={item.ok} warn={!item.ok && item.warn} />
                        <span className="text-xs text-slate-300">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Keys status */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold text-white">API Keys</span>
                    </div>
                    {status ? (
                      <div className="space-y-3">
                        <MaskedField label="Secret Key"      masked={status.keys.secretKey.masked} />
                        <MaskedField label="Publishable Key" masked={status.keys.publishableKey.masked} />
                        <MaskedField label="Webhook Secret"  masked={status.keys.webhookSecret.masked} />
                        {status.isLiveMode !== status.publishableIsLive && (
                          <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2 mt-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300">Key mode mismatch — secret and publishable keys are in different modes (live vs test).</p>
                          </div>
                        )}
                        {status.lastError && (
                          <div className="bg-red-950/30 border border-red-700/40 rounded-lg px-3 py-2">
                            <p className="text-xs text-red-400 font-mono break-all">{status.lastError}</p>
                          </div>
                        )}
                      </div>
                    ) : <p className="text-slate-500 text-sm">No data</p>}
                  </div>

                  {/* Account info */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-semibold text-white">Stripe Account</span>
                    </div>
                    {status?.stripeAccount ? (
                      <div className="space-y-2">
                        {[
                          { label: 'Account ID',        value: status.stripeAccount.id },
                          { label: 'Business Name',     value: status.stripeAccount.businessName ?? '—' },
                          { label: 'Email',             value: status.stripeAccount.email ?? '—' },
                          { label: 'Country',           value: status.stripeAccount.country?.toUpperCase() ?? '—' },
                          { label: 'Default Currency',  value: status.stripeAccount.defaultCurrency?.toUpperCase() ?? '—' },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-700/40 last:border-0">
                            <span className="text-xs text-slate-400">{row.label}</span>
                            <span className="text-xs text-white font-mono">{row.value}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-1.5 border-b border-slate-700/40">
                          <span className="text-xs text-slate-400">Charges Enabled</span>
                          <StatusDot ok={status.stripeAccount.chargesEnabled} />
                        </div>
                        <div className="flex items-center justify-between py-1.5">
                          <span className="text-xs text-slate-400">Payouts Enabled</span>
                          <StatusDot ok={status.stripeAccount.payoutsEnabled} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <CreditCard className="w-8 h-8 text-slate-600" />
                        <p className="text-slate-500 text-sm">
                          {status?.keys.secretKey.set ? 'Could not connect to Stripe' : 'No secret key configured'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Price IDs status */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 lg:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-semibold text-white">Price IDs — All Plans</span>
                    </div>
                    {status ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {PRICE_SLOT_KEYS.map(key => {
                          const slot = status.prices[key];
                          return (
                            <div key={key} className="bg-slate-900/60 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <StatusDot ok={slot.set} />
                                <span className="text-xs font-medium text-slate-300">{slot.label}</span>
                              </div>
                              {slot.masked
                                ? <p className="text-[11px] font-mono text-slate-400 break-all">{slot.masked}</p>
                                : <p className="text-[11px] text-slate-600 italic">Not configured</p>
                              }
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-slate-500 text-sm">No data</p>}
                  </div>

                  {/* Subscription stats */}
                  {status?.subscriptionStats && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-semibold text-white">Subscription Stats</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Total',     value: status.subscriptionStats.total,     color: 'text-white' },
                          { label: 'Active',    value: status.subscriptionStats.active,    color: 'text-green-400' },
                          { label: 'Cancelled', value: status.subscriptionStats.cancelled, color: 'text-slate-400' },
                        ].map(s => (
                          <div key={s.label} className="bg-slate-900/60 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── API Keys tab ── */}
              {canEdit && (
                <TabsContent value="keys" className="mt-4 space-y-4">
                  <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl px-4 py-3 flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-300 font-medium">Security notice</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Keys are stored server-side only and never exposed to the browser. Leave a field blank to keep the existing value. Masked previews are shown in the Status tab.
                      </p>
                    </div>
                  </div>

                  {keysSaved && (
                    <div className="flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border text-emerald-400 bg-emerald-900/20 border-emerald-700/40">
                      <CheckCircle2 className="w-4 h-4" /> {keysSaved}
                    </div>
                  )}
                  {keysError && (
                    <div className="flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border text-red-400 bg-red-900/20 border-red-700/40">
                      <XCircle className="w-4 h-4" /> {keysError}
                    </div>
                  )}

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" /> Stripe API Keys
                    </h3>
                    <SecretInput
                      label="Secret Key"
                      placeholder="sk_live_… or sk_test_…"
                      value={secretKey}
                      onChange={setSecretKey}
                      hint="Leave blank to keep existing value"
                      warning="This is a LIVE secret key — changes affect real payments"
                    />
                    <SecretInput
                      label="Publishable Key"
                      placeholder="pk_live_… or pk_test_…"
                      value={publishableKey}
                      onChange={setPublishableKey}
                      hint="Safe to expose to the browser — used in checkout"
                    />
                    <SecretInput
                      label="Webhook Secret"
                      placeholder="whsec_…"
                      value={webhookSecret}
                      onChange={setWebhookSecret}
                      hint="From Stripe Dashboard → Webhooks → Signing secret"
                    />
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-purple-400" /> Checkout URLs
                    </h3>
                    <div>
                      <Label className="text-xs text-slate-300 mb-1 block">Success URL</Label>
                      <Input value={successUrl} onChange={e => setSuccessUrl(e.target.value)}
                        placeholder="https://yourdomain.com/dashboard?checkout=success"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 text-xs h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-300 mb-1 block">Cancel URL</Label>
                      <Input value={cancelUrl} onChange={e => setCancelUrl(e.target.value)}
                        placeholder="https://yourdomain.com/pricing?checkout=cancelled"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 text-xs h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-300 mb-1 block">Customer Portal Return URL</Label>
                      <Input value={portalReturnUrl} onChange={e => setPortalReturnUrl(e.target.value)}
                        placeholder="https://yourdomain.com/settings"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 text-xs h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-300 mb-1 block">Webhook Endpoint URL</Label>
                      <Input value={webhookEndpointUrl} onChange={e => setWebhookEndpointUrl(e.target.value)}
                        placeholder="https://yourdomain.com/api/stripe/webhook"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 text-xs h-9" />
                      <p className="text-[11px] text-slate-500 mt-1">Register this URL in the Stripe Dashboard under Webhooks.</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveKeys} disabled={keysSaving}
                      className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-9">
                      <Save className="w-3.5 h-3.5" />
                      {keysSaving ? 'Saving…' : 'Save Keys & URLs'}
                    </Button>
                  </div>
                </TabsContent>
              )}

              {/* ── Price IDs tab ── */}
              {canEdit && (
                <TabsContent value="prices" className="mt-4 space-y-4">
                  {pricesSaved && (
                    <div className="flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border text-emerald-400 bg-emerald-900/20 border-emerald-700/40">
                      <CheckCircle2 className="w-4 h-4" /> {pricesSaved}
                    </div>
                  )}
                  {pricesError && (
                    <div className="flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border text-red-400 bg-red-900/20 border-red-700/40">
                      <XCircle className="w-4 h-4" /> {pricesError}
                    </div>
                  )}

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amber-400" /> Plan → Price ID Mapping
                    </h3>
                    <p className="text-xs text-slate-400">
                      Map each paid plan to a Stripe price ID. Leave blank to keep existing. Price IDs start with <code className="text-amber-300">price_</code>.
                    </p>

                    {[
                      { label: 'Explore Plan',  placeholder: 'price_…', value: pricePersonal,     set: setPricePersonal,     current: status?.prices.personal.masked },
                      { label: 'Plan Plan',     placeholder: 'price_…', value: priceStandard,     set: setPriceStandard,     current: status?.prices.standard.masked },
                      { label: 'Complete Plan', placeholder: 'price_…', value: priceProfessional, set: setPriceProfessional, current: status?.prices.professional.masked },
                      { label: 'Together Plan', placeholder: 'price_…', value: priceOrgStarter,   set: setPriceOrgStarter,   current: status?.prices.org_starter.masked },
                    ].map(plan => (
                      <div key={plan.label}>
                        <Label className="text-xs text-slate-300 mb-1 block">{plan.label}</Label>
                        {plan.current && (
                          <p className="text-[11px] text-slate-500 mb-1 font-mono">Current: {plan.current}</p>
                        )}
                        <Input
                          value={plan.value}
                          onChange={e => plan.set(e.target.value)}
                          placeholder={plan.placeholder}
                          className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 font-mono text-xs h-9"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-400" /> Trial Settings
                    </h3>
                    <p className="text-xs text-slate-400">
                      Trial applies to all paid plans. There is no free plan — trial is the only way to try before subscribing.
                    </p>
                    <Toggle
                      checked={trialEnabled}
                      onChange={setTrialEnabled}
                      label="Enable Trial Period"
                      description="New subscribers get a free trial before their first charge"
                    />
                    {trialEnabled && (
                      <div>
                        <Label className="text-xs text-slate-300 mb-1 block">Trial Duration (days)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={trialDays}
                          onChange={e => setTrialDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                          className="bg-slate-900 border-slate-700 text-white w-32 h-9 text-sm"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">Between 1 and 90 days.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={savePrices} disabled={pricesSaving}
                      className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-9">
                      <Save className="w-3.5 h-3.5" />
                      {pricesSaving ? 'Saving…' : 'Save Price IDs & Trial'}
                    </Button>
                  </div>
                </TabsContent>
              )}

              {/* ── Test Tools tab ── */}
              <TabsContent value="tools" className="mt-4 space-y-4">

                {/* Test Connection */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-green-400" /> Test Stripe Connection
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Verifies the secret key can reach the Stripe API and returns account info.</p>
                    </div>
                    <Button onClick={testConnection} disabled={testConnLoading}
                      className="bg-green-700 hover:bg-green-600 text-white gap-1.5 h-9 shrink-0">
                      {testConnLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                      {testConnLoading ? 'Testing…' : 'Test Connection'}
                    </Button>
                  </div>
                  {testConnResult && (
                    <div className={`rounded-lg border px-4 py-3 ${testConnResult.success ? 'bg-green-950/30 border-green-700/40' : 'bg-red-950/30 border-red-700/40'}`}>
                      {testConnResult.success && testConnResult.account ? (
                        <div className="space-y-1">
                          <p className="text-sm text-green-400 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Connection successful
                          </p>
                          {Object.entries(testConnResult.account as Record<string, unknown>).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between">
                              <span className="text-xs text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                              <span className="text-xs text-white font-mono">{String(v ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-red-400 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" /> {testConnResult.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Verify Price IDs */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-400" /> Verify Price IDs
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Checks each configured price ID against the Stripe API.</p>
                    </div>
                    <Button onClick={verifyPrices} disabled={verifyLoading}
                      className="bg-amber-700 hover:bg-amber-600 text-white gap-1.5 h-9 shrink-0">
                      {verifyLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                      {verifyLoading ? 'Verifying…' : 'Verify Prices'}
                    </Button>
                  </div>
                  {verifyResult && (
                    <div className="space-y-2">
                      {Object.entries(verifyResult).map(([plan, p]) => (
                        <div key={plan} className={`rounded-lg border px-4 py-3 ${p.valid ? 'bg-green-950/20 border-green-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <StatusDot ok={p.valid} />
                            <span className="text-sm text-white font-medium capitalize">{plan} Plan</span>
                            {p.id && <span className="text-[11px] text-slate-400 font-mono ml-auto">{p.id}</span>}
                          </div>
                          {p.valid ? (
                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              {p.product  && <span>{p.product}</span>}
                              {p.amount   != null && p.currency && <span>{(p.amount / 100).toFixed(2)} {p.currency}</span>}
                              {p.interval && <span>/ {p.interval}</span>}
                              {p.active   != null && <span className={p.active ? 'text-green-400' : 'text-red-400'}>{p.active ? 'active' : 'inactive'}</span>}
                            </div>
                          ) : (
                            <p className="text-xs text-red-400">{p.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Test Checkout */}
                {canEdit && (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <TestTube2 className="w-4 h-4 text-blue-400" /> Create Test Checkout Session
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Only available in <strong className="text-amber-300">test mode</strong>. Creates a real Stripe checkout session you can open to test the full flow.
                      </p>
                    </div>
                    {isLiveMode && (
                      <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">Test checkout is blocked in live mode. Switch to test keys first.</p>
                      </div>
                    )}
                    {!isLiveMode && (
                      <div className="flex items-center gap-3">
                        <select
                          value={checkoutPlan}
                          onChange={e => setCheckoutPlan(e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 h-9"
                        >
                          <option value="personal">Explore Plan</option>
                          <option value="standard">Plan Plan</option>
                          <option value="professional">Complete Plan</option>
                          <option value="org_starter">Together Plan</option>
                        </select>
                        <Button onClick={createTestCheckout} disabled={checkoutLoading || isLiveMode}
                          className="bg-blue-700 hover:bg-blue-600 text-white gap-1.5 h-9">
                          {checkoutLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                          {checkoutLoading ? 'Creating…' : 'Create Test Session'}
                        </Button>
                      </div>
                    )}
                    {checkoutResult && (
                      <div className={`rounded-lg border px-4 py-3 ${checkoutResult.success ? 'bg-green-950/20 border-green-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                        {checkoutResult.success ? (
                          <div className="space-y-2">
                            <p className="text-sm text-green-400 font-medium flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" /> Session created
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono break-all">{checkoutResult.sessionId}</p>
                            {checkoutResult.sessionUrl && (
                              <a href={checkoutResult.sessionUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 underline">
                                <ExternalLink className="w-3.5 h-3.5" /> Open checkout session
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-red-400 flex items-center gap-1.5">
                            <XCircle className="w-4 h-4" /> {checkoutResult.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Webhook tab ── */}
              <TabsContent value="webhook" className="mt-4 space-y-4">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-green-400" /> Webhook Configuration
                  </h3>
                  <div className="space-y-0">
                    <StatusRow label="Webhook Secret configured"              ok={status?.keys.webhookSecret.set ?? false} warn={!(status?.keys.webhookSecret.set ?? false)} />
                    <StatusRow label="checkout.session.completed handler"     ok={true} />
                    <StatusRow label="customer.subscription.updated handler"  ok={true} />
                    <StatusRow label="customer.subscription.deleted handler"  ok={true} />
                    <StatusRow label="invoice.payment_succeeded handler"      ok={true} />
                    <StatusRow label="invoice.payment_failed handler"         ok={true} />
                    <StatusRow label="customer.subscription.trial_will_end"   ok={true} />
                  </div>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Webhook Endpoint</h3>
                  <p className="text-xs text-slate-400">Register this URL in your Stripe Dashboard under <strong className="text-white">Developers → Webhooks</strong>:</p>
                  <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3">
                    <p className="text-sm font-mono text-blue-300 break-all">
                      https://sousamurrayplaneia.jagroupservices.co.uk/api/stripe/webhook
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">Required events to subscribe to:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {[
                      'checkout.session.completed',
                      'customer.subscription.created',
                      'customer.subscription.updated',
                      'customer.subscription.deleted',
                      'customer.subscription.trial_will_end',
                      'invoice.payment_succeeded',
                      'invoice.payment_failed',
                      'invoice.upcoming',
                    ].map(event => (
                      <div key={event} className="flex items-center gap-2 py-1">
                        <Package className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-300 font-mono">{event}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!(status?.keys.webhookSecret.set) && (
                  <div className="flex items-start gap-3 bg-amber-950/30 border border-amber-700/40 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-300 font-medium">Webhook secret not configured</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Without a webhook secret, Stripe events cannot be verified. Go to the <strong className="text-white">API Keys</strong> tab to add your <code className="text-amber-300">whsec_…</code> signing secret.
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

            </Tabs>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
