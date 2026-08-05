import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Bot, CheckCircle2, ChevronDown, Download, ExternalLink, LifeBuoy, Loader2, Printer, Send, Sparkles, Wrench, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface AssistantConfig {
  enabled: boolean;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  maintenanceAllowEnquiries: boolean;
  allowAnonymous: boolean;
  selfHelpEnabled: boolean;
  escalationEnabled: boolean;
  assistantName: string;
  logoUrl: string;
  avatarUrl: string;
  fontFamily: string;
  welcomeMessage: string;
  responseTime: string;
  maxSelfHelpTurns: number;
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

interface ArticleLink { id: string; title: string; category: string; summary: string; href: string; }
interface ChatMessage { id: string; role: 'assistant' | 'user'; text: string; article?: ArticleLink; suggestions?: string[]; }
interface AssistantReply { success: boolean; error?: string; reply?: string; suggestions?: string[]; article?: ArticleLink; category?: string; suggestedSubject?: string; priority?: string; escalate?: boolean; maintenance?: boolean; }
interface EnquiryForm { name: string; email: string; telephone: string; subject: string; message: string; category: string; consent: boolean; }

const DEFAULT_CONFIG: AssistantConfig = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The Help Centre assistant is temporarily unavailable while maintenance is completed. Please return after the maintenance window.',
  maintenanceStart: '',
  maintenanceEnd: '',
  maintenanceAllowEnquiries: false,
  allowAnonymous: true,
  selfHelpEnabled: true,
  escalationEnabled: true,
  assistantName: 'Sousa Murray Planeia Support Assistant',
  logoUrl: '',
  avatarUrl: '',
  fontFamily: 'inherit',
  welcomeMessage: 'Hello! I can help you find an answer in the Sousa Murray Planeia Help Centre. What do you need help with?',
  responseTime: 'within 2 working days',
  maxSelfHelpTurns: 3,
  position: 'bottom-right',
  primaryColor: '#2563eb',
  accentColor: '#dbeafe',
  panelWidth: 430,
  panelHeight: 680,
  borderRadius: 18,
  launcherSize: 56,
  launcherLabel: 'Help',
  inputPlaceholder: 'Ask a Help Centre question…',
  showPoweredBy: true,
  autoOpenDelaySeconds: 0,
};

