import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  LifeBuoy,
  Loader2,
  Printer,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface AssistantConfig {
  enabled: boolean;
  maintenanceEnabled: boolean;
  allowAnonymous: boolean;
  escalationEnabled: boolean;
  assistantName: string;
  logoUrl: string;
  avatarUrl: string;
  fontFamily: string;
  welcomeMessage: string;
  responseTime: string;
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
  accentColor: string;
  panelWidth: number;
  panelHeight: number;
  borderRadius: number;
  launcherSize: number;
  launcherLabel: string;
  inputPlaceholder: string;
  showPoweredBy: boolean;
  autoOpenDelaySeconds: number;
}

interface ArticleLink {
  id: string;
  title: string;
  category: string;
  summary: string;
  href: string;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  article?: ArticleLink;
  suggestions?: string[];
}

interface AssistantReply {
  success: boolean;
  error?: string;
  reply?: string;
  suggestions?: string[];
  article?: ArticleLink;
  category?: string;
  suggestedSubject?: string;
  priority?: string;
  escalate?: boolean;
  contactEnquiriesAvailable?: boolean;
}

interface EnquiryForm {
  name: string;
  email: string;
  telephone: string;
  subject: string;
  message: string;
  category: string;
  consent: boolean;
}

const DEFAULT_CONFIG: AssistantConfig = {
  enabled: true,
  maintenanceEnabled: false,
  allowAnonymous: true,
  escalationEnabled: true,
  assistantName: 'Planyx Support Assistant',
  logoUrl: '',
  avatarUrl: '',
  fontFamily: 'inherit',
  welcomeMessage: 'Hello! I can help you find an answer in the Planyx Help Centre. What do you need help with?',
  responseTime: 'within 2 working days',
  position: 'bottom-right',
  primaryColor: '#2563eb',
  accentColor: '#dbeafe',
  panelWidth: 430,
  panelHeight: 680,
  borderRadius: 18,
  launcherSize: 56,
  launcherLabel: 'Help',
  inputPlaceholder: 'Tell me what you need help with…',
  showPoweredBy: true,
  autoOpenDelaySeconds: 0,
};

const STARTER_SUGGESTIONS = [
  'Account or sign-in',
  'Billing or subscription',
  'Builders or saved plans',
  'Privacy or data',
  'Technical problem',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function id(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email: string } | null | undefined): string {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
}

function issueHistory(messages: ChatMessage[]) {
  return messages.slice(-20).map(message => ({ role: message.role, content: message.text }));
}

