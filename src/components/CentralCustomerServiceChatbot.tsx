import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ExternalLink,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type Role = 'assistant' | 'user' | 'staff' | 'system';

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  createdAt: string;
  senderName?: string;
};

type AssistantReply = {
  success?: boolean;
  error?: string;
  reply?: string;
  suggestions?: string[];
  article?: { title?: string; href?: string };
  escalate?: boolean;
  humanHandling?: boolean;
  centralEnabled?: boolean;
  category?: string;
  priority?: string;
};

type CentralMessage = {
  id: string;
  externalMessageId?: string;
  senderType: 'customer' | 'ai' | 'staff' | 'system';
  senderName?: string;
  body: string;
  createdAt: string;
};

type CentralConversation = {
  id: string;
  reference: string;
  status: string;
  handlingMode: string;
  caseId?: string | null;
};

type CustomerServiceConfig = {
  enabled: boolean;
  assistantName: string;
  welcomeMessage: string;
  inputPlaceholder: string;
  launcherLabel: string;
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
  accentColor?: string;
  panelWidth: number;
  panelHeight?: number;
  borderRadius: number;
  launcherSize: number;
  showPoweredBy?: boolean;
  emergencyNotice?: string;
  humanTakeoverEnabled?: boolean;
};

type Props = { config: CustomerServiceConfig };

const SESSION_KEY = 'planyx-head-office-support-session';

