import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Globe2,
  HeartPulse,
  MessageSquare,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';

type ConnectionState = 'updating' | 'online' | 'unavailable';

type CustomerRecord = {
  email?: string;
  display_name?: string;
  created_at?: string;
  updated_at?: string;
};

type AuditRecord = {
  actor_email?: string;
  action?: string;
  summary?: string;
  created_at?: string;
};

type SupportRecord = {
  id?: string;
  subject?: string;
  status?: string;
  priority?: string;
  updated_at?: string;
};

type DashboardData = {
  customers: number;
  outputs: number;
  activePlans: number;
  lifetimeUsers: number;
  pendingDpr: number;
  openIssues: number;
  openSupport: number;
  admins: number;
  launchGatewayStatus: 'On' | 'Off';
  maintenanceStatus: 'On' | 'Off';
  latestCustomers: CustomerRecord[];
  latestAudit: AuditRecord[];
  latestSupport: SupportRecord[];
};

type DashboardResponse = {
  success?: boolean;
  checkedAt?: string;
  error?: string;
  data?: Partial<DashboardData>;
};

type ActionItem = {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const EMPTY_DATA: DashboardData = {
  customers: 0,
  outputs: 0,
  activePlans: 0,
  lifetimeUsers: 0,
  pendingDpr: 0,
  openIssues: 0,
  openSupport: 0,
  admins: 0,
  launchGatewayStatus: 'Off',
  maintenanceStatus: 'Off',
  latestCustomers: [],
  latestAudit: [],
  latestSupport: [],
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function dateTime(value?: string) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  note: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-4 pt-1">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

function QuickAction({ action }: { action: ActionItem }) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to}
      className="group flex min-h-[92px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{action.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{action.description}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600 dark:text-slate-600" />
    </Link>
  );
}

