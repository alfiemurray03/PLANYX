import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Filter,
  HeadphonesIcon,
  KeyRound,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  TicketCheck,
  UserRoundPlus,
  Wrench,
  XCircle,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import AtlassianCustomerRequestForm from '@/components/admin/AtlassianCustomerRequestForm';
import { useAdmin } from '@/lib/admin-context';

type TabId = 'overview' | 'raise' | 'queue' | 'diagnostics' | 'settings';
type RoutingMode = 'auto' | 'question' | 'problem' | 'suggestion';
type AuthMode = 'auto' | 'bearer' | 'basic';

interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  status: number;
  detail: string;
  help: string;
  authMode: string;
  metadata?: Record<string, unknown> | null;
}

interface ConnectionState {
  ok: boolean;
  readyToCreate: boolean;
  configured: boolean;
  projectName: string | null;
  projectKey: string | null;
  serviceDeskId: string | null;
  authMode: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorHelp: string | null;
  httpStatus: number | null;
  checks: DiagnosticCheck[];
  requiredScopes: string[];
  optionalCustomerScopes: string[];
  checkedAt: string;
}

interface RequestRecord {
  localReference: string;
  issueKey: string;
  issueId: string;
  requestKind: string;
  requestTypeId: string;
  serviceDeskId: string;
  portalUrl: string;
  agentUrl: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  errorHelp: string;
  httpStatus: number;
  authMode: string;
  customerEmail: string;
  customerName: string;
  subject: string;
  source: string;
  priority: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

interface DashboardState {
  success: boolean;
  config: {
    configured: boolean;
    cloudId: string | null;
    serviceDeskId: string | null;
    serviceAccount: string | null;
    tokenConfigured: boolean;
    defaultAuthMode: string;
    requestTypes: { question: string | null; problem: string | null; suggestion: string | null };
    missing: string[];
  };
  settings: {
    enabled: boolean;
    routingMode: RoutingMode;
    authMode: AuthMode;
    syncCustomers: boolean;
    updatedBy: string;
    updatedAt: string;
  };
  stats: { total: number; created: number; failed: number; disabled: number };
  requests: RequestRecord[];
  connection: ConnectionState | null;
}

function dateLabel(value: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === 'created') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (value === 'disabled') return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300';
}

