import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Clock3,
  Copy,
  DatabaseZap,
  FileSearch,
  Fingerprint,
  Globe2,
  History,
  Laptop,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  Users,
} from 'lucide-react';

type SessionStatus = 'Active now' | 'Recent' | 'Signed out' | 'Expired' | 'Idle expired' | 'Historical' | string;

interface AuthorityReportLink {
  id: string;
  reference: string;
  report_type: string;
  urgency: string;
  status: string;
}

interface SessionRecord {
  session_id: string;
  reference: string;
  realm: 'admin' | 'customer';
  status: SessionStatus;
  created_at?: string | null;
  last_seen_at?: string | null;
  idle_expires_at?: string | null;
  absolute_expires_at?: string | null;
  revoked_at?: string | null;
  auth_method: string;
  fingerprint: string;
  user_agent: string;
  ip_address: string;
  network_fingerprint: string;
  country_code: string;
  cf_colo: string;
  request_id: string;
  subject: string;
  tenant_id: string;
  microsoft_object_id: string;
  legal_hold: boolean;
  legal_hold_reason: string;
  retained_until?: string | null;
  linked_user: {
    type: string;
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    match_basis: string;
    profile_url: string;
  };
  risk_flags: string[];
  event_count: number;
  linked_reports: AuthorityReportLink[];
  is_current: boolean;
}

