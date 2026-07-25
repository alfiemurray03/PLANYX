import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity, AlertTriangle, BadgeCheck, CheckCircle2, Clock3, FileCheck2,
  Fingerprint, Gauge, KeyRound, Loader2, LockKeyhole, RefreshCw, Save,
  ShieldAlert, ShieldCheck, SlidersHorizontal, TestTube2, UserRoundCheck,
  UsersRound, Wrench, XCircle,
} from 'lucide-react';

type ServiceStatus = 'live' | 'maintenance' | 'paused';
type VerificationMethod = 'self_declaration' | 'independent_provider';
type DesignVariant = 'standard' | 'compact' | 'assurance';

interface ProviderStatus {
  adapter: string;
  supportedAdapter: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  returnSecretConfigured: boolean;
  ready: boolean;
}

interface Settings {
  minimumAge: number;
  minorSafeguardsLocked: boolean;
  serviceStatus: ServiceStatus;
  verificationMethod: VerificationMethod;
  providerName: string;
  allowSelfDeclarationFallback: boolean;
  allowExistingVerifiedAccess: boolean;
  designVariant: DesignVariant;
  publicHeading: string;
  publicDescription: string;
  buttonLabel: string;
  maintenanceHeading: string;
  maintenanceMessage: string;
  showPrivacyNotice: boolean;
  showSafetyLink: boolean;
  policyVersion: string;
  dpiaReference: string;
  lawfulBasisNote: string;
  lastLegalReviewAt: string;
  nextLegalReviewAt: string;
  eventRetentionDays: number;
  debugLogging: boolean;
  updatedAt: string;
  updatedBy: string;
  provider: ProviderStatus;
}

interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
}

