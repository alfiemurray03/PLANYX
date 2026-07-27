import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, HeadphonesIcon, Loader2, Search, Send, UserRound } from 'lucide-react';

interface CustomerUser {
  email: string;
  displayName?: string | null;
  firstName?: string;
  lastName?: string;
  company?: string | null;
  accountStatus?: string | null;
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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string; issueKey?: string; agentUrl?: string; localReference?: string } | null>(null);

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
      .catch(() => setFeedback({ type: 'error', text: 'The CRM customer list could not be loaded.' }))
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

  function selectCustomer(customer: CustomerUser) {
    setCustomerEmail(customer.email);
    setCustomerSearch(`${customerName(customer)} — ${customer.email}`);
    setFeedback(null);
  }

  async function submit() {
    if (!canEdit) return;
    setFeedback(null);
    if (!selectedCustomer) {
      setFeedback({ type: 'error', text: 'Select a customer from the CRM results first.' });
      return;
    }
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setFeedback({ type: 'error', text: 'Enter a subject and at least ten characters of detail.' });
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
          ? ` The CRM case was still saved as ${data.localReference} and can be retried.`
          : '';
        throw new Error(`${data.error || data.errorCode || 'The Atlassian issue could not be raised.'}${savedText}`);
      }
      setFeedback({
        type: 'success',
        text: `Issue ${data.issueKey || data.reference} was raised for ${selectedCustomer.email} and added to their CRM support history.`,
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
      setFeedback({ type: 'error', text: reason instanceof Error ? reason.message : 'The Atlassian issue could not be raised.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><HeadphonesIcon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Raise an issue for a customer</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Select a Planyx CRM customer, create the PXCS issue on their behalf, and add the case to their support history. This explicit admin action works even when automatic AI ticket creation is switched off.</p>
          </div>
        </div>
        {!canEdit && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">View only</span>}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div>
          <label htmlFor="atlassian-customer-search" className="text-sm font-semibold text-slate-950 dark:text-white">CRM customer</label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              id="atlassian-customer-search"
              value={customerSearch}
              disabled={!canEdit || loadingCustomers}
              onChange={event => { setCustomerSearch(event.target.value); setCustomerEmail(''); setFeedback(null); }}
              placeholder={loadingCustomers ? 'Loading CRM customers…' : 'Search by name, company or email'}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-500/15"
            />
          </div>
          {!selectedCustomer && customerSearch && <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950">
            {filteredCustomers.length ? filteredCustomers.map(customer => (
              <button key={customer.email} type="button" onClick={() => selectCustomer(customer)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><UserRound className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{customerName(customer)}</span><span className="block truncate text-xs text-slate-500">{customer.email}{customer.company ? ` · ${customer.company}` : ''}</span></span>
              </button>
            )) : <p className="px-4 py-4 text-sm text-slate-500">No matching CRM customer was found.</p>}
          </div>}

          {selectedCustomer && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/25 dark:bg-blue-500/10">
            <p className="text-sm font-bold text-blue-950 dark:text-blue-100">{customerName(selectedCustomer)}</p>
            <p className="mt-1 break-all text-xs text-blue-800 dark:text-blue-200">{selectedCustomer.email}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
              <a href={`/admin/users/${encodeURIComponent(selectedCustomer.email)}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-300">Open Customer CRM <ExternalLink className="h-3.5 w-3.5" /></a>
              <button type="button" onClick={() => { setCustomerEmail(''); setCustomerSearch(''); }} className="text-slate-600 hover:underline dark:text-slate-300">Choose another customer</button>
            </div>
          </div>}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
          <label className="block text-sm font-semibold text-slate-950 dark:text-white">Subject
            <input value={subject} disabled={!canEdit} maxLength={255} onChange={event => setSubject(event.target.value)} placeholder="What does the customer need help with?" className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="block text-sm font-semibold text-slate-950 dark:text-white">Issue details
            <textarea value={message} disabled={!canEdit} maxLength={28000} rows={6} onChange={event => setMessage(event.target.value)} placeholder="Explain the issue, what has already been checked, and what the customer needs next." className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </label>
          <button type="button" onClick={() => void submit()} disabled={!canEdit || submitting || !selectedCustomer} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? 'Raising issue…' : 'Raise issue for customer'}</button>
        </div>
      </div>

      {feedback && <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
        <p className="font-semibold">{feedback.text}</p>
        {feedback.agentUrl && feedback.issueKey && <a href={feedback.agentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline">Open {feedback.issueKey} in Atlassian <ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>}
    </section>
  );
}