function supportSessionId() {
  if (typeof window === 'undefined') return 'server-support-session';
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing && existing.length >= 8) return existing;
  const value = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `planyx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(SESSION_KEY, value);
  return value;
}

function messageId(prefix: string) {
  return `${prefix}-${typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function firstName(value?: string) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function humanMode(mode?: string) {
  return ['human_pending', 'human', 'paused'].includes(String(mode || '').toLowerCase());
}

export default function CentralCustomerServiceChatbot({ config }: Props) {
  const { user } = useAuth();
  const sessionIdRef = useRef(supportSessionId());
  const seenCentralIds = useRef(new Set<string>());
  const lastCentralTimestamp = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [centralEnabled, setCentralEnabled] = useState(false);
  const [conversation, setConversation] = useState<CentralConversation | null>(null);
  const [staffHandling, setStaffHandling] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [article, setArticle] = useState<{ title?: string; href?: string } | null>(null);

  const side = config.position === 'bottom-left' ? 'left-5' : 'right-5';
  const panelSide = config.position === 'bottom-left' ? 'sm:left-5' : 'sm:right-5';
  const history = useMemo(
    () => messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.text,
    })),
    [messages],
  );

  useEffect(() => {
    const recognised = Boolean(user?.email);
    const name = firstName(user?.name || user?.displayName);
    const welcome = recognised
      ? `Hello${name ? ` ${name}` : ''}. I have securely recognised your signed-in Planyx account, so I will not ask you to enter your name or email again. ${config.welcomeMessage || 'How can I help?'}`
      : `${config.welcomeMessage || 'Hello. How can I help?'} You can ask general questions without signing in. Account-specific support may require secure verification.`;
    setMessages([{ id: 'welcome', role: 'assistant', text: welcome, createdAt: new Date().toISOString(), senderName: config.assistantName }]);
  }, [config.assistantName, config.welcomeMessage, user?.email, user?.name, user?.displayName]);

  useEffect(() => {
    if (!open) return;
    const body = JSON.stringify({
      event: 'open',
      sessionId: sessionIdRef.current,
      pagePath: window.location.pathname,
      pageTitle: document.title,
    });
    fetch('/api/support-assistant', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined);
    fetch('/api/customer-service/config', { credentials: 'include', cache: 'no-store' })
      .then(response => response.json())
      .then(data => setCentralEnabled(data?.centralEnabled === true && data?.branch?.enabled === true))
      .catch(() => setCentralEnabled(false));
    return () => {
      navigator.sendBeacon?.('/api/support-assistant', new Blob([JSON.stringify({
        event: 'close',
        sessionId: sessionIdRef.current,
        pagePath: window.location.pathname,
      })], { type: 'application/json' }));
    };
  }, [open]);

  useEffect(() => {
    if (!open || !centralEnabled) return;
    let active = true;
    let timer = 0;

    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (lastCentralTimestamp.current) params.set('after', lastCentralTimestamp.current);
        const response = await fetch(`/api/customer-service/conversations/${encodeURIComponent(sessionIdRef.current)}/messages?${params}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({})) as {
          success?: boolean;
          conversation?: CentralConversation;
          messages?: CentralMessage[];
        };
        if (!active || !response.ok || !data.success) return;
        if (data.conversation) {
          setConversation(data.conversation);
          setStaffHandling(humanMode(data.conversation.handlingMode));
        }
        const incoming = (data.messages || []).filter(item => !seenCentralIds.current.has(item.id));
        incoming.forEach(item => {
          seenCentralIds.current.add(item.id);
          if (!lastCentralTimestamp.current || item.createdAt > lastCentralTimestamp.current) lastCentralTimestamp.current = item.createdAt;
        });
        const staffMessages = incoming.filter(item => item.senderType === 'staff' || item.senderType === 'system');
        if (staffMessages.length) {
          setMessages(current => [
            ...current,
            ...staffMessages.map(item => ({
              id: `central-${item.id}`,
              role: item.senderType === 'staff' ? 'staff' as const : 'system' as const,
              text: item.body,
              createdAt: item.createdAt,
              senderName: item.senderName || (item.senderType === 'staff' ? 'JA Group Services Support' : 'Customer Service Centre'),
            })),
          ]);
        }
      } catch {
        // The local assistant remains available if the central poll is temporarily unavailable.
      } finally {
        if (active) timer = window.setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [centralEnabled, open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, thinking]);

  async function sendToStaff(value: string, id: string) {
    const response = await fetch(`/api/customer-service/conversations/${encodeURIComponent(sessionIdRef.current)}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        externalMessageId: id,
        message: value,
        pagePath: window.location.pathname,
      }),
    });
    const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || 'Your message could not be sent to the support team.');
  }

  async function submit(event?: FormEvent, supplied?: string) {
    event?.preventDefault();
    const value = String(supplied ?? input).trim();
    if (!value || thinking) return;
    const id = messageId('customer');
    setMessages(current => [...current, { id, role: 'user', text: value, createdAt: new Date().toISOString(), senderName: user?.name || 'You' }]);
    setInput('');
    setThinking(true);
    setError('');
    setSuggestions([]);
    setArticle(null);

    try {
      if (centralEnabled && staffHandling) {
        await sendToStaff(value, id);
        setMessages(current => [...current, {
          id: messageId('system'),
          role: 'system',
          text: 'Your message has been added to the same Head Office conversation. The AI remains in standby while an authorised staff member handles the enquiry.',
          createdAt: new Date().toISOString(),
          senderName: 'Customer Service Centre',
        }]);
        return;
      }

      const response = await fetch('/api/support-assistant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          messageId: id,
          turn: history.filter(item => item.role === 'user').length + 1,
          message: value,
          pagePath: window.location.pathname,
          pageTitle: document.title,
          history,
        }),
      });
      const data = await response.json().catch(() => ({})) as AssistantReply;
      if (!response.ok || !data.success || !data.reply) throw new Error(data.error || 'The Planyx Support Assistant could not answer that question.');
      setMessages(current => [...current, {
        id: messageId('assistant'),
        role: data.humanHandling ? 'system' : 'assistant',
        text: data.reply || '',
        createdAt: new Date().toISOString(),
        senderName: data.humanHandling ? 'Customer Service Centre' : config.assistantName,
      }]);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 4) : []);
      setArticle(data.article || null);
      if (data.centralEnabled) setCentralEnabled(true);
      if (data.humanHandling || data.escalate) setStaffHandling(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The support message could not be sent.');
    } finally {
      setThinking(false);
    }
  }

  async function requestHuman() {
    if (thinking || !config.humanTakeoverEnabled) return;
    setThinking(true);
    setError('');
    try {
      if (!centralEnabled) throw new Error('Head Office human assistance is not enabled for this environment yet.');
      const response = await fetch(`/api/customer-service/conversations/${encodeURIComponent(sessionIdRef.current)}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'request_human', pagePath: window.location.pathname }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Human assistance could not be requested.');
      setStaffHandling(true);
      setMessages(current => [...current, {
        id: messageId('system'),
        role: 'system',
        text: 'Human assistance has been requested. The AI is now in standby and the full conversation remains available to the authorised support team.',
        createdAt: new Date().toISOString(),
        senderName: 'Customer Service Centre',
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Human assistance could not be requested.');
    } finally {
      setThinking(false);
    }
  }

  function messageIcon(role: Role) {
    if (role === 'user') return <UserRound className="h-4 w-4" />;
    if (role === 'staff') return <Users className="h-4 w-4" />;
    if (role === 'system') return <ShieldCheck className="h-4 w-4" />;
    return <Bot className="h-4 w-4" />;
  }

  return (
    <>
      <div className={`fixed bottom-5 ${side} z-[70] flex items-center gap-2`}>
        {config.launcherLabel && !open && (
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:block">
            {config.launcherLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-label={open ? 'Close Planyx support' : 'Open Planyx support'}
          style={{ width: config.launcherSize, height: config.launcherSize, backgroundColor: config.primaryColor }}
          className="flex items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          {open ? <ChevronDown className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <section
          role="dialog"
          aria-label="Planyx Support Assistant"
          style={{
            width: `min(calc(100vw - 1.5rem), ${config.panelWidth}px)`,
            height: `min(calc(100vh - 7rem), ${config.panelHeight || 650}px)`,
            borderRadius: config.borderRadius,
          }}
          className={`fixed inset-x-3 bottom-20 z-[69] flex overflow-hidden border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:left-auto ${panelSide}`}
        >
          <div className="flex min-h-0 w-full flex-col">
            <header style={{ backgroundColor: config.primaryColor }} className="flex items-center justify-between px-4 py-3 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><LifeBuoy className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-bold">{config.assistantName}</p>
                  <p className="flex items-center gap-1 text-[11px] text-white/80">
                    <LockKeyhole className="h-3 w-3" />
                    {staffHandling ? 'Human assistance · AI standby' : centralEnabled ? 'Connected to Head Office' : 'Planyx self-service'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
            </header>

            {config.emergencyNotice && (
              <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{config.emergencyNotice}</span>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900/60">
              {messages.map(message => (
                <article key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role !== 'user' && (
                    <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${message.role === 'staff' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : message.role === 'system' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}`}>
                      {messageIcon(message.role)}
                    </span>
                  )}
                  <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-md bg-blue-600 text-white' : message.role === 'staff' ? 'rounded-bl-md border border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100' : message.role === 'system' ? 'rounded-bl-md border border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                    {message.senderName && message.role !== 'user' && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-65">{message.senderName}</p>}
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  </div>
                </article>
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {staffHandling ? 'Sending your message to the support team…' : 'Checking Planyx support information…'}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {(suggestions.length > 0 || article?.href) && (
              <div className="flex flex-wrap gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-800">
                {suggestions.map(suggestion => (
                  <button key={suggestion} type="button" onClick={() => submit(undefined, suggestion)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                    {suggestion}
                  </button>
                ))}
                {article?.href && (
                  <a href={article.href} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    {article.title || 'Open help article'} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {error && <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p>}

            <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder={staffHandling ? 'Write a message to the support team…' : config.inputPlaceholder || 'How can we help?'}
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-950"
                />
                <button type="submit" disabled={!input.trim() || thinking} style={{ backgroundColor: config.primaryColor }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send support message">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Never send passwords, one-time codes or full payment-card details.
                </p>
                {centralEnabled && config.humanTakeoverEnabled && !staffHandling && (
                  <button type="button" onClick={requestHuman} disabled={thinking} className="shrink-0 text-[10px] font-bold text-blue-700 hover:underline dark:text-blue-300">
                    Request human support
                  </button>
                )}
              </div>
              {conversation?.reference && <p className="mt-1 text-[9px] text-slate-400">Conversation reference: {conversation.reference}</p>}
            </form>
          </div>
        </section>
      )}
    </>
  );
}