const STARTER_SUGGESTIONS = ['Account or sign-in', 'Billing or subscription', 'Builders or saved plans', 'Privacy or data', 'Technical problem'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatMaintenanceWindow(start: string, end: string) {
  const format = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const from = format(start);
  const until = format(end);
  if (from && until) return `Scheduled maintenance: ${from} to ${until} (your local time).`;
  if (from) return `Scheduled maintenance begins: ${from} (your local time).`;
  if (until) return `Maintenance is scheduled to finish: ${until} (your local time).`;
  return '';
}

function id(prefix: string) {
  try { return `${prefix}-${crypto.randomUUID()}`; }
  catch { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function looksLikePersonName(value: string) {
  const candidate = value.trim().replace(/\s+/g, ' ');
  const words = candidate.split(' ').filter(Boolean);
  if (candidate.length < 2 || candidate.length > 100 || words.length > 6) return false;
  if (!/^[\p{L}\p{M}'’. -]+$/u.test(candidate) || /[?!@:/\\]/.test(candidate)) return false;
  if (/^(?:i|we)\s+(?:want|need|would|have|am|cannot|can't|would like)\b/i.test(candidate)) return false;
  if (/^(?:can|could|would|will|do|does|is|are|where|what|when|why|how)\s+(?:i|you|we|the|my|your)\b/i.test(candidate)) return false;
  if (/^(?:show|tell|help|take|find|open|book|plan|search)\s+(?:me|us|a|an|the|my)\b/i.test(candidate)) return false;
  return true;
}

function issueOnlyHistory(messages: ChatMessage[]) {
  let boundary = -1;
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && /now, please tell me what you need help with/i.test(message.text)) boundary = index;
  });
  return (boundary >= 0 ? messages.slice(boundary + 1) : messages).slice(-20);
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email: string } | null | undefined) {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
}

export default function ManagedAIHelpChatbot() {
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
  const [form, setForm] = useState<EnquiryForm>({ name: '', email: '', telephone: '', subject: '', message: '', category: 'Technical Support', consent: false });
  const [intakeStep, setIntakeStep] = useState<'name' | 'email' | 'telephone' | 'issue'>('name');
  const [supportPin, setSupportPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pendingEscalation, setPendingEscalation] = useState<{ reply: AssistantReply; conversation: ChatMessage[] } | null>(null);
  const sessionIdRef = useRef(id('support-session'));
  const openedAtRef = useRef(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hiddenForPortal = typeof window !== 'undefined' && (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/reseller'));
  const history = useMemo(() => messages.map(message => ({ role: message.role, content: message.text })), [messages]);

  useEffect(() => {
    let active = true;
    fetch('/api/support-assistant', { credentials: 'include' })
      .then(response => response.json())
      .then((data: { success?: boolean; config?: Partial<AssistantConfig> }) => {
        if (active && data.success && data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
      })
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    setForm(current => ({ ...current, name: current.name || displayName(user), email: current.email || user.email }));
  }, [user]);

  useEffect(() => {
    if (!config.maintenanceEnabled) return;
    setMode('chat');
    setMessages([]);
    setInput('');
    setThinking(false);
    setChatError('');
    setSubmitError('');
    setSubmitting(false);
  }, [config.maintenanceEnabled]);

  useEffect(() => {
    if (ready && open && !config.maintenanceEnabled && messages.length === 0) initialiseConversation();
  }, [ready, open, config.maintenanceEnabled, messages.length]);

  useEffect(() => {
    if (!ready || !config.enabled || config.autoOpenDelaySeconds <= 0 || hiddenForPortal) return;
    const timer = window.setTimeout(() => openWidget(), config.autoOpenDelaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [ready, config.enabled, config.autoOpenDelaySeconds, hiddenForPortal]);

  useEffect(() => {
    if (!open || config.maintenanceEnabled) return;
    const timer = window.setInterval(() => void sendEvent('heartbeat'), 60_000);
    return () => window.clearInterval(timer);
  }, [open, config.maintenanceEnabled]);

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open, mode, thinking]);
  useEffect(() => { if (open && mode === 'chat' && !config.maintenanceEnabled) window.setTimeout(() => inputRef.current?.focus(), 100); }, [open, mode, config.maintenanceEnabled]);

  function sendEvent(event: 'open' | 'heartbeat' | 'close') {
    if (config.maintenanceEnabled) return Promise.resolve(undefined);
    return fetch('/api/support-assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', keepalive: true,
      body: JSON.stringify({ event, sessionId: sessionIdRef.current, email: user?.email || '', pagePath: window.location.pathname }),
    }).catch(() => undefined);
  }

  function initialiseConversation() {
    if (config.maintenanceEnabled || messages.length) return;
    setMessages([{ id: id('assistant'), role: 'assistant', text: `${config.welcomeMessage}\n\nBefore we look at the issue, what is your full name?`, suggestions: [] }]);
  }

  function openWidget() {
    setOpen(true);
    setMode('chat');
    setChatError('');
    if (config.maintenanceEnabled) return;
    openedAtRef.current = Date.now();
    initialiseConversation();
    void sendEvent('open');
  }

  function closeWidget() { setOpen(false); void sendEvent('close'); }

  function appendAssistant(text: string, options: Partial<ChatMessage> = {}) {
    setMessages(current => [...current, { id: id('assistant'), role: 'assistant', text, article: options.article, suggestions: options.suggestions }]);
  }

  function startEnquiry(subject = suggestedSubject, category = suggestedCategory) {
    if (config.maintenanceEnabled) return;
    const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')?.text ?? '';
    setForm(current => ({ ...current, name: current.name || displayName(user), email: current.email || user?.email || '', subject: current.subject || subject || 'Help with Sousa Murray Planeia', message: current.message || lastUserMessage, category: category || 'Technical Support' }));
    setFieldErrors({}); setSubmitError(''); setMode('enquiry');
  }

  async function submitAutomaticEscalation(reply: AssistantReply, conversation: ChatMessage[]) {
    const name = form.name.trim() || displayName(user);
    const email = user?.email?.trim() || form.email.trim() || '';
    const subject = reply.suggestedSubject || suggestedSubject || 'Help with Sousa Murray Planeia';
    const category = reply.category || suggestedCategory || 'Technical Support';

    if (!email || !name) {
      setForm(current => ({ ...current, subject, category, message: [...conversation].reverse().find(message => message.role === 'user')?.text || '' }));
      setFieldErrors({});
      setSubmitError('');
      setMode('enquiry');
      return;
    }

    setSubmitting(true);
    setChatError('');
    try {
      const transcript = conversation
        .map(message => `${message.role === 'assistant' ? config.assistantName : 'Customer'}: ${message.text}`)
        .join('\n\n');
      const metadata = [
        '--- Structured AI escalation ---',
        `Account type: Signed-in customer`,
        `Category: ${category}`,
        `Priority: ${reply.priority || 'Normal'}`,
        `Page: ${window.location.pathname}`,
        `Session: ${sessionIdRef.current}`,
        'Troubleshooting and triage transcript:',
        transcript,
      ].join('\n');

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
          message: metadata.slice(0, 20000),
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
      const data = await response.json().catch(() => ({})) as { success?: boolean; reference?: string; error?: string; errors?: string[] };
      if (!response.ok || !data.success || !data.reference) {
        throw new Error(data.error || data.errors?.[0] || 'The issue could not be escalated.');
      }
      setReference(data.reference);
      setMode('sent');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The issue could not be escalated.';
      setChatError(message);
      appendAssistant(`I could not send the escalation automatically: ${message}`, { suggestions: ['Create an enquiry'] });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifySupportPin() {
    if (!pendingEscalation || !/^\d{6}$/.test(supportPin)) {
      setPinError('Enter the six-digit Support PIN shown in Settings → Security.');
      return;
    }
    setPinVerifying(true); setPinError('');
    try {
      const response = await fetch('/api/support-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ event: 'verify_support_pin', pin: supportPin }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      setSupportPin('');
      if (!response.ok || !data.success) throw new Error(data.error || 'The Support PIN could not be verified.');
      const escalation = pendingEscalation;
      setPendingEscalation(null);
      appendAssistant('Thank you — your identity has been verified. I’m sending your enquiry to the Support Team now.');
      await submitAutomaticEscalation(escalation.reply, escalation.conversation);
    } catch (reason) {
      setPinError(reason instanceof Error ? reason.message : 'The Support PIN could not be verified.');
    } finally { setPinVerifying(false); }
  }

  async function sendMessage(raw = input) {
    const value = raw.trim();
    if (!value || thinking) return;
    if (config.maintenanceEnabled) return;

    if (intakeStep !== 'issue') {
      const intakeMessage: ChatMessage = { id: id('user'), role: 'user', text: value };
      setMessages(current => [...current, intakeMessage]);
      setInput('');
      if (intakeStep === 'name') {
        if (!looksLikePersonName(value)) {
          appendAssistant('That looks like a question or request rather than a name. I can help with it, but first please tell me the full name you would like the support team to use.');
          return;
        }
        setForm(current => ({ ...current, name: value.trim().replace(/\s+/g, ' '), email: user?.email || current.email }));
        if (user?.email) {
          setIntakeStep('telephone');
          appendAssistant(`Thanks, ${value}. I’ve securely matched this conversation to your signed-in Sousa Murray Planeia account. What telephone number should the Support Team use if a call is necessary? You can type “skip”.`);
        } else {
          setIntakeStep('email');
          appendAssistant(`Thanks, ${value}. What email address should we use to contact you about this conversation?`);
        }
        return;
      }
      if (intakeStep === 'email') {
        if (!EMAIL_PATTERN.test(value)) {
          appendAssistant('That email address does not look quite right. Please check it and enter it again.');
          return;
        }
        setForm(current => ({ ...current, email: value.toLowerCase() }));
        setIntakeStep('telephone');
        appendAssistant('Thank you. What telephone number should the Support Team use if a call is necessary? You can type “skip” if you do not want to provide one.');
        return;
      }
      if (intakeStep === 'telephone') {
        const telephone = /^skip$/i.test(value) ? '' : value;
        if (telephone && !/^[+()0-9 .-]{7,30}$/.test(telephone)) {
          appendAssistant('Please enter a valid telephone number, or type “skip”.');
          return;
        }
        setForm(current => ({ ...current, telephone }));
        setIntakeStep('issue');
        appendAssistant('Perfect — I have your contact details. Now, please tell me what you need help with. I’ll ask relevant follow-up questions and check the Help Centre before escalating anything.');
        return;
      }
    }
    if (value === 'Create an enquiry') { startEnquiry(); return; }
    if (value === 'Open the Help Centre') { window.location.assign('/help-centre'); return; }
    if (value === 'Ask another question' || value === 'Try another question') { appendAssistant('Of course. What else can I help you with?', { suggestions: STARTER_SUGGESTIONS }); setInput(''); return; }
    const userMessage: ChatMessage = { id: id('user'), role: 'user', text: value };
    const next = [...messages, userMessage];
    const supportHistory = issueOnlyHistory(next);
    const lastAssistantText = [...messages].reverse().find(message => message.role === 'assistant')?.text || '';
    const answeringHandover = /Would you like me to send this conversation to the support team\?/i.test(lastAssistantText);
    const confirmingHandover = answeringHandover && /^(?:yes\b|please do\b|send\b|go ahead\b|contact\b|submit\b)/i.test(value);
    setThinkingLabel(confirmingHandover ? 'Sending your enquiry…' : answeringHandover ? 'Continuing the conversation…' : 'Searching the Help Centre…');
    setMessages(next); setInput(''); setThinking(true); setChatError('');
    try {
      const response = await fetch('/api/support-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: value, email: user?.email || '', pagePath: window.location.pathname, history: supportHistory.map(message => ({ role: message.role, content: message.text })) }),
      });
      const data = await response.json().catch(() => ({})) as AssistantReply;
      if (!response.ok || !data.success || !data.reply) throw new Error(data.error || 'The Help Centre assistant could not answer that question.');
      if (data.suggestedSubject) setSuggestedSubject(data.suggestedSubject);
      if (data.category) setSuggestedCategory(data.category);
      const assistantMessage: ChatMessage = { id: id('assistant'), role: 'assistant', text: data.reply, article: data.article, suggestions: data.escalate && user?.email ? [] : data.suggestions };
      setMessages(current => [...current, assistantMessage]);
      if (data.escalate) {
        const conversation = [...next, assistantMessage];
        if (user?.email) {
          setPendingEscalation({ reply: data, conversation });
          setSupportPin(''); setPinError('');
        } else {
          await submitAutomaticEscalation(data, conversation);
        }
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The Help Centre assistant could not answer that question.';
      setChatError(message);
      appendAssistant('I could not complete the self-help check. You can still send a Contact Enquiry.', { suggestions: config.escalationEnabled ? ['Create an enquiry', 'Try another question'] : ['Try another question'] });
    } finally { setThinking(false); }
  }

  function validateEnquiry() {
    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (form.subject.trim().length < 3) errors.subject = 'Enter a subject of at least 3 characters.';
    if (form.message.trim().length < 10) errors.message = 'Please give at least 10 characters of detail.';
    if (!form.consent) errors.consent = 'Confirm the Terms of Service and Privacy Notice.';
    setFieldErrors(errors); return Object.keys(errors).length === 0;
  }

  async function submitEnquiry() {
    setSubmitError('');
    if (!validateEnquiry()) return;
    setSubmitting(true);
    try {
      const transcript = history.map(message => `${message.role === 'assistant' ? config.assistantName : 'Visitor'}: ${message.content}`).join('\n\n');
      const response = await fetch('/api/support/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sessionId: sessionIdRef.current, name: form.name.trim(), email: user?.email || form.email.trim(), telephone: form.telephone.trim(), subject: form.subject.trim(), message: `${form.message.trim()}${transcript ? `\n\n--- AI Help Centre conversation ---\n${transcript}` : ''}`.slice(0, 20000), category: form.category, termsAccepted: true, privacyAccepted: true, marketingConsent: false, startedAt: openedAtRef.current, website: '', idempotencyKey: `${sessionIdRef.current}-${form.subject.trim().toLowerCase()}`.slice(0, 120) }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; reference?: string; error?: string; errors?: string[] };
      if (!response.ok || !data.success || !data.reference) throw new Error(data.error || data.errors?.[0] || 'The enquiry could not be sent.');
      setReference(data.reference); setMode('sent');
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : 'The enquiry could not be sent.'); }
    finally { setSubmitting(false); }
  }

  function transcriptText() {
    const lines = messages.map(message => `${message.role === 'assistant' ? config.assistantName : form.name || 'Visitor'}: ${message.text}`);
    return [
      'Sousa Murray Planeia Support Conversation',
      `Name: ${form.name || 'Not provided'}`,
      `Email: ${form.email || 'Not provided'}`,
      `Telephone: ${form.telephone || 'Not provided'}`,
      reference ? `Enquiry reference: ${reference}` : '',
      '',
      ...lines,
    ].filter(line => line !== '').join('\n\n');
  }

  function downloadTranscript() {
    const blob = new Blob([transcriptText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Sousa Murray Planeia-${reference || sessionIdRef.current}-transcript.txt`;
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
    const safe = transcriptText().replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] || character);
    popup.document.write(`<!doctype html><html lang="en-GB"><head><title>Sousa Murray Planeia support transcript</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#0f172a}pre{white-space:pre-wrap;line-height:1.55}h1{font-size:22px}@media print{button{display:none}}</style></head><body><h1>Sousa Murray Planeia support transcript</h1><pre>${safe}</pre><button onclick="window.print()">Print transcript</button></body></html>`);
    popup.document.close();
  }

  function restart() {
    sessionIdRef.current = id('support-session'); openedAtRef.current = Date.now(); setReference(''); setInput(''); setSuggestedSubject(''); setSuggestedCategory('Technical Support');
    setForm({ name: '', email: '', telephone: '', subject: '', message: '', category: 'Technical Support', consent: false });
    setIntakeStep('name');
    setMessages([{ id: id('assistant'), role: 'assistant', text: `${config.welcomeMessage}\n\nBefore we look at the issue, what is your full name?`, suggestions: [] }]); setMode('chat'); void sendEvent('open');
  }

  if (hiddenForPortal || !ready || !config.enabled) return null;
  const sideClass = config.position === 'bottom-left' ? 'left-5' : 'right-5';
  const panelSideClass = config.position === 'bottom-left' ? 'sm:left-5' : 'sm:right-5';
  const colourStyle = { '--chat-primary': config.primaryColor, '--chat-accent': config.accentColor, fontFamily: config.fontFamily } as CSSProperties;
  const maintenanceWindow = formatMaintenanceWindow(config.maintenanceStart, config.maintenanceEnd);

  return (
    <div style={colourStyle}>
      <div className={`fixed bottom-5 ${sideClass} z-[70] flex items-center gap-2`}>
        {config.launcherLabel && !open && <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg sm:block">{config.launcherLabel}</span>}
        <button type="button" onClick={open ? closeWidget : openWidget} aria-label={open ? 'Close Help Centre assistant' : 'Open Help Centre assistant'}
          style={{ width: config.launcherSize, height: config.launcherSize, backgroundColor: config.primaryColor }}
          className="relative flex items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-200">
          {open ? <ChevronDown className="h-6 w-6" /> : config.logoUrl ? <img src={config.logoUrl} alt="" className="h-8 w-8 rounded-full object-contain" /> : <Bot className="h-6 w-6" />}
          {!open && <span className="absolute -left-1 -top-1 rounded-full bg-white p-1 shadow" style={{ color: config.primaryColor }}><Sparkles className="h-3 w-3" /></span>}
        </button>
      </div>

      {open && (
        <section role="dialog" aria-modal="false" aria-label={`${config.assistantName} chat`}
          style={{ width: `min(calc(100vw - 1.5rem), ${config.panelWidth}px)`, height: `min(calc(100dvh - 6rem), ${config.panelHeight}px)`, borderRadius: config.borderRadius }}
          className={`fixed inset-x-3 bottom-20 z-[69] flex flex-col overflow-hidden border border-slate-200 bg-white text-slate-950 shadow-2xl [color-scheme:light] sm:left-auto ${panelSideClass}`}>
          <header style={{ backgroundColor: config.primaryColor }} className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              {!config.maintenanceEnabled && mode !== 'chat' && <button type="button" onClick={() => setMode('chat')} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Back to conversation"><ArrowLeft className="h-4 w-4" /></button>}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15">{config.maintenanceEnabled ? <Wrench className="h-5 w-5" /> : config.avatarUrl ? <img src={config.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Bot className="h-5 w-5" />}</span>
              <div className="min-w-0"><p className="truncate text-sm font-bold">{mode === 'enquiry' ? 'Contact Enquiry' : mode === 'sent' ? 'Enquiry received' : config.assistantName}</p><p className="truncate text-[11px] text-white/80">{config.maintenanceEnabled ? 'Maintenance mode' : `AI-assisted Help Centre · Team replies ${config.responseTime}`}</p></div>
            </div>
            <button type="button" onClick={closeWidget} aria-label="Close assistant" className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </header>
          {!config.maintenanceEnabled && maintenanceWindow && <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-950">{maintenanceWindow}</div>}

          {config.maintenanceEnabled && <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-8 text-center" role="status"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Wrench className="h-7 w-7" /></span><h2 className="mt-4 text-lg font-bold text-slate-950">Chat temporarily unavailable</h2><p className="mt-2 max-w-sm whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{config.maintenanceMessage}</p>{maintenanceWindow && <p className="mt-4 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">{maintenanceWindow}</p>}<p className="mt-4 text-xs text-slate-500">Conversations and enquiries are disabled until maintenance has ended.</p></div>}

          {!config.maintenanceEnabled && mode === 'chat' && <>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
              {messages.map(message => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className="max-w-[88%]">
                <div style={message.role === 'user' ? { backgroundColor: config.primaryColor } : undefined} className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'rounded-br-md text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`}>{message.text}</div>
                {message.article && <a href={message.article.href || '/help-centre'} className="mt-2 block rounded-xl border p-3 text-left transition hover:brightness-95" style={{ borderColor: config.accentColor, backgroundColor: config.accentColor }}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: config.primaryColor }}>Help Centre · {message.article.category}</p><p className="mt-1 text-sm font-semibold text-slate-900">{message.article.title}</p><p className="mt-1 text-xs text-slate-600">{message.article.summary}</p></div><ExternalLink className="mt-1 h-4 w-4 shrink-0" style={{ color: config.primaryColor }} /></div></a>}
                {!!message.suggestions?.length && <div className="mt-2 flex flex-wrap gap-2">{message.suggestions.map(suggestion => <button key={`${message.id}-${suggestion}`} type="button" onClick={() => void sendMessage(suggestion)} className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50" style={{ borderColor: config.accentColor, color: config.primaryColor }}>{suggestion}</button>)}</div>}
              </div></div>)}
              {thinking && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" style={{ color: config.primaryColor }} />{thinkingLabel}</div></div>}
              {pendingEscalation && <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm" role="group" aria-labelledby="support-pin-title"><p id="support-pin-title" className="text-sm font-bold text-slate-950">Verify your identity before human support</p><p className="mt-1 text-xs leading-relaxed text-slate-600">Enter your six-digit Sousa Murray Planeia Support PIN. You can see or generate it in <a href="/settings?tab=security" className="font-semibold underline" target="_blank" rel="noreferrer">Settings → Security</a>. It expires after 10 minutes and resets after it is used.</p><label htmlFor="chat-support-pin" className="mt-3 block text-xs font-semibold text-slate-800">Support PIN</label><div className="mt-1 flex gap-2"><Input id="chat-support-pin" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={supportPin} onChange={event => setSupportPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-10 bg-white font-mono text-lg tracking-[0.3em] text-slate-950" aria-describedby={pinError ? 'support-pin-error' : undefined} /><Button type="button" onClick={() => void verifySupportPin()} disabled={pinVerifying || supportPin.length !== 6} style={{ backgroundColor: config.primaryColor }} className="text-white">{pinVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}</Button></div>{pinError && <p id="support-pin-error" role="alert" className="mt-2 text-xs text-red-700">{pinError}</p>}<p className="mt-2 text-[11px] text-slate-500">Never give us your Microsoft sign-in code, password, card number or CVV. This prompt accepts only the Sousa Murray Planeia Support PIN.</p></div>}
              <div ref={bottomRef} />
            </div>
            {!config.maintenanceEnabled && <footer className="shrink-0 border-t border-slate-200 bg-white p-3">{chatError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{chatError}</p>}<div className="flex items-end gap-2"><Input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void sendMessage(); } }} placeholder={config.inputPlaceholder} className="h-10 flex-1 border-slate-300 bg-white text-sm text-slate-900" /><Button type="button" onClick={() => void sendMessage()} disabled={thinking || !input.trim()} style={{ backgroundColor: config.primaryColor }} className="h-10 w-10 shrink-0 p-0 text-white"><Send className="h-4 w-4" /></Button></div><div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>{config.showPoweredBy ? 'Powered by Sousa Murray Planeia Help Centre' : 'AI answers may be checked before acting.'}</span>{config.escalationEnabled && <button type="button" onClick={() => startEnquiry()} className="font-semibold hover:underline" style={{ color: config.primaryColor }}>Contact the team</button>}</div></footer>}
          </>}

          {!config.maintenanceEnabled && mode === 'enquiry' && <div className="flex-1 overflow-y-auto bg-white px-4 py-4"><div className="mb-4 rounded-xl border p-3" style={{ borderColor: config.accentColor, backgroundColor: config.accentColor }}><div className="flex gap-2"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" style={{ color: config.primaryColor }} /><div><p className="text-sm font-semibold text-slate-950">Send this to Contact Enquiries</p><p className="mt-1 text-xs text-slate-700">This creates a support case and reference for the Sousa Murray Planeia Support Team. Signed-out visitors can submit as well.</p></div></div></div><div className="space-y-3">
            {[['name','Name','text'],['email','Email address','email'],['telephone','Telephone','tel'],['subject',`Subject (${form.subject.trim().length}/180)`,'text']].map(([key,label,type]) => <div key={key}><label className="mb-1 block text-xs font-semibold text-slate-800">{label}</label><Input type={type} value={String(form[key as keyof EnquiryForm])} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="border-slate-300 bg-white text-slate-900" />{fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}</div>)}
            <div><label className="mb-1 block text-xs font-semibold text-slate-800">Message ({form.message.trim().length}/6000)</label><Textarea value={form.message} rows={6} maxLength={6000} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} className="min-h-[130px] border-slate-300 bg-white text-slate-900" />{fieldErrors.message && <p className="mt-1 text-xs text-red-600">{fieldErrors.message}</p>}</div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><input type="checkbox" checked={form.consent} onChange={event => setForm(current => ({ ...current, consent: event.target.checked }))} className="mt-0.5 h-4 w-4" /><span className="text-xs text-slate-700">I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline">Terms of Service</a> and have read the <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold underline">Privacy Notice</a>.</span></label>{fieldErrors.consent && <p className="text-xs text-red-600">{fieldErrors.consent}</p>}
            {submitError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
            <Button type="button" onClick={() => void submitEnquiry()} disabled={submitting} style={{ backgroundColor: config.primaryColor }} className="w-full text-white">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{submitting ? 'Sending enquiry…' : 'Send enquiry'}</Button>
          </div></div>}

          {!config.maintenanceEnabled && mode === 'sent' && <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-8 w-8 text-green-600" /></span><h2 className="mt-4 text-lg font-bold">Enquiry received</h2><p className="mt-2 text-sm text-slate-600">Your enquiry has been submitted to the Sousa Murray Planeia Support Team.</p><div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase text-slate-500">Reference</p><p className="mt-1 font-mono text-sm font-bold">{reference}</p></div><p className="mt-3 text-xs text-slate-500">The team normally replies {config.responseTime}.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button type="button" size="sm" variant="outline" onClick={downloadTranscript}><Download className="mr-2 h-4 w-4" />Download transcript</Button><Button type="button" size="sm" variant="outline" onClick={printTranscript}><Printer className="mr-2 h-4 w-4" />Print transcript</Button><Button type="button" size="sm" onClick={restart}>Start another conversation</Button></div></div>}
        </section>
      )}
    </div>
  );
}
