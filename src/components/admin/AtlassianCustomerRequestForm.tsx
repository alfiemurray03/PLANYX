import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HeadphonesIcon,
  Loader2,
  Search,
  Send,
  UserRound,
} from 'lucide-react';

interface CustomerUser {
  email: string;
  displayName?: string | null;
  firstName?: string;
  lastName?: string;
  company?: string | null;
  accountStatus?: string | null;
  plan?: string | null;
}

interface CreationResponse {
  success?: boolean;
  savedToCrm?: boolean;
  localReference?: string;
  reference?: string;
  issueKey?: string | null;
  agentUrl?: string | null;
  requestKind?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorHelp?: string | null;
  httpStatus?: number | null;
  authMode?: string | null;
  error?: string;
  dashboard?: unknown;
}

interface Props {
  canEdit: boolean;
  onCreated?: (dashboard: unknown | undefined) => void;
}

function customerName(customer: CustomerUser) {
  return customer.displayName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email;
}

export default function AtlassianCustomerRequestForm({ canEdit, onCreated }: Props) {
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [requestKind, setRequestKind] = useState<'question' | 'problem' | 'suggestion'>('question');
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    text: string;
    help?: string;
    issueKey?: string;
    agentUrl?: string;
    localReference?: string;
    code?: string;
    httpStatus?: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/customers', { credentials: 'include', cache: 'no-store' })
      .then(response => response.json())
      .then((data: { success?: boolean; users?: CustomerUser[] }) => {
        if (!active || !data.success || !Array.isArray(data.users)) return;
        setCustomers(data.users);
        const query = new URLSearchParams(window.location.search).get('customer')?.trim().toLowerCase() || '';
        if (query) {
          const match = data.users.find(customer => customer.email.toLowerCase() === query);
          if (match) {
            setCustomerEmail(match.email);
            setCustomerSearch(`${customerName(match)} — ${match.email}`);
          }
        }
      })
      .catch(() => setFeedback({ type: 'error', title: 'CRM unavailable', text: 'The CRM customer list could not be loaded.' }))
      .finally(() => { if (active) setLoadingCustomers(false); });
    return () => { active = false; };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers.slice(0, 8);
    return customers.filter(customer =>
      customer.email.toLowerCase().includes(query)
      || customerName(customer).toLowerCase().includes(query)
      || String(customer.company || '').toLowerCase().includes(query)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  const selectedCustomer = customers.find(customer => customer.email.toLowerCase() === customerEmail.toLowerCase()) || null;
  const detailsValid = subject.trim().length >= 3 && message.trim().length >= 10;

  function selectCustomer(customer: CustomerUser) {
    setCustomerEmail(customer.email);
    setCustomerSearch(`${customerName(customer)} — ${customer.email}`);
    setFeedback(null);
  }

  async function submit() {
    if (!canEdit) return;
    setFeedback(null);
    if (!selectedCustomer) {
      setFeedback({ type: 'error', title: 'Choose a CRM customer', text: 'Select a customer from the search results before raising the request.' });
      return;
    }
    if (!detailsValid) {
      setFeedback({ type: 'error', title: 'More detail is required', text: 'Enter a subject of at least three characters and at least ten characters of issue detail.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/atlassian-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'create_customer_request',
          customerEmail: selectedCustomer.email,
          subject: subject.trim(),
          message: message.trim(),
          requestKind,
          priority,
        }),
      });
      const data = await response.json().catch(() => ({})) as CreationResponse;
      if (!response.ok || !data.success) {
        const savedText = data.savedToCrm && data.localReference
          ? `The case is safely stored in CRM as ${data.localReference} and can be retried from Queue & history.`
          : 'The request was not created.';
        setFeedback({
          type: 'error',
          title: data.httpStatus === 403 ? 'Atlassian permission refused the request' : 'Atlassian did not create the request',
          text: data.errorMessage || data.error || data.errorCode || savedText,
          help: `${data.errorHelp ? `${data.errorHelp} ` : ''}${savedText}`,
          localReference: data.localReference,
          code: data.errorCode || undefined,
          httpStatus: data.httpStatus || undefined,
        });
        onCreated?.(data.dashboard);
        return;
      }
      setFeedback({
        type: 'success',
        title: `${data.issueKey || data.reference} created successfully`,
        text: `The request was raised for ${selectedCustomer.email} and connected to their CRM support history.`,
        issueKey: data.issueKey || undefined,
        agentUrl: data.agentUrl || undefined,
        localReference: data.localReference,
      });
      setSubject('');
      setMessage('');
      setRequestKind('question');
      setPriority('Normal');
      onCreated?.(data.dashboard);
    } catch (reason) {
      setFeedback({ type: 'error', title: 'Network or system error', text: reason instanceof Error ? reason.message : 'The request could not be raised.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-900/20"><HeadphonesIcon className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">Administrator-assisted support</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">Raise a PXCS request for a customer</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">The selected CRM account is verified again by the backend, the request is saved to the customer record first, and Atlassian receives it on their behalf.</p>
          </div>
        </div>
        {!canEdit && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">View only</span>}
      </div>

      <div className="grid gap-0 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="border-b border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${selectedCustomer ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>{selectedCustomer ? <CheckCircle2 className="h-4 w-4" /> : '1'}</span><div><h3 className="font-bold text-slate-950 dark:text-white">Select the CRM customer</h3><p className="text-xs text-slate-500">Only existing Planyx accounts can be selected.</p></div></div>

          <label htmlFor="atlassian-customer-search" className="mt-5 block text-sm font-semibold text-slate-950 dark:text-white">Customer search</label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              id="atlassian-customer-search"
              value={customerSearch}
              disabled={!canEdit || loadingCustomers}
              onChange={event => { setCustomerSearch(event.target.value); setCustomerEmail(''); setFeedback(null); }}
              placeholder={loadingCustomers ? 'Loading CRM customers…' : 'Name, company or email'}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-500/15"
            />
          </div>

          {!selectedCustomer && customerSearch && <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {filteredCustomers.length ? filteredCustomers.map(customer => (
              <button key={customer.email} type="button" onClick={() => selectCustomer(customer)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><UserRound className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{customerName(customer)}</span><span className="block truncate text-xs text-slate-500">{customer.email}{customer.company ? ` · ${customer.company}` : ''}</span></span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select</span>
              </button>
            )) : <p className="px-4 py-4 text-sm text-slate-500">No matching CRM customer was found.</p>}
          </div>}

          {selectedCustomer ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/25 dark:bg-blue-500/10">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="font-bold text-blue-950 dark:text-blue-100">{customerName(selectedCustomer)}</p><p className="mt-0.5 break-all text-xs text-blue-800 dark:text-blue-200">{selectedCustomer.email}</p>{selectedCustomer.company && <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">{selectedCustomer.company}</p>}</div></div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><a href={`/admin/users/${encodeURIComponent(selectedCustomer.email)}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-300">Open Customer CRM <ExternalLink className="h-3.5 w-3.5" /></a><button type="button" onClick={() => { setCustomerEmail(''); setCustomerSearch(''); setFeedback(null); }} className="text-slate-600 hover:underline dark:text-slate-300">Choose another</button></div>
          </div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">Search and select a customer to continue.</div>}

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900"><strong className="block text-slate-700 dark:text-slate-300">CRM safety</strong>The local support case is created before Atlassian is contacted. A permission or API failure therefore never loses the customer request.</div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${detailsValid ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>{detailsValid ? <CheckCircle2 className="h-4 w-4" /> : '2'}</span><div><h3 className="font-bold text-slate-950 dark:text-white">Describe and classify the request</h3><p className="text-xs text-slate-500">These values are stored in CRM and sent to PXCS.</p></div></div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-950 dark:text-white">Request type
              <select value={requestKind} disabled={!canEdit} onChange={event => setRequestKind(event.target.value as typeof requestKind)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="question">Question</option><option value="problem">Problem</option><option value="suggestion">Suggestion</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-950 dark:text-white">Priority
              <select value={priority} disabled={!canEdit} onChange={event => setPriority(event.target.value as typeof priority)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-950 dark:text-white">Subject
            <input value={subject} disabled={!canEdit} maxLength={255} onChange={event => setSubject(event.target.value)} placeholder="Clear summary of what the customer needs" className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-950 dark:text-white">Full request details
            <textarea value={message} disabled={!canEdit} maxLength={28000} rows={8} onChange={event => setMessage(event.target.value)} placeholder="Explain the problem or question, what has already been checked, the impact on the customer, and the outcome needed." className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal leading-relaxed text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{message.trim().length < 10 ? `${10 - message.trim().length} more character(s) needed` : 'Detail requirement met'}</span><span>{message.length.toLocaleString('en-GB')} / 28,000</span></div>

          <div className="mt-6 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span><div><h3 className="font-bold text-slate-950 dark:text-white">Create and record</h3><p className="text-xs text-slate-500">The CRM case and audit history are written automatically.</p></div></div>
          <button type="button" onClick={() => void submit()} disabled={!canEdit || submitting || !selectedCustomer || !detailsValid} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-900/15 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? 'Saving CRM case and contacting Atlassian…' : 'Raise request for customer'}</button>
        </div>
      </div>

      {feedback && <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`border-t p-5 ${feedback.type === 'error' ? 'border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10'}`}>
        <div className="flex items-start gap-3">{feedback.type === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />}<div className="min-w-0"><p className={`font-bold ${feedback.type === 'error' ? 'text-red-950 dark:text-red-100' : 'text-emerald-950 dark:text-emerald-100'}`}>{feedback.title}</p><p className={`mt-1 text-sm leading-relaxed ${feedback.type === 'error' ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'}`}>{feedback.text}</p>{feedback.help && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs font-medium leading-relaxed text-slate-700 dark:bg-slate-950/40 dark:text-slate-200">{feedback.help}</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">{feedback.code && <span className="font-mono text-red-700 dark:text-red-300">{feedback.code}{feedback.httpStatus ? ` · HTTP ${feedback.httpStatus}` : ''}</span>}{feedback.localReference && <span className="font-mono text-slate-500">CRM {feedback.localReference}</span>}{feedback.agentUrl && feedback.issueKey && <a href={feedback.agentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline dark:text-blue-300">Open {feedback.issueKey} in Atlassian <ExternalLink className="h-3.5 w-3.5" /></a>}</div></div></div>
      </div>}
    </section>
  );
}
