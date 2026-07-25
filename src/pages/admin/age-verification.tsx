import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  FileCheck2,
  Fingerprint,
  Gauge,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TestTube2,
  UserRoundCheck,
  UsersRound,
  Wrench,
  XCircle,
} from 'lucide-react';

type ServiceStatus = 'live' | 'maintenance' | 'paused';
type VerificationMethod = 'self_declaration' | 'independent_provider';
type DesignVariant = 'standard' | 'compact' | 'assurance';
type BusyAction = 'save' | 'diagnostics' | 'test' | 'clear' | null;

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
  created_at: string;
}

interface ControlPayload {
  success: boolean;
  settings: Settings;
  diagnostics: { checks: DiagnosticCheck[]; healthy: boolean };
  stats: {
    profiles: {
      total: number;
      verified: number;
      youngPeople: number;
      adults: number;
      blockedUnder16: number;
      checkRequired: number;
    };
    events: {
      total: number;
      passed: number;
      blocked: number;
      failed: number;
      last24Hours: number;
    };
  };
  events: EventRecord[];
  legalNotice?: string;
  error?: string;
  code?: string;
  correlationId?: string;
}

interface ApiEnvelope {
  success?: boolean;
  error?: string;
  code?: string;
  correlationId?: string;
}

class ApiFailure extends Error {
  status: number;
  code: string;
  correlationId: string;

