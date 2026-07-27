import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HeadphonesIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  TicketCheck,
  XCircle,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import AtlassianCustomerRequestForm from '@/components/admin/AtlassianCustomerRequestForm';
import { useAdmin } from '@/lib/admin-context';

interface ConnectionState {
  ok: boolean;
  configured: boolean;
  projectName: string | null;
  projectKey: string | null;
  serviceDeskId: string | null;
  errorCode: string | null;
  httpStatus: number | null;
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
    requestTypes: { question: string | null; problem: string | null; suggestion: string | null };
    missing: string[];
  };
  settings: {
    enabled: boolean;
    routingMode: 'auto' | 'question' | 'problem' | 'suggestion';
    updatedBy: string;
    updatedAt: string;
  };
  stats: { total: number; created: number; failed: number };
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

function StatusBadge({ status }: { status: string }) {
  const normalised = status.toLowerCase();
  if (normalised === 'created') {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Created</span>;
  }
  if (normalised === 'disabled') {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-300"><AlertTriangle className="h-3.5 w-3.5" />Disabled</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-300"><XCircle className="h-3.5 w-3.5" />Failed</span>;
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

export default function AdminAtlassianSupportPage() {
  const { admin } = useAdmin();
  const roles = admin?.roles ?? [];
  const canEdit = admin?.isSystemAdministrator === true
    || roles.includes('PlatformOwner')
    || roles.includes('SystemAdministrator')
    || roles.includes('Admin')
    || roles.length === 0;

  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [routingMode, setRoutingMode] = useState<DashboardState['settings']['routingMode']>('auto');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const applyDashboard = useCallback((next: DashboardState) => {
    setDashboard(next);
    setEnabled(next.settings.enabled);
    setRoutingMode(next.settings.routingMode);
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
      if (!response.ok || !data.success) throw new Error(data.error || 'The Atlassian controls could not be loaded.');
      applyDashboard(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Atlassian controls could not be loaded.');
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
        body: JSON.stringify({ action: 'save_settings', enabled, routingMode }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; dashboard?: DashboardState };
      if (!response.ok || !data.success || !data.dashboard) throw new Error(data.error || 'The controls could not be saved.');
      applyDashboard(data.dashboard);
      setMessage('Atlassian support controls saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The controls could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'test_connection' }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; connection?: ConnectionState };
      if (!data.connection) throw new Error(data.error || 'No connection result was returned.');
      setDashboard(current => current ? { ...current, connection: data.connection ?? null } : current);
      if (!response.ok || !data.success) throw new Error(`Connection test failed${data.connection.errorCode ? `: ${data.connection.errorCode}` : ''}.`);
      setMessage(`Connected to ${data.connection.projectName || 'Atlassian Customer Service'}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The connection test failed.');
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
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; result?: { issueKey?: string; errorCode?: string }; dashboard?: DashboardState };
      if (data.dashboard) applyDashboard(data.dashboard);
      if (!response.ok || !data.success) throw new Error(data.error || data.result?.errorCode || 'The Atlassian request could not be retried.');
      setMessage(`Created ${data.result?.issueKey || 'the Atlassian request'} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Atlassian request could not be retried.');
    } finally {
      setRetrying('');
    }
  }

  const connectionHealthy = dashboard?.connection?.ok === true;
  const dirty = dashboard ? enabled !== dashboard.settings.enabled || routingMode !== dashboard.settings.routingMode : false;
  const successRate = useMemo(() => {
    if (!dashboard?.stats.total) return 0;
    return Math.round((dashboard.stats.created / dashboard.stats.total) * 100);
  }, [dashboard]);

  return (
    <AdminLayout title="Atlassian Support Control Centre">
      <Helmet><title>Atlassian Support Control Centre | Planyx Admin</title></Helmet>
      <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-5 border-b border-slate-200 p-6 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><HeadphonesIcon className="h-6 w-6" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">Customer Service Integration</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Atlassian Support Control Centre</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">See the live PXCS connection, raise issues for CRM customers, control automatic AI ticket creation, choose how enquiries are classified, and retry failed deliveries.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadDashboard(false)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
              <button type="button" onClick={() => void testConnection()} disabled={testing} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Test connection</button>
            </div>
          </div>
          <div className={`flex items-center gap-3 px-6 py-4 text-sm ${connectionHealthy ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200'}`}>
            {connectionHealthy ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            <span className="font-semibold">{connectionHealthy ? `Connected to ${dashboard?.connection?.projectName || 'Planyx Customer Services'} (${dashboard?.connection?.projectKey || 'PXCS'})` : dashboard?.connection ? `Connection needs attention${dashboard.connection.errorCode ? ` — ${dashboard.connection.errorCode}` : ''}` : 'Connection has not been tested yet'}</span>
            {dashboard?.connection?.checkedAt && <span className="ml-auto hidden text-xs opacity-75 sm:inline">Checked {dateLabel(dashboard.connection.checkedAt)}</span>}
          </div>
        </section>

        {(message || error) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{error || message}</div>}

        {loading && !dashboard ? <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : dashboard && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Total deliveries', dashboard.stats.total, TicketCheck],
              ['Created in Atlassian', dashboard.stats.created, CheckCircle2],
              ['Failed deliveries', dashboard.stats.failed, XCircle],
              ['Success rate', `${successRate}%`, ShieldCheck],
            ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{String(label)}</p><Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" /></div><p className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">{String(value)}</p></div>)}
          </section>

          <AtlassianCustomerRequestForm
            canEdit={canEdit}
            onCreated={next => { if (next) applyDashboard(next as DashboardState); }}
          />

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Ticket controls</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">These settings apply immediately to signed-in AI escalations.</p></div>{!canEdit && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">View only</span>}</div>
              <div className="mt-6 space-y-6">
                <div className="flex items-start justify-between gap-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div><p className="font-semibold text-slate-950 dark:text-white">Automatic Atlassian ticket creation</p><p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">When enabled, verified signed-in AI escalations create PXCS tickets. Planyx still keeps its own enquiry record as a safety copy.</p></div><Toggle checked={enabled} disabled={!canEdit} onChange={setEnabled} /></div>
                <div><label htmlFor="atlassian-routing-mode" className="text-sm font-semibold text-slate-950 dark:text-white">Request classification</label><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Automatic uses the customer’s subject, message and category. A fixed option sends every new ticket to that request type.</p><select id="atlassian-routing-mode" value={routingMode} disabled={!canEdit} onChange={event => setRoutingMode(event.target.value as DashboardState['settings']['routingMode'])} className="mt-3 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="auto">Automatic classification</option><option value="question">Always create as Question</option><option value="problem">Always create as Problem</option><option value="suggestion">Always create as Suggestion</option></select></div>
                <button type="button" onClick={() => void saveControls()} disabled={!canEdit || saving || !dirty} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save controls</button>
                {dashboard.settings.updatedAt && <p className="text-xs text-slate-500 dark:text-slate-400">Last changed {dateLabel(dashboard.settings.updatedAt)}{dashboard.settings.updatedBy ? ` by ${dashboard.settings.updatedBy}` : ''}.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Connection configuration</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Credential values stay encrypted in Cloudflare and are never displayed here.</p>
              <dl className="mt-5 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {[
                  ['Project', dashboard.connection?.projectName || 'Planyx Customer Services'],
                  ['Project key', dashboard.connection?.projectKey || 'PXCS'],
                  ['Service desk ID', dashboard.config.serviceDeskId || 'Missing'],
                  ['Cloud ID', dashboard.config.cloudId || 'Missing'],
                  ['Service account', dashboard.config.serviceAccount || 'Missing'],
                  ['API token', dashboard.config.tokenConfigured ? 'Configured securely' : 'Missing'],
                ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="max-w-[65%] break-all text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">{value}</dd></div>)}
              </dl>
              <div className="mt-5 grid grid-cols-3 gap-2">{Object.entries(dashboard.config.requestTypes).map(([kind, id]) => <div key={kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-950"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kind}</p><p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white">{id || '—'}</p></div>)}</div>
              <a href="https://jagroupservices.atlassian.net/jira/servicedesk/projects/PXCS" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Open PXCS in Atlassian <ExternalLink className="h-4 w-4" /></a>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Recent Atlassian deliveries</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The latest 50 Planyx-to-Atlassian ticket attempts, including requests raised by administrators for CRM customers.</p></div><span className="text-xs text-slate-500">Failed items can be retried without creating a duplicate local case.</span></div>
            {dashboard.requests.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No Atlassian ticket deliveries have been recorded yet.</div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-950"><tr><th className="px-5 py-3">Status</th><th className="px-5 py-3">Atlassian</th><th className="px-5 py-3">Planyx reference</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{dashboard.requests.map(record => <tr key={record.localReference} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-5 py-4"><StatusBadge status={record.status} />{record.errorCode && <p className="mt-1 max-w-40 break-all text-[10px] text-red-600 dark:text-red-300">{record.errorCode}</p>}</td><td className="px-5 py-4 font-mono text-sm font-bold text-slate-950 dark:text-white">{record.issueKey ? record.agentUrl ? <a href={record.agentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-300">{record.issueKey}<ExternalLink className="h-3 w-3" /></a> : record.issueKey : '—'}</td><td className="px-5 py-4 font-mono text-xs text-slate-700 dark:text-slate-300">{record.localReference}</td><td className="px-5 py-4"><span className="capitalize text-slate-700 dark:text-slate-300">{record.requestKind || 'Unknown'}</span><p className="font-mono text-[10px] text-slate-500">ID {record.requestTypeId || '—'}</p></td><td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500">{dateLabel(record.updatedAt)}</td><td className="px-5 py-4 text-right">{record.status !== 'created' && <button type="button" onClick={() => void retryRequest(record.localReference)} disabled={!canEdit || retrying === record.localReference} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{retrying === record.localReference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Retry</button>}</td></tr>)}</tbody></table></div>}
          </section>
        </>}
      </main>
    </AdminLayout>
  );
}
