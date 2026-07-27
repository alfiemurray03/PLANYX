/**
 * Admin Support Centre
 * Full ticket management for live Planyx Customer Services requests in Atlassian.
 * Theme-aware, permission-protected and backed by the real PXCS service desk.
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  HeadphonesIcon,
  Inbox,
  Loader2,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

type WorkspaceFilter = 'open' | 'closed' | 'all';

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

interface WorkspaceDetail {
  request: WorkspaceRequest;
  comments: WorkspaceComment[];
  statusHistory: Array<{ status: string; statusDate: string }>;
  authMode: string;
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
  status: WorkspaceFilter;
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

function statusTone(request: WorkspaceRequest) {
  const category = request.statusCategory.toUpperCase();
  if (category === 'COMPLETE' || /resolved|closed|done/i.test(request.status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (/waiting|pending/i.test(request.status)) {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200';
  }
  return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200';
}

function StatusPill({ request }: { request: WorkspaceRequest }) {
  const closed = request.statusCategory.toUpperCase() === 'COMPLETE' || /resolved|closed|done/i.test(request.status);
  const Icon = closed ? CheckCircle2 : Clock3;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(request)}`}>
      <Icon className="h-3.5 w-3.5" />
      {request.status}
    </span>
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
    if (!issueKey) return;
    setSelectedKey(issueKey);
    setLoadingDetail(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/atlassian-workspace?issueKey=${encodeURIComponent(issueKey)}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as WorkspaceDetail & { success?: boolean; error?: string };
      if (!response.ok || payload.success === false || !payload.request) {
        throw new Error(payload.error || `The request ${issueKey} could not be loaded.`);
      }
      setDetail(payload);
      setAuthMode(payload.authMode || '');
    } catch (reason) {
      setDetail(null);
      setError(reason instanceof Error ? reason.message : 'The request could not be loaded.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadRequests = useCallback(async (requestedStart = 0, preserveSelection = true) => {
    setLoadingList(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status: filter,
        start: String(requestedStart),
        limit: '50',
      });
      if (searchTerm) params.set('search', searchTerm);
      const response = await fetch(`/api/admin/atlassian-workspace?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as WorkspaceListResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'The live PXCS request list could not be loaded.');
      }
      setRequests(payload.requests || []);
      setStart(payload.start || 0);
      setNextStart(payload.nextStart ?? null);
      setPreviousStart(payload.previousStart ?? null);
      setAuthMode(payload.authMode || '');

      const selectionStillVisible = preserveSelection && selectedKey
        && (payload.requests || []).some((request) => request.issueKey === selectedKey);
      const nextSelection = selectionStillVisible ? selectedKey : payload.requests?.[0]?.issueKey || '';
      if (nextSelection) {
        await loadDetail(nextSelection);
      } else {
        setSelectedKey('');
        setDetail(null);
      }
    } catch (reason) {
      setRequests([]);
      setDetail(null);
      setSelectedKey('');
      setError(reason instanceof Error ? reason.message : 'The live PXCS request list could not be loaded.');
    } finally {
      setLoadingList(false);
    }
  }, [filter, loadDetail, searchTerm, selectedKey]);

  useEffect(() => {
    void loadRequests(0, false);
  }, [filter, searchTerm]);

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
        body: JSON.stringify({
          action: 'add_comment',
          issueKey: selectedKey,
          body: replyBody.trim(),
          public: publicReply,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'The reply could not be added to PXCS.');
      }
      setReplyBody('');
      setMessage(publicReply ? `Public reply added to ${selectedKey}.` : `Internal note added to ${selectedKey}.`);
      await loadDetail(selectedKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reply could not be added to PXCS.');
    } finally {
      setSendingReply(false);
    }
  }

  const visibleMetrics = useMemo(() => {
    const waiting = requests.filter((request) => /waiting|pending/i.test(request.status)).length;
    const closed = requests.filter((request) => request.statusCategory.toUpperCase() === 'COMPLETE' || /resolved|closed|done/i.test(request.status)).length;
    return { loaded: requests.length, waiting, active: requests.length - closed, closed };
  }, [requests]);

  const additionalFields = detail?.request.fields.filter((field) => !['summary', 'description'].includes(field.id) && field.value) || [];
  const sortedComments = useMemo(
    () => [...(detail?.comments || [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [detail],
  );

  return (
    <AdminLayout title="Customer Service Workspace" subtitle="View and manage live Planyx Customer Services requests">
      <Helmet>
        <title>Customer Service Workspace | Planyx Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/20">
                <HeadphonesIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Planyx Customer Services · PXCS</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Customer Service Workspace</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Work from the live PXCS service desk without leaving the Planyx Admin Centre. Open requests, customer details, status history and conversations are shown here in real time.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/admin/atlassian-support" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Settings2 className="h-4 w-4" />Integration controls
              </a>
              <button type="button" onClick={() => void loadRequests(start)} disabled={loadingList} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />Refresh workspace
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-semibold">Live PXCS workspace</span>
            <span className="text-xs opacity-75">Authenticated through the protected service account{authMode ? ` using ${authMode}` : ''}.</span>
          </div>
        </section>

        {(error || message) && (
          <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'}`}>
            {error || message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Loaded requests', value: visibleMetrics.loaded, hint: 'Requests in the current live page.' },
            { label: 'Active', value: visibleMetrics.active, hint: 'Requests not currently resolved or closed.' },
            { label: 'Waiting', value: visibleMetrics.waiting, hint: 'Requests waiting on support or another action.' },
            { label: 'Closed in view', value: visibleMetrics.closed, hint: 'Resolved or closed requests currently loaded.' },
          ].map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{loadingList ? '—' : metric.value}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{metric.hint}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 lg:grid-cols-[auto_minmax(280px,1fr)]">
            <div className="flex gap-1 overflow-x-auto p-3">
              {(['open', 'closed', 'all'] as WorkspaceFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`h-9 rounded-lg px-3 text-sm font-semibold capitalize ${filter === value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {value} requests
                </button>
              ))}
            </div>
            <form onSubmit={submitSearch} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800 lg:border-l lg:border-t-0">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search PXCS reference, subject or customer"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <button type="submit" className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">Search</button>
              {searchTerm && (
                <button type="button" onClick={() => { setSearchInput(''); setSearchTerm(''); }} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700">Clear</button>
              )}
            </form>
          </div>

          <div className="grid min-h-[650px] xl:grid-cols-[430px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 dark:border-slate-800 xl:border-b-0 xl:border-r">
              {loadingList ? (
                <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : requests.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">No matching PXCS requests</p>
                  <p className="mt-1 text-sm text-slate-500">Change the filter or search term, then refresh.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {requests.map((request) => (
                    <button
                      key={request.issueKey}
                      type="button"
                      onClick={() => void loadDetail(request.issueKey)}
                      className={`w-full p-4 text-left transition sm:p-5 ${selectedKey === request.issueKey ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{request.issueKey}</span>
                        <StatusPill request={request} />
                      </div>
                      <p className="mt-2 line-clamp-2 font-semibold text-slate-950 dark:text-white">{request.summary}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <UserRound className="h-3.5 w-3.5" />
                        <span className="truncate">{request.reporter.displayName}{request.reporter.email ? ` · ${request.reporter.email}` : ''}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Created {dateLabel(request.createdAt)}</p>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-200 p-3 dark:border-slate-800">
                <button type="button" onClick={() => previousStart != null && void loadRequests(previousStart, false)} disabled={previousStart == null || loadingList} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">
                  <ArrowLeft className="h-3.5 w-3.5" />Previous
                </button>
                <span className="text-xs text-slate-500">Starting at {start + 1}</span>
                <button type="button" onClick={() => nextStart != null && void loadRequests(nextStart, false)} disabled={nextStart == null || loadingList} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">
                  Next<ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </aside>

            <main className="min-w-0">
              {loadingDetail ? (
                <div className="flex min-h-[650px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : !detail ? (
                <div className="flex min-h-[650px] flex-col items-center justify-center p-10 text-center">
                  <MessageSquare className="h-11 w-11 text-slate-300" />
                  <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">Select a request</p>
                  <p className="mt-1 max-w-md text-sm text-slate-500">Choose a PXCS request to view its customer, full details, status history and conversation.</p>
                </div>
              ) : (
                <div className="space-y-5 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300">{detail.request.issueKey}</span>
                        <StatusPill request={detail.request} />
                      </div>
                      <h2 className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{detail.request.summary}</h2>
                      <p className="mt-2 text-sm text-slate-500">{detail.request.requestTypeName || `Request type ${detail.request.requestTypeId}`}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.request.reporter.email && (
                        <a href={`/admin/users/${encodeURIComponent(detail.request.reporter.email)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                          <UserRound className="h-3.5 w-3.5" />Open CRM
                        </a>
                      )}
                      {detail.request.agentUrl && (
                        <a href={detail.request.agentUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">
                          Open in Atlassian<ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">{detail.request.reporter.displayName}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{detail.request.reporter.email || 'Email hidden by Atlassian'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Created</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">{dateLabel(detail.request.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">Status updated {dateLabel(detail.request.statusUpdatedAt)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Service desk</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">{detail.request.serviceDeskName || 'Planyx Customer Services'}</p>
                      <p className="mt-1 text-xs text-slate-500">PXCS desk {detail.request.serviceDeskId}</p>
                    </div>
                  </div>

                  <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
                    <h3 className="font-bold text-slate-950 dark:text-white">Request details</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{detail.request.description || 'No description was supplied.'}</p>
                    {additionalFields.length > 0 && (
                      <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">
                        {additionalFields.map((field) => (
                          <div key={field.id} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                            <dt className="font-semibold text-slate-500">{field.label}</dt>
                            <dd className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                      <div>
                        <h3 className="font-bold text-slate-950 dark:text-white">Conversation</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Public replies and internal notes from the live PXCS request.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{sortedComments.length} messages</span>
                    </div>
                    <div className="max-h-[500px] space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
                      {sortedComments.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">No comments have been added yet.</p>
                      ) : sortedComments.map((comment) => (
                        <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-950 dark:text-white">{comment.author.displayName}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${comment.public ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>
                                {comment.public ? <MessageSquare className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
                                {comment.public ? 'Public' : 'Internal'}
                              </span>
                            </div>
                            <time className="text-xs text-slate-400">{dateLabel(comment.createdAt)}</time>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{comment.body}</p>
                        </article>
                      ))}
                    </div>
                    <div className="border-t border-slate-200 p-4 dark:border-slate-700">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPublicReply(true)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${publicReply ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Public reply</button>
                        <button type="button" onClick={() => setPublicReply(false)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!publicReply ? 'bg-amber-500 text-slate-950' : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>Internal note</button>
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        rows={4}
                        maxLength={10_000}
                        placeholder={publicReply ? 'Write a reply the customer can see…' : 'Write an internal note for the customer-service team…'}
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                      />
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          {publicReply ? <MessageSquare className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                          {publicReply ? 'The customer can see this reply.' : 'Only the PXCS team can see this note.'}
                        </p>
                        <button type="button" onClick={() => void sendReply()} disabled={!replyBody.trim() || sendingReply} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${publicReply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}`}>
                          {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {publicReply ? 'Send customer reply' : 'Add internal note'}
                        </button>
                      </div>
                    </div>
                  </section>

                  {detail.statusHistory.length > 0 && (
                    <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
                      <h3 className="font-bold text-slate-950 dark:text-white">Status history</h3>
                      <div className="mt-4 space-y-3">
                        {detail.statusHistory.map((entry, index) => (
                          <div key={`${entry.status}-${entry.statusDate}-${index}`} className="flex gap-3">
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{entry.status}</p>
                              <p className="text-xs text-slate-500">{dateLabel(entry.statusDate)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </main>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            This workspace reads directly from PXCS. Delivery failures and integration diagnostics remain in <a href="/admin/atlassian-support" className="font-bold underline">Atlassian Support controls</a>.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
