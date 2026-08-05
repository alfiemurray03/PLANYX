import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, CircleOff, Database,
  Eye, Loader2, MessageCircle, Paintbrush, Plus, RefreshCw, Save,
  Search, Settings2, ShieldCheck, Sparkles, Trash2, UserRound, Webhook, Wrench, Contact,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Article {
  id: string; category: string; title: string; summary: string; answer: string;
  keywords: string[]; steps: string[]; href: string;
}

interface ChatbotSettings {
  enabled: boolean; maintenanceEnabled: boolean; maintenanceMessage: string;
  maintenanceStart: string; maintenanceEnd: string; maintenanceAllowEnquiries: boolean;
  allowAnonymous: boolean; selfHelpEnabled: boolean; escalationEnabled: boolean;
  webhookDeliveryEnabled: boolean; debugEnabled: boolean; assistantName: string; welcomeMessage: string;
  logoUrl: string; avatarUrl: string; fontFamily: string;
  responseTime: string; maxSelfHelpTurns: number; provider: 'built_in' | 'workers_ai';
  model: string; tone: 'friendly' | 'professional' | 'concise'; escalationPrompt: string;
  position: 'bottom-right' | 'bottom-left'; primaryColor: string; accentColor: string;
  panelWidth: number; panelHeight: number; borderRadius: number; launcherSize: number;
  launcherLabel: string; inputPlaceholder: string; showPoweredBy: boolean;
  autoOpenDelaySeconds: number; knowledge: Article[];
  contactPageEnabled: boolean; contactEyebrow: string; contactTitle: string; contactIntroduction: string;
  contactAiTitle: string; contactAiDescription: string; contactSupportEmail: string;
  contactGeneralEmail: string; contactDpoEmail: string; contactPhoneDisplay: string;
  contactPhoneHref: string; contactRegisteredOffice: string; contactCompanyDetails: string;
  contactResponseStandard: string; contactResponseTechnical: string; contactResponseData: string;
  contactResponseNote: string; contactEmailEnabled: boolean; contactTelephoneEnabled: boolean;
  contactPageStatus: 'online' | 'maintenance' | 'offline';
  contactMaintenanceTitle: string; contactMaintenanceReason: string; contactMaintenanceMessage: string;
  contactMaintenanceStart: string; contactMaintenanceExpectedReturn: string; contactOfflineMessage: string;
}

interface Conversation {
  session_id: string; customer_email?: string; visitor_type: string; status: string;
  category?: string; provider?: string; model?: string; message_count: number;
  last_user_message?: string; last_assistant_message?: string; matched_article?: string;
  enquiry_reference?: string; page_path?: string; country?: string; user_agent?: string;
  started_at: string; last_activity: string; ended_at?: string;
}

interface TranscriptMessage {
  id: string; role: string; message: string; response_source?: string;
  matched_article?: string; escalated?: number; created_at: string;
}

interface ChatbotStats {
  total: number; active: number; escalated: number; resolved: number;
  abandoned: number; anonymous: number; authenticated: number; today: number; messages: number;
}

interface Diagnostics {
  database: boolean; workersAiBinding: boolean; provider: string; model: string;
  debugEnabled: boolean; maintenanceEnabled: boolean; webhookDeliveryEnabled?: boolean;
  webhooks?: Array<{ id: string; label: string; configured: boolean }>;
}

type Tab = 'overview' | 'behaviour' | 'design' | 'contact' | 'knowledge' | 'conversations' | 'integrations' | 'diagnostics';

const BASE_ARTICLES: Article[] = [
  {
    id: 'sign-in', category: 'Account & access', title: 'Sign-in and Microsoft account help',
    summary: 'Resolve common JA Group Services ID sign-in problems.',
    answer: 'Use Log In and complete Microsoft sign-in in the same browser. Close duplicate tabs and allow essential cookies before trying again.',
    keywords: ['login', 'sign in', 'microsoft', 'session', 'cookies'],
    steps: ['Close duplicate sign-in tabs.', 'Choose Log In.', 'Complete Microsoft sign-in in the same browser.'], href: '/help-centre',
  },
  {
    id: 'billing', category: 'Billing & subscriptions', title: 'Subscriptions, plans and invoices',
    summary: 'Understand plans, renewals and invoices.',
    answer: 'Open Settings and choose Billing to review your plan, renewal information and invoices.',
    keywords: ['billing', 'plan', 'invoice', 'stripe', 'payment'],
    steps: ['Open Settings.', 'Choose Billing.', 'Review your plan and invoices.'], href: '/help-centre',
  },
  {
    id: 'technical', category: 'Technical support', title: 'Website or builder not working',
    summary: 'Safe checks for loading, saving and preview problems.',
    answer: 'Refresh once, confirm you are signed in and retry in one browser tab. Create an enquiry if the same error continues.',
    keywords: ['error', 'not working', 'loading', 'save', 'preview'],
    steps: ['Refresh once.', 'Confirm sign-in.', 'Create an enquiry if it continues.'], href: '/help-centre',
  },
];

const DEFAULT_SETTINGS: ChatbotSettings = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The Help Centre assistant is temporarily unavailable while maintenance is completed. Please return after the maintenance window.',
  maintenanceStart: '',
  maintenanceEnd: '',
  maintenanceAllowEnquiries: false,
  allowAnonymous: true,
  selfHelpEnabled: true,
  escalationEnabled: true,
  webhookDeliveryEnabled: true,
  debugEnabled: false,
  assistantName: 'Sousa Murray Planeia Support Assistant',
  logoUrl: '',
  avatarUrl: '',
  fontFamily: 'inherit',
  welcomeMessage: 'Hello! I can help you find an answer in the Sousa Murray Planeia Help Centre. What do you need help with?',
  responseTime: 'within 2 working days',
  maxSelfHelpTurns: 3,
  provider: 'built_in',
  model: '',
  tone: 'friendly',
  escalationPrompt: 'I can send this to the Sousa Murray Planeia team as a Contact Enquiry.',
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
  knowledge: BASE_ARTICLES,
  contactPageEnabled: true,
  contactEyebrow: 'Sousa Murray Planeia intelligent support',
  contactTitle: 'How can we help?',
  contactIntroduction: 'Describe what you need and our AI-assisted contact box will organise your enquiry before you send it.',
  contactAiTitle: 'AI-assisted contact',
  contactAiDescription: 'Tell us what you need in plain English. Sousa Murray Planeia will organise the enquiry, suggest what information to include and prepare it for the correct support route.',
  contactSupportEmail: 'contact@jagroupservices.co.uk',
  contactGeneralEmail: 'hello@jagroupservices.co.uk',
  contactDpoEmail: 'dpo@jagroupservices.co.uk',
  contactPhoneDisplay: '020 3834 2790',
  contactPhoneHref: 'tel:+442038342790',
  contactRegisteredOffice: '167–169 Great Portland Street, 5th Floor, London, W1W 5PF',
  contactCompanyDetails: 'Company number 16314179 · ICO registration ZB877370',
  contactResponseStandard: 'Usually within 2 working days',
  contactResponseTechnical: 'Prioritised by impact',
  contactResponseData: 'Handled under applicable legal timescales',
  contactResponseNote: 'Times are estimates, not guaranteed service levels. Complex enquiries may take longer. Please avoid submitting the same enquiry more than once, as duplicates can delay handling.',
  contactEmailEnabled: true,
  contactTelephoneEnabled: true,
  contactPageStatus: 'online',
  contactMaintenanceTitle: 'Contact support is temporarily unavailable',
  contactMaintenanceReason: 'Contact service maintenance',
  contactMaintenanceMessage: 'We are carrying out essential work on the Sousa Murray Planeia contact service. Please check back shortly.',
  contactMaintenanceStart: '',
  contactMaintenanceExpectedReturn: '',
  contactOfflineMessage: 'The Contact Us page is currently offline. Please use the published contact details if your enquiry cannot wait.',
};