function StatusBadge({ status }: { status: string }) {
  const created = status.toLowerCase() === 'created';
  const disabled = status.toLowerCase() === 'disabled';
  const Icon = created ? CheckCircle2 : disabled ? CircleDot : XCircle;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}><Icon className="h-3.5 w-3.5" />{created ? 'Created' : disabled ? 'Held' : 'Failed'}</span>;
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function MetricCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: ComponentType<{ className?: string }>; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Icon className="h-5 w-5" /></span></div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function CheckCard({ check }: { check: DiagnosticCheck }) {
  return (
    <div className={`rounded-xl border p-4 ${check.ok ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-red-200 bg-red-50/70 dark:border-red-500/25 dark:bg-red-500/10'}`}>
      <div className="flex items-start gap-3">
        {check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-950 dark:text-white">{check.label}</p><span className="font-mono text-[11px] text-slate-500">HTTP {check.status || '—'} · {check.authMode || 'not tested'}</span></div>
          <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{check.detail || (check.ok ? 'Check completed.' : 'Check failed.')}</p>
          {!check.ok && check.help && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs font-medium leading-relaxed text-red-800 dark:bg-slate-950/40 dark:text-red-200">Fix: {check.help}</p>}
        </div>
      </div>
    </div>
  );
}

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'raise', label: 'Raise request', icon: UserRoundPlus },
  { id: 'queue', label: 'Queue & history', icon: TicketCheck },
  { id: 'diagnostics', label: 'Diagnostics', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminAtlassianSupportPage() {
  const { admin } = useAdmin();
  const roles = admin?.roles ?? [];
  const canEdit = admin?.isSystemAdministrator === true
    || roles.includes('PlatformOwner')
    || roles.includes('SystemAdministrator')
    || roles.includes('Admin')
    || roles.length === 0;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [authMode, setAuthMode] = useState<AuthMode>('auto');
  const [syncCustomers, setSyncCustomers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [retryingAll, setRetryingAll] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'created' | 'failed' | 'disabled'>('all');
  const [selectedReference, setSelectedReference] = useState('');

  const applyDashboard = useCallback((next: DashboardState) => {
    setDashboard(next);
    setEnabled(next.settings.enabled);
    setRoutingMode(next.settings.routingMode);
    setAuthMode(next.settings.authMode || 'auto');
    setSyncCustomers(next.settings.syncCustomers === true);
  }, []);

  const loadDashboard = useCallback(async (testConnection = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/atlassian-connection${testConnection ? '?test=1' : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as DashboardState & { error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'The support operations centre could not be loaded.');
      applyDashboard(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The support operations centre could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [applyDashboard]);

  useEffect(() => { void loadDashboard(true); }, [loadDashboard]);

  async function saveControls() {
    if (!canEdit) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'save_settings', enabled, routingMode, authMode, syncCustomers }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; dashboard?: DashboardState };
      if (!response.ok || !data.success || !data.dashboard) throw new Error(data.error || 'The controls could not be saved.');
      applyDashboard(data.dashboard);
      setMessage('Support operations settings saved. Run diagnostics to verify the new connection mode.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The controls could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function runDiagnostics() {
    setTesting(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'run_diagnostics' }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; connection?: ConnectionState };
      if (!data.connection) throw new Error(data.error || 'No diagnostic result was returned.');
      setDashboard(current => current ? { ...current, connection: data.connection ?? null } : current);
      setActiveTab('diagnostics');
      if (!response.ok || !data.success) {
        setError(data.connection.errorHelp || data.connection.errorMessage || `Diagnostics failed${data.connection.errorCode ? `: ${data.connection.errorCode}` : ''}.`);
      } else {
        setMessage(`All checks passed for ${data.connection.projectName || 'Planyx Customer Services'}.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The diagnostics could not be completed.');
    } finally {
      setTesting(false);
    }
  }

  async function retryRequest(localReference: string) {
    if (!canEdit) return;
    setRetrying(localReference); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'retry', localReference }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; result?: RequestRecord; dashboard?: DashboardState };
      if (data.dashboard) applyDashboard(data.dashboard);
      if (!response.ok || !data.success) throw new Error(data.result?.errorHelp || data.result?.errorMessage || data.error || data.result?.errorCode || 'The request could not be retried.');
      setMessage(`Created ${data.result?.issueKey || 'the Atlassian request'} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be retried.');
    } finally {
      setRetrying('');
    }
  }

  async function retryAllFailed() {
    if (!canEdit) return;
    setRetryingAll(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'retry_all_failed' }),
      });
      const data = await response.json().catch(() => ({})) as { dashboard?: DashboardState; retried?: number; created?: number; failed?: number; error?: string };
      if (data.dashboard) applyDashboard(data.dashboard);
      if (!response.ok && response.status !== 207) throw new Error(data.error || 'Failed deliveries could not be retried.');
      setMessage(`Retried ${data.retried || 0} item(s): ${data.created || 0} created and ${data.failed || 0} still need attention.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed deliveries could not be retried.');
    } finally {
      setRetryingAll(false);
    }
  }

  const connectionReady = dashboard?.connection?.readyToCreate === true;
  const dirty = dashboard
    ? enabled !== dashboard.settings.enabled
      || routingMode !== dashboard.settings.routingMode
      || authMode !== dashboard.settings.authMode
      || syncCustomers !== dashboard.settings.syncCustomers
    : false;
  const successRate = useMemo(() => {
    if (!dashboard?.stats.total) return 0;
    return Math.round((dashboard.stats.created / dashboard.stats.total) * 100);
  }, [dashboard]);
  const failedRecords = dashboard?.requests.filter(record => record.status === 'failed' || record.status === 'not_configured') || [];
  const has403 = failedRecords.some(record => record.httpStatus === 403 || record.errorCode === 'ATLASSIAN_HTTP_403');

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (dashboard?.requests || []).filter(record => {
      const statusMatch = statusFilter === 'all'
        || (statusFilter === 'failed' ? ['failed', 'not_configured'].includes(record.status) : record.status === statusFilter);
      const searchMatch = !query || [
        record.localReference, record.issueKey, record.customerName, record.customerEmail,
        record.subject, record.requestKind, record.errorCode, record.source,
      ].some(value => String(value || '').toLowerCase().includes(query));
      return statusMatch && searchMatch;
    });
  }, [dashboard, search, statusFilter]);

  function createdDashboard(next: unknown) {
    if (next && typeof next === 'object' && 'success' in next) applyDashboard(next as DashboardState);
    setActiveTab('queue');
    setStatusFilter('all');
  }

  return (
    <AdminLayout title="Support Operations Centre">
      <Helmet><title>Support Operations Centre | Planyx Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/20"><HeadphonesIcon className="h-6 w-6" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Planyx Customer Services · PXCS</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Support Operations Centre</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Raise requests for CRM customers, monitor delivery, investigate failures and control the Atlassian integration from one operational workspace.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadDashboard(false)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
              <button type="button" onClick={() => void runDiagnostics()} disabled={testing} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Run diagnostics</button>
            </div>
          </div>
          <div className={`flex flex-col gap-2 border-t px-6 py-4 text-sm sm:flex-row sm:items-center ${connectionReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'}`}>
            {connectionReady ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
            <span className="font-semibold">{connectionReady ? `Ready to create PXCS requests using ${dashboard?.connection?.authMode || 'automatic'} authentication` : dashboard?.connection?.errorMessage || 'The integration needs a diagnostic check before it can be treated as ready.'}</span>
            {dashboard?.connection?.checkedAt && <span className="sm:ml-auto text-xs opacity-75">Checked {dateLabel(dashboard.connection.checkedAt)}</span>}
          </div>
        </section>

        {(message || error) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{error || message}</div>}

        {has403 && <section className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/25 dark:bg-red-500/10">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" /><div><h2 className="font-bold text-red-950 dark:text-red-100">Atlassian is refusing ticket creation with HTTP 403</h2><p className="mt-1 text-sm leading-relaxed text-red-800 dark:text-red-200">The credentials are reaching Atlassian, but the service account is not authorised for the write operation. Run Diagnostics. The usual fix is to recreate the token with <code className="rounded bg-white/70 px-1 py-0.5">read:servicedesk-request</code> and <code className="rounded bg-white/70 px-1 py-0.5">write:servicedesk-request</code>, then add the service account to the PXCS Service Desk Team or Administrator role.</p><button type="button" onClick={() => { setActiveTab('diagnostics'); void runDiagnostics(); }} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-red-800 underline dark:text-red-200">Open guided diagnostics <ArrowRight className="h-4 w-4" /></button></div></div>
        </section>}

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Support operations sections">
          {TABS.map(tab => { const Icon = tab.icon; const active = activeTab === tab.id; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}><Icon className="h-4 w-4" />{tab.label}{tab.id === 'queue' && failedRecords.length > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>{failedRecords.length}</span>}</button>; })}
        </nav>

        {loading && !dashboard ? <div className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div> : dashboard && <>
          {activeTab === 'overview' && <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Created" value={dashboard.stats.created} icon={CheckCircle2} hint="Requests successfully created in PXCS." />
              <MetricCard label="Needs attention" value={dashboard.stats.failed} icon={AlertTriangle} hint="Saved cases that Atlassian has not accepted yet." />
              <MetricCard label="Success rate" value={`${successRate}%`} icon={Activity} hint="Successful deliveries across recorded attempts." />
              <MetricCard label="Total activity" value={dashboard.stats.total} icon={TicketCheck} hint="Automatic and administrator-raised deliveries." />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Operational readiness</h2><p className="mt-1 text-sm text-slate-500">The most important checks for live customer ticket creation.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${connectionReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{connectionReady ? 'Ready' : 'Attention required'}</span></div>
                <div className="mt-5 space-y-3">
                  {(dashboard.connection?.checks || []).slice(0, 5).map(check => <CheckCard key={check.id} check={check} />)}
                  {!dashboard.connection?.checks?.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Run diagnostics to populate the live readiness checks.</p>}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-950 dark:text-white">Quick actions</h2><div className="mt-4 grid gap-3"><button type="button" onClick={() => setActiveTab('raise')} className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-blue-900 hover:bg-blue-100 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-100"><span><span className="block font-semibold">Raise a customer request</span><span className="mt-0.5 block text-xs opacity-75">Search CRM and create it on their behalf.</span></span><UserRoundPlus className="h-5 w-5" /></button><button type="button" onClick={() => setActiveTab('queue')} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><span><span className="block font-semibold">Open delivery queue</span><span className="mt-0.5 block text-xs text-slate-500">Review, filter and retry saved cases.</span></span><TicketCheck className="h-5 w-5 text-slate-500" /></button><button type="button" onClick={() => setActiveTab('settings')} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><span><span className="block font-semibold">Integration settings</span><span className="mt-0.5 block text-xs text-slate-500">Routing, authentication and customer sync.</span></span><Settings2 className="h-5 w-5 text-slate-500" /></button></div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-950 dark:text-white">PXCS configuration</h2><dl className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800"><div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Service desk</dt><dd className="font-mono font-semibold">{dashboard.config.serviceDeskId || 'Missing'}</dd></div><div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Authentication</dt><dd className="capitalize font-semibold">{dashboard.connection?.authMode || dashboard.settings.authMode}</dd></div><div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Automatic AI creation</dt><dd className="font-semibold">{dashboard.settings.enabled ? 'Enabled' : 'Disabled'}</dd></div><div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">CRM customer sync</dt><dd className="font-semibold">{dashboard.settings.syncCustomers ? 'Enabled' : 'Disabled'}</dd></div></dl></div>
              </div>
            </section>
          </div>}

          {activeTab === 'raise' && <AtlassianCustomerRequestForm canEdit={canEdit} onCreated={createdDashboard} />}

          {activeTab === 'queue' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Delivery queue and case history</h2><p className="mt-1 text-sm text-slate-500">Search every recorded delivery, inspect the exact failure and retry the saved CRM case safely.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void retryAllFailed()} disabled={!canEdit || retryingAll || failedRecords.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{retryingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Retry failed</button><button type="button" onClick={() => void loadDashboard(false)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700"><RefreshCw className="h-4 w-4" />Refresh queue</button></div></div>
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-[1fr_190px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reference, customer, subject or error" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900" /></div><div className="relative"><Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="all">All statuses</option><option value="created">Created</option><option value="failed">Failed</option><option value="disabled">Held</option></select></div></div>
            {filteredRequests.length === 0 ? <div className="p-12 text-center"><TicketCheck className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-300">No matching support deliveries</p><p className="mt-1 text-sm text-slate-500">Change the filters or raise a request for a CRM customer.</p></div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{filteredRequests.map(record => <div key={record.localReference} className="p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[140px_1fr_170px_120px]"><div><StatusBadge status={record.status} />{record.httpStatus > 0 && <p className="mt-2 font-mono text-[11px] text-slate-500">HTTP {record.httpStatus} · {record.authMode || 'unknown'}</p>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-slate-950 dark:text-white">{record.subject || record.localReference}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">{record.requestKind || 'request'}</span>{record.priority && <span className="text-xs font-medium text-slate-500">{record.priority}</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{record.customerName || 'Customer'} · {record.customerEmail || 'email not recorded'}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs"><span className="text-slate-500">Planyx {record.localReference}</span>{record.issueKey && <a href={record.agentUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline dark:text-blue-300">{record.issueKey}<ExternalLink className="h-3 w-3" /></a>}</div>{record.errorMessage && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-red-700 dark:text-red-300">{record.errorMessage}</p>}</div><div className="text-xs text-slate-500"><p>Updated</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{dateLabel(record.updatedAt)}</p><p className="mt-2">Attempts: {record.attempts || 1}</p></div><div className="flex items-start justify-end gap-2">{record.status !== 'created' && <button type="button" onClick={() => void retryRequest(record.localReference)} disabled={!canEdit || retrying === record.localReference} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{retrying === record.localReference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Retry</button>}</div></div>{record.errorHelp && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recommended action</p><p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{record.errorHelp}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">{record.customerEmail && <a href={`/admin/users/${encodeURIComponent(record.customerEmail)}`} className="text-blue-700 hover:underline dark:text-blue-300">Open Customer CRM</a>}<span className="text-slate-500">Source: {record.source || 'Not recorded'}</span></div></div>}</div>)}</div>}
          </section>}

          {activeTab === 'diagnostics' && <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Guided connection diagnostics</h2><p className="mt-1 text-sm text-slate-500">Tests the service-account identity, PXCS access and raise-on-behalf permission for all three request types.</p></div><button type="button" onClick={() => void runDiagnostics()} disabled={testing} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Run full diagnostics</button></div><div className="mt-5 grid gap-3">{(dashboard.connection?.checks || []).map(check => <CheckCard key={check.id} check={check} />)}{!dashboard.connection?.checks?.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No diagnostic results yet.</p>}</div></section>
            <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-blue-600" /><h2 className="text-lg font-bold text-slate-950 dark:text-white">Required API-token scopes</h2></div><p className="mt-2 text-sm leading-relaxed text-slate-500">A 403 during request creation normally means the token can read PXCS but cannot write a customer request.</p><div className="mt-4 space-y-2">{(dashboard.connection?.requiredScopes || ['read:servicedesk-request', 'write:servicedesk-request']).map(scope => <code key={scope} className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{scope}</code>)}</div><p className="mt-4 text-xs leading-relaxed text-slate-500">Customer provisioning is optional and additionally requires <code>manage:servicedesk-customer</code> plus the relevant Jira administration permissions.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-blue-600" /><h2 className="text-lg font-bold text-slate-950 dark:text-white">PXCS project permissions</h2></div><ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300"><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span><span>Add the service account to the <strong>Planyx Customer Services</strong> project.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">2</span><span>Give it the <strong>Service Desk Team</strong> or project administrator role, not customer-only access.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">3</span><span>Confirm each request type reports <strong>canRaiseOnBehalfOf=true</strong> in the diagnostics above.</span></li></ol><a href="https://jagroupservices.atlassian.net/jira/servicedesk/projects/PXCS/settings/people" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Open PXCS people and access <ExternalLink className="h-4 w-4" /></a></div></section>
          </div>}

          {activeTab === 'settings' && <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Integration controls</h2><p className="mt-1 text-sm text-slate-500">Changes apply to new automatic and administrator-raised requests.</p></div>{!canEdit && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">View only</span>}</div><div className="mt-6 space-y-5"><div className="flex items-start justify-between gap-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div><p className="font-semibold text-slate-950 dark:text-white">Automatic AI ticket creation</p><p className="mt-1 text-sm leading-relaxed text-slate-500">Verified signed-in escalations create PXCS tickets. Disabling this keeps Planyx and CRM records but holds Atlassian delivery.</p></div><Toggle checked={enabled} disabled={!canEdit} onChange={setEnabled} /></div><div className="flex items-start justify-between gap-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div><p className="font-semibold text-slate-950 dark:text-white">Provision missing CRM customers</p><p className="mt-1 text-sm leading-relaxed text-slate-500">Creates and associates a missing Atlassian portal customer before raising the request. Requires the optional customer-management scope and Jira administrator permission.</p></div><Toggle checked={syncCustomers} disabled={!canEdit} onChange={setSyncCustomers} /></div><label className="block text-sm font-semibold text-slate-950 dark:text-white">Request classification<select value={routingMode} disabled={!canEdit} onChange={event => setRoutingMode(event.target.value as RoutingMode)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-950"><option value="auto">Automatic classification</option><option value="question">Always Question</option><option value="problem">Always Problem</option><option value="suggestion">Always Suggestion</option></select></label><label className="block text-sm font-semibold text-slate-950 dark:text-white">Authentication mode<select value={authMode} disabled={!canEdit} onChange={event => setAuthMode(event.target.value as AuthMode)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-950"><option value="auto">Automatic — Bearer first, Basic compatibility fallback</option><option value="bearer">Bearer — recommended for scoped service-account tokens</option><option value="basic">Basic — email and API token compatibility mode</option></select></label><button type="button" onClick={() => void saveControls()} disabled={!canEdit || saving || !dirty} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save integration settings</button>{dashboard.settings.updatedAt && <p className="text-xs text-slate-500">Last changed {dateLabel(dashboard.settings.updatedAt)}{dashboard.settings.updatedBy ? ` by ${dashboard.settings.updatedBy}` : ''}.</p>}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-950 dark:text-white">Secure configuration</h2><p className="mt-1 text-sm text-slate-500">Secrets remain encrypted in Cloudflare and are never sent to this page.</p><dl className="mt-5 divide-y divide-slate-100 text-sm dark:divide-slate-800">{[['Project', dashboard.connection?.projectName || 'Planyx Customer Services'],['Project key', dashboard.connection?.projectKey || 'PXCS'],['Service desk ID', dashboard.config.serviceDeskId || 'Missing'],['Cloud ID', dashboard.config.cloudId || 'Missing'],['Service account', dashboard.config.serviceAccount || 'Missing'],['API token', dashboard.config.tokenConfigured ? 'Configured securely' : 'Missing']].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3"><dt className="text-slate-500">{label}</dt><dd className="max-w-[65%] break-all text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">{value}</dd></div>)}</dl><div className="mt-5 grid grid-cols-3 gap-2">{Object.entries(dashboard.config.requestTypes).map(([kind, id]) => <div key={kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kind}</p><p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white">{id || '—'}</p></div>)}</div><a href="https://jagroupservices.atlassian.net/jira/servicedesk/projects/PXCS" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Open PXCS in Atlassian <ExternalLink className="h-4 w-4" /></a></div>
          </section>}
        </>}
      </div>
    </AdminLayout>
  );
}