  constructor(message: string, status = 0, code = '', correlationId = '') {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
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
  provider: {
    adapter: 'not_configured',
    supportedAdapter: false,
    apiKeyConfigured: false,
    webhookSecretConfigured: false,
    returnSecretConfigured: false,
    ready: false,
  },
};

async function requestJson<T extends ApiEnvelope>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiFailure('The Admin Centre could not connect to the age-verification service. Check your connection and retry.');
  }

  const contentType = response.headers.get('content-type') || '';
  let data: T;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({} as T));
  } else {
    const text = await response.text().catch(() => '');
    throw new ApiFailure(
      text.trim() || 'The age-verification service returned an unexpected response.',
      response.status,
    );
  }

  if (!response.ok || data.success === false) {
    throw new ApiFailure(
      data.error || 'The age-verification request could not be completed.',
      response.status,
      data.code || '',
      data.correlationId || '',
    );
  }

  return data;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  locked = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-950 dark:text-white">{label}</p>
          {locked && <LockKeyhole className="h-3.5 w-3.5 text-slate-400" aria-label="Locked" />}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={locked}
        onClick={() => !locked && onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} ${locked ? 'cursor-not-allowed opacity-65' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

function StatusCard({
  status,
  selected,
  onSelect,
  title,
  description,
  icon: Icon,
}: {
  status: ServiceStatus;
  selected: boolean;
  onSelect: (status: ServiceStatus) => void;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
}) {
  const selectedTone = status === 'live'
    ? 'border-emerald-400 bg-emerald-50/80 dark:border-emerald-500/60 dark:bg-emerald-500/10'
    : status === 'maintenance'
      ? 'border-amber-400 bg-amber-50/80 dark:border-amber-500/60 dark:bg-amber-500/10'
      : 'border-red-400 bg-red-50/80 dark:border-red-500/60 dark:bg-red-500/10';

  return (
    <button
      type="button"
      onClick={() => onSelect(status)}
      className={`group rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? `${selectedTone} ring-2 ring-blue-500/15` : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/50'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="font-semibold text-slate-950 dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
        {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />}
      </div>
    </button>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p>
    </div>
  );
}

function PublicPreview({ settings }: { settings: Settings }) {
  const compact = settings.designVariant === 'compact';
  const assurance = settings.designVariant === 'assurance';

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      <div className={`mx-auto overflow-hidden border bg-white shadow-xl dark:bg-slate-900 ${compact ? 'max-w-md rounded-2xl' : 'max-w-xl rounded-3xl'} ${assurance ? 'border-blue-300 dark:border-blue-500/50' : 'border-slate-200 dark:border-slate-700'}`}>
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
        <div className={compact ? 'p-5' : 'p-7 sm:p-8'}>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">16+</div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Planyx age and safeguarding check</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{settings.publicHeading || 'Confirm you are aged 16 or over'}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{settings.publicDescription || 'Complete the age check before creating or using an account.'}</p>
          <div className="mt-5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Date of birth</span>
            <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950">DD / MM / YYYY</div>
          </div>
          <div className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm">{settings.buttonLabel || 'Confirm age and continue'}</div>
          {settings.showPrivacyNotice && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
              Only the minimum age and safeguarding result is used in the ordinary customer profile.
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">Live design preview · no personal information is collected here</p>
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  const sessionExpired = error.status === 401 || error.code === 'SESSION_EXPIRED';
  return (
    <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-500/30 dark:bg-slate-900 sm:p-8">
      <div className="flex max-w-2xl items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{sessionExpired ? 'Administrator session needs refreshing' : 'Age-verification controls could not be loaded'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{error.message}</p>
          {error.correlationId && <p className="mt-2 font-mono text-xs text-slate-500">Reference: {error.correlationId}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
            {sessionExpired && (
              <Button type="button" variant="outline" onClick={() => { window.location.href = '/admin'; }}>
                Return to admin sign-in <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminAgeVerificationPage() {
  const [payload, setPayload] = useState<ControlPayload | null>(null);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiFailure | null>(null);
  const [testDob, setTestDob] = useState('');
  const [testResult, setTestResult] = useState<{ age: number; ageBand: string; eligible: boolean; youngPersonSafeguards: boolean } | null>(null);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const data = await requestJson<ControlPayload>('/api/admin/age-verification');
      if (!data.settings || !data.stats || !data.diagnostics) {
        throw new ApiFailure('The age-verification service returned an incomplete response.');
      }
      setPayload(data);
      setSettings(data.settings);
    } catch (reason) {
      setError(reason instanceof ApiFailure ? reason : new ApiFailure(reason instanceof Error ? reason.message : 'Age-verification controls could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy('save');
    setMessage('');
    setError(null);
    try {
      const data = await requestJson<{ success: boolean; settings?: Settings; error?: string; code?: string; correlationId?: string }>('/api/admin/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', settings }),
      });
      if (!data.settings) throw new ApiFailure('The service did not return the saved settings.');
      setSettings(data.settings);
      setMessage('Age-verification settings were saved and published successfully.');
      await load(false);
    } catch (reason) {
      setError(reason instanceof ApiFailure ? reason : new ApiFailure('Age-verification settings could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  async function diagnostics() {
    setBusy('diagnostics');
    setMessage('');
    setError(null);
    try {
      const data = await requestJson<{ success: boolean; diagnostics?: { settings: Settings; checks: DiagnosticCheck[]; healthy: boolean }; error?: string; code?: string; correlationId?: string }>('/api/admin/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'diagnostics' }),
      });
      if (!data.diagnostics) throw new ApiFailure('The diagnostics response was incomplete.');
      setPayload(current => current ? { ...current, diagnostics: { checks: data.diagnostics!.checks, healthy: data.diagnostics!.healthy } } : current);
      setMessage(data.diagnostics.healthy ? 'All mandatory age-verification diagnostics passed.' : 'Diagnostics completed. Review the warning or failed checks below.');
    } catch (reason) {
      setError(reason instanceof ApiFailure ? reason : new ApiFailure('Diagnostics could not be completed.'));
    } finally {
      setBusy(null);
    }
  }

  async function testAge() {
    setBusy('test');
    setTestResult(null);
    setError(null);
    try {
      const data = await requestJson<{ success: boolean; result?: typeof testResult; error?: string; code?: string; correlationId?: string }>('/api/admin/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_age', dateOfBirth: testDob }),
      });
      if (!data.result) throw new ApiFailure('The age-band test returned no result.');
      setTestResult(data.result);
    } catch (reason) {
      setError(reason instanceof ApiFailure ? reason : new ApiFailure('The age-band test could not be completed.'));
    } finally {
      setBusy(null);
    }
  }

  async function clearEvents() {
    if (!window.confirm('Clear all age-verification event records? This cannot be undone and will be recorded in the main Admin audit log.')) return;
    setBusy('clear');
    setMessage('');
    setError(null);
    try {
      await requestJson<{ success: boolean; error?: string; code?: string; correlationId?: string }>('/api/admin/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_events' }),
      });
      setMessage('Age-verification event records were cleared.');
      await load(false);
    } catch (reason) {
      setError(reason instanceof ApiFailure ? reason : new ApiFailure('Events could not be cleared.'));
    } finally {
      setBusy(null);
    }
  }

  const complianceReady = useMemo(
    () => Boolean(settings.dpiaReference && settings.lastLegalReviewAt && settings.policyVersion),
    [settings.dpiaReference, settings.lastLegalReviewAt, settings.policyVersion],
  );

  const statusLabel = settings.serviceStatus === 'live' ? 'Live' : settings.serviceStatus === 'maintenance' ? 'Maintenance' : 'Registrations paused';
  const statusClass = settings.serviceStatus === 'live'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
    : settings.serviceStatus === 'maintenance'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';

  return (
    <AdminLayout title="Age Verification">
      <Helmet><title>Age Verification | Planyx Admin Centre</title></Helmet>
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
          <div className="flex flex-col gap-5 p-5 pt-7 sm:p-7 sm:pt-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <BadgeCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Age Verification Control Centre</h1>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Manage the 16+ registration gate, customer wording, provider readiness, safeguards, governance records and operational diagnostics from one place.</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Minimum age locked at 16</span>
                  <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Admin actions audited</span>
                  <span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Provider secrets never displayed</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || busy !== null}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button type="button" onClick={() => void save()} disabled={loading || busy !== null || !payload}>
                {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {busy === 'save' ? 'Saving…' : 'Save and publish'}
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Alert className="rounded-2xl border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription><strong>Safety lock:</strong> maintenance or paused mode never admits unverified registrations. New registration is safely stopped instead.</AlertDescription>
          </Alert>
          <Alert className="rounded-2xl border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <FileCheck2 className="h-4 w-4" />
            <AlertDescription>This system supports governance, but a saved setting cannot itself guarantee legal compliance. Keep the DPIA, Children’s Code assessment, privacy notice and provider review current.</AlertDescription>
          </Alert>
        </div>

        {message && (
          <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {error && payload && (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error.message}
              {error.correlationId && <span className="ml-2 font-mono text-xs">Reference: {error.correlationId}</span>}
            </AlertDescription>
          </Alert>
        )}

        {loading && !payload ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />)}
            </div>
            <div className="flex min-h-80 items-center justify-center rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" />
                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Loading secure age-verification controls…</p>
              </div>
            </div>
          </div>
        ) : error && !payload ? (
          <ErrorPanel error={error} onRetry={() => void load()} />
        ) : payload ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Stat label="Profiles" value={payload.stats.profiles.total} icon={UsersRound} />
              <Stat label="Verified" value={payload.stats.profiles.verified} icon={UserRoundCheck} />
              <Stat label="Age 16–17" value={payload.stats.profiles.youngPeople} icon={ShieldCheck} />
              <Stat label="Adults" value={payload.stats.profiles.adults} icon={BadgeCheck} />
              <Stat label="Under-16 blocked" value={payload.stats.profiles.blockedUnder16} icon={ShieldAlert} />
              <Stat label="Check required" value={payload.stats.profiles.checkRequired} icon={Clock3} />
            </div>

            <Tabs defaultValue="service" className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <TabsList className="h-auto min-w-max justify-start gap-1 bg-transparent p-0">
                  <TabsTrigger value="service" className="rounded-xl"><SlidersHorizontal className="mr-2 h-4 w-4" />Service</TabsTrigger>
                  <TabsTrigger value="design" className="rounded-xl"><Gauge className="mr-2 h-4 w-4" />Design</TabsTrigger>
                  <TabsTrigger value="provider" className="rounded-xl"><Fingerprint className="mr-2 h-4 w-4" />Provider</TabsTrigger>
                  <TabsTrigger value="governance" className="rounded-xl"><FileCheck2 className="mr-2 h-4 w-4" />Safeguards & governance</TabsTrigger>
                  <TabsTrigger value="diagnostics" className="rounded-xl"><Wrench className="mr-2 h-4 w-4" />Diagnostics</TabsTrigger>
                  <TabsTrigger value="events" className="rounded-xl"><Activity className="mr-2 h-4 w-4" />Events</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="service" className="space-y-4">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Age-verification availability</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Choose how new registrations are handled. Existing verified customers are controlled separately below.</p>
                  </div>
                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    <StatusCard status="live" selected={settings.serviceStatus === 'live'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Live" description="Accept eligible checks and allow verified customers to continue." icon={ShieldCheck} />
                    <StatusCard status="maintenance" selected={settings.serviceStatus === 'maintenance'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Maintenance" description="Pause new checks with the published maintenance message." icon={Wrench} />
                    <StatusCard status="paused" selected={settings.serviceStatus === 'paused'} onSelect={status => setSettings(current => ({ ...current, serviceStatus: status }))} title="Registrations paused" description="Emergency safe-off mode. No unverified signup can continue." icon={ShieldAlert} />
                  </div>
                </section>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Toggle checked={settings.allowExistingVerifiedAccess} onChange={value => setSettings(current => ({ ...current, allowExistingVerifiedAccess: value }))} label="Allow existing verified customers during maintenance" description="Customers with a valid stored result may continue. Turn this off only for a serious safeguarding or security incident." />
                  <Toggle checked={settings.debugLogging} onChange={value => setSettings(current => ({ ...current, debugLogging: value }))} label="Detailed diagnostic logging" description="Records additional non-secret technical events. DOBs, document images, tokens and provider secrets must never be logged." />
                </div>
              </TabsContent>

              <TabsContent value="design" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
                <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Public age-check design and wording</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Keep the customer journey clear, calm and age-appropriate. The preview updates as you edit.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label htmlFor="age-design">Design style</Label><select id="age-design" value={settings.designVariant} onChange={event => setSettings(current => ({ ...current, designVariant: event.target.value as DesignVariant }))} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="standard">Standard Planyx card</option><option value="compact">Compact</option><option value="assurance">Trust and assurance</option></select></div>
                    <div><Label htmlFor="age-button">Continue button</Label><Input id="age-button" value={settings.buttonLabel} onChange={event => setSettings(current => ({ ...current, buttonLabel: event.target.value }))} className="mt-1" /></div>
                  </div>
                  <div><Label htmlFor="age-heading">Page heading</Label><Input id="age-heading" value={settings.publicHeading} onChange={event => setSettings(current => ({ ...current, publicHeading: event.target.value }))} className="mt-1" /></div>
                  <div><Label htmlFor="age-description">Page explanation</Label><textarea id="age-description" value={settings.publicDescription} onChange={event => setSettings(current => ({ ...current, publicDescription: event.target.value }))} rows={4} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label htmlFor="maintenance-heading">Maintenance heading</Label><Input id="maintenance-heading" value={settings.maintenanceHeading} onChange={event => setSettings(current => ({ ...current, maintenanceHeading: event.target.value }))} className="mt-1" /></div>
                    <div><Label htmlFor="maintenance-message">Maintenance message</Label><textarea id="maintenance-message" value={settings.maintenanceMessage} onChange={event => setSettings(current => ({ ...current, maintenanceMessage: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle checked={settings.showPrivacyNotice} onChange={value => setSettings(current => ({ ...current, showPrivacyNotice: value }))} label="Show privacy and data-minimisation notice" description="Explain how the minimum eligibility and age-band result is used." />
                    <Toggle checked={settings.showSafetyLink} onChange={value => setSettings(current => ({ ...current, showSafetyLink: value }))} label="Show 16+ safety guidance link" description="Keep young-person safety guidance available throughout the journey." />
                  </div>
                </section>
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-2 px-1">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <h2 className="font-semibold text-slate-950 dark:text-white">Customer preview</h2>
                  </div>
                  <PublicPreview settings={settings} />
                </section>
              </TabsContent>

              <TabsContent value="provider" className="space-y-4">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Verification method</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Independent provider mode cannot go live until its adapter and Cloudflare secrets are configured and pass diagnostics.</p>
                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    <button type="button" onClick={() => setSettings(current => ({ ...current, verificationMethod: 'self_declaration' }))} className={`rounded-2xl border p-5 text-left transition ${settings.verificationMethod === 'self_declaration' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 dark:bg-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950 dark:text-white">Signed self-declaration</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Customer supplies a DOB. Planyx calculates the age band and applies safeguards. This is not independent proof.</p></div>{settings.verificationMethod === 'self_declaration' && <CheckCircle2 className="h-5 w-5 text-blue-600" />}</div></button>
                    <button type="button" onClick={() => setSettings(current => ({ ...current, verificationMethod: 'independent_provider' }))} className={`rounded-2xl border p-5 text-left transition ${settings.verificationMethod === 'independent_provider' ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/15 dark:bg-violet-500/10' : 'border-slate-200 bg-white hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950 dark:text-white">Independent age-assurance provider</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Planyx should receive only an over-16 result, age band, reference and expiry—not identity documents.</p></div>{settings.verificationMethod === 'independent_provider' && <CheckCircle2 className="h-5 w-5 text-violet-600" />}</div></button>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><h3 className="text-lg font-semibold text-slate-950 dark:text-white">Provider readiness</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Secrets are read from Cloudflare and are never returned to the browser.</p></div>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${settings.provider.ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}`}>{settings.provider.ready ? 'Ready' : 'Not ready'}</span>
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                    <div><Label htmlFor="provider-name">Public provider name</Label><Input id="provider-name" value={settings.providerName} onChange={event => setSettings(current => ({ ...current, providerName: event.target.value }))} placeholder="For example: Yoti" className="mt-1" /></div>
                    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60 sm:grid-cols-2">
                      <p><strong>Adapter:</strong> {settings.provider.adapter}</p><p><strong>API key:</strong> {settings.provider.apiKeyConfigured ? 'Configured' : 'Missing'}</p><p><strong>Webhook secret:</strong> {settings.provider.webhookSecretConfigured ? 'Configured' : 'Missing'}</p><p><strong>Return verification:</strong> {settings.provider.returnSecretConfigured ? 'Configured' : 'Missing'}</p>
                    </div>
                  </div>
                </section>

                <Toggle checked={settings.allowSelfDeclarationFallback} onChange={value => setSettings(current => ({ ...current, allowSelfDeclarationFallback: value }))} locked={settings.verificationMethod === 'self_declaration'} label="Allow self-declaration fallback" description="In provider mode, decide whether a provider outage may fall back to the weaker signed declaration. A DPIA and risk decision should justify this." />
                <Alert className="rounded-2xl border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"><KeyRound className="h-4 w-4" /><AlertDescription>Provider credentials must remain encrypted Cloudflare secrets: <code>AGE_PROVIDER_ADAPTER</code>, <code>AGE_PROVIDER_API_KEY</code>, <code>AGE_PROVIDER_WEBHOOK_SECRET</code> and <code>AGE_PROVIDER_RETURN_SECRET</code>. They are deliberately not editable here.</AlertDescription></Alert>
              </TabsContent>

              <TabsContent value="governance" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Toggle checked onChange={() => undefined} locked label="Minimum age: 16" description="Under-16 registration is permanently blocked. Administrators cannot lower or bypass the minimum age from this interface." />
                  <Toggle checked onChange={() => undefined} locked label="Mandatory 16–17 high-privacy safeguards" description="Private profile, no public discovery, no non-essential profiling or marketing, and precise location off by default." />
                </div>
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Governance record</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Record the policy and review evidence used to operate the age gate.</p></div>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${complianceReady ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}`}>{complianceReady ? 'Core record complete' : 'Review required'}</span>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div><Label htmlFor="policy-version">Policy version</Label><Input id="policy-version" value={settings.policyVersion} onChange={event => setSettings(current => ({ ...current, policyVersion: event.target.value }))} className="mt-1" /></div>
                    <div><Label htmlFor="dpia-reference">DPIA / Children’s Code assessment reference</Label><Input id="dpia-reference" value={settings.dpiaReference} onChange={event => setSettings(current => ({ ...current, dpiaReference: event.target.value }))} placeholder="For example: DPIA-PLANYX-AGE-001" className="mt-1" /></div>
                    <div><Label htmlFor="last-review">Last legal/compliance review</Label><Input id="last-review" type="date" value={settings.lastLegalReviewAt} onChange={event => setSettings(current => ({ ...current, lastLegalReviewAt: event.target.value }))} className="mt-1" /></div>
                    <div><Label htmlFor="next-review">Next review due</Label><Input id="next-review" type="date" value={settings.nextLegalReviewAt} onChange={event => setSettings(current => ({ ...current, nextLegalReviewAt: event.target.value }))} className="mt-1" /></div>
                    <div className="md:col-span-2"><Label htmlFor="lawful-basis">Purpose, lawful-basis and necessity note</Label><textarea id="lawful-basis" rows={5} value={settings.lawfulBasisNote} onChange={event => setSettings(current => ({ ...current, lawfulBasisNote: event.target.value }))} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></div>
                    <div><Label htmlFor="retention-days">Event retention</Label><div className="mt-1 flex items-center gap-2"><Input id="retention-days" type="number" min={90} max={730} value={settings.eventRetentionDays} onChange={event => setSettings(current => ({ ...current, eventRetentionDays: Number(event.target.value) }))} /><span className="text-sm text-slate-500">days</span></div></div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="diagnostics" className="space-y-4">
                <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">System diagnostics</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Checks database access, signing, provider readiness, age locks and governance records without exposing secrets.</p></div>
                  <Button type="button" onClick={() => void diagnostics()} disabled={busy !== null}>{busy === 'diagnostics' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}Run diagnostics</Button>
                </section>
                <div className="grid gap-3 lg:grid-cols-2">
                  {payload.diagnostics.checks.map(check => (
                    <div key={check.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      {check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : check.warn ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                      <div><p className="font-semibold text-slate-950 dark:text-white">{check.label}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{check.detail}</p></div>
                    </div>
                  ))}
                </div>
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <div className="flex items-center gap-2"><TestTube2 className="h-5 w-5 text-violet-600" /><h3 className="text-lg font-semibold text-slate-950 dark:text-white">Test age-band calculation</h3></div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The test date is calculated in memory and is not stored in the profile or event record.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input type="date" value={testDob} onChange={event => setTestDob(event.target.value)} className="sm:max-w-xs" /><Button type="button" variant="outline" onClick={() => void testAge()} disabled={!testDob || busy !== null}>{busy === 'test' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test age result</Button></div>
                  {testResult && <div className={`mt-4 rounded-2xl border p-4 ${testResult.eligible ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'}`}><p className="font-semibold">{testResult.eligible ? 'Eligible for Planyx' : 'Registration blocked'}</p><p className="mt-1 text-sm">Age {testResult.age} · band {testResult.ageBand}{testResult.youngPersonSafeguards ? ' · young-person safeguards applied' : ''}</p></div>}
                </section>
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Age-verification events</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Operational and audit events only. Full DOBs, documents, selfies, cookies, tokens and provider secrets are never displayed here.</p></div>
                  <Button type="button" variant="destructive" onClick={() => void clearEvents()} disabled={busy !== null}>{busy === 'clear' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Clear event records</Button>
                </section>
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Band</th><th className="px-4 py-3">Account/Admin</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3">Reference</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {payload.events.length ? payload.events.map(event => (
                          <tr key={event.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="whitespace-nowrap px-4 py-3 text-xs">{new Date(event.created_at).toLocaleString('en-GB')}</td>
                            <td className="px-4 py-3 font-medium">{event.event_type.replaceAll('_', ' ')}</td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${event.outcome === 'passed' || event.outcome === 'success' ? 'bg-emerald-100 text-emerald-700' : event.outcome === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{event.outcome}</span></td>
                            <td className="px-4 py-3">{event.age_band || '—'}</td>
                            <td className="px-4 py-3 break-all text-xs">{event.subject_email || 'Not linked'}</td>
                            <td className="max-w-sm px-4 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{event.detail || '—'}</td>
                            <td className="px-4 py-3 font-mono text-[11px]">{event.correlation_id || event.id.slice(0, 12)}</td>
                          </tr>
                        )) : <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No age-verification events have been recorded yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
