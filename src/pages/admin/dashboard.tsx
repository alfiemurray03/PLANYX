/**
 * Planyx Admin Centre command dashboard with live operational data.
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
  CircleDollarSign,
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
  Wrench,
} from 'lucide-react';

interface RecentDocument {
  uuid?: string;
  title?: string;
  templateId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RecentUser {
  id?: string;
  email?: string;
  displayName?: string;
  createdAt?: string;
}

interface PlatformStats {
  totalUsers: number;
  totalDocuments: number;
  paidUsers: number;
  recentDocuments: RecentDocument[];
  recentUsers: RecentUser[];
  planBreakdown: Array<{ plan: string; count: number }>;
  usageBreakdown: Array<{ usageType: string; count: number }>;
}

interface TicketStats {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  urgent: number;
  total: number;
}

interface OperationalOverview {
  customers: number;
  lifetimeUsers: number;
  activePlans: number;
  supportTickets: number;
  dataProtectionRequests: number;
  systemReports: number;
  openIssues: number;
  admins: number;
  launchGatewayStatus: string;
  maintenanceStatus: string;
}

type ApiHealth = 'checking' | 'online' | 'degraded' | 'offline';

type ActionItem = {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Dashboard request failed (${response.status}).`);
  return payload as T;
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
  return String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
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
        <div className="space-y-3 pt-2">
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
        <Icon className="h-4.5 w-4.5" />
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
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [ticketStats, setTicketStats] = useState<TicketStats>({ open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0, total: 0 });
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

    const [statsResult, ticketsResult, overviewResult] = await Promise.allSettled([
      fetchJson<{ success: boolean; stats?: PlatformStats }>('/api/admin/stats'),
      fetchJson<{ success: boolean; stats?: TicketStats }>('/api/admin/support/tickets'),
      fetchJson<{ success?: boolean; data?: OperationalOverview }>('/api/admin/section/overview'),
    ]);

    let successfulRequests = 0;

    if (statsResult.status === 'fulfilled' && statsResult.value.success && statsResult.value.stats) {
      setStats(statsResult.value.stats);
      successfulRequests += 1;
    }
    if (ticketsResult.status === 'fulfilled' && ticketsResult.value.success && ticketsResult.value.stats) {
      setTicketStats(ticketsResult.value.stats);
      successfulRequests += 1;
    }
    if (overviewResult.status === 'fulfilled' && overviewResult.value.success && overviewResult.value.data) {
      setOverview(overviewResult.value.data);
      successfulRequests += 1;
    }

    setApiHealth(successfulRequests === 3 ? 'online' : successfulRequests > 0 ? 'degraded' : 'offline');
    if (successfulRequests > 0) setLastUpdated(new Date());
    if (successfulRequests === 0) setLoadError('Live dashboard information could not be loaded. Existing values may be out of date.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard(false);
    const interval = window.setInterval(() => void loadDashboard(true), 60_000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (admin?.name || 'Administrator').split(' ')[0];
  const websiteStatus = overview?.maintenanceStatus === 'On'
    ? 'Maintenance'
    : overview?.launchGatewayStatus === 'On' ? 'Coming Soon' : 'Live';

  const openSupport = ticketStats.open + ticketStats.in_progress;
  const attentionTotal = (overview?.dataProtectionRequests || 0)
    + (overview?.systemReports || 0)
    + (overview?.openIssues || 0)
    + ticketStats.urgent;

  const recentUsers = Array.isArray(stats?.recentUsers) ? stats.recentUsers.slice(0, 5) : [];
  const recentDocuments = Array.isArray(stats?.recentDocuments) ? stats.recentDocuments.slice(0, 5) : [];

  const attentionItems = [
    {
      label: 'Data protection requests',
      count: overview?.dataProtectionRequests || 0,
      description: 'Requests requiring review or a formal response.',
      to: '/admin/gdpr',
      icon: ClipboardList,
      critical: true,
    },
    {
      label: 'Urgent support tickets',
      count: ticketStats.urgent,
      description: 'Customer support records marked as urgent.',
      to: '/admin/support',
      icon: MessageSquare,
      critical: true,
    },
    {
      label: 'System reports',
      count: overview?.systemReports || 0,
      description: 'Reported defects, faults and platform concerns.',
      to: '/admin/system-reports',
      icon: AlertTriangle,
      critical: false,
    },
    {
      label: 'Open platform issues',
      count: overview?.openIssues || 0,
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
        { to: '/admin/gates', label: 'Gate Control Centre', description: 'Control Launch and Maintenance Gates.', icon: Globe2 },
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

  const apiHealthLabel = apiHealth === 'online' ? 'Online' : apiHealth === 'degraded' ? 'Degraded' : apiHealth === 'offline' ? 'Offline' : 'Checking';
  const apiTone = apiHealth === 'online' ? 'good' : apiHealth === 'degraded' ? 'warning' : apiHealth === 'offline' ? 'danger' : 'neutral';

  return (
    <>
      <Helmet>
        <title>Admin Dashboard — Planyx</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Dashboard" subtitle="Planyx Administration">
        <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-12">
          <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-7 sm:py-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.35),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(34,211,238,0.2),transparent_28%),radial-gradient(circle_at_75%_90%,rgba(124,58,237,0.22),transparent_28%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-100">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin command overview
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${apiHealth === 'online' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : apiHealth === 'degraded' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-red-400/30 bg-red-400/10 text-red-200'}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> API {apiHealthLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-200">
                    <Globe2 className="h-3.5 w-3.5" /> Website {websiteStatus}
                  </span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting}, {firstName}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                  Review platform performance, customer operations, security workload and public website controls from one place.
                </p>
                <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  {lastUpdated ? `Last updated ${formatDateTime(lastUpdated.toISOString())}` : 'Waiting for live platform data'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                <Link to="/admin/gates" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15">
                  <Globe2 className="h-4 w-4" /> Public gates
                </Link>
                <Link to="/admin/audit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15">
                  <FileText className="h-4 w-4" /> Audit log
                </Link>
                <button
                  type="button"
                  onClick={() => void loadDashboard(true)}
                  disabled={refreshing || loading}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="headline-metrics" className="text-lg font-bold text-slate-950 dark:text-white">Headline operations</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Live totals across customers, planning and operational workload.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Customer profiles" value={overview?.customers ?? stats?.totalUsers ?? 0} note="All registered Planyx customer records" icon={Users} accent="bg-blue-600" loading={loading} />
              <MetricCard label="Plans and outputs" value={stats?.totalDocuments ?? 0} note="Saved builder outputs across the platform" icon={FileText} accent="bg-cyan-500" loading={loading} />
              <MetricCard label="Configured plans" value={overview?.activePlans ?? 0} note="Subscription plans currently configured" icon={CreditCard} accent="bg-violet-600" loading={loading} />
              <MetricCard label="Items requiring action" value={attentionTotal} note="Privacy, urgent support and system work" icon={AlertTriangle} accent={attentionTotal > 0 ? 'bg-amber-500' : 'bg-emerald-500'} loading={loading} />
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
                <ControlRow icon={Globe2} label="Public website mode" value={websiteStatus} note="Saved visitor-facing website state." tone={websiteStatus === 'Live' ? 'good' : 'warning'} />
                <ControlRow icon={Server} label="Admin API" value={apiHealthLabel} note="Connectivity across dashboard data services." tone={apiTone} />
                <ControlRow icon={UserCheck} label="Authorised administrators" value={(overview?.admins ?? 0).toLocaleString('en-GB')} note="Administrators visible to the operational overview." />
                <ControlRow icon={ShieldCheck} label="Lifetime members" value={(overview?.lifetimeUsers ?? 0).toLocaleString('en-GB')} note="Customers with lifetime platform access." />
                <ControlRow icon={CircleDollarSign} label="Revenue integration" value="Not connected" note="No revenue reporting API is connected to this dashboard." tone="neutral" />
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
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Latest customers and builder outputs reported by Planyx.</p>
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
                    {recentUsers.length ? recentUsers.map((user, index) => (
                      <Link key={user.id || user.email || index} to={`/admin/users/${encodeURIComponent(user.email || user.id || '')}`} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {(user.displayName || user.email || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.displayName || user.email || 'Customer'}</p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(user.createdAt)}</p>
                        </div>
                      </Link>
                    )) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">No recent customer activity was returned.</p>}
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent builder outputs</h3>
                  </div>
                  <div className="space-y-2">
                    {recentDocuments.length ? recentDocuments.map((document, index) => (
                      <div key={document.uuid || index} className="flex items-center gap-3 rounded-xl p-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{document.title || 'Untitled plan'}</p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{normaliseStatus(document.status)} · {formatDateTime(document.updatedAt || document.createdAt)}</p>
                        </div>
                      </div>
                    )) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">No recent builder activity was returned.</p>}
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
                  ['Open support', openSupport, 'Open or in progress'],
                  ['Urgent tickets', ticketStats.urgent, 'Priority support work'],
                  ['Resolved tickets', ticketStats.resolved, 'Successfully resolved'],
                  ['Lifetime access', overview?.lifetimeUsers ?? 0, 'Lifetime members'],
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
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Your Microsoft administrator session and personal security PIN protect privileged access.</p>
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
