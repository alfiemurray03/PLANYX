/**
 * Sousa Murray Planeia Admin Centre command dashboard.
 *
 * Dashboard data comes from the production Cloudflare Admin API. The page uses
 * one bounded request so a slow or unavailable service cannot leave the whole
 * dashboard displaying skeleton cards indefinitely.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Gauge,
  Globe2,
  HeartPulse,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';

interface RecentCustomer {
  email?: string;
  verified_name?: string;
  display_name?: string;
  contact_email?: string;
  updated_at?: string;
}

interface RecentSupport {
  id?: string;
  subject?: string;
  status?: string;
  priority?: string;
  updated_at?: string;
}

interface RecentReport {
  id?: string;
  title?: string;
  status?: string;
  updated_at?: string;
}

interface RecentAudit {
  action?: string;
  actor_email?: string;
  entity_type?: string;
  entity_id?: string;
  summary?: string;
  created_at?: string;
}

interface ActiveAdmin {
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  updated_at?: string;
}

interface OperationalOverview {
  customers: number;
  plans: number;
  activePlans: number;
  policies: number;
  supportTickets: number;
  openIssues: number;
  dataProtectionRequests: number;
  systemReports: number;
  closureRequests: number;
  lifetimeUsers: number;
  admins: number;
  launchGatewayStatus: string;
  maintenanceStatus: string;
  recentAudit: RecentAudit[];
  latestCustomers: RecentCustomer[];
  latestSupport: RecentSupport[];
  latestReports: RecentReport[];
  activeAdmins: ActiveAdmin[];
}

interface OverviewResponse {
  overview?: OperationalOverview;
  error?: string;
}

type ApiHealth = 'checking' | 'online' | 'offline';

type ActionItem = {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const EMPTY_OVERVIEW: OperationalOverview = {
  customers: 0,
  plans: 0,
  activePlans: 0,
  policies: 0,
  supportTickets: 0,
  openIssues: 0,
  dataProtectionRequests: 0,
  systemReports: 0,
  closureRequests: 0,
  lifetimeUsers: 0,
  admins: 0,
  launchGatewayStatus: 'Off',
  maintenanceStatus: 'Off',
  recentAudit: [],
  latestCustomers: [],
  latestSupport: [],
  latestReports: [],
  activeAdmins: [],
};

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      const message = typeof payload?.error === 'string'
        ? payload.error
        : `Dashboard request failed (${response.status}).`;
      throw new Error(message);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The dashboard data request timed out after 8 seconds.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatDateTime(value?: string | null) {
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

function normaliseStatus(value?: string) {
  return String(value || 'Unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  loading: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      {loading ? (
        <div className="space-y-3 pt-2" aria-label={`Loading ${label}`}>
          <div className="h-3 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-9 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 pt-1">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-3 break-words text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      )}
    </section>
  );
}

function ControlRow({
  icon: Icon,
  label,
  value,
  note,
  tone = 'neutral',
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
  tone?: 'good' | 'warning' | 'danger' | 'neutral';
}) {
  const toneClass = {
    good: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    danger: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20',
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  }[tone];

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-4 last:border-b-0 dark:border-slate-800">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${toneClass}`}>{value}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>
      </div>
    </div>
  );
}

function QuickAction({ action }: { action: ActionItem }) {
  const Icon = action.icon;

  return (
    <Link
      to={action.to}
      className="group flex min-h-[92px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{action.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{action.description}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600" />
    </Link>
  );
}

export default function AdminDashboard() {
  const { admin } = useAdmin();
  const [overview, setOverview] = useState<OperationalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>('checking');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setLoadError('');
    if (!refresh) setApiHealth('checking');

    try {
      const payload = await fetchJson<OverviewResponse>('/admin/api?section=overview');
      if (!payload.overview) throw new Error(payload.error || 'The Admin overview did not return any dashboard data.');

      setOverview({
        ...EMPTY_OVERVIEW,
        ...payload.overview,
        recentAudit: Array.isArray(payload.overview.recentAudit) ? payload.overview.recentAudit : [],
        latestCustomers: Array.isArray(payload.overview.latestCustomers) ? payload.overview.latestCustomers : [],
        latestSupport: Array.isArray(payload.overview.latestSupport) ? payload.overview.latestSupport : [],
        latestReports: Array.isArray(payload.overview.latestReports) ? payload.overview.latestReports : [],
        activeAdmins: Array.isArray(payload.overview.activeAdmins) ? payload.overview.activeAdmins : [],
      });
      setApiHealth('online');
      setLastUpdated(new Date());
    } catch (error) {
      setApiHealth('offline');
      setLoadError(error instanceof Error
        ? error.message
        : 'Live dashboard information could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
    const interval = window.setInterval(() => void loadDashboard(true), 60_000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  const data = overview || EMPTY_OVERVIEW;
  const initialLoading = loading && !overview;
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (admin?.name || 'Administrator').split(' ')[0];
  const websiteStatus = initialLoading
    ? 'Checking'
    : data.maintenanceStatus === 'On'
      ? 'Maintenance'
      : data.launchGatewayStatus === 'On'
        ? 'Coming Soon'
        : 'Live';

  const urgentSupport = data.latestSupport.filter(ticket =>
    String(ticket.priority || '').toLowerCase() === 'urgent'
    && !['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase())
  ).length;

  const attentionTotal = data.dataProtectionRequests
    + data.systemReports
    + data.openIssues
    + data.closureRequests
    + urgentSupport;

  const attentionItems = [
    {
      label: 'Data protection requests',
      count: data.dataProtectionRequests,
      description: 'Requests requiring review or a formal response.',
      to: '/admin/gdpr',
      icon: ClipboardList,
      critical: true,
    },
    {
      label: 'Urgent support tickets',
      count: urgentSupport,
      description: 'Recent customer-support records marked as urgent.',
      to: '/admin/support',
      icon: MessageSquare,
      critical: true,
    },
    {
      label: 'System reports',
      count: data.systemReports,
      description: 'Reported defects, faults and platform concerns.',
      to: '/admin/system-reports',
      icon: AlertTriangle,
      critical: false,
    },
    {
      label: 'Open platform issues',
      count: data.openIssues,
      description: 'Operational issues still awaiting closure.',
      to: '/admin/status',
      icon: Activity,
      critical: false,
    },
  ];

  const quickActionGroups = useMemo(() => ([
    {
      title: 'Customer operations',
      actions: [
        { to: '/admin/users', label: 'Customer CRM', description: 'Profiles, security verification and subscriptions.', icon: Users },
        { to: '/admin/support', label: 'Support centre', description: 'Review active customer support records.', icon: MessageSquare },
        { to: '/admin/gdpr', label: 'Data requests', description: 'Manage privacy and information-rights requests.', icon: ShieldCheck },
      ],
    },
    {
      title: 'Website and content',
      actions: [
        { to: '/admin/pages', label: 'AI Website Studio', description: 'Edit managed pages, code and public content.', icon: Sparkles },
        { to: '/admin/status', label: 'Gate Control Centre', description: 'Control Launch and Maintenance Gates.', icon: Globe2 },
        { to: '/admin/ai-chatbot', label: 'AI Chatbot', description: 'Knowledge, escalation and contact controls.', icon: Bot },
      ],
    },
    {
      title: 'Platform governance',
      actions: [
        { to: '/admin/health', label: 'Production health', description: 'Database, API and integration diagnostics.', icon: HeartPulse },
        { to: '/admin/audit', label: 'Audit log', description: 'Review administrator actions and changes.', icon: FileText },
        { to: '/admin/site-settings', label: 'System settings', description: 'Brand, status, navigation and features.', icon: Settings },
      ],
    },
  ] satisfies Array<{ title: string; actions: ActionItem[] }>), []);

  const apiHealthLabel = apiHealth === 'online' ? 'Online' : apiHealth === 'offline' ? 'Offline' : 'Checking';
  const apiTone = apiHealth === 'online' ? 'good' : apiHealth === 'offline' ? 'danger' : 'neutral';

  return (
    <>
      <Helmet>
        <title>Admin Dashboard — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <AdminLayout title="Dashboard" subtitle="Sousa Murray Planeia Administration">
        <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-12">
          <section className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white px-5 py-6 text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-950 dark:text-white sm:px-7 sm:py-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_75%_90%,rgba(124,58,237,0.12),transparent_28%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.35),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(34,211,238,0.2),transparent_28%),radial-gradient(circle_at_75%_90%,rgba(124,58,237,0.22),transparent_28%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-blue-100">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin command overview
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                    apiHealth === 'online'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
                      : apiHealth === 'offline'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'
                        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'
                  }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> API {apiHealthLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
                    <Globe2 className="h-3.5 w-3.5" /> Website {websiteStatus}
                  </span>
                </div>

                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting}, {firstName}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                  Review platform performance, customer operations, security workload and public website controls from one place.
                </p>
                <p className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  {lastUpdated
                    ? `Last updated ${formatDateTime(lastUpdated.toISOString())}`
                    : initialLoading
                      ? 'Loading live platform data'
                      : 'Live platform data is currently unavailable'}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                <Link to="/admin/status" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-800 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  <Globe2 className="h-4 w-4" /> Public gates
                </Link>
                <Link to="/admin/audit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-800 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  <FileText className="h-4 w-4" /> Audit log
                </Link>
                <button
                  type="button"
                  onClick={() => void loadDashboard(true)}
                  disabled={refreshing || initialLoading}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh data'}
                </button>
              </div>
            </div>
          </section>

          {loadError && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Dashboard connection warning</p>
                <p className="mt-1 text-xs leading-relaxed">{loadError}</p>
              </div>
            </div>
          )}

          <section aria-labelledby="headline-metrics" className="space-y-3">
            <div>
              <h2 id="headline-metrics" className="text-lg font-bold text-slate-950 dark:text-white">Headline operations</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Live totals across customers, subscriptions and operational workload.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Customer profiles" value={data.customers} note="All registered Sousa Murray Planeia customer records" icon={Users} accent="bg-blue-600" loading={initialLoading} />
              <MetricCard label="Active service plans" value={data.activePlans} note={`${data.plans.toLocaleString('en-GB')} service plans configured`} icon={CreditCard} accent="bg-cyan-500" loading={initialLoading} />
              <MetricCard label="Lifetime members" value={data.lifetimeUsers} note="Customers with lifetime platform access" icon={ShieldCheck} accent="bg-violet-600" loading={initialLoading} />
              <MetricCard label="Items requiring action" value={attentionTotal} note="Privacy, support and system work" icon={AlertTriangle} accent={attentionTotal > 0 ? 'bg-amber-500' : 'bg-emerald-500'} loading={initialLoading} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-7">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">Attention required</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Work that may need an administrator response.</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${attentionTotal > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                  {attentionTotal > 0 ? `${attentionTotal.toLocaleString('en-GB')} open` : 'All clear'}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {attentionItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} to={item.to} className="group flex items-center gap-4 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.count > 0 && item.critical ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : item.count > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{item.count.toLocaleString('en-GB')}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600" />
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-5">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Platform control</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Current operational and integration state.</p>
              <div className="mt-3">
                <ControlRow icon={Globe2} label="Public website mode" value={websiteStatus} note="Saved visitor-facing website state." tone={websiteStatus === 'Live' ? 'good' : websiteStatus === 'Checking' ? 'neutral' : 'warning'} />
                <ControlRow icon={Server} label="Admin API" value={apiHealthLabel} note="Authenticated Cloudflare Admin overview endpoint." tone={apiTone} />
                <ControlRow icon={UserCheck} label="Authorised administrators" value={data.admins.toLocaleString('en-GB')} note="Administrators visible to the operational overview." />
                <ControlRow icon={ShieldCheck} label="Lifetime members" value={data.lifetimeUsers.toLocaleString('en-GB')} note="Customers with lifetime platform access." />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link to="/admin/health" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><HeartPulse className="h-4 w-4" /> Health</Link>
                <Link to="/admin/site-settings" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Settings className="h-4 w-4" /> Settings</Link>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-7">
              <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white">Recent platform activity</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Latest customers and administrator actions from the production overview.</p>
                </div>
                <Link to="/admin/audit" className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300">Full audit log</Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="border-b border-slate-200 p-5 dark:border-slate-800 md:border-b-0 md:border-r">
                  <div className="mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent customers</h3>
                  </div>
                  <div className="space-y-2">
                    {data.latestCustomers.length ? data.latestCustomers.slice(0, 5).map((user, index) => {
                      const name = user.display_name || user.verified_name || user.email || 'Customer';
                      const email = user.email || user.contact_email || '';
                      return (
                        <Link key={email || index} to={`/admin/users/${encodeURIComponent(email)}`} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(user.updated_at)}</p>
                          </div>
                        </Link>
                      );
                    }) : (
                      <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">No recent customer activity was returned.</p>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent administrator activity</h3>
                  </div>
                  <div className="space-y-2">
                    {data.recentAudit.length ? data.recentAudit.slice(0, 5).map((event, index) => (
                      <div key={`${event.entity_id || event.action || 'audit'}-${index}`} className="flex items-start gap-3 rounded-xl p-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{event.summary || normaliseStatus(event.action)}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{event.actor_email || 'Administrator'} · {formatDateTime(event.created_at)}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">No recent administrator activity was returned.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Support and membership</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Current customer-service and access position.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ['Support records', data.supportTickets, 'All support records'],
                  ['Urgent recent', urgentSupport, 'Recent urgent records'],
                  ['Active plans', data.activePlans, 'Enabled service plans'],
                  ['Lifetime access', data.lifetimeUsers, 'Lifetime members'],
                ].map(([label, value, note]) => (
                  <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{Number(value).toLocaleString('en-GB')}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link to="/admin/support" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700"><MessageSquare className="h-4 w-4" /> Support</Link>
                <Link to="/admin/plans" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><CreditCard className="h-4 w-4" /> Plans</Link>
              </div>
            </section>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Administrative workspace</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Frequently used tools grouped by operational purpose.</p>
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              {quickActionGroups.map(group => (
                <section key={group.title} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <LockKeyhole className="h-3.5 w-3.5 text-slate-400" />
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{group.title}</h3>
                  </div>
                  <div className="space-y-3">
                    {group.actions.map(action => <QuickAction key={action.to} action={action} />)}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Admin Centre security</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Microsoft administrator authentication and governed customer-verification controls protect privileged access.</p>
              </div>
            </div>
            <Link to="/admin/security" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Security controls <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}