const EMPTY_STATS: ChatbotStats = {
  total: 0, active: 0, escalated: 0, resolved: 0, abandoned: 0,
  anonymous: 0, authenticated: 0, today: 0, messages: 0,
};

function bool(value: string | undefined, fallback: boolean) {
  return value === undefined ? fallback : value === 'true';
}

function parseKnowledge(value?: string): Article[] {
  try {
    const parsed = JSON.parse(value || '[]') as Article[];
    return Array.isArray(parsed) && parsed.length ? parsed : BASE_ARTICLES;
  } catch {
    return BASE_ARTICLES;
  }
}

function fromRecord(record: Record<string, string>): ChatbotSettings {
  return {
    enabled: bool(record.ai_chatbot_enabled, true),
    maintenanceEnabled: bool(record.ai_chatbot_maintenance_enabled, false),
    maintenanceMessage: record.ai_chatbot_maintenance_message || DEFAULT_SETTINGS.maintenanceMessage,
    maintenanceStart: record.ai_chatbot_maintenance_start || '',
    maintenanceEnd: record.ai_chatbot_maintenance_end || '',
    maintenanceAllowEnquiries: false,
    allowAnonymous: bool(record.ai_chatbot_allow_anonymous, true),
    selfHelpEnabled: bool(record.ai_chatbot_self_help_enabled, true),
    escalationEnabled: bool(record.ai_chatbot_escalation_enabled, true),
    webhookDeliveryEnabled: bool(record.ai_chatbot_webhook_delivery_enabled, true),
    debugEnabled: bool(record.ai_chatbot_debug_enabled, false),
    assistantName: record.ai_chatbot_name || DEFAULT_SETTINGS.assistantName,
    logoUrl: record.ai_chatbot_logo_url || '',
    avatarUrl: record.ai_chatbot_avatar_url || '',
    fontFamily: record.ai_chatbot_font_family || 'inherit',
    welcomeMessage: record.ai_chatbot_welcome_message || DEFAULT_SETTINGS.welcomeMessage,
    responseTime: record.ai_chatbot_response_time || DEFAULT_SETTINGS.responseTime,
    maxSelfHelpTurns: Number(record.ai_chatbot_max_self_help_turns || 3),
    provider: record.ai_chatbot_provider === 'workers_ai' ? 'workers_ai' : 'built_in',
    model: record.ai_chatbot_model || '',
    tone: ['friendly', 'professional', 'concise'].includes(record.ai_chatbot_tone)
      ? record.ai_chatbot_tone as ChatbotSettings['tone'] : 'friendly',
    escalationPrompt: record.ai_chatbot_escalation_prompt || DEFAULT_SETTINGS.escalationPrompt,
    position: record.ai_chatbot_position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    primaryColor: record.ai_chatbot_primary_color || '#2563eb',
    accentColor: record.ai_chatbot_accent_color || '#dbeafe',
    panelWidth: Number(record.ai_chatbot_panel_width || 430),
    panelHeight: Number(record.ai_chatbot_panel_height || 680),
    borderRadius: Number(record.ai_chatbot_border_radius || 18),
    launcherSize: Number(record.ai_chatbot_launcher_size || 56),
    launcherLabel: record.ai_chatbot_launcher_label || 'Help',
    inputPlaceholder: record.ai_chatbot_input_placeholder || DEFAULT_SETTINGS.inputPlaceholder,
    showPoweredBy: bool(record.ai_chatbot_show_powered_by, true),
    autoOpenDelaySeconds: Number(record.ai_chatbot_auto_open_delay_seconds || 0),
    knowledge: parseKnowledge(record.ai_chatbot_knowledge_json),
    contactPageEnabled: bool(record.contact_page_enabled, true),
    contactEyebrow: record.contact_page_eyebrow || DEFAULT_SETTINGS.contactEyebrow,
    contactTitle: record.contact_page_title || DEFAULT_SETTINGS.contactTitle,
    contactIntroduction: record.contact_page_introduction || DEFAULT_SETTINGS.contactIntroduction,
    contactAiTitle: record.contact_ai_title || DEFAULT_SETTINGS.contactAiTitle,
    contactAiDescription: record.contact_ai_description || DEFAULT_SETTINGS.contactAiDescription,
    contactSupportEmail: record.contact_support_email || DEFAULT_SETTINGS.contactSupportEmail,
    contactGeneralEmail: record.contact_general_email || DEFAULT_SETTINGS.contactGeneralEmail,
    contactDpoEmail: record.contact_dpo_email || DEFAULT_SETTINGS.contactDpoEmail,
    contactPhoneDisplay: record.contact_phone_display || DEFAULT_SETTINGS.contactPhoneDisplay,
    contactPhoneHref: record.contact_phone_href || DEFAULT_SETTINGS.contactPhoneHref,
    contactRegisteredOffice: record.contact_registered_office || DEFAULT_SETTINGS.contactRegisteredOffice,
    contactCompanyDetails: record.contact_company_details || DEFAULT_SETTINGS.contactCompanyDetails,
    contactResponseStandard: record.contact_response_standard || DEFAULT_SETTINGS.contactResponseStandard,
    contactResponseTechnical: record.contact_response_technical || DEFAULT_SETTINGS.contactResponseTechnical,
    contactResponseData: record.contact_response_data || DEFAULT_SETTINGS.contactResponseData,
    contactResponseNote: record.contact_response_note || DEFAULT_SETTINGS.contactResponseNote,
    contactEmailEnabled: bool(record.contact_email_enabled, true),
    contactTelephoneEnabled: bool(record.contact_telephone_enabled, true),
    contactPageStatus: ['online', 'maintenance', 'offline'].includes(record.contact_page_status)
      ? record.contact_page_status as ChatbotSettings['contactPageStatus']
      : 'online',
    contactMaintenanceTitle: record.contact_maintenance_title || DEFAULT_SETTINGS.contactMaintenanceTitle,
    contactMaintenanceReason: record.contact_maintenance_reason || DEFAULT_SETTINGS.contactMaintenanceReason,
    contactMaintenanceMessage: record.contact_maintenance_message || DEFAULT_SETTINGS.contactMaintenanceMessage,
    contactMaintenanceStart: record.contact_maintenance_start || '',
    contactMaintenanceExpectedReturn: record.contact_maintenance_expected_return || '',
    contactOfflineMessage: record.contact_offline_message || DEFAULT_SETTINGS.contactOfflineMessage,
  };
}

