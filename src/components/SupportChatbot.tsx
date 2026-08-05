import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Send, ChevronDown, Loader2, CheckCircle2,
  ChevronLeft, Plus, Clock, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketMessage {
  id: number;
  senderType: 'admin' | 'customer';
  senderName: string;
  message: string;
  createdAt: string;
}

type AnonStep = 'name' | 'email' | 'subject' | 'message' | 'consent' | 'sending' | 'done' | 'error';

interface AnonMsg {
  id: string;
  role: 'bot' | 'user';
  text: string;
}

interface EnquiryResponse {
  success: boolean;
  reference?: string;
  message?: string;
  error?: string;
}

const STATUS_COLOURS: Record<string, string> = {
  open: 'text-blue-600',
  in_progress: 'text-amber-600',
  resolved: 'text-green-600',
  closed: 'text-slate-500',
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  open: Clock,
  in_progress: AlertTriangle,
  resolved: CheckCircle2,
  closed: X,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function enquiryKey() {
  try {
    return `support-chat-${crypto.randomUUID()}`;
  } catch {
    return `support-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function normaliseMessages(messages: Array<Record<string, unknown>>): TicketMessage[] {
  return messages.map((message, index) => ({
    id: Number(message.id ?? index),
    senderType: String(message.senderType ?? message.sender_type ?? 'customer') === 'admin' ? 'admin' : 'customer',
    senderName: String(message.senderName ?? message.sender_name ?? 'Customer'),
    message: String(message.message ?? ''),
    createdAt: String(message.createdAt ?? message.created_at ?? ''),
  }));
}

export default function SupportChatbot() {
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnread] = useState(0);

  const [view, setView] = useState<'list' | 'thread' | 'new'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [threadMessages, setThreadMessages] = useState<TicketMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [userName, setUserName] = useState('');

  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newConsent, setNewConsent] = useState(false);
  const [newStartedAt, setNewStartedAt] = useState(Date.now());
  const [newIdempotencyKey, setNewIdempotencyKey] = useState(enquiryKey());
  const [submittingNew, setSubmittingNew] = useState(false);
  const [newReference, setNewReference] = useState('');
  const [newError, setNewError] = useState('');

  const [anonStep, setAnonStep] = useState<AnonStep>('name');
  const [anonMessages, setAnonMessages] = useState<AnonMsg[]>([]);
  const [anonInput, setAnonInput] = useState('');
  const [anonName, setAnonName] = useState('');
  const [anonEmail, setAnonEmail] = useState('');
  const [anonSubject, setAnonSubject] = useState('');
  const [anonMessage, setAnonMessage] = useState('');
  const [anonConsent, setAnonConsent] = useState(false);
  const [anonStartedAt, setAnonStartedAt] = useState(Date.now());
  const [anonIdempotencyKey, setAnonIdempotencyKey] = useState(enquiryKey());
  const [anonReference, setAnonReference] = useState('');
  const [anonError, setAnonError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, anonMessages, anonStep]);

  useEffect(() => {
    const inputSteps: AnonStep[] = ['name', 'email', 'subject', 'message'];
    if (open && !isLoggedIn && inputSteps.includes(anonStep)) {
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [anonStep, open, isLoggedIn]);

  useEffect(() => {
    if (user) setUserName(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email);
  }, [user]);

  const loadTickets = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTickets(true);
    try {
      const response = await fetch('/api/support/tickets', { credentials: 'include' });
      const data = await response.json() as { success?: boolean; tickets?: Ticket[] };
      if (response.ok && data.success) {
        const loaded = data.tickets ?? [];
        setTickets(loaded);
        setUnread(loaded.filter(ticket => ticket.status === 'in_progress').length);
      }
    } catch {
      // Existing ticket history is supplementary; a failed read must not hide the assistant.
    } finally {
      setLoadingTickets(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && open) void loadTickets();
  }, [isLoggedIn, open, loadTickets]);

  async function openThread(ticket: Ticket) {
    setSelectedTicket(ticket);
    setView('thread');
    setReplyText('');
    setThreadMessages([]);
    setLoadingThread(true);
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, { credentials: 'include' });
      const data = await response.json() as { success?: boolean; messages?: Array<Record<string, unknown>> };
      if (response.ok && data.success) setThreadMessages(normaliseMessages(data.messages ?? []));
    } finally {
      setLoadingThread(false);
    }
  }

  async function sendReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await response.json() as { success?: boolean; messages?: Array<Record<string, unknown>> };
      if (response.ok && data.success) {
        setThreadMessages(normaliseMessages(data.messages ?? []));
        setReplyText('');
      }
    } finally {
      setSendingReply(false);
    }
  }

  function beginNewEnquiry() {
    setView('new');
    setNewSubject('');
    setNewMessage('');
    setNewConsent(false);
    setNewReference('');
    setNewError('');
    setNewStartedAt(Date.now());
    setNewIdempotencyKey(enquiryKey());
  }

  async function submitNewEnquiry() {
    if (!newConsent || newSubject.trim().length < 3 || newMessage.trim().length < 10) return;
    setSubmittingNew(true);
    setNewError('');
    try {
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: userName,
          email: user?.email ?? '',
          subject: newSubject.trim(),
          category: 'Technical Support',
          message: newMessage.trim(),
          termsAccepted: newConsent,
          privacyAccepted: newConsent,
          startedAt: newStartedAt,
          idempotencyKey: newIdempotencyKey,
          website: '',
        }),
      });
      const data = await response.json() as EnquiryResponse;
      if (!response.ok || !data.success || !data.reference) throw new Error(data.error || 'Your enquiry could not be sent.');
      setNewReference(data.reference);
    } catch (error) {
      setNewError(error instanceof Error ? error.message : 'Your enquiry could not be sent.');
    } finally {
      setSubmittingNew(false);
    }
  }

  function addAnonMessage(role: 'bot' | 'user', text: string) {
    setAnonMessages(previous => [...previous, { id: `${Date.now()}-${role}-${Math.random()}`, role, text }]);
  }

  function initialiseAnonymousFlow() {
    setAnonStep('name');
    setAnonMessages([{
      id: 'intro',
      role: 'bot',
      text: "Hi! I'm the Sousa Murray Planeia support assistant. I'll send your enquiry directly to our team. What's your name?",
    }]);
    setAnonInput('');
    setAnonName('');
    setAnonEmail('');
    setAnonSubject('');
    setAnonMessage('');
    setAnonConsent(false);
    setAnonReference('');
    setAnonError('');
    setAnonStartedAt(Date.now());
    setAnonIdempotencyKey(enquiryKey());
  }

  function handleAnonInput() {
    const value = anonInput.trim();
    if (!value) return;
    setAnonInput('');

    if (anonStep === 'name') {
      if (value.length < 2) {
        addAnonMessage('bot', 'Please enter your full name or the name you would like us to use.');
        return;
      }
      setAnonName(value);
      addAnonMessage('user', value);
      setAnonStep('email');
      addAnonMessage('bot', `Nice to meet you, ${value}. What email address should our team reply to?`);
      return;
    }

    if (anonStep === 'email') {
      if (!validEmail(value)) {
        addAnonMessage('bot', "That email address doesn't look valid. Please check it and try again.");
        return;
      }
      setAnonEmail(value.toLowerCase());
      addAnonMessage('user', value);
      setAnonStep('subject');
      addAnonMessage('bot', "What's the subject of your enquiry?");
      return;
    }

    if (anonStep === 'subject') {
      if (value.length < 3) {
        addAnonMessage('bot', 'Please enter a slightly longer subject.');
        return;
      }
      setAnonSubject(value);
      addAnonMessage('user', value);
      setAnonStep('message');
      addAnonMessage('bot', 'Please describe your question or problem in at least 10 characters.');
      return;
    }

    if (anonStep === 'message') {
      if (value.length < 10) {
        addAnonMessage('bot', 'Please provide a little more detail so our team can help.');
        return;
      }
      setAnonMessage(value);
      addAnonMessage('user', value);
      setAnonStep('consent');
      addAnonMessage('bot', 'Before I send this, please confirm that you accept the Terms of Service and have read the Privacy Notice.');
    }
  }

  async function submitAnonymousEnquiry() {
    if (!anonConsent || !anonName || !anonEmail || !anonSubject || anonMessage.length < 10) return;
    setAnonStep('sending');
    setAnonError('');
    addAnonMessage('bot', 'Sending your enquiry to our team…');
    try {
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: anonName,
          email: anonEmail,
          subject: anonSubject,
          category: 'Technical Support',
          message: anonMessage,
          termsAccepted: anonConsent,
          privacyAccepted: anonConsent,
          startedAt: anonStartedAt,
          idempotencyKey: anonIdempotencyKey,
          website: '',
        }),
      });
      const data = await response.json() as EnquiryResponse;
      if (!response.ok || !data.success || !data.reference) throw new Error(data.error || 'Your enquiry could not be sent.');
      setAnonReference(data.reference);
      setAnonStep('done');
      addAnonMessage('bot', `Your enquiry has been received. Your reference is ${data.reference}. Our team will reply to ${anonEmail}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Your enquiry could not be sent.';
      setAnonError(message);
      setAnonStep('error');
      addAnonMessage('bot', message);
    }
  }

  function handleAnonKey(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleAnonInput();
    }
  }

  function openWidget() {
    setOpen(true);
    setUnread(0);
    if (!isLoggedIn && anonMessages.length === 0) initialiseAnonymousFlow();
    if (isLoggedIn) {
      setView('list');
      setSelectedTicket(null);
      setNewReference('');
      setNewError('');
    }
  }

  const panelTitle = isLoggedIn
    ? view === 'thread' ? selectedTicket?.subject ?? 'Support conversation' : view === 'new' ? 'New Enquiry' : 'Support'
    : 'JA Support';

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[80] sm:bottom-5 sm:right-5">
        <button
          type="button"
          onClick={open ? () => setOpen(false) : openWidget}
          aria-label={open ? 'Close support assistant' : 'Open support assistant'}
          aria-expanded={open}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition hover:scale-105 hover:bg-blue-700 active:scale-95"
        >
          {open ? <ChevronDown className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {!open && unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <section
          role="dialog"
          aria-label="Sousa Murray Planeia support assistant"
          className="fixed inset-x-3 bottom-20 z-[70] flex h-[calc(100dvh-6rem)] max-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl [color-scheme:light] sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[600px] sm:w-[410px] sm:max-w-[calc(100vw-2.5rem)]"
        >
          <header className="flex shrink-0 items-center justify-between bg-blue-600 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              {isLoggedIn && view !== 'list' && (
                <button
                  type="button"
                  onClick={() => { setView('list'); setSelectedTicket(null); setNewReference(''); setNewError(''); }}
                  className="mr-1 rounded p-1 text-blue-100 hover:bg-white/10 hover:text-white"
                  aria-label="Back to support conversations"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{panelTitle}</p>
                <p className="text-[11px] leading-tight text-blue-100">We typically reply within 2 working days</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-2 text-blue-100 hover:bg-white/10 hover:text-white"
              aria-label="Close support assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {isLoggedIn ? (
            <>
              {view === 'list' && (
                <div className="flex min-h-0 flex-1 flex-col bg-white">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {loadingTickets ? (
                      <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
                    ) : tickets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                        <MessageCircle className="mb-3 h-10 w-10 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-900">No previous support conversations</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">Send an enquiry directly to the Sousa Murray Planeia Support Team.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {tickets.map(ticket => {
                          const Icon = STATUS_ICONS[ticket.status] ?? Clock;
                          return (
                            <button
                              type="button"
                              key={ticket.id}
                              onClick={() => void openThread(ticket)}
                              className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{ticket.subject}</p>
                                <span className={`flex shrink-0 items-center gap-1 text-[10px] ${STATUS_COLOURS[ticket.status]}`}>
                                  <Icon className="h-3 w-3" /> {ticket.status.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="mt-1 text-[10px] text-slate-500">Updated {formatDate(ticket.updatedAt)}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                    <Button type="button" size="sm" className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700" onClick={beginNewEnquiry}>
                      <Plus className="h-4 w-4" /> Send an Enquiry
                    </Button>
                  </div>
                </div>
              )}

              {view === 'thread' && selectedTicket && (
                <div className="flex min-h-0 flex-1 flex-col bg-white">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-3">
                    {loadingThread ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-slate-500" /></div>
                    ) : threadMessages.length === 0 ? (
                      <p className="py-5 text-center text-xs text-slate-600">No replies yet. Our team will respond as soon as possible.</p>
                    ) : threadMessages.map(message => {
                      const adminMessage = message.senderType === 'admin';
                      return (
                        <div key={message.id} className={`flex gap-2 ${adminMessage ? '' : 'flex-row-reverse'}`}>
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${adminMessage ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-800'}`}>
                            {adminMessage ? <ShieldCheck className="h-3 w-3" /> : message.senderName.charAt(0).toUpperCase()}
                          </div>
                          <div className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed ${adminMessage ? 'rounded-bl-sm border border-slate-200 bg-white text-slate-900 shadow-sm' : 'rounded-br-sm bg-blue-600 text-white'}`}>
                            {message.message}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  {selectedTicket.status !== 'closed' ? (
                    <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={replyText}
                          onChange={event => setReplyText(event.target.value)}
                          placeholder="Reply to the support team…"
                          rows={2}
                          className="min-h-0 flex-1 resize-none border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendReply(); } }}
                        />
                        <Button type="button" size="sm" onClick={() => void sendReply()} disabled={sendingReply || !replyText.trim()} className="h-10 w-10 shrink-0 bg-blue-600 p-0 text-white hover:bg-blue-700">
                          {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-600">This conversation is closed.</div>
                  )}
                </div>
              )}

              {view === 'new' && (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white p-4">
                  {newReference ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-3 py-8 text-center">
                      <CheckCircle2 className="mb-3 h-11 w-11 text-green-600" />
                      <p className="text-base font-semibold text-slate-900">Enquiry submitted</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">It is now available under <strong>Contact Enquiries</strong> in the Admin Portal.</p>
                      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 font-mono text-sm font-semibold text-blue-800">{newReference}</div>
                      <Button type="button" size="sm" variant="outline" className="mt-5 border-slate-300 text-slate-800" onClick={() => setView('list')}>Back to support</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="support-enquiry-subject" className="mb-1 block text-xs font-semibold text-slate-800">Subject</label>
                        <Input id="support-enquiry-subject" value={newSubject} onChange={event => setNewSubject(event.target.value)} placeholder="For example, billing question or builder issue" className="border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <div>
                        <label htmlFor="support-enquiry-message" className="mb-1 block text-xs font-semibold text-slate-800">Message</label>
                        <Textarea id="support-enquiry-message" value={newMessage} onChange={event => setNewMessage(event.target.value)} placeholder="Describe your question or problem in detail…" className="min-h-[150px] border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                        <input type="checkbox" checked={newConsent} onChange={event => setNewConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                        <span>I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Terms of Service</a> and confirm that I have read the <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Privacy Notice</a>.</span>
                      </label>
                      {newError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{newError}</p>}
                      <Button type="button" size="sm" className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700" onClick={() => void submitNewEnquiry()} disabled={submittingNew || !newConsent || newSubject.trim().length < 3 || newMessage.trim().length < 10}>
                        {submittingNew ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {submittingNew ? 'Sending…' : 'Send Enquiry'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-3">
                {anonMessages.map(message => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'bot' && (
                      <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                        <MessageCircle className="h-3 w-3" />
                      </div>
                    )}
                    <div className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900 shadow-sm'}`}>
                      {message.text}
                    </div>
                  </div>
                ))}
                {anonStep === 'done' && anonReference && (
                  <div className="flex justify-center"><span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Reference {anonReference}</span></div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                {anonStep === 'consent' ? (
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                      <input type="checkbox" checked={anonConsent} onChange={event => setAnonConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                      <span>I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Terms of Service</a> and have read the <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Privacy Notice</a>.</span>
                    </label>
                    <Button type="button" size="sm" className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700" onClick={() => void submitAnonymousEnquiry()} disabled={!anonConsent}>
                      <Send className="h-4 w-4" /> Send Enquiry
                    </Button>
                  </div>
                ) : anonStep === 'sending' ? (
                  <div className="flex items-center justify-center py-2 text-xs text-slate-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending securely…</div>
                ) : anonStep === 'done' ? (
                  <Button type="button" size="sm" variant="outline" onClick={initialiseAnonymousFlow} className="w-full border-slate-300 text-slate-800">Send another enquiry</Button>
                ) : anonStep === 'error' ? (
                  <div className="space-y-2">
                    {anonError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{anonError}</p>}
                    <Button type="button" size="sm" className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={() => setAnonStep('consent')}>Try again</Button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    {anonStep === 'message' ? (
                      <Textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        value={anonInput}
                        onChange={event => setAnonInput(event.target.value)}
                        onKeyDown={handleAnonKey}
                        placeholder="Describe your question or problem…"
                        rows={3}
                        className="min-h-0 flex-1 resize-none border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                      />
                    ) : (
                      <Input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        value={anonInput}
                        onChange={event => setAnonInput(event.target.value)}
                        onKeyDown={handleAnonKey}
                        placeholder={anonStep === 'name' ? 'Your name…' : anonStep === 'email' ? 'your@email.com' : 'Subject…'}
                        type={anonStep === 'email' ? 'email' : 'text'}
                        className="flex-1 border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                      />
                    )}
                    <Button type="button" size="sm" onClick={handleAnonInput} disabled={!anonInput.trim()} className="h-10 w-10 shrink-0 bg-blue-600 p-0 text-white hover:bg-blue-700" aria-label="Continue">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-center text-[10px] text-slate-500">Messages are sent securely to the Sousa Murray Planeia Support Team</p>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