export default function StableAdminDashboard() {
  const { admin } = useAdmin();
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [connection, setConnection] = useState<ConnectionState>('updating');
  const [message, setMessage] = useState('Live figures are updating in the background.');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setConnection('updating');
    setMessage('Live figures are updating in the background.');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5500);

    try {
      const response = await fetch('/api/admin/dashboard-summary', {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as DashboardResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || `Dashboard summary returned ${response.status}.`);
      }

      const incoming = payload.data;
      setData({
        ...EMPTY_DATA,
        ...incoming,
        customers: number(incoming.customers),
        outputs: number(incoming.outputs),
        activePlans: number(incoming.activePlans),
        lifetimeUsers: number(incoming.lifetimeUsers),
        pendingDpr: number(incoming.pendingDpr),
        openIssues: number(incoming.openIssues),
        openSupport: number(incoming.openSupport),
        admins: number(incoming.admins),
        latestCustomers: Array.isArray(incoming.latestCustomers) ? incoming.latestCustomers : [],
        latestAudit: Array.isArray(incoming.latestAudit) ? incoming.latestAudit : [],
        latestSupport: Array.isArray(incoming.latestSupport) ? incoming.latestSupport : [],
      });
      setConnection('online');
      setMessage('Live platform figures are connected.');
      setLastUpdated(payload.checkedAt || new Date().toISOString());
    } catch (error) {
      setConnection('unavailable');
      setMessage(error instanceof Error && error.name !== 'AbortError'
        ? error.message
        : 'Live figures are temporarily unavailable. The dashboard remains usable.');
    } finally {
      window.clearTimeout(timeout);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(false);
    const interval = window.setInterval(() => void loadSummary(false), 60_000);
    return () => window.clearInterval(interval);
  }, [loadSummary]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (admin?.name || 'Administrator').split(' ')[0];
  const websiteStatus = data.maintenanceStatus === 'On' ? 'Maintenance' : data.launchGatewayStatus === 'On' ? 'Coming Soon' : 'Live';
  const attentionTotal = data.pendingDpr + data.openIssues + data.openSupport;

  const quickActions = useMemo<ActionItem[]>(() => [
    { to: '/admin/users', label: 'Customer CRM', description: 'Profiles, security verification and subscriptions.', icon: Users },
    { to: '/admin/support', label: 'Support centre', description: 'Review active customer support records.', icon: MessageSquare },
    { to: '/admin/gdpr', label: 'Data requests', description: 'Manage privacy and information-rights requests.', icon: ShieldCheck },
    { to: '/admin/pages', label: 'AI Website Studio', description: 'Edit managed pages, code and public content.', icon: Wrench },
    { to: '/admin/status', label: 'Gate Control Centre', description: 'Control Launch and Maintenance Gates.', icon: Globe2 },
    { to: '/admin/health', label: 'Production health', description: 'Database, API and integration diagnostics.', icon: HeartPulse },
  ], []);

  const connectionClass = connection === 'online'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : connection === 'unavailable'
      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
      : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';

  return (
    <>
      <Helmet>
        <title>Admin Dashboard — Planyx</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Dashboard" subtitle="Planyx Administration">
        <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-12">
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-blue-50 to-violet-50 px-5 py-6 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950 sm:px-7 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-blue-100">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin command overview
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${connectionClass}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> {connection === 'online' ? 'Data online' : connection === 'unavailable' ? 'Data unavailable' : 'Updating data'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
                    <Globe2 className="h-3.5 w-3.5" /> Website {websiteStatus}
                  </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{greeting}, {firstName}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                  Review customers, planning activity, support workload, security work and public website controls from one place.
                </p>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{lastUpdated ? `Last updated ${dateTime(lastUpdated)}` : message}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to="/admin/status" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  <Globe2 className="h-4 w-4" /> Public gates
                </Link>
                <Link to="/admin/audit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  <FileText className="h-4 w-4" /> Audit log
                </Link>
                <button type="button" onClick={() => void loadSummary(true)} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing…' : 'Refresh data'}
                </button>
              </div>
            </div>
          </section>

          {connection === 'unavailable' && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Live figures could not be refreshed</p>
                <p className="mt-1 text-xs leading-relaxed">{message} The Admin tools below remain available.</p>
              </div>
            </div>
          )}

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Headline operations</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Current totals from the Planyx operational database.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Customer profiles" value={data.customers} note="Registered Planyx customer records" icon={Users} accent="bg-blue-600" />
              <MetricCard label="Plans and outputs" value={data.outputs} note="Saved builder outputs" icon={FileText} accent="bg-cyan-500" />
              <MetricCard label="Configured plans" value={data.activePlans} note="Active subscription plans" icon={CreditCard} accent="bg-violet-600" />
              <MetricCard label="Items requiring action" value={attentionTotal} note="Privacy, support and platform work" icon={AlertTriangle} accent={attentionTotal > 0 ? 'bg-amber-500' : 'bg-emerald-500'} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white">Attention required</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Work that may need an administrator response.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${attentionTotal > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{attentionTotal > 0 ? `${attentionTotal} open` : 'All clear'}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ['Data protection', data.pendingDpr, '/admin/gdpr', ClipboardList],
                  ['Open support', data.openSupport, '/admin/support', MessageSquare],
                  ['Platform issues', data.openIssues, '/admin/status', Activity],
                ].map(([label, value, to, Icon]) => (
                  <Link key={String(label)} to={String(to)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-center justify-between gap-2">
                      {typeof Icon !== 'string' && <Icon className="h-5 w-5 text-blue-600" />}
                      <span className="text-2xl font-bold text-slate-950 dark:text-white">{Number(value).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{String(label)}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-5">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Platform control</h2>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ['Public website mode', websiteStatus],
                  ['Dashboard data', connection === 'online' ? 'Online' : connection === 'updating' ? 'Updating' : 'Unavailable'],
                  ['Authorised administrators', data.admins.toLocaleString('en-GB')],
                  ['Lifetime members', data.lifetimeUsers.toLocaleString('en-GB')],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Administrative workspace</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Frequently used operational tools.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{quickActions.map(action => <QuickAction key={action.to} action={action} />)}</div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Admin Centre remains available</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Dashboard figures update in the background and can no longer block access to Admin tools.</p>
              </div>
            </div>
            <Link to="/admin/site-settings" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Settings <Settings className="h-4 w-4" /></Link>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}