function toRecord(settings: ChatbotSettings): Record<string, string> {
  return {
    ai_chatbot_enabled: String(settings.enabled),
    ai_chatbot_maintenance_enabled: String(settings.maintenanceEnabled),
    ai_chatbot_maintenance_message: settings.maintenanceMessage,
    ai_chatbot_maintenance_start: settings.maintenanceStart,
    ai_chatbot_maintenance_end: settings.maintenanceEnd,
    ai_chatbot_maintenance_allow_enquiries: 'false',
    ai_chatbot_allow_anonymous: String(settings.allowAnonymous),
    ai_chatbot_self_help_enabled: String(settings.selfHelpEnabled),
    ai_chatbot_escalation_enabled: String(settings.escalationEnabled),
    ai_chatbot_webhook_delivery_enabled: String(settings.webhookDeliveryEnabled),
    ai_chatbot_debug_enabled: String(settings.debugEnabled),
    ai_chatbot_name: settings.assistantName,
    ai_chatbot_logo_url: settings.logoUrl,
    ai_chatbot_avatar_url: settings.avatarUrl,
    ai_chatbot_font_family: settings.fontFamily,
    ai_chatbot_welcome_message: settings.welcomeMessage,
    ai_chatbot_response_time: settings.responseTime,
    ai_chatbot_max_self_help_turns: String(settings.maxSelfHelpTurns),
    ai_chatbot_provider: settings.provider,
    ai_chatbot_model: settings.model,
    ai_chatbot_tone: settings.tone,
    ai_chatbot_escalation_prompt: settings.escalationPrompt,
    ai_chatbot_position: settings.position,
    ai_chatbot_primary_color: settings.primaryColor,
    ai_chatbot_accent_color: settings.accentColor,
    ai_chatbot_panel_width: String(settings.panelWidth),
    ai_chatbot_panel_height: String(settings.panelHeight),
    ai_chatbot_border_radius: String(settings.borderRadius),
    ai_chatbot_launcher_size: String(settings.launcherSize),
    ai_chatbot_launcher_label: settings.launcherLabel,
    ai_chatbot_input_placeholder: settings.inputPlaceholder,
    ai_chatbot_show_powered_by: String(settings.showPoweredBy),
    ai_chatbot_auto_open_delay_seconds: String(settings.autoOpenDelaySeconds),
    ai_chatbot_knowledge_json: JSON.stringify(settings.knowledge),
    contact_page_enabled: String(settings.contactPageEnabled),
    contact_page_eyebrow: settings.contactEyebrow,
    contact_page_title: settings.contactTitle,
    contact_page_introduction: settings.contactIntroduction,
    contact_ai_title: settings.contactAiTitle,
    contact_ai_description: settings.contactAiDescription,
    contact_support_email: settings.contactSupportEmail,
    contact_general_email: settings.contactGeneralEmail,
    contact_dpo_email: settings.contactDpoEmail,
    contact_phone_display: settings.contactPhoneDisplay,
    contact_phone_href: settings.contactPhoneHref,
    contact_registered_office: settings.contactRegisteredOffice,
    contact_company_details: settings.contactCompanyDetails,
    contact_response_standard: settings.contactResponseStandard,
    contact_response_technical: settings.contactResponseTechnical,
    contact_response_data: settings.contactResponseData,
    contact_response_note: settings.contactResponseNote,
    contact_email_enabled: String(settings.contactEmailEnabled),
    contact_telephone_enabled: String(settings.contactTelephoneEnabled),
    contact_page_status: settings.contactPageStatus,
    contact_maintenance_title: settings.contactMaintenanceTitle,
    contact_maintenance_reason: settings.contactMaintenanceReason,
    contact_maintenance_message: settings.contactMaintenanceMessage,
    contact_maintenance_start: settings.contactMaintenanceStart,
    contact_maintenance_expected_return: settings.contactMaintenanceExpectedReturn,
    contact_offline_message: settings.contactOfflineMessage,
  };
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (value: boolean) => void; label: string; description: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/40">
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: 'bg-green-100 text-green-800', escalated: 'bg-amber-100 text-amber-800',
    resolved: 'bg-blue-100 text-blue-800', completed: 'bg-blue-100 text-blue-800',
    abandoned: 'bg-slate-200 text-slate-700',
  };
  return <Badge className={classes[status] || 'bg-slate-100 text-slate-700'}>{status}</Badge>;
}

