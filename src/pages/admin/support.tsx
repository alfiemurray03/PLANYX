import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  HeadphonesIcon,
  Inbox,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  TicketCheck,
  UserRound,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

type WorkspaceFilter = 'open' | 'waiting' | 'closed' | 'all';

interface WorkspaceField {
  id: string;
  label: string;
  value: string;
  renderedText: string;
}

interface WorkspaceReporter {
  accountId: string;
  displayName: string;
  email: string;
}

interface WorkspaceRequest {
  issueId: string;
  issueKey: string;
  summary: string;
  description: string;
  requestTypeId: string;
  requestTypeName: string;
  serviceDeskId: string;
  serviceDeskName: string;
  status: string;
  statusCategory: string;
  statusUpdatedAt: string;
  createdAt: string;
  reporter: WorkspaceReporter;
  fields: WorkspaceField[];
  portalUrl: string;
  agentUrl: string;
}

interface WorkspaceComment {
  id: string;
  body: string;
  public: boolean;
  createdAt: string;
  author: WorkspaceReporter;
}

interface WorkspaceWarning {
  section: string;
  code: string;
  message: string;
  httpStatus: number;
}

interface WorkspaceDetail {
  success?: boolean;
  request: WorkspaceRequest;
  comments: WorkspaceComment[];
  statusHistory: Array<{ status: string; statusDate: string }>;
  warnings?: WorkspaceWarning[];
  authMode: string;
  error?: string;
}

interface WorkspaceListResponse {
  success: boolean;
  requests: WorkspaceRequest[];
  start: number;
  limit: number;
  size: number;
  isLastPage: boolean;
  nextStart: number | null;
  previousStart: number | null;
  status: string;
  searchTerm: string;
  authMode: string;
  error?: string;
}

function dateLabel(value: string) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function isClosed(request: WorkspaceRequest) {
  return request.statusCategory.toUpperCase() === 'COMPLETE' || /resolved|closed|done/i.test(request.status);
}

function isWaiting(request: WorkspaceRequest) {
  return /waiting|pending|customer/i.test(request.status);
}

function statusTone(request: WorkspaceRequest) {
  if (isClosed(request)) return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200';
  if (isWaiting(request)) return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200';
  return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200';
}