interface SessionEvent {
  id: string;
  session_id: string;
  session_reference: string;
  event_type: string;
  result: string;
  realm: string;
  email: string;
  actor_email: string;
  ip_address: string;
  network_fingerprint: string;
  user_agent: string;
  request_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface SessionPayload {
  summary: {
    total_sessions: number;
    active_now: number;
    signed_in_today: number;
    administrators: number;
    customers: number;
    unique_users: number;
    sessions_needing_review: number;
    evidence_holds: number;
    authority_reports: number;
  };
  sessions: SessionRecord[];
  events: SessionEvent[];
  reports: AuthorityReportLink[];
  retention: {
    standard_days: number;
    legal_hold: string;
    token_notice: string;
  };
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB');
}

function relativeTime(value?: string | null): string {
  if (!value) return 'No activity recorded';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(value => value[0]?.toUpperCase()).join('') || '?';
}

function deviceSummary(userAgent: string): { device: string; browser: string; Icon: typeof Laptop } {
  const ua = userAgent.toLowerCase();
  const device = ua.includes('iphone') ? 'iPhone'
    : ua.includes('ipad') ? 'iPad'
      : ua.includes('android') ? 'Android device'
        : ua.includes('macintosh') || ua.includes('mac os') ? 'Mac'
          : ua.includes('windows') ? 'Windows computer'
            : ua.includes('linux') ? 'Linux computer'
              : 'Unknown device';
  const browser = ua.includes('edg/') ? 'Microsoft Edge'
    : ua.includes('firefox/') ? 'Firefox'
      : ua.includes('chrome/') ? 'Google Chrome'
        : ua.includes('safari/') ? 'Safari'
          : 'Unknown browser';
  const Icon = ua.includes('iphone') || ua.includes('android') ? Smartphone : Laptop;
  return { device, browser, Icon };
}

function statusStyle(status: SessionStatus): string {
  if (status === 'Active now') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  if (status === 'Recent') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
  if (status === 'Signed out') return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
}

function SummaryCard({ label, value, detail, Icon }: { label: string; value: number; detail: string; Icon: typeof Activity }) {
  return (
    <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div>
        <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}

export default function AdminSessionsPage() {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [realm, setRealm] = useState<'all' | 'admin' | 'customer'>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'review' | 'hold'>('all');
  const [selectedId, setSelectedId] = useState('');

  async function load(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/session-centre', { credentials: 'include', cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: SessionPayload; error?: string };
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Session records could not be loaded.');
      setData(result.data);
      setSelectedId(current => result.data!.sessions.some(item => item.session_id === current) ? current : result.data!.sessions[0]?.session_id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Session records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.sessions || []).filter(session => {
      if (realm !== 'all' && session.realm !== realm) return false;
      if (status === 'active' && session.status !== 'Active now') return false;
      if (status === 'review' && session.risk_flags.length === 0) return false;
      if (status === 'hold' && !session.legal_hold) return false;
      if (!query) return true;
      return [session.reference, session.linked_user.name, session.linked_user.email, session.linked_user.role, session.ip_address, session.country_code, session.user_agent]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [data?.sessions, realm, search, status]);

  const selected = data?.sessions.find(session => session.session_id === selectedId) || null;
  const selectedEvents = useMemo(() => (data?.events || []).filter(event => event.session_id === selectedId), [data?.events, selectedId]);

  async function sessionAction(action: 'mark_reviewed' | 'set_legal_hold', session: SessionRecord, enabled?: boolean): Promise<void> {
    let reason = '';
    if (action === 'set_legal_hold' && enabled) {
      reason = window.prompt('Enter the investigation, safeguarding or legal reason for preserving this session:')?.trim() || '';
      if (!reason) return;
    }
    if (action === 'set_legal_hold' && !enabled && !window.confirm(`Remove the evidence hold from ${session.reference}?`)) return;
    setSaving(session.session_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/session-centre', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, session_id: session.session_id, enabled, reason }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: SessionPayload; error?: string };
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'The session record could not be updated.');
      setData(result.data);
      setSuccess(action === 'mark_reviewed' ? `${session.reference} was marked as reviewed.` : `Evidence hold ${enabled ? 'applied' : 'removed'} for ${session.reference}.`);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The session record could not be updated.');
    } finally {
      setSaving('');
    }
  }

  function reportingLink(session: SessionRecord): string {
    const params = new URLSearchParams({
      session_id: session.session_id,
      session_reference: session.reference,
      user_email: session.linked_user.email,
      user_name: session.linked_user.name,
      user_type: session.linked_user.type,
    });
    return `/admin/authority-reporting?${params.toString()}`;
  }

  return (
    <>
      <Helmet><title>Session & Sign-in Centre - Planyx Admin Centre</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <AdminLayout title="Session & Sign-in Centre">
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-20">
          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-white via-blue-50/70 to-violet-50/60 shadow-lg dark:border-blue-500/30 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/50">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"><MonitorSmartphone className="h-6 w-6" /></div>
                <div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-200">Security evidence and access history</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Understand who signed in, when and from where</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Every verified staff or customer session is linked to the correct account where possible. Secret cookies are never displayed. Records use a safe session reference and a masked one-way fingerprint.</p></div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline"><Link to="/admin/authority-reporting"><FileSearch className="mr-2 h-4 w-4" />Authority reporting</Link></Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
            </div>
          </section>

          {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

          {loading || !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Active now" value={data.summary.active_now} detail="Seen during the last 15 minutes" Icon={Activity} />
                <SummaryCard label="Signed in today" value={data.summary.signed_in_today} detail={`${data.summary.unique_users} unique linked users`} Icon={UserRoundCheck} />
                <SummaryCard label="Needs review" value={data.summary.sessions_needing_review} detail="Missing links, multiple sessions or security flags" Icon={ShieldAlert} />
                <SummaryCard label="Evidence holds" value={data.summary.evidence_holds} detail={`${data.summary.authority_reports} authority reports stored`} Icon={LockKeyhole} />
              </div>

              <Alert className="border-blue-200 bg-blue-50/70 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100"><ShieldCheck className="h-4 w-4" /><AlertDescription><strong>Investigation standard:</strong> Record facts, not assumptions. Do not alter a customer account or device evidence merely because a session looks unfamiliar. Link the session to an Authority Report where police, safeguarding, regulatory or legal escalation may be required.</AlertDescription></Alert>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a person, email, session reference, IP address or device" className="pl-9" /></label>
                  <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">{(['all','admin','customer'] as const).map(value => <button key={value} type="button" onClick={() => setRealm(value)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${realm === value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{value === 'all' ? 'All users' : value === 'admin' ? 'Staff' : 'Customers'}</button>)}</div>
                  <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">{(['all','active','review','hold'] as const).map(value => <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${status === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{value === 'all' ? 'All status' : value}</button>)}</div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,.7fr)]">
                <section className="space-y-3" aria-label="Session records">
                  <div className="flex items-center justify-between"><h2 className="font-black text-slate-950 dark:text-white">Session records</h2><span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{filtered.length} shown · {data.summary.total_sessions} stored</span></div>
                  {!filtered.length ? <Card><CardContent className="py-14 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-semibold">No sessions match these filters</p></CardContent></Card> : filtered.map(session => {
                    const device = deviceSummary(session.user_agent);
                    const expanded = selectedId === session.session_id;
                    return (
                      <article key={session.session_id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${expanded ? 'border-blue-500 ring-2 ring-blue-500/15 dark:border-blue-400' : 'border-slate-200 dark:border-slate-700'}`}>
                        <button type="button" className="flex w-full items-start gap-4 p-5 text-left" onClick={() => setSelectedId(expanded ? '' : session.session_id)}>
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${session.realm === 'admin' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'}`}>{initials(session.linked_user.name)}</div>
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black text-slate-950 dark:text-white">{session.linked_user.name}</h3>{session.is_current && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">This session</span>}</div><p className="truncate text-sm text-slate-500 dark:text-slate-400">{session.linked_user.email}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusStyle(session.status)}`}>{session.status}</span></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1.5"><device.Icon className="h-3.5 w-3.5" />{device.device} · {device.browser}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{relativeTime(session.last_seen_at)}</span><span className="inline-flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" />{session.reference}</span></div>{session.risk_flags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{session.risk_flags.map(flag => <span key={flag} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{flag}</span>)}</div>}</div>
                          {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
                        </button>
                        {expanded && <div className="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-950/40"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
                          ['Account link', `${session.linked_user.type} · ${session.linked_user.match_basis}`, CircleUserRound],
                          ['Role / access', `${session.linked_user.role} · ${session.linked_user.status}`, BadgeCheck],
                          ['Signed in', formatDate(session.created_at), CalendarClock],
                          ['Last activity', formatDate(session.last_seen_at), Activity],
                          ['IP address', session.ip_address || `Hash ${session.network_fingerprint}`, Globe2],
                          ['Session fingerprint', session.fingerprint, Fingerprint],
                        ].map(([label, value, IconValue]) => { const Icon = IconValue as typeof Activity; return <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5" />{String(label)}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-white">{String(value)}</p></div>; })}</div><div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm"><Link to={session.linked_user.profile_url}><Users className="mr-2 h-4 w-4" />Open linked user</Link></Button><Button asChild size="sm" variant="outline"><Link to={reportingLink(session)}><FileSearch className="mr-2 h-4 w-4" />Create authority report</Link></Button><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(session.reference)}><Copy className="mr-2 h-4 w-4" />Copy reference</Button><Button size="sm" variant="outline" disabled={saving === session.session_id} onClick={() => void sessionAction('mark_reviewed', session)}>{saving === session.session_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Mark reviewed</Button><Button size="sm" variant="outline" className={session.legal_hold ? 'border-amber-300 text-amber-800 dark:text-amber-200' : ''} disabled={saving === session.session_id} onClick={() => void sessionAction('set_legal_hold', session, !session.legal_hold)}><LockKeyhole className="mr-2 h-4 w-4" />{session.legal_hold ? 'Remove evidence hold' : 'Apply evidence hold'}</Button></div>{session.linked_reports.length > 0 && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"><p className="font-bold">Linked authority reports</p><div className="mt-2 flex flex-wrap gap-2">{session.linked_reports.map(report => <Link key={report.id} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-200" to={`/admin/authority-reporting?report=${encodeURIComponent(report.id)}`}>{report.reference} · {report.status}</Link>)}</div></div>}</div>}
                      </article>
                    );
                  })}
                </section>

                <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                  <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="p-5"><div className="flex items-center gap-2"><History className="h-5 w-5 text-blue-600 dark:text-blue-300" /><h2 className="font-black text-slate-950 dark:text-white">Session chronology</h2></div>{!selected ? <p className="mt-4 text-sm text-slate-500">Select a session to see its audit events.</p> : !selectedEvents.length ? <p className="mt-4 text-sm text-slate-500">No separate events have been recorded for this historical session.</p> : <ol className="mt-4 space-y-4">{selectedEvents.slice(0, 20).map(event => <li key={event.id} className="relative border-l-2 border-blue-200 pl-4 dark:border-blue-500/30"><span className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${event.result === 'Success' ? 'bg-blue-500' : 'bg-red-500'}`} /><p className="text-sm font-bold text-slate-900 dark:text-white">{event.event_type}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}{event.actor_email ? ` · ${event.actor_email}` : ''}</p><p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">{event.ip_address ? `IP ${event.ip_address}` : event.network_fingerprint ? `Network ${event.network_fingerprint}` : 'Network not recorded'}{event.request_id ? ` · Request ${event.request_id}` : ''}</p></li>)}</ol>}</CardContent></Card>
                  <Card className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><CardContent className="p-5"><div className="flex items-center gap-2"><DatabaseZap className="h-5 w-5 text-violet-600 dark:text-violet-300" /><h2 className="font-black text-slate-950 dark:text-white">Evidence handling</h2></div><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300"><li>• Standard retention marker: {data.retention.standard_days} days.</li><li>• Authority reports can preserve linked sessions beyond the normal marker.</li><li>• Full session cookies and access tokens are never shown here.</li><li>• Export or disclose records only through an authorised legal, police, safeguarding or data-protection process.</li></ul></CardContent></Card>
                </aside>
              </div>
            </>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