export default function AIChatbotControlCenter() {
  const [tab, setTab] = useState<Tab>('overview');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [selectedArticle, setSelectedArticle] = useState(0);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeCategory, setKnowledgeCategory] = useState('all');
  const [previewStage, setPreviewStage] = useState<'welcome' | 'self-help' | 'handover' | 'maintenance'>('welcome');
  const [testQuestion, setTestQuestion] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState('');

  const article = settings.knowledge[selectedArticle] || settings.knowledge[0];
  const knowledgeCategories = useMemo(() => Array.from(new Set(settings.knowledge.map(item => item.category).filter(Boolean))).sort(), [settings.knowledge]);
  const filteredKnowledge = useMemo(() => {
    const query = knowledgeSearch.trim().toLowerCase();
    return settings.knowledge.map((item, index) => ({ item, index })).filter(({ item }) => {
      const categoryMatches = knowledgeCategory === 'all' || item.category === knowledgeCategory;
      const searchMatches = !query || [item.title, item.category, item.summary, item.answer, ...item.keywords].join(' ').toLowerCase().includes(query);
      return categoryMatches && searchMatches;
    });
  }, [settings.knowledge, knowledgeSearch, knowledgeCategory]);
  const liveState = !settings.enabled ? 'Off' : settings.maintenanceEnabled ? 'Maintenance' : 'Live';

  function patch<K extends keyof ChatbotSettings>(key: K, value: ChatbotSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  function patchArticle<K extends keyof Article>(key: K, value: Article[K]) {
    setSettings(current => ({
      ...current,
      knowledge: current.knowledge.map((item, index) => index === selectedArticle ? { ...item, [key]: value } : item),
    }));
  }

  async function loadSettings() {
    setLoading(true); setError('');
    try {
      const [response, assistantResponse] = await Promise.all([
        fetch('/api/admin/site-settings', { credentials: 'include' }),
        fetch('/api/support-assistant', { credentials: 'include' }),
      ]);
      const data = await response.json() as { success?: boolean; settings?: Record<string, string>; error?: string };
      const assistantData = await assistantResponse.json().catch(() => ({})) as { articles?: Article[] };
      if (!response.ok || !data.success) throw new Error(data.error || 'Chatbot settings could not be loaded.');
      const loaded = fromRecord(data.settings || {});
      if (Array.isArray(assistantData.articles) && assistantData.articles.length) loaded.knowledge = assistantData.articles;
      setSettings(loaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chatbot settings could not be loaded.');
    } finally { setLoading(false); }
  }

  async function saveSettings() {
    setSaving(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/site-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: toRecord(settings) }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Chatbot settings could not be saved.');
      setNotice('Chatbot settings saved and published.');
      await loadMonitor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chatbot settings could not be saved.');
    } finally { setSaving(false); }
  }

  async function loadMonitor() {
    setMonitorLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, search, limit: '100' });
      const response = await fetch(`/api/admin/support-assistant?${params}`, { credentials: 'include' });
      const data = await response.json() as {
        success?: boolean; error?: string; conversations?: Conversation[];
        stats?: ChatbotStats; diagnostics?: Diagnostics;
      };
      if (!response.ok || !data.success) throw new Error(data.error || 'Conversation monitoring could not be loaded.');
      setConversations(data.conversations || []);
      setStats(data.stats || EMPTY_STATS);
      setDiagnostics(data.diagnostics || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Conversation monitoring could not be loaded.');
    } finally { setMonitorLoading(false); }
  }

  async function openConversation(item: Conversation) {
    setSelected(item); setMessages([]);
    try {
      const response = await fetch(`/api/admin/support-assistant/${encodeURIComponent(item.session_id)}`, { credentials: 'include' });
      const data = await response.json() as { success?: boolean; messages?: TranscriptMessage[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Transcript could not be loaded.');
      setMessages(data.messages || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Transcript could not be loaded.');
    }
  }

  async function changeConversation(item: Conversation, action: 'status' | 'delete', nextStatus = 'completed') {
    if (action === 'delete' && !window.confirm('Delete this chatbot conversation and transcript?')) return;
    const response = await fetch(`/api/admin/support-assistant/${encodeURIComponent(item.session_id)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(action === 'delete' ? { action: 'delete' } : { action: 'set_status', status: nextStatus }),
    });
    const data = await response.json() as { success?: boolean; error?: string };
    if (!response.ok || !data.success) { setError(data.error || 'Conversation could not be updated.'); return; }
    setSelected(null); setMessages([]); await loadMonitor();
  }

  async function purgeAbandoned() {
    if (!window.confirm('Delete abandoned conversations older than 30 days?')) return;
    const response = await fetch('/api/admin/support-assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'purge_abandoned', days: 30 }),
    });
    const data = await response.json() as { success?: boolean; deleted?: number; error?: string };
    if (!response.ok || !data.success) { setError(data.error || 'Old conversations could not be deleted.'); return; }
    setNotice(`${data.deleted || 0} old abandoned conversations deleted.`); await loadMonitor();
  }

  async function testWebhook(slot: string) {
    setTestingWebhook(slot); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/support-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'test_webhook', slot }),
      });
      const data = await response.json() as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Webhook test failed.');
      setNotice(data.message || 'Webhook test delivered.');
      await loadMonitor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Webhook test failed.');
    } finally { setTestingWebhook(''); }
  }

  async function runTest() {
    if (testQuestion.trim().length < 2) return;
    setTesting(true); setTestReply('');
    try {
      const response = await fetch('/api/support-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sessionId: `admin-test-${Date.now()}`, message: testQuestion, history: [], pagePath: '/admin/ai-chatbot' }),
      });
      const data = await response.json() as { success?: boolean; reply?: string; error?: string };
      setTestReply(data.success ? data.reply || 'No reply returned.' : data.error || 'Test failed.');
    } catch { setTestReply('The runtime test could not be completed.'); }
    finally { setTesting(false); }
  }

  useEffect(() => { void Promise.all([loadSettings(), loadMonitor()]); }, []);
  useEffect(() => {
    if (tab !== 'conversations') return;
    const timer = window.setInterval(() => void loadMonitor(), 15_000);
    return () => window.clearInterval(timer);
  }, [tab, statusFilter, search]);

  const nav = useMemo(() => [
    ['overview', 'Overview', Activity], ['behaviour', 'Behaviour', Settings2],
    ['design', 'Design', Paintbrush], ['contact', 'Contact page', Contact], ['knowledge', 'Knowledge', Sparkles],
    ['conversations', 'Conversations', MessageCircle], ['integrations', 'Integrations', Webhook], ['diagnostics', 'Diagnostics', Wrench],
  ] as const, []);

  const statCards = [
    ['Active now', stats.active, Activity], ['Today', stats.today, MessageCircle],
    ['Escalated', stats.escalated, AlertTriangle], ['Resolved', stats.resolved, CheckCircle2],
    ['Anonymous', stats.anonymous, UserRound], ['Messages', stats.messages, Bot],
  ] as const;

  return (
    <>
      <Helmet><title>AI Chatbot Control Centre — Admin Portal</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <AdminLayout title="AI Chatbot" subtitle="Manage the Sousa Murray Planeia support assistant">
        <div className="mx-auto max-w-[1800px] space-y-6 pb-20 lg:pb-0">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-semibold text-foreground">AI Chatbot Control</h1>
                    <Badge className={liveState === 'Live' ? 'border border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200' : liveState === 'Maintenance' ? 'border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}>{liveState}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">Manage the assistant, published content and customer conversations.</p>
                </div>
              </div>
              <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                <span className="text-sm text-muted-foreground">{saving ? 'Publishing changes…' : notice || 'Settings are ready to edit.'}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void Promise.all([loadSettings(), loadMonitor()])}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                  <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveSettings()} disabled={saving || loading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save settings</Button>
                </div>
              </div>
            </div>
            <nav aria-label="Chatbot settings sections" className="flex gap-1.5 overflow-x-auto bg-slate-100 p-2 dark:bg-slate-800/80">
              {nav.map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${tab === value ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:text-blue-300'}`}><Icon className="h-4 w-4" />{label}</button>)}
            </nav>
          </section>

          {notice && <Alert role="status" aria-live="polite" className="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
          {error && <Alert role="alert" aria-live="assertive" variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="rounded-2xl border border-border bg-muted/25 p-4 shadow-sm sm:p-5 [&_.bg-card]:bg-background [&_.rounded-xl]:rounded-xl">
          {loading ? <Card><CardContent className="flex h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card> : <>
            {tab === 'overview' && <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{statCards.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4"><Icon className="h-4 w-4 text-blue-600" /><p className="mt-3 text-2xl font-semibold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>)}</div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-base">Service state</CardTitle></CardHeader><CardContent className="space-y-3"><Toggle checked={settings.enabled} onChange={value => patch('enabled', value)} label="Chatbot enabled" description="Master switch for the public chatbot." /><Toggle checked={settings.maintenanceEnabled} onChange={value => patch('maintenanceEnabled', value)} label="Maintenance mode" description="Lock all chatbot conversations and enquiries and show only the maintenance notice." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Access</CardTitle></CardHeader><CardContent className="space-y-3"><Toggle checked={settings.allowAnonymous} onChange={value => patch('allowAnonymous', value)} label="Anonymous visitors" description="Allow signed-out visitors to use the chatbot and submit enquiries." /><Toggle checked={settings.escalationEnabled} onChange={value => patch('escalationEnabled', value)} label="Contact Enquiry escalation" description="Allow unresolved conversations to create an ENQ reference." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Provider</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span>Selected engine</span><strong>{settings.provider === 'workers_ai' ? 'Workers AI' : 'Built-in'}</strong></div><div className="flex justify-between"><span>AI binding</span><strong>{diagnostics?.workersAiBinding ? 'Connected' : 'Not connected'}</strong></div><div className="flex justify-between"><span>Knowledge articles</span><strong>{settings.knowledge.length}</strong></div><div className="flex justify-between"><span>Debug logging</span><strong>{settings.debugEnabled ? 'On' : 'Off'}</strong></div></CardContent></Card>
              </div>
            </div>}

            {tab === 'behaviour' && <div className="grid gap-5 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Availability and access</CardTitle></CardHeader><CardContent className="space-y-3"><Toggle checked={settings.enabled} onChange={value => patch('enabled', value)} label="Enable chatbot" description="Display and run the assistant on public and customer pages." /><Toggle checked={settings.maintenanceEnabled} onChange={value => patch('maintenanceEnabled', value)} label="Maintenance mode" description="Lock all conversations, message history, AI answers and enquiries. Visitors see only the maintenance notice and schedule." /><Toggle checked={settings.allowAnonymous} onChange={value => patch('allowAnonymous', value)} label="Allow anonymous visitors" description="No Microsoft sign-in is required for help or Contact Enquiries." /><Toggle checked={settings.selfHelpEnabled} onChange={value => patch('selfHelpEnabled', value)} label="Help Centre self-service" description="Search configured articles before escalation." /><Toggle checked={settings.escalationEnabled} onChange={value => patch('escalationEnabled', value)} label="Escalate to Contact Enquiries" description="Create ENQ references for unresolved requests." /><Toggle checked={settings.debugEnabled} onChange={value => patch('debugEnabled', value)} label="Debug logging" description="Log provider failures and detailed runtime diagnostics." /></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Messages and reasoning</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Assistant name</Label><Input value={settings.assistantName} onChange={event => patch('assistantName', event.target.value)} /></div><div><Label>Welcome message</Label><Textarea rows={4} value={settings.welcomeMessage} onChange={event => patch('welcomeMessage', event.target.value)} /></div><div><Label>Maintenance message</Label><Textarea rows={3} value={settings.maintenanceMessage} onChange={event => patch('maintenanceMessage', event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Scheduled start</Label><Input type="datetime-local" value={settings.maintenanceStart} onChange={event => patch('maintenanceStart', event.target.value)} /></div><div><Label>Scheduled end</Label><Input type="datetime-local" value={settings.maintenanceEnd} onChange={event => patch('maintenanceEnd', event.target.value)} /></div></div><Alert><CircleOff className="h-4 w-4" /><AlertDescription><strong>Customer contact is locked during maintenance.</strong> The chatbot input, enquiry escalation and direct submission API are unavailable until maintenance ends. Configured start and end times are shown to visitors in their local time.</AlertDescription></Alert><div><Label>Escalation message</Label><Textarea rows={3} value={settings.escalationPrompt} onChange={event => patch('escalationPrompt', event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Published response time</Label><Input value={settings.responseTime} onChange={event => patch('responseTime', event.target.value)} /></div><div><Label>Self-help attempts</Label><Input type="number" min={1} max={8} value={settings.maxSelfHelpTurns} onChange={event => patch('maxSelfHelpTurns', Number(event.target.value))} /></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Answer tone</Label><Select value={settings.tone} onValueChange={value => patch('tone', value as ChatbotSettings['tone'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="friendly">Friendly</SelectItem><SelectItem value="professional">Professional</SelectItem><SelectItem value="concise">Concise</SelectItem></SelectContent></Select></div><div><Label>Response engine</Label><Select value={settings.provider} onValueChange={value => patch('provider', value as ChatbotSettings['provider'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="built_in">Built-in Help Centre</SelectItem><SelectItem value="workers_ai">Cloudflare Workers AI</SelectItem></SelectContent></Select></div></div>{settings.provider === 'workers_ai' && <div><Label>Workers AI model</Label><Input value={settings.model} onChange={event => patch('model', event.target.value)} placeholder="@cf/meta/llama-3.1-8b-instruct" /></div>}</CardContent></Card>
            </div>}

            {tab === 'design' && <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
              <Card><CardHeader><CardTitle className="text-base">Widget appearance</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><div><Label>Primary colour</Label><div className="flex gap-2"><Input type="color" value={settings.primaryColor} onChange={event => patch('primaryColor', event.target.value)} className="w-14 p-1" /><Input value={settings.primaryColor} onChange={event => patch('primaryColor', event.target.value)} /></div></div><div><Label>Accent colour</Label><div className="flex gap-2"><Input type="color" value={settings.accentColor} onChange={event => patch('accentColor', event.target.value)} className="w-14 p-1" /><Input value={settings.accentColor} onChange={event => patch('accentColor', event.target.value)} /></div></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Screen position</Label><Select value={settings.position} onValueChange={value => patch('position', value as ChatbotSettings['position'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bottom-right">Bottom right</SelectItem><SelectItem value="bottom-left">Bottom left</SelectItem></SelectContent></Select></div><div><Label>Launcher label</Label><Input value={settings.launcherLabel} onChange={event => patch('launcherLabel', event.target.value)} /></div></div><div><Label>Input placeholder</Label><Input value={settings.inputPlaceholder} onChange={event => patch('inputPlaceholder', event.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Launcher logo URL</Label><Input value={settings.logoUrl} onChange={event => patch('logoUrl', event.target.value)} placeholder="/images/support-logo.svg or https://…" /></div><div><Label>Assistant avatar URL</Label><Input value={settings.avatarUrl} onChange={event => patch('avatarUrl', event.target.value)} placeholder="/images/assistant-avatar.png or https://…" /></div></div><div><Label>Chatbot font</Label><Select value={settings.fontFamily} onValueChange={value => patch('fontFamily', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Website default</SelectItem><SelectItem value="system-ui">System UI</SelectItem><SelectItem value="Segoe UI">Segoe UI</SelectItem><SelectItem value="Arial">Arial</SelectItem><SelectItem value="Helvetica">Helvetica</SelectItem><SelectItem value="Verdana">Verdana</SelectItem><SelectItem value="Tahoma">Tahoma</SelectItem><SelectItem value="Trebuchet MS">Trebuchet MS</SelectItem><SelectItem value="Calibri">Calibri</SelectItem><SelectItem value="Open Sans">Open Sans</SelectItem><SelectItem value="Roboto">Roboto</SelectItem><SelectItem value="Lato">Lato</SelectItem><SelectItem value="Poppins">Poppins</SelectItem><SelectItem value="Montserrat">Montserrat</SelectItem><SelectItem value="Nunito">Nunito</SelectItem><SelectItem value="Atkinson Hyperlegible">Atkinson Hyperlegible</SelectItem><SelectItem value="Georgia">Georgia</SelectItem><SelectItem value="Garamond">Garamond</SelectItem><SelectItem value="Cambria">Cambria</SelectItem><SelectItem value="Times New Roman">Times New Roman</SelectItem><SelectItem value="Courier New">Courier New</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div><Label>Panel width</Label><Input type="number" min={340} max={560} value={settings.panelWidth} onChange={event => patch('panelWidth', Number(event.target.value))} /></div><div><Label>Panel height</Label><Input type="number" min={480} max={820} value={settings.panelHeight} onChange={event => patch('panelHeight', Number(event.target.value))} /></div><div><Label>Corner radius</Label><Input type="number" min={0} max={32} value={settings.borderRadius} onChange={event => patch('borderRadius', Number(event.target.value))} /></div><div><Label>Button size</Label><Input type="number" min={44} max={72} value={settings.launcherSize} onChange={event => patch('launcherSize', Number(event.target.value))} /></div></div><div><Label>Auto-open delay in seconds</Label><Input type="number" min={0} max={120} value={settings.autoOpenDelaySeconds} onChange={event => patch('autoOpenDelaySeconds', Number(event.target.value))} /><p className="mt-1 text-xs text-muted-foreground">Use 0 to disable automatic opening.</p></div><Toggle checked={settings.showPoweredBy} onChange={value => patch('showPoweredBy', value)} label="Show service attribution" description="Show the Sousa Murray Planeia Help Centre attribution under the input." /></CardContent></Card>
              <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Current chatbot preview</CardTitle><p className="mt-1 text-xs text-muted-foreground">Uses the same branding, wording and conversation states as the customer widget.</p></div><Select value={previewStage} onValueChange={value => setPreviewStage(value as typeof previewStage)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="welcome">Welcome and intake</SelectItem><SelectItem value="self-help">Self-help answer</SelectItem><SelectItem value="handover">Support handover</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select></div></CardHeader><CardContent><div className="overflow-hidden border bg-white text-slate-950 shadow-xl" style={{ borderRadius: settings.borderRadius, fontFamily: settings.fontFamily }}><div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: settings.primaryColor }}><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/15">{previewStage === 'maintenance' ? <Wrench className="h-5 w-5" /> : settings.avatarUrl ? <img src={settings.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Bot className="h-5 w-5" />}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{settings.assistantName}</p><p className="truncate text-[11px] text-white/80">{previewStage === 'maintenance' ? 'Maintenance mode' : `AI-assisted Help Centre · Team replies ${settings.responseTime}`}</p></div></div>{previewStage === 'maintenance' && (settings.maintenanceStart || settings.maintenanceEnd) && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950">Scheduled maintenance: {settings.maintenanceStart || 'Not set'} to {settings.maintenanceEnd || 'Not set'}</div>}<div className="min-h-72 space-y-3 bg-slate-50 p-4">{previewStage === 'welcome' && <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm">{settings.welcomeMessage}{'\n\n'}Before we look at the issue, what is your full name?</div>}{previewStage === 'self-help' && <><div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-white" style={{ backgroundColor: settings.primaryColor }}>My builder will not save.</div><div className="max-w-[88%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm">Refresh the page once, confirm that you are still signed in and try again in one browser tab. Did this solve the problem?</div><div className="flex flex-wrap gap-2"><span className="rounded-full border bg-white px-3 py-1.5 text-xs" style={{ color: settings.primaryColor, borderColor: settings.accentColor }}>Yes, that solved it</span><span className="rounded-full border bg-white px-3 py-1.5 text-xs" style={{ color: settings.primaryColor, borderColor: settings.accentColor }}>No, I still need help</span></div></>}{previewStage === 'handover' && <><div className="max-w-[88%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm">Thanks — I’ve got the information the support team would need. Would you like me to send this conversation to the support team?</div><div className="flex flex-wrap gap-2"><span className="rounded-full border bg-white px-3 py-1.5 text-xs" style={{ color: settings.primaryColor, borderColor: settings.accentColor }}>Yes, send it to the support team</span><span className="rounded-full border bg-white px-3 py-1.5 text-xs" style={{ color: settings.primaryColor, borderColor: settings.accentColor }}>No, keep helping me</span></div></>}{previewStage === 'maintenance' && <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Wrench className="h-6 w-6" /></span><p className="mt-3 text-sm font-bold text-slate-950">Chat temporarily unavailable</p><p className="mt-2 max-w-sm whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{settings.maintenanceMessage}</p><p className="mt-3 text-[11px] text-slate-500">Conversations and enquiries are disabled until maintenance has ended.</p></div>}</div>{previewStage !== 'maintenance' && <div className="border-t border-slate-200 p-3"><div className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-400">{settings.inputPlaceholder}</div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{settings.showPoweredBy ? 'Powered by Sousa Murray Planeia Help Centre' : 'AI answers may be checked before acting.'}</span><span style={{ color: settings.primaryColor }}>Contact the team</span></div></div>}</div></CardContent></Card>
            </div>}

            {tab === 'contact' && <div className="space-y-5">
              <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>This is the single control area for the live Contact Us page: availability, maintenance, published content, contact channels and its AI-assisted enquiry box. Email and Teams delivery controls remain under Integrations so secret webhook addresses are never exposed.</AlertDescription></Alert>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><CardTitle className="text-base">Contact Us page status</CardTitle><p className="mt-1 text-xs text-muted-foreground">Control only <code>/contact</code>. The rest of Sousa Murray Planeia remains available.</p></div>
                    <Badge className={settings.contactPageStatus === 'online' ? 'border border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200' : settings.contactPageStatus === 'maintenance' ? 'border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}>{settings.contactPageStatus === 'online' ? 'Online' : settings.contactPageStatus === 'maintenance' ? 'Maintenance' : 'Offline'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    {([
                      ['online', 'Online', 'Show the Contact Us page and accept enquiries normally.'],
                      ['maintenance', 'Maintenance', 'Show the branded contact maintenance page and schedule.'],
                      ['offline', 'Offline', 'Take the Contact Us page and enquiry form out of public use.'],
                    ] as const).map(([value, label, description]) => {
                      const selected = settings.contactPageStatus === value;
                      return <button key={value} type="button" onClick={() => patch('contactPageStatus', value)}
                        className={`rounded-xl border p-4 text-left transition ${selected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/15 dark:bg-blue-950/30' : 'border-border bg-background hover:border-blue-300 dark:hover:border-blue-700'}`}>
                        <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-foreground">{label}</span><span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span></span>
                        <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{description}</span>
                      </button>;
                    })}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label>Maintenance page heading</Label><Input value={settings.contactMaintenanceTitle} onChange={event => patch('contactMaintenanceTitle', event.target.value)} /></div>
                    <div><Label>Reason for maintenance</Label><Input value={settings.contactMaintenanceReason} onChange={event => patch('contactMaintenanceReason', event.target.value)} /></div>
                    <div><Label>Maintenance started</Label><Input type="datetime-local" value={settings.contactMaintenanceStart.slice(0, 16)} onChange={event => patch('contactMaintenanceStart', event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Useful for customer updates and debugging.</p></div>
                    <div><Label>Expected return</Label><Input type="datetime-local" value={settings.contactMaintenanceExpectedReturn.slice(0, 16)} onChange={event => patch('contactMaintenanceExpectedReturn', event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Leave blank if no reliable estimate is available.</p></div>
                  </div>
                  <div><Label>Maintenance message</Label><Textarea rows={3} value={settings.contactMaintenanceMessage} onChange={event => patch('contactMaintenanceMessage', event.target.value)} /></div>
                  <div><Label>Offline message</Label><Textarea rows={3} value={settings.contactOfflineMessage} onChange={event => patch('contactOfflineMessage', event.target.value)} /></div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm"><a href="/maintenance/contact/?view=maintenance" target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Preview maintenance</a></Button>
                    <Button asChild variant="outline" size="sm"><a href="/maintenance/contact/?view=offline" target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Preview offline</a></Button>
                    <Button asChild variant="outline" size="sm"><a href="/contact" target="_blank" rel="noreferrer"><Contact className="mr-2 h-4 w-4" />Open Contact Us</a></Button>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"><strong>Route diagnostic:</strong> after saving, <code>/contact</code> will resolve as <strong>{settings.contactPageStatus}</strong>. Both previews use this same saved wording, and Admin Centre access remains available in every state.</div>
                </CardContent>
              </Card>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card><CardHeader><CardTitle className="text-base">Page availability and channels</CardTitle></CardHeader><CardContent className="space-y-3">
                  <Toggle checked={settings.contactPageEnabled} onChange={value => patch('contactPageEnabled', value)} label="Accept Contact Us enquiries" description="Switch the public enquiry form on or off without removing the contact-information page." />
                  <Toggle checked={settings.contactEmailEnabled} onChange={value => patch('contactEmailEnabled', value)} label="Show Sousa Murray Planeia support email" description="Display the support email card and full contact entry." />
                  <Toggle checked={settings.contactTelephoneEnabled} onChange={value => patch('contactTelephoneEnabled', value)} label="Show telephone contact" description="Display the JA Group Services switchboard and ticket-number calling guidance." />
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Page heading</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div><Label>Eyebrow</Label><Input value={settings.contactEyebrow} onChange={event => patch('contactEyebrow', event.target.value)} /></div>
                  <div><Label>Page title</Label><Input value={settings.contactTitle} onChange={event => patch('contactTitle', event.target.value)} /></div>
                  <div><Label>Introduction</Label><Textarea rows={3} value={settings.contactIntroduction} onChange={event => patch('contactIntroduction', event.target.value)} /></div>
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">AI-assisted contact box</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div><Label>Box title</Label><Input value={settings.contactAiTitle} onChange={event => patch('contactAiTitle', event.target.value)} /></div>
                  <div><Label>Description</Label><Textarea rows={4} value={settings.contactAiDescription} onChange={event => patch('contactAiDescription', event.target.value)} /></div>
                  <p className="text-xs text-muted-foreground">The enquiry classifier, ticket creation, Reply-To handling and secure submission validation remain enforced by the platform.</p>
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Contact information</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div><Label>Sousa Murray Planeia support email</Label><Input type="email" value={settings.contactSupportEmail} onChange={event => patch('contactSupportEmail', event.target.value)} /></div>
                  <div><Label>General company email</Label><Input type="email" value={settings.contactGeneralEmail} onChange={event => patch('contactGeneralEmail', event.target.value)} /></div>
                  <div><Label>Data Protection Officer email</Label><Input type="email" value={settings.contactDpoEmail} onChange={event => patch('contactDpoEmail', event.target.value)} /></div>
                  <div className="grid gap-3 sm:grid-cols-2"><div><Label>Telephone shown</Label><Input value={settings.contactPhoneDisplay} onChange={event => patch('contactPhoneDisplay', event.target.value)} /></div><div><Label>Telephone link</Label><Input value={settings.contactPhoneHref} onChange={event => patch('contactPhoneHref', event.target.value)} placeholder="tel:+4420…" /></div></div>
                  <div><Label>Registered office</Label><Textarea rows={2} value={settings.contactRegisteredOffice} onChange={event => patch('contactRegisteredOffice', event.target.value)} /></div>
                  <div><Label>Company details</Label><Input value={settings.contactCompanyDetails} onChange={event => patch('contactCompanyDetails', event.target.value)} /></div>
                </CardContent></Card>
                <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Published response information</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-3">
                  <div><Label>Online requests</Label><Input value={settings.contactResponseStandard} onChange={event => patch('contactResponseStandard', event.target.value)} /></div>
                  <div><Label>Account and technical issues</Label><Input value={settings.contactResponseTechnical} onChange={event => patch('contactResponseTechnical', event.target.value)} /></div>
                  <div><Label>Data protection requests</Label><Input value={settings.contactResponseData} onChange={event => patch('contactResponseData', event.target.value)} /></div>
                  <div className="lg:col-span-3"><Label>Response-times note</Label><Textarea rows={3} value={settings.contactResponseNote} onChange={event => patch('contactResponseNote', event.target.value)} /></div>
                </CardContent></Card>
              </div>
            </div>}

            {tab === 'knowledge' && <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
              <Card className="flex min-h-[520px] flex-col overflow-hidden lg:h-[calc(100vh-15rem)] lg:max-h-[760px]">
                <CardHeader className="shrink-0 space-y-3 border-b bg-background">
                  <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Help Centre articles</CardTitle><p className="mt-1 text-xs text-muted-foreground">{filteredKnowledge.length} of {settings.knowledge.length} articles</p></div><Button size="sm" variant="outline" onClick={() => { const next: Article = { id: `article-${Date.now()}`, category: 'General', title: 'New article', summary: '', answer: '', keywords: [], steps: [], href: '/help-centre' }; setSettings(current => ({ ...current, knowledge: [...current.knowledge, next] })); setSelectedArticle(settings.knowledge.length); setKnowledgeSearch(''); setKnowledgeCategory('all'); }}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></div>
                  <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={knowledgeSearch} onChange={event => setKnowledgeSearch(event.target.value)} placeholder="Search articles, answers or keywords" className="pl-9" /></div>
                  <Select value={knowledgeCategory} onValueChange={setKnowledgeCategory}><SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{knowledgeCategories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto p-2" role="list" aria-label="Help Centre articles">
                  <div className="space-y-1">{filteredKnowledge.map(({ item, index }) => <button key={item.id} type="button" role="listitem" onClick={() => setSelectedArticle(index)} className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${selectedArticle === index ? 'border-blue-500 bg-blue-50 text-blue-950 shadow-sm dark:bg-blue-950/40 dark:text-blue-100' : 'border-transparent hover:border-border hover:bg-muted'}`}><p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p><div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-muted-foreground">{item.category}</p><span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{index + 1}</span></div></button>)}</div>
                  {!filteredKnowledge.length && <div className="p-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No matching articles</p><p className="mt-1 text-xs text-muted-foreground">Change the search or category filter.</p></div>}
                </CardContent>
              </Card>
              {article && <Card className="flex min-h-[520px] flex-col overflow-hidden lg:h-[calc(100vh-15rem)] lg:max-h-[760px]">
                <CardHeader className="shrink-0 border-b bg-background"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><CardTitle className="text-base">Edit article</CardTitle><p className="mt-1 truncate text-xs text-muted-foreground">{article.category} · {article.id}</p></div><Button variant="destructive" size="sm" disabled={settings.knowledge.length <= 1} onClick={() => { setSettings(current => ({ ...current, knowledge: current.knowledge.filter((_, index) => index !== selectedArticle) })); setSelectedArticle(Math.max(0, selectedArticle - 1)); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div></CardHeader>
                <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Article ID</Label><Input value={article.id} onChange={event => patchArticle('id', event.target.value)} /></div><div><Label>Category</Label><Input value={article.category} onChange={event => patchArticle('category', event.target.value)} /></div></div><div><Label>Title</Label><Input value={article.title} onChange={event => patchArticle('title', event.target.value)} /></div><div><Label>Search-result summary</Label><Textarea rows={2} value={article.summary} onChange={event => patchArticle('summary', event.target.value)} /></div><div><Label>Approved self-help answer</Label><Textarea rows={5} value={article.answer} onChange={event => patchArticle('answer', event.target.value)} /></div><div><Label>Keywords, separated by commas</Label><Input value={article.keywords.join(', ')} onChange={event => patchArticle('keywords', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></div><div><Label>Steps, one per line</Label><Textarea rows={5} value={article.steps.join('\n')} onChange={event => patchArticle('steps', event.target.value.split('\n').map(value => value.trim()).filter(Boolean))} /></div><div><Label>Help Centre link</Label><Input value={article.href} onChange={event => patchArticle('href', event.target.value)} /></div></CardContent>
              </Card>}
            </div>}

            {tab === 'conversations' && <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{statCards.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4"><Icon className="h-4 w-4 text-blue-600" /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>)}</div>
              <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Conversation monitor</CardTitle><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Email, message, ENQ or session" className="w-64 pl-9" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="escalated">Escalated</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="abandoned">Abandoned</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => void loadMonitor()} disabled={monitorLoading}>{monitorLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh</Button><Button variant="outline" onClick={() => void purgeAbandoned()}><Trash2 className="mr-2 h-4 w-4" />Purge old</Button></div></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Visitor</th><th className="p-3">Status</th><th className="p-3">Last question</th><th className="p-3">Provider</th><th className="p-3">Activity</th><th className="p-3">Action</th></tr></thead><tbody>{conversations.map(item => <tr key={item.session_id} className="border-b last:border-0"><td className="p-3"><p className="font-medium text-foreground">{item.customer_email || 'Anonymous visitor'}</p><p className="text-xs text-muted-foreground">{item.country || '—'} · {item.page_path || '/'}</p></td><td className="p-3"><StatusBadge status={item.status} />{item.enquiry_reference && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.enquiry_reference}</p>}</td><td className="max-w-md p-3"><p className="line-clamp-2">{item.last_user_message || 'Conversation opened'}</p><p className="mt-1 text-xs text-muted-foreground">{item.message_count || 0} messages</p></td><td className="p-3">{item.provider || 'built-in'}</td><td className="p-3 text-xs">{new Date(item.last_activity).toLocaleString('en-GB')}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => void openConversation(item)}><Eye className="mr-1 h-3.5 w-3.5" />View</Button></td></tr>)}{!conversations.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No chatbot conversations match the current filters.</td></tr>}</tbody></table></div></CardContent></Card>
              {selected && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Conversation transcript</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{selected.session_id}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void changeConversation(selected, 'status', 'resolved')}>Mark resolved</Button><Button size="sm" variant="outline" onClick={() => void changeConversation(selected, 'status', 'completed')}>Complete</Button><Button size="sm" variant="destructive" onClick={() => void changeConversation(selected, 'delete')}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div></div></CardHeader><CardContent><div className="space-y-3">{messages.map(message => <div key={message.id} className={`rounded-xl border p-3 ${message.role === 'user' ? 'ml-8 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30' : 'mr-8 border-border bg-muted/40'}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide">{message.role}</p><p className="text-[10px] text-muted-foreground">{new Date(message.created_at).toLocaleString('en-GB')}</p></div><p className="mt-2 whitespace-pre-wrap text-sm">{message.message}</p>{message.response_source && <p className="mt-2 text-[10px] text-muted-foreground">Source: {message.response_source}{message.matched_article ? ` · Article: ${message.matched_article}` : ''}</p>}</div>)}{!messages.length && <p className="text-sm text-muted-foreground">No transcript messages are available.</p>}</div></CardContent></Card>}
            </div>}

            {tab === 'integrations' && <div className="space-y-5">
              <Card><CardHeader><CardTitle className="text-base">Support webhooks</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Webhook addresses are encrypted Cloudflare secrets. Their values are never returned to this page. Configure the primary Teams workflow as <code>TEAMS_SUPPORT_WEBHOOK_URL</code> and optional additional workflows as <code>SUPPORT_WEBHOOK_2_URL</code>, <code>SUPPORT_WEBHOOK_3_URL</code> and <code>SUPPORT_WEBHOOK_4_URL</code>.</p><div className="grid gap-3 lg:grid-cols-2">{(diagnostics?.webhooks || []).map(item => <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">Secret slot: {item.id}</p></div><Badge className={item.configured ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}>{item.configured ? 'Configured' : 'Not configured'}</Badge></div><Button className="mt-4" size="sm" variant="outline" disabled={!item.configured || testingWebhook === item.id} onClick={() => void testWebhook(item.id)}>{testingWebhook === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Webhook className="mr-2 h-4 w-4" />}Send test</Button></div>)}</div><Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>Only HTTPS Microsoft Power Platform workflow URLs are accepted. A failed webhook never prevents the customer’s enquiry from being stored.</AlertDescription></Alert></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Enquiry delivery controls</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2"><Toggle checked={settings.escalationEnabled} onChange={value => patch('escalationEnabled', value)} label="Human support enquiries" description="Allow the chatbot to create ENQ cases and send the normal support email." /><Toggle checked={settings.webhookDeliveryEnabled} onChange={value => patch('webhookDeliveryEnabled', value)} label="Teams and additional webhooks" description="When off, enquiries are still stored and emailed, but nothing is sent to Teams or any configured webhook." /><Toggle checked={settings.debugEnabled} onChange={value => patch('debugEnabled', value)} label="Webhook diagnostics" description="Record safe delivery failures and response status without logging secret URLs." /></CardContent></Card>
            </div>}

            {tab === 'diagnostics' && <div className="grid gap-5 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Runtime diagnostics</CardTitle></CardHeader><CardContent className="space-y-3">{[['Database monitoring', diagnostics?.database, Database], ['Workers AI binding', diagnostics?.workersAiBinding, Sparkles], ['Chatbot enabled', settings.enabled, Bot], ['Maintenance mode off', !settings.maintenanceEnabled, Wrench], ['Anonymous access', settings.allowAnonymous, ShieldCheck], ['Webhook delivery', settings.webhookDeliveryEnabled, Webhook], ['Debug logging', settings.debugEnabled, Activity]].map(([label, healthy, Icon]) => { const TypedIcon = Icon as typeof Activity; return <div key={String(label)} className="flex items-center justify-between rounded-lg border border-border p-3"><span className="flex items-center gap-2 text-sm"><TypedIcon className="h-4 w-4 text-muted-foreground" />{String(label)}</span>{healthy ? <Badge className="bg-green-100 text-green-800">Available</Badge> : <Badge className="bg-slate-200 text-slate-700">Unavailable / off</Badge>}</div>; })}<div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground"><p>Provider: <strong className="text-foreground">{diagnostics?.provider || settings.provider}</strong></p><p className="mt-1">Model: <strong className="text-foreground">{diagnostics?.model || settings.model || 'Not configured'}</strong></p></div></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Live runtime test</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Send a test question through the same production assistant endpoint used by visitors.</p><Textarea rows={4} value={testQuestion} onChange={event => setTestQuestion(event.target.value)} placeholder="For example: I cannot sign in with Microsoft" /><Button onClick={() => void runTest()} disabled={testing || testQuestion.trim().length < 2}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Run test</Button>{testReply && <div className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 text-sm">{testReply}</div>}<Alert><CircleOff className="h-4 w-4" /><AlertDescription>Tests are recorded as Admin test conversations so provider failures and answer quality can be audited.</AlertDescription></Alert></CardContent></Card>
            </div>}
          </>}
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