function StatusPill({ request }: { request: WorkspaceRequest }) {
  const Icon = isClosed(request) ? CheckCircle2 : Clock3;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(request)}`}>
      <Icon className="h-3.5 w-3.5" />
      {request.status}
    </span>
  );
}

function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: number | string; hint: string; icon: typeof TicketCheck }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Icon className="h-5 w-5" /></span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

export default function AdminSupport() {
  const [filter, setFilter] = useState<WorkspaceFilter>('open');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [requests, setRequests] = useState<WorkspaceRequest[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [start, setStart] = useState(0);
  const [nextStart, setNextStart] = useState<number | null>(null);
  const [previousStart, setPreviousStart] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [publicReply, setPublicReply] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [authMode, setAuthMode] = useState('');

  const loadDetail = useCallback(async (issueKey: string) => {
    const key = issueKey.trim().toUpperCase();
    if (!key) return;
    setSelectedKey(key);
    setLoadingDetail(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/atlassian-workspace?issueKey=${encodeURIComponent(key)}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as WorkspaceDetail;
      if (!response.ok || payload.success === false || !payload.request) {
        throw new Error(payload.error || `The request ${key} could not be opened.`);
      }
      setDetail(payload);
      setAuthMode(payload.authMode || '');
    } catch (reason) {
      setDetail(null);
      setError(reason instanceof Error ? reason.message : 'The request could not be opened.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const openRequest = useCallback((issueKey: string) => {
    const key = issueKey.trim().toUpperCase();
    window.history.pushState({ pxcsRequest: key }, '', `/admin/support?request=${encodeURIComponent(key)}`);
    void loadDetail(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [loadDetail]);

  const closeRequest = useCallback(() => {
    window.history.pushState({}, '', '/admin/support');
    setSelectedKey('');
    setDetail(null);
    setReplyBody('');
    setError('');
    setMessage('');
  }, []);

  const loadRequests = useCallback(async (requestedStart = 0) => {
    setLoadingList(true);
    setError('');
    try {
      const apiStatus = filter === 'waiting' ? 'open' : filter;
      const params = new URLSearchParams({ status: apiStatus, start: String(requestedStart), limit: '50' });
      if (searchTerm) params.set('search', searchTerm);
      const response = await fetch(`/api/admin/atlassian-workspace?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as WorkspaceListResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'The live PXCS request list could not be loaded.');
      const loaded = payload.requests || [];
      setRequests(filter === 'waiting' ? loaded.filter(isWaiting) : loaded);
      setStart(payload.start || 0);
      setNextStart(payload.nextStart ?? null);
      setPreviousStart(payload.previousStart ?? null);
      setAuthMode(payload.authMode || '');
    } catch (reason) {
      setRequests([]);
      setError(reason instanceof Error ? reason.message : 'The live PXCS request list could not be loaded.');
    } finally {
      setLoadingList(false);
    }
  }, [filter, searchTerm]);

  useEffect(() => { void loadRequests(0); }, [loadRequests]);

  useEffect(() => {
    const openFromUrl = () => {
      const key = new URL(window.location.href).searchParams.get('request') || '';
      if (key) void loadDetail(key);
      else {
        setSelectedKey('');
        setDetail(null);
      }
    };
    openFromUrl();
    window.addEventListener('popstate', openFromUrl);
    return () => window.removeEventListener('popstate', openFromUrl);
  }, [loadDetail]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  }

  async function sendReply() {
    if (!selectedKey || !replyBody.trim()) return;
    setSendingReply(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/atlassian-workspace', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'add_comment', issueKey: selectedKey, body: replyBody.trim(), public: publicReply }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'The reply could not be added to PXCS.');
      setReplyBody('');
      setMessage(publicReply ? `Public reply added to ${selectedKey}.` : `Internal note added to ${selectedKey}.`);
      await loadDetail(selectedKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reply could not be added to PXCS.');
    } finally {
      setSendingReply(false);
    }
  }

  const metrics = useMemo(() => {
    const waiting = requests.filter(isWaiting).length;
    const closed = requests.filter(isClosed).length;
    return { loaded: requests.length, active: requests.length - closed, waiting, closed };
  }, [requests]);

  const additionalFields = detail?.request.fields.filter((field) => !['summary', 'description'].includes(field.id) && field.value) || [];
  const sortedComments = useMemo(() => [...(detail?.comments || [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [detail]);

  const alerts = (
    <>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div>}
    </>
  );

  if (selectedKey || loadingDetail) {
    return (
      <AdminLayout title="PXCS Request" subtitle="Customer service case workspace">
        <Helmet><title>{selectedKey || 'PXCS Request'} | Planyx Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <div className="mx-auto w-full max-w-[1600px] space-y-5">
          <button type="button" onClick={closeRequest} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" />Back to request queue
          </button>
          {alerts}
          {loadingDetail ? (
            <div className="flex min-h-[650px] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-9 w-9 animate-spin text-blue-600" /></div>
          ) : detail && (
            <>
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-950 p-6 text-white dark:border-slate-800 sm:p-8">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-sm font-bold">{detail.request.issueKey}</span>
                        <StatusPill request={detail.request} />
                        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold">{detail.request.requestTypeName || 'Customer request'}</span>
                      </div>
                      <h1 className="mt-4 max-w-5xl text-2xl font-bold leading-tight sm:text-3xl">{detail.request.summary}</h1>
                      <p className="mt-3 text-sm text-blue-100">Created {dateLabel(detail.request.createdAt)} · Updated {dateLabel(detail.request.statusUpdatedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void loadDetail(detail.request.issueKey)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold hover:bg-white/20"><RefreshCw className="h-4 w-4" />Refresh request</button>
                      {detail.request.agentUrl && <a href={detail.request.agentUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-blue-50">Open in Atlassian<ExternalLink className="h-4 w-4" /></a>}
                    </div>
                  </div>
                </div>
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <main className="space-y-5 p-5 sm:p-6 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
                    {(detail.warnings || []).map((warning) => (
                      <div key={warning.section} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Part of this request could not be loaded</p><p className="mt-1 text-xs leading-relaxed">{warning.message}</p></div>
                      </div>
                    ))}
                    <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white">Request details</h2>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{detail.request.description || 'No description was supplied.'}</p>
                      {additionalFields.length > 0 && <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">{additionalFields.map((field) => <div key={field.id} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><dt className="font-semibold text-slate-500">{field.label}</dt><dd className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{field.value}</dd></div>)}</dl>}
                    </section>
                    <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Conversation</h2><p className="mt-1 text-xs text-slate-500">Public customer replies and private PXCS team notes.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{sortedComments.length}</span></div>
                      <div className="max-h-[560px] space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
                        {sortedComments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><MessageSquare className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">No conversation yet</p><p className="mt-1 text-xs text-slate-500">Send the first customer reply or add an internal note below.</p></div> : sortedComments.map((comment) => <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-semibold text-slate-950 dark:text-white">{comment.author.displayName}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${comment.public ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>{comment.public ? <MessageSquare className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}{comment.public ? 'Public' : 'Internal'}</span></div><time className="text-xs text-slate-400">{dateLabel(comment.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{comment.body}</p></article>)}
                      </div>
                      <div className="border-t border-slate-200 p-5 dark:border-slate-700">
                        <div className="mb-3 flex gap-2"><button type="button" onClick={() => setPublicReply(true)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${publicReply ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Public reply</button><button type="button" onClick={() => setPublicReply(false)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!publicReply ? 'bg-amber-500 text-slate-950' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Internal note</button></div>
                        <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={5} maxLength={10_000} placeholder={publicReply ? 'Write a reply the customer can see…' : 'Write a private note for the PXCS team…'} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5 text-xs text-slate-500">{publicReply ? <Mail className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}{publicReply ? 'Visible to the customer.' : 'Visible only to the PXCS team.'}</p><button type="button" onClick={() => void sendReply()} disabled={!replyBody.trim() || sendingReply} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${publicReply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}`}>{sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{publicReply ? 'Send customer reply' : 'Add internal note'}</button></div>
                      </div>
                    </section>
                  </main>
                  <aside className="space-y-5 bg-slate-50 p-5 dark:bg-slate-950 sm:p-6">
                    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><UserRound className="h-5 w-5" /></div><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Customer</p><p className="mt-2 font-bold text-slate-950 dark:text-white">{detail.request.reporter.displayName}</p><p className="mt-1 break-all text-xs text-slate-500">{detail.request.reporter.email || 'Email hidden by Atlassian'}</p>{detail.request.reporter.email && <a href={`/admin/users/${encodeURIComponent(detail.request.reporter.email)}`} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><UserRound className="h-3.5 w-3.5" />Open customer CRM</a>}</section>
                    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold text-slate-950 dark:text-white">Case information</h2><dl className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800"><div className="py-3"><dt className="text-xs text-slate-500">Reference</dt><dd className="mt-1 font-mono font-bold">{detail.request.issueKey}</dd></div><div className="py-3"><dt className="text-xs text-slate-500">Request type</dt><dd className="mt-1 font-semibold">{detail.request.requestTypeName || detail.request.requestTypeId}</dd></div><div className="py-3"><dt className="text-xs text-slate-500">Service desk</dt><dd className="mt-1 font-semibold">{detail.request.serviceDeskName || 'Planyx Customer Services'}</dd></div><div className="py-3"><dt className="text-xs text-slate-500">Authentication</dt><dd className="mt-1 capitalize font-semibold">{detail.authMode || authMode || 'automatic'}</dd></div></dl></section>
                    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold text-slate-950 dark:text-white">Status history</h2>{detail.statusHistory.length === 0 ? <p className="mt-3 text-sm text-slate-500">No additional status history was returned.</p> : <div className="mt-4 space-y-4">{detail.statusHistory.map((entry, index) => <div key={`${entry.status}-${entry.statusDate}-${index}`} className="flex gap-3"><div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600" />{index < detail.statusHistory.length - 1 && <span className="mt-1 h-full w-px bg-slate-200 dark:bg-slate-700" />}</div><div className="pb-2"><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{entry.status}</p><p className="mt-0.5 text-xs text-slate-500">{dateLabel(entry.statusDate)}</p></div></div>)}</div>}</section>
                  </aside>
                </div>
              </section>
            </>
          )}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Customer Service Workspace" subtitle="Live Planyx Customer Services request management">
      <Helmet><title>Customer Service Workspace | Planyx Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-950 p-6 text-white dark:border-slate-800 sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4"><span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40"><HeadphonesIcon className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Planyx Customer Services · PXCS</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Customer Service Workspace</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">A live operational workspace for reviewing customer requests, opening full cases, replying to customers and recording private team notes.</p></div></div>
              <div className="flex flex-wrap gap-2"><a href="/admin/atlassian-support" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold hover:bg-white/20"><Settings2 className="h-4 w-4" />Integration controls</a><a href="/admin/atlassian-support" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-blue-50"><Plus className="h-4 w-4" />Raise request</a></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-emerald-50 px-6 py-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><ShieldCheck className="h-4 w-4" /><span className="font-semibold">Live PXCS connection</span><span className="text-xs opacity-75">Protected service-account access{authMode ? ` · ${authMode}` : ''}</span></div>
        </section>
        {alerts}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Requests loaded" value={loadingList ? '—' : metrics.loaded} hint="Live cases on the current page." icon={TicketCheck} /><MetricCard label="Active" value={loadingList ? '—' : metrics.active} hint="Requests still requiring work." icon={LayoutDashboard} /><MetricCard label="Waiting" value={loadingList ? '—' : metrics.waiting} hint="Cases waiting on a response or action." icon={Clock3} /><MetricCard label="Closed" value={loadingList ? '—' : metrics.closed} hint="Resolved cases in the current view." icon={CheckCircle2} /></section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">Request queue</h2><p className="mt-1 text-sm text-slate-500">Select any row or use the Open request button to enter the full case workspace.</p></div><button type="button" onClick={() => void loadRequests(start)} disabled={loadingList} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />Refresh queue</button></div>
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 xl:grid-cols-[auto_minmax(280px,1fr)]"><div className="flex gap-1 overflow-x-auto">{(['open', 'waiting', 'closed', 'all'] as WorkspaceFilter[]).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`h-10 shrink-0 rounded-lg px-3.5 text-sm font-semibold capitalize ${filter === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'}`}><Filter className="mr-1.5 inline h-3.5 w-3.5" />{value}</button>)}</div><form onSubmit={submitSearch} className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search reference, subject or customer" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900" /></div><button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">Search</button>{searchTerm && <button type="button" onClick={() => { setSearchInput(''); setSearchTerm(''); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700">Clear</button>}</form></div>
          {loadingList ? <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div> : requests.length === 0 ? <div className="p-16 text-center"><Inbox className="mx-auto h-11 w-11 text-slate-300" /><p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">No matching PXCS requests</p><p className="mt-1 text-sm text-slate-500">Change the filter or search, then refresh the live queue.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-950"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-5 py-3 font-semibold">Request</th><th className="px-5 py-3 font-semibold">Customer</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Created</th><th className="px-5 py-3 text-right font-semibold">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{requests.map((request) => <tr key={request.issueKey} onClick={() => openRequest(request.issueKey)} className="cursor-pointer transition hover:bg-blue-50/60 dark:hover:bg-blue-500/5"><td className="px-5 py-4 align-top"><span className="font-mono font-bold text-blue-700 dark:text-blue-300">{request.issueKey}</span></td><td className="max-w-md px-5 py-4 align-top"><p className="font-semibold text-slate-950 dark:text-white">{request.summary}</p><p className="mt-1 text-xs text-slate-500">{request.requestTypeName || 'Customer request'}</p></td><td className="px-5 py-4 align-top"><p className="font-medium text-slate-800 dark:text-slate-200">{request.reporter.displayName}</p><p className="mt-1 max-w-[240px] truncate text-xs text-slate-500">{request.reporter.email || 'Email hidden'}</p></td><td className="px-5 py-4 align-top"><StatusPill request={request} /></td><td className="px-5 py-4 align-top text-xs text-slate-500">{dateLabel(request.createdAt)}</td><td className="px-5 py-4 text-right align-top"><button type="button" onClick={(event) => { event.stopPropagation(); openRequest(request.issueKey); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Open request<ChevronRight className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div>}
          <div className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => previousStart != null && void loadRequests(previousStart)} disabled={previousStart == null || loadingList} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"><ArrowLeft className="h-3.5 w-3.5" />Previous</button><span className="text-xs text-slate-500">Starting at {start + 1}</span><button type="button" onClick={() => nextStart != null && void loadRequests(nextStart)} disabled={nextStart == null || loadingList} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">Next<ArrowRight className="h-3.5 w-3.5" /></button></div>
        </section>
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>This workspace reads directly from PXCS. Delivery failures and API diagnostics remain in <a href="/admin/atlassian-support" className="font-bold underline">Atlassian Support controls</a>.</p></div>
      </div>
    </AdminLayout>
  );
}