interface EventRecord {
  id: string;
  event_type: string;
  outcome: string;
  age_band?: string;
  subject_email?: string;
  method?: string;
  provider?: string;
  detail?: string;
  correlation_id?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface ControlPayload {
  success: boolean;
  settings: Settings;
  diagnostics: { checks: DiagnosticCheck[]; healthy: boolean };
  stats: {
    profiles: { total: number; verified: number; youngPeople: number; adults: number; blockedUnder16: number; checkRequired: number };
    events: { total: number; passed: number; blocked: number; failed: number; last24Hours: number };
  };
  events: EventRecord[];
  legalNotice?: string;
  error?: string;
  correlationId?: string;
}

const EMPTY_SETTINGS: Settings = {
  minimumAge: 16,
  minorSafeguardsLocked: true,
  serviceStatus: 'live',
  verificationMethod: 'self_declaration',
  providerName: '',
  allowSelfDeclarationFallback: true,
  allowExistingVerifiedAccess: true,
  designVariant: 'standard',
  publicHeading: 'Confirm you are aged 16 or over',
  publicDescription: 'Planyx is a 16+ planning service. Complete the age check before creating or using an account.',
  buttonLabel: 'Confirm age and continue',
  maintenanceHeading: 'Age verification is temporarily unavailable',
  maintenanceMessage: 'New registrations are paused while the age-verification service is maintained.',
  showPrivacyNotice: true,
  showSafetyLink: true,
  policyVersion: 'planyx-16-plus-v1',
  dpiaReference: '',
  lawfulBasisNote: '',
  lastLegalReviewAt: '',
  nextLegalReviewAt: '',
  eventRetentionDays: 365,
  debugLogging: false,
  updatedAt: '',
  updatedBy: '',
  provider: { adapter: 'not_configured', supportedAdapter: false, apiKeyConfigured: false, webhookSecretConfigured: false, returnSecretConfigured: false, ready: false },
};

function Toggle({ checked, onChange, label, description, locked = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string; locked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0">
        <p className="font-bold text-slate-950 dark:text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={locked}
        onClick={() => !locked && onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

function StatusCard({ status, selected, onSelect, title, description, tone }: { status: ServiceStatus; selected: boolean; onSelect: (status: ServiceStatus) => void; title: string; description: string; tone: string }) {
  return (
    <button type="button" onClick={() => onSelect(status)} className={`min-w-0 rounded-2xl border p-4 text-left transition ${selected ? `${tone} ring-2 ring-blue-500/20` : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-black text-slate-950 dark:text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p></div>
        {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />}
      </div>
    </button>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p></div>;
}

export default function AdminAgeVerificationPage() {
  const [payload, setPayload] = useState<ControlPayload | null>(null);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testDob, setTestDob] = useState('');
  const [testResult, setTestResult] = useState<{ age: number; ageBand: string; eligible: boolean; youngPersonSafeguards: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/age-verification', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({})) as ControlPayload;
      if (!response.ok || !data.success) throw new Error(data.error || 'Age verification controls could not be loaded.');
      setPayload(data); setSettings(data.settings);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Age verification controls could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/age-verification', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'save', settings }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; settings?: Settings; error?: string };
      if (!response.ok || !data.success || !data.settings) throw new Error(data.error || 'Age verification settings could not be saved.');
      setSettings(data.settings); setMessage('Age verification settings saved and published.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Age verification settings could not be saved.'); }
    finally { setSaving(false); }
  }

  async function diagnostics() {
    setRunningDiagnostics(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/age-verification', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'diagnostics' }) });
      const data = await response.json().catch(() => ({})) as { success?: boolean; diagnostics?: { settings: Settings; checks: DiagnosticCheck[]; healthy: boolean }; error?: string };
      if (!response.ok || !data.success || !data.diagnostics) throw new Error(data.error || 'Diagnostics could not be completed.');
      setPayload(current => current ? { ...current, diagnostics: { checks: data.diagnostics!.checks, healthy: data.diagnostics!.healthy } } : current);
      setMessage(data.diagnostics.healthy ? 'All mandatory age-verification diagnostics passed.' : 'Diagnostics completed. Review the failed or warning checks below.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Diagnostics could not be completed.'); }
    finally { setRunningDiagnostics(false); }
  }

  async function testAge() {
    setTestResult(null); setError('');
    try {
      const response = await fetch('/api/admin/age-verification', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test_age', dateOfBirth: testDob }) });
      const data = await response.json().catch(() => ({})) as { success?: boolean; result?: typeof testResult; error?: string };
      if (!response.ok || !data.success || !data.result) throw new Error(data.error || 'The age-band test could not be completed.');
      setTestResult(data.result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The age-band test could not be completed.'); }
  }

  async function clearEvents() {
    if (!window.confirm('Clear all age-verification event records? This cannot be undone and will be recorded in the main Admin audit log.')) return;
    try {
      const response = await fetch('/api/admin/age-verification', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_events' }) });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Events could not be cleared.');
      setMessage('Age-verification events cleared.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Events could not be cleared.'); }
  }

  const complianceReady = useMemo(() => Boolean(settings.dpiaReference && settings.lastLegalReviewAt && settings.policyVersion), [settings]);

  return (
    <AdminLayout title="Age Verification">
      <Helmet><title>Age Verification | Planyx Admin Centre</title></Helmet>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><BadgeCheck className="h-6 w-6" /></div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-slate-950 dark:text-white">Age Verification Control Centre</h1><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${settings.serviceStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : settings.serviceStatus === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{settings.serviceStatus === 'paused' ? 'Registrations paused' : settings.serviceStatus}</span></div><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Control the 16+ gate, young-person safeguards, public design, provider readiness, governance and diagnostics.</p></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button><Button type="button" onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save and publish'}</Button></div>
        </div>

        <Alert className="border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100"><ShieldCheck className="h-4 w-4" /><AlertDescription><strong>Safety lock:</strong> disabling or maintaining age verification never permits unverified registrations. New registration is paused instead. The minimum age remains locked at 16 and high-privacy safeguards remain mandatory for ages 16–17.</AlertDescription></Alert>
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><FileCheck2 className="h-4 w-4" /><AlertDescription>This system supports governance and compliance, but a saved setting cannot itself guarantee legal compliance. Keep the DPIA, Children’s Code assessment, privacy notice, provider due diligence and legal review current.</AlertDescription></Alert>

        {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

        {loading || !payload ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat label="Profiles" value={payload.stats.profiles.total} icon={UsersRound} />
            <Stat label="Verified" value={payload.stats.profiles.verified} icon={UserRoundCheck} />
            <Stat label="Age 16–17" value={payload.stats.profiles.youngPeople} icon={ShieldCheck} />
            <Stat label="Adults" value={payload.stats.profiles.adults} icon={BadgeCheck} />
            <Stat label="Under-16 blocked" value={payload.stats.profiles.blockedUnder16} icon={ShieldAlert} />
            <Stat label="Check required" value={payload.stats.profiles.checkRequired} icon={Clock3} />
          </div>

          <Tabs defaultValue="service" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 dark:bg-slate-800">
              <TabsTrigger value="service"><SlidersHorizontal className="mr-2 h-4 w-4" />Service</TabsTrigger>
              <TabsTrigger value="design"><Gauge className="mr-2 h-4 w-4" />Design</TabsTrigger>
              <TabsTrigger value="provider"><Fingerprint className="mr-2 h-4 w-4" />Provider</TabsTrigger>
              <TabsTrigger value="governance"><FileCheck2 className="mr-2 h-4 w-4" />Safeguards & governance</TabsTrigger>
              <TabsTrigger value="diagnostics"><Wrench className="mr-2 h-4 w-4" />Diagnostics</TabsTrigger>
              <TabsTrigger value="events"><Activity className="mr-2 h-4 w-4" />Events</TabsTrigger>
            </TabsList>

            <TabsContent value="service" className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/40"><h2 className="font-black text-slate-950 dark:text-white">Age-verification availability</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose how new registrations are handled. Existing verified users are controlled separately.</p><div className="mt-4 grid gap-3 lg:grid-cols-3">
                <StatusCard status="live" selected={settings.serviceStatus === 'live'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Live" description="Accept eligible age checks and allow verified 16+ customers to continue to Microsoft signup." tone="border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-500/10" />
                <StatusCard status="maintenance" selected={settings.serviceStatus === 'maintenance'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Maintenance" description="Pause new checks with a branded maintenance message. Never bypass the 16+ rule." tone="border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-500/10" />
                <StatusCard status="paused" selected={settings.serviceStatus === 'paused'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Registrations paused" description="Emergency safe-off mode. New account registration is blocked rather than admitted without a check." tone="border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-500/10" />
              </div></div>
              <Toggle checked={settings.allowExistingVerifiedAccess} onChange={value => setSettings(current => ({ ...current, allowExistingVerifiedAccess: value }))} label="Allow existing verified customers during maintenance" description="Customers who already have a valid stored age result may continue to use Planyx. Turning this off blocks customer access during maintenance and should be used only for a serious safeguarding incident." />
              <Toggle checked={settings.debugLogging} onChange={value => setSettings(current => ({ ...current, debugLogging: value }))} label="Detailed diagnostic logging" description="Records additional non-secret technical events. Exact dates of birth, document images, selfies, access tokens and provider secrets must never be written to the log." />
            </TabsContent>

            <TabsContent value="design" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div><h2 className="font-black text-slate-950 dark:text-white">Public age-check design and wording</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">These words are published on the customer age-check page. Keep them clear, age-appropriate and free from pressure or misleading claims.</p></div>
              <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="age-design">Design style</Label><select id="age-design" value={settings.designVariant} onChange={event => setSettings(current => ({ ...current, designVariant: event.target.value as DesignVariant }))} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="standard">Standard Planyx card</option><option value="compact">Compact</option><option value="assurance">Trust and assurance</option></select></div><div><Label htmlFor="age-button">Continue button</Label><Input id="age-button" value={settings.buttonLabel} onChange={event => setSettings(current => ({ ...current, buttonLabel: event.target.value }))} /></div></div>
              <div><Label htmlFor="age-heading">Page heading</Label><Input id="age-heading" value={settings.publicHeading} onChange={event => setSettings(current => ({ ...current, publicHeading: event.target.value }))} /></div>
              <div><Label htmlFor="age-description">Page explanation</Label><textarea id="age-description" value={settings.publicDescription} onChange={event => setSettings(current => ({ ...current, publicDescription: event.target.value }))} rows={4} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
              <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="maintenance-heading">Maintenance heading</Label><Input id="maintenance-heading" value={settings.maintenanceHeading} onChange={event => setSettings(current => ({ ...current, maintenanceHeading: event.target.value }))} /></div><div><Label htmlFor="maintenance-message">Maintenance message</Label><textarea id="maintenance-message" value={settings.maintenanceMessage} onChange={event => setSettings(current => ({ ...current, maintenanceMessage: event.target.value }))} rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div></div>
              <Toggle checked={settings.showPrivacyNotice} onChange={value => setSettings(current => ({ ...current, showPrivacyNotice: value }))} label="Show privacy and data-minimisation notice" description="Explain that the check is converted into the minimum eligibility and age-band record rather than keeping a full date of birth in the ordinary profile." />
              <Toggle checked={settings.showSafetyLink} onChange={value => setSettings(current => ({ ...current, showSafetyLink: value }))} label="Show 16+ safety guidance link" description="Keep the young-person safety page visible from the age-check journey." />
            </TabsContent>

            <TabsContent value="provider" className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="font-black text-slate-950 dark:text-white">Verification method</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Self-declaration is the current signed age gate. Independent provider mode cannot be switched live unless its adapter and Cloudflare secrets are configured.</p><div className="mt-4 grid gap-3 lg:grid-cols-2">
                <button type="button" onClick={() => setSettings(current => ({ ...current, verificationMethod: 'self_declaration' }))} className={`rounded-2xl border p-4 text-left ${settings.verificationMethod === 'self_declaration' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950 dark:text-white">Signed self-declaration</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Customer supplies a date of birth. Planyx calculates the band, signs the result and does not keep the full DOB in the normal profile. This is not independent proof.</p></div>{settings.verificationMethod === 'self_declaration' && <CheckCircle2 className="h-5 w-5 text-blue-600" />}</div></button>
                <button type="button" onClick={() => setSettings(current => ({ ...current, verificationMethod: 'independent_provider' }))} className={`rounded-2xl border p-4 text-left ${settings.verificationMethod === 'independent_provider' ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/15 dark:bg-violet-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950 dark:text-white">Independent age-assurance provider</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Requires a supported provider adapter and secret configuration. Planyx should receive only an over-16 result, band, reference and expiry—not identity documents.</p></div>{settings.verificationMethod === 'independent_provider' && <CheckCircle2 className="h-5 w-5 text-violet-600" />}</div></button>
              </div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-950 dark:text-white">Provider readiness</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Secrets are read from Cloudflare and are never returned to the browser.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${settings.provider.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{settings.provider.ready ? 'Ready' : 'Not ready'}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div><Label htmlFor="provider-name">Public provider name</Label><Input id="provider-name" value={settings.providerName} onChange={event => setSettings(current => ({ ...current, providerName: event.target.value }))} placeholder="For example: Yoti" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950"><p><strong>Adapter:</strong> {settings.provider.adapter}</p><p className="mt-1"><strong>API key:</strong> {settings.provider.apiKeyConfigured ? 'Configured' : 'Missing'}</p><p className="mt-1"><strong>Webhook secret:</strong> {settings.provider.webhookSecretConfigured ? 'Configured' : 'Missing'}</p><p className="mt-1"><strong>Return verification:</strong> {settings.provider.returnSecretConfigured ? 'Configured' : 'Missing'}</p></div></div></div>
              <Toggle checked={settings.allowSelfDeclarationFallback} onChange={value => setSettings(current => ({ ...current, allowSelfDeclarationFallback: value }))} locked={settings.verificationMethod === 'self_declaration'} label="Allow self-declaration fallback" description="In provider mode, decide whether a provider outage may fall back to the weaker signed declaration. A DPIA and risk decision should justify enabling this." />
              <Alert className="border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><KeyRound className="h-4 w-4" /><AlertDescription>Provider credentials must be stored as encrypted Cloudflare secrets: <code>AGE_PROVIDER_ADAPTER</code>, <code>AGE_PROVIDER_API_KEY</code>, <code>AGE_PROVIDER_WEBHOOK_SECRET</code> and, where separate, <code>AGE_PROVIDER_RETURN_SECRET</code>. They are deliberately not editable or visible here.</AlertDescription></Alert>
            </TabsContent>

            <TabsContent value="governance" className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-2"><Toggle checked={true} onChange={() => undefined} locked label="Minimum age: 16" description="Under-16 registration is permanently blocked. Administrators cannot lower or bypass the minimum age from the UI." /><Toggle checked={true} onChange={() => undefined} locked label="Mandatory 16–17 high-privacy safeguards" description="Private profile, no public discovery, no non-essential profiling or marketing, and precise location off by default." /></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-950 dark:text-white">Governance record</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Record the policy and review evidence used to operate the age gate.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${complianceReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{complianceReady ? 'Core record complete' : 'Review required'}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label htmlFor="policy-version">Policy version</Label><Input id="policy-version" value={settings.policyVersion} onChange={event => setSettings(current => ({ ...current, policyVersion: event.target.value }))} /></div><div><Label htmlFor="dpia-reference">DPIA / Children’s Code assessment reference</Label><Input id="dpia-reference" value={settings.dpiaReference} onChange={event => setSettings(current => ({ ...current, dpiaReference: event.target.value }))} placeholder="For example: DPIA-PLANYX-AGE-001" /></div><div><Label htmlFor="last-review">Last legal/compliance review</Label><Input id="last-review" type="date" value={settings.lastLegalReviewAt} onChange={event => setSettings(current => ({ ...current, lastLegalReviewAt: event.target.value }))} /></div><div><Label htmlFor="next-review">Next review due</Label><Input id="next-review" type="date" value={settings.nextLegalReviewAt} onChange={event => setSettings(current => ({ ...current, nextLegalReviewAt: event.target.value }))} /></div><div className="md:col-span-2"><Label htmlFor="lawful-basis">Purpose, lawful-basis and necessity note</Label><textarea id="lawful-basis" rows={5} value={settings.lawfulBasisNote} onChange={event => setSettings(current => ({ ...current, lawfulBasisNote: event.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div><div><Label htmlFor="retention-days">Event retention</Label><div className="mt-1 flex items-center gap-2"><Input id="retention-days" type="number" min={90} max={730} value={settings.eventRetentionDays} onChange={event => setSettings(current => ({ ...current, eventRetentionDays: Number(event.target.value) }))} /><span className="text-sm text-slate-500">days</span></div></div></div></div>
            </TabsContent>

            <TabsContent value="diagnostics" className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-950 dark:text-white">System diagnostics</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Checks database, signing, provider readiness, age locks and governance records without exposing secrets.</p></div><Button type="button" onClick={() => void diagnostics()} disabled={runningDiagnostics}>{runningDiagnostics ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}Run diagnostics</Button></div>
              <div className="grid gap-3 lg:grid-cols-2">{payload.diagnostics.checks.map(check => <div key={check.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : check.warn ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}<div><p className="font-bold text-slate-950 dark:text-white">{check.label}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{check.detail}</p></div></div>)}</div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center gap-2"><TestTube2 className="h-5 w-5 text-violet-600" /><h3 className="font-black text-slate-950 dark:text-white">Test age-band calculation</h3></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">The test date is calculated in memory and is not stored in the profile or event record.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input type="date" value={testDob} onChange={event => setTestDob(event.target.value)} className="sm:max-w-xs" /><Button type="button" variant="outline" onClick={() => void testAge()} disabled={!testDob}>Test age result</Button></div>{testResult && <div className={`mt-4 rounded-xl border p-4 ${testResult.eligible ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'}`}><p className="font-black">{testResult.eligible ? 'Eligible for Planyx' : 'Registration blocked'}</p><p className="mt-1 text-sm">Age {testResult.age} · band {testResult.ageBand}{testResult.youngPersonSafeguards ? ' · young-person safeguards applied' : ''}</p></div>}</div>
            </TabsContent>

            <TabsContent value="events" className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-950 dark:text-white">Age-verification events</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Operational and audit events only. Full DOBs, documents, selfies, cookies, tokens and provider secrets are never displayed here.</p></div><Button type="button" variant="destructive" onClick={() => void clearEvents()}>Clear event records</Button></div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Band</th><th className="px-4 py-3">Account/Admin</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3">Reference</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{payload.events.length ? payload.events.map(event => <tr key={event.id}><td className="whitespace-nowrap px-4 py-3 text-xs">{new Date(event.created_at).toLocaleString('en-GB')}</td><td className="px-4 py-3 font-semibold">{event.event_type.replaceAll('_', ' ')}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${event.outcome === 'passed' || event.outcome === 'success' ? 'bg-emerald-100 text-emerald-700' : event.outcome === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{event.outcome}</span></td><td className="px-4 py-3">{event.age_band || '—'}</td><td className="px-4 py-3 break-all text-xs">{event.subject_email || 'Not linked'}</td><td className="max-w-sm px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.detail || '—'}</td><td className="px-4 py-3 font-mono text-[11px]">{event.correlation_id || event.id.slice(0, 12)}</td></tr>) : <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No age-verification events have been recorded yet.</td></tr>}</tbody></table></div></div>
            </TabsContent>
          </Tabs>
        </>}
      </div>
    </AdminLayout>
  );
}