export default function ConversationalAIHelpChatbot() {
  const { user } = useAuth();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'enquiry' | 'sent'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Searching the Help Centre…');
  const [chatError, setChatError] = useState('');
  const [reference, setReference] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [suggestedSubject, setSuggestedSubject] = useState('');
  const [suggestedCategory, setSuggestedCategory] = useState('Technical Support');
  const [form, setForm] = useState<EnquiryForm>({
    name: '',
    email: '',
    telephone: '',
    subject: '',
    message: '',
    category: 'Technical Support',
    consent: false,
  });
  const [supportPin, setSupportPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pendingEscalation, setPendingEscalation] = useState<{ reply: AssistantReply; conversation: ChatMessage[] } | null>(null);

  const sessionIdRef = useRef(id('support-session'));
  const openedAtRef = useRef(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hiddenForPortal = typeof window !== 'undefined'
    && (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/reseller'));

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/support-assistant', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as {
        success?: boolean;
        config?: Partial<AssistantConfig>;
      };
      if (response.ok && data.success && data.config) {
        setConfig(current => ({ ...current, ...data.config }));
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!user) return;
    setForm(current => ({
      ...current,
      name: current.name || displayName(user),
      email: current.email || user.email,
    }));
  }, [user]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [open, loadConfig]);

  useEffect(() => {
    if (!open || config.maintenanceEnabled) return;
    const timer = window.setInterval(() => {
      void sendEvent('heartbeat');
      void loadConfig();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [open, config.maintenanceEnabled, loadConfig]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, mode, thinking, pendingEscalation]);

  useEffect(() => {
    if (open && mode === 'chat') {
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!ready || !config.enabled || config.autoOpenDelaySeconds <= 0 || hiddenForPortal) return;
    const timer = window.setTimeout(() => openWidget(), config.autoOpenDelaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [ready, config.enabled, config.autoOpenDelaySeconds, hiddenForPortal]);

  function sendEvent(event: 'open' | 'heartbeat' | 'close') {
    return fetch('/api/support-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        event,
        sessionId: sessionIdRef.current,
        email: user?.email || '',
        pagePath: window.location.pathname,
      }),
    }).catch(() => undefined);
  }

  function initialiseConversation() {
    if (messages.length) return;
    setMessages([{
      id: id('assistant'),
      role: 'assistant',
      text: config.welcomeMessage,
      suggestions: STARTER_SUGGESTIONS,
    }]);
  }

  function openWidget() {
    setOpen(true);
    setMode('chat');
    setChatError('');
    openedAtRef.current = Date.now();
    initialiseConversation();
    void sendEvent('open');
  }

  function closeWidget() {
    setOpen(false);
    void sendEvent('close');
  }

  function appendAssistant(text: string, options: Partial<ChatMessage> = {}) {
    setMessages(current => [...current, {
      id: id('assistant'),
      role: 'assistant',
      text,
      article: options.article,
      suggestions: options.suggestions,
    }]);
  }

  function startEnquiry(subject = suggestedSubject, category = suggestedCategory, conversation = messages) {
    if (!config.escalationEnabled) {
      appendAssistant('Online Contact Enquiries are currently unavailable. I can continue helping with self-service information.', {
        suggestions: ['Try another question', 'Open the Help Centre'],
      });
      return;
    }

    const lastUserMessage = [...conversation].reverse().find(message => message.role === 'user')?.text ?? '';
    setForm(current => ({
      ...current,
      name: current.name || displayName(user),
      email: current.email || user?.email || '',
      subject: current.subject || subject || 'Help with Planyx',
      message: current.message || lastUserMessage,
      category: category || 'Technical Support',
    }));
    setFieldErrors({});
    setSubmitError('');
    setMode('enquiry');
  }

  async function submitAutomaticEscalation(reply: AssistantReply, conversation: ChatMessage[]) {
    const name = form.name.trim() || displayName(user);
    const email = user?.email?.trim() || form.email.trim();
    const subject = reply.suggestedSubject || suggestedSubject || 'Help with Planyx';
    const category = reply.category || suggestedCategory || 'Technical Support';

    if (!name || !email) {
      startEnquiry(subject, category, conversation);
      return;
    }

    setSubmitting(true);
    setChatError('');
    try {
      const transcript = conversation
        .map(message => `${message.role === 'assistant' ? config.assistantName : 'Customer'}: ${message.text}`)
        .join('\n\n');
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          name,
          email,
          telephone: form.telephone.trim(),
          subject,
          message: [
            '--- Structured AI escalation ---',
            `Category: ${category}`,
            `Priority: ${reply.priority || 'Normal'}`,
            `Page: ${window.location.pathname}`,
            `Session: ${sessionIdRef.current}`,
            'Troubleshooting and triage transcript:',
            transcript,
          ].join('\n').slice(0, 20000),
          category,
          priority: reply.priority || 'Normal',
          enquiryType: 'AI Support Assistant escalation',
          termsAccepted: true,
          privacyAccepted: true,
          marketingConsent: false,
          startedAt: openedAtRef.current,
          website: '',
          idempotencyKey: `${sessionIdRef.current}-automatic-escalation`.slice(0, 120),
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        success?: boolean;
        reference?: string;
        error?: string;
        errors?: string[];
      };
      if (!response.ok || !data.success || !data.reference) {
        throw new Error(data.error || data.errors?.[0] || 'The issue could not be escalated.');
      }
      setReference(data.reference);
      setPendingEscalation(null);
      setMode('sent');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The issue could not be escalated.';
      setChatError(message);
      appendAssistant(`I could not send the escalation automatically: ${message}`, {
        suggestions: config.escalationEnabled ? ['Create an enquiry', 'Try another question'] : ['Try another question'],
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifySupportPin() {
    if (!pendingEscalation || !/^\d{6}$/.test(supportPin)) {
      setPinError('Enter the six-digit Support PIN shown in Settings → Security.');
      return;
    }
    setPinVerifying(true);
    setPinError('');
    try {
      const response = await fetch('/api/support-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ event: 'verify_support_pin', pin: supportPin }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      setSupportPin('');
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'The Support PIN could not be verified.');
      }
      const escalation = pendingEscalation;
      appendAssistant('Thank you — your identity has been verified. I’m sending your enquiry to the Support Team now.');
      await submitAutomaticEscalation(escalation.reply, escalation.conversation);
    } catch (reason) {
      setPinError(reason instanceof Error ? reason.message : 'The Support PIN could not be verified.');
    } finally {
      setPinVerifying(false);
    }
  }

  async function sendMessage(raw = input) {
    const value = raw.trim();
    if (!value || thinking) return;

    if (value === 'Create an enquiry') {
      startEnquiry();
      return;
    }
    if (value === 'Open the Help Centre') {
      window.location.assign('/help-centre');
      return;
    }
    if (value === 'Ask another question' || value === 'Try another question') {
      appendAssistant('Of course. What else can I help you with?', { suggestions: STARTER_SUGGESTIONS });
      setInput('');
      return;
    }

    const userMessage: ChatMessage = { id: id('user'), role: 'user', text: value };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setThinking(true);
    setChatError('');

    const lastAssistantText = [...messages].reverse().find(message => message.role === 'assistant')?.text || '';
    const answeringHandover = /Would you like me to send this conversation to the support team\?/i.test(lastAssistantText);
    const confirmingHandover = answeringHandover && /^(?:yes\b|please do\b|send\b|go ahead\b|contact\b|submit\b)/i.test(value);
    setThinkingLabel(confirmingHandover ? 'Preparing your enquiry…' : 'Searching the Help Centre…');

    try {
      const response = await fetch('/api/support-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: value,
          email: user?.email || '',
          pagePath: window.location.pathname,
          history: issueHistory(next),
        }),
      });
      const data = await response.json().catch(() => ({})) as AssistantReply;
      if (!response.ok || !data.success || !data.reply) {
        throw new Error(data.error || 'The Help Centre assistant could not answer that question.');
      }

      if (data.suggestedSubject) setSuggestedSubject(data.suggestedSubject);
      if (data.category) setSuggestedCategory(data.category);
      if (data.contactEnquiriesAvailable === false) {
        setConfig(current => ({ ...current, escalationEnabled: false }));
      }

      const assistantMessage: ChatMessage = {
        id: id('assistant'),
        role: 'assistant',
        text: data.reply,
        article: data.article,
        suggestions: data.escalate && user?.email ? [] : data.suggestions,
      };
      setMessages(current => [...current, assistantMessage]);

      if (data.escalate) {
        const conversation = [...next, assistantMessage];
        if (user?.email) {
          setPendingEscalation({ reply: data, conversation });
          setSupportPin('');
          setPinError('');
        } else {
          startEnquiry(data.suggestedSubject, data.category, conversation);
        }
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The Help Centre assistant could not answer that question.';
      setChatError(message);
      appendAssistant('I could not complete the self-help check. You can try another question or use Contact Enquiries when it is available.', {
        suggestions: config.escalationEnabled ? ['Create an enquiry', 'Try another question'] : ['Try another question', 'Open the Help Centre'],
      });
    } finally {
      setThinking(false);
    }
  }

  function validateEnquiry() {
    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test((user?.email || form.email).trim())) errors.email = 'Enter a valid email address.';
    if (form.subject.trim().length < 3) errors.subject = 'Enter a subject of at least 3 characters.';
    if (form.message.trim().length < 10) errors.message = 'Please give at least 10 characters of detail.';
    if (!form.consent) errors.consent = 'Confirm the Terms of Service and Privacy Notice.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitEnquiry() {
    setSubmitError('');
    if (!validateEnquiry()) return;
    setSubmitting(true);
    try {
      const transcript = messages
        .map(message => `${message.role === 'assistant' ? config.assistantName : 'Visitor'}: ${message.text}`)
        .join('\n\n');
      const response = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          name: form.name.trim(),
          email: user?.email || form.email.trim(),
          telephone: form.telephone.trim(),
          subject: form.subject.trim(),
          message: `${form.message.trim()}${transcript ? `\n\n--- AI Help Centre conversation ---\n${transcript}` : ''}`.slice(0, 20000),
          category: form.category,
          termsAccepted: true,
          privacyAccepted: true,
          marketingConsent: false,
          startedAt: openedAtRef.current,
          website: '',
          idempotencyKey: `${sessionIdRef.current}-${form.subject.trim().toLowerCase()}`.slice(0, 120),
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        success?: boolean;
        reference?: string;
        error?: string;
        errors?: string[];
      };
      if (!response.ok || !data.success || !data.reference) {
        throw new Error(data.error || data.errors?.[0] || 'The enquiry could not be sent.');
      }
      setReference(data.reference);
      setMode('sent');
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : 'The enquiry could not be sent.');
    } finally {
      setSubmitting(false);
    }
  }

  const transcriptText = useMemo(() => {
    const lines = messages.map(message => `${message.role === 'assistant' ? config.assistantName : form.name || 'Visitor'}: ${message.text}`);
    return [
      'Planyx Support Conversation',
      `Name: ${form.name || 'Not provided'}`,
      `Email: ${user?.email || form.email || 'Not provided'}`,
      `Telephone: ${form.telephone || 'Not provided'}`,
      reference ? `Enquiry reference: ${reference}` : '',
      '',
      ...lines,
    ].filter(line => line !== '').join('\n\n');
  }, [messages, config.assistantName, form.name, form.email, form.telephone, reference, user?.email]);

  function downloadTranscript() {
    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Planyx-${reference || sessionIdRef.current}-transcript.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function printTranscript() {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=800,height=700');
    if (!popup) {
      setChatError('Your browser blocked the print window. Please allow pop-ups and try again.');
      return;
    }
    const safe = transcriptText.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] || character);
    popup.document.write(`<!doctype html><html lang="en-GB"><head><title>Planyx support transcript</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#0f172a}pre{white-space:pre-wrap;line-height:1.55}h1{font-size:22px}@media print{button{display:none}}</style></head><body><h1>Planyx support transcript</h1><pre>${safe}</pre><button onclick="window.print()">Print transcript</button></body></html>`);
    popup.document.close();
  }

  function restart() {
    sessionIdRef.current = id('support-session');
    openedAtRef.current = Date.now();
    setReference('');
    setInput('');
    setSuggestedSubject('');
    setSuggestedCategory('Technical Support');
    setPendingEscalation(null);
    setForm({
      name: displayName(user),
      email: user?.email || '',
      telephone: '',
      subject: '',
      message: '',
      category: 'Technical Support',
      consent: false,
    });
    setMessages([{
      id: id('assistant'),
      role: 'assistant',
      text: config.welcomeMessage,
      suggestions: STARTER_SUGGESTIONS,
    }]);
    setMode('chat');
    void sendEvent('open');
  }

  if (hiddenForPortal || !ready || !config.enabled || config.maintenanceEnabled) return null;

  const sideClass = config.position === 'bottom-left' ? 'left-5' : 'right-5';
  const panelSideClass = config.position === 'bottom-left' ? 'sm:left-5' : 'sm:right-5';
  const colourStyle = {
    '--chat-primary': config.primaryColor,
    '--chat-accent': config.accentColor,
    fontFamily: config.fontFamily,
  } as CSSProperties;

  return (
    <div style={colourStyle}>
      <div className={`fixed bottom-5 ${sideClass} z-[70] flex items-center gap-2`}>
        {config.launcherLabel && !open && (
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg sm:block">
            {config.launcherLabel}
          </span>
        )}
        <button
          type="button"
          onClick={open ? closeWidget : openWidget}
          aria-label={open ? 'Close Help Centre assistant' : 'Open Help Centre assistant'}
          style={{ width: config.launcherSize, height: config.launcherSize, backgroundColor: config.primaryColor }}
          className="relative flex items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          {open ? <ChevronDown className="h-6 w-6" /> : config.logoUrl ? <img src={config.logoUrl} alt="" className="h-8 w-8 rounded-full object-contain" /> : <Bot className="h-6 w-6" />}
          {!open && <span className="absolute -left-1 -top-1 rounded-full bg-white p-1 shadow" style={{ color: config.primaryColor }}><Sparkles className="h-3 w-3" /></span>}
        </button>
      </div>

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={`${config.assistantName} chat`}
          style={{
            width: `min(calc(100vw - 1.5rem), ${config.panelWidth}px)`,
            height: `min(calc(100dvh - 6rem), ${config.panelHeight}px)`,
            borderRadius: config.borderRadius,
          }}
          className={`fixed inset-x-3 bottom-20 z-[69] flex flex-col overflow-hidden border border-slate-200 bg-white text-slate-950 shadow-2xl [color-scheme:light] sm:left-auto ${panelSideClass}`}
        >
          <header style={{ backgroundColor: config.primaryColor }} className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              {mode !== 'chat' && <button type="button" onClick={() => setMode('chat')} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Back to conversation"><ArrowLeft className="h-4 w-4" /></button>}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15">
                {config.avatarUrl ? <img src={config.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Bot className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{mode === 'enquiry' ? 'Contact Enquiry' : mode === 'sent' ? 'Enquiry received' : config.assistantName}</p>
                <p className="truncate text-[11px] text-white/80">{mode === 'chat' ? 'AI-assisted Help Centre' : `Team replies ${config.responseTime}`}</p>
              </div>
            </div>
            <button type="button" onClick={closeWidget} aria-label="Close assistant" className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </header>

          {mode === 'chat' && (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
                {messages.map(message => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[88%]">
                      <div
                        style={message.role === 'user' ? { backgroundColor: config.primaryColor } : undefined}
                        className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'rounded-br-md text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`}
                      >
                        {message.text}
                      </div>
                      {message.article && (
                        <a href={message.article.href || '/help-centre'} className="mt-2 block rounded-xl border p-3 text-left transition hover:brightness-95" style={{ borderColor: config.accentColor, backgroundColor: config.accentColor }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: config.primaryColor }}>Help Centre · {message.article.category}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{message.article.title}</p>
                              <p className="mt-1 text-xs text-slate-600">{message.article.summary}</p>
                            </div>
                            <ExternalLink className="mt-1 h-4 w-4 shrink-0" style={{ color: config.primaryColor }} />
                          </div>
                        </a>
                      )}
                      {!!message.suggestions?.length && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.suggestions.map(suggestion => (
                            <button
                              key={`${message.id}-${suggestion}`}
                              type="button"
                              onClick={() => void sendMessage(suggestion)}
                              className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50"
                              style={{ borderColor: config.accentColor, color: config.primaryColor }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {thinking && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" style={{ color: config.primaryColor }} />{thinkingLabel}</div></div>}
                {pendingEscalation && (
                  <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm" role="group" aria-labelledby="support-pin-title">
                    <p id="support-pin-title" className="text-sm font-bold text-slate-950">Verify your identity before human support</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">Enter your six-digit Planyx Support PIN from <a href="/settings?tab=security" className="font-semibold underline" target="_blank" rel="noreferrer">Settings → Security</a>. Your name and email are taken from your signed-in account only at this handover stage.</p>
                    <label htmlFor="chat-support-pin" className="mt-3 block text-xs font-semibold text-slate-800">Support PIN</label>
                    <div className="mt-1 flex gap-2">
                      <Input id="chat-support-pin" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={supportPin} onChange={event => setSupportPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-10 bg-white font-mono text-lg tracking-[0.3em] text-slate-950" />
                      <Button type="button" onClick={() => void verifySupportPin()} disabled={pinVerifying || supportPin.length !== 6} style={{ backgroundColor: config.primaryColor }} className="text-white">{pinVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}</Button>
                    </div>
                    {pinError && <p role="alert" className="mt-2 text-xs text-red-700">{pinError}</p>}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <footer className="shrink-0 border-t border-slate-200 bg-white p-3">
                {chatError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{chatError}</p>}
                <div className="flex items-end gap-2">
                  <Input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void sendMessage(); } }} placeholder={config.inputPlaceholder} className="h-10 flex-1 border-slate-300 bg-white text-sm text-slate-900" />
                  <Button type="button" onClick={() => void sendMessage()} disabled={thinking || !input.trim()} style={{ backgroundColor: config.primaryColor }} className="h-10 w-10 shrink-0 p-0 text-white"><Send className="h-4 w-4" /></Button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{config.showPoweredBy ? 'Powered by Planyx Help Centre' : 'AI answers may be checked before acting.'}</span>
                  {config.escalationEnabled && <button type="button" onClick={() => startEnquiry()} className="font-semibold hover:underline" style={{ color: config.primaryColor }}>Contact the team</button>}
                </div>
              </footer>
            </>
          )}

          {mode === 'enquiry' && (
            <div className="flex-1 overflow-y-auto bg-white px-4 py-4">
              <div className="mb-4 rounded-xl border p-3" style={{ borderColor: config.accentColor, backgroundColor: config.accentColor }}>
                <div className="flex gap-2"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" style={{ color: config.primaryColor }} /><div><p className="text-sm font-semibold text-slate-950">Now add your contact details</p><p className="mt-1 text-xs text-slate-700">These details are requested only because you have chosen to send the conversation to the Planyx Support Team.</p></div></div>
              </div>
              <div className="space-y-3">
                {([['name', 'Name', 'text'], ['email', 'Email address', 'email'], ['telephone', 'Telephone (optional)', 'tel'], ['subject', `Subject (${form.subject.trim().length}/180)`, 'text']] as const).map(([key, label, type]) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-semibold text-slate-800">{label}</label>
                    <Input type={type} value={String(form[key])} disabled={key === 'email' && Boolean(user?.email)} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="border-slate-300 bg-white text-slate-900" />
                    {fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}
                  </div>
                ))}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-800">Message ({form.message.trim().length}/6000)</label>
                  <Textarea value={form.message} rows={6} maxLength={6000} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} className="min-h-[130px] border-slate-300 bg-white text-slate-900" />
                  {fieldErrors.message && <p className="mt-1 text-xs text-red-600">{fieldErrors.message}</p>}
                </div>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="checkbox" checked={form.consent} onChange={event => setForm(current => ({ ...current, consent: event.target.checked }))} className="mt-0.5 h-4 w-4" />
                  <span className="text-xs text-slate-700">I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline">Terms of Service</a> and have read the <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold underline">Privacy Notice</a>.</span>
                </label>
                {fieldErrors.consent && <p className="text-xs text-red-600">{fieldErrors.consent}</p>}
                {submitError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
                <Button type="button" onClick={() => void submitEnquiry()} disabled={submitting} style={{ backgroundColor: config.primaryColor }} className="w-full text-white">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{submitting ? 'Sending enquiry…' : 'Send enquiry'}</Button>
              </div>
            </div>
          )}

          {mode === 'sent' && (
            <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-8 w-8 text-green-600" /></span>
              <h2 className="mt-4 text-lg font-bold">Enquiry received</h2>
              <p className="mt-2 text-sm text-slate-600">Your conversation has been submitted to the Planyx Support Team.</p>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase text-slate-500">Reference</p><p className="mt-1 font-mono text-sm font-bold">{reference}</p></div>
              <p className="mt-3 text-xs text-slate-500">The team normally replies {config.responseTime}.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={downloadTranscript}><Download className="mr-2 h-4 w-4" />Download transcript</Button>
                <Button type="button" size="sm" variant="outline" onClick={printTranscript}><Printer className="mr-2 h-4 w-4" />Print transcript</Button>
                <Button type="button" size="sm" onClick={restart}>Start another conversation</Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
