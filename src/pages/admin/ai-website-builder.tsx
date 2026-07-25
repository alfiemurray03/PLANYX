import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertTriangle, Bot, CheckCircle2, ChevronRight, Code2, ExternalLink, FileCode2,
  FileJson2, FilePlus2, Files, Folder, History, Loader2, MessageSquare, PanelTop,
  RefreshCw, Rocket, Save, Send, Settings2, Trash2, Volume2, VolumeX, WandSparkles,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import AIWebsiteBuilderPreview, { type WebsiteBuilderOperation } from '@/components/AIWebsiteBuilderPreview';
import WebsiteBuilderSettingsPanel, { type WebsiteBuilderSettings } from '@/components/WebsiteBuilderSettingsPanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ManagedPage {
  id: string;
  path: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  html: string;
  css: string;
  seo_title: string;
  seo_description: string;
  noindex: number;
}

interface ManagedRule {
  id: string;
  path_pattern: string;
  operation: string;
  selector: string;
  value: string;
  attribute_name: string;
  status?: string;
  updated_at?: string;
}

interface ChangePlanData {
  summary: string;
  warnings?: string[];
  operations: WebsiteBuilderOperation[];
}

interface ChangePlan {
  id: string;
  prompt: string;
  target_path: string;
  status: string;
  created_at?: string;
  created_by?: string;
  published_at?: string;
  plan: ChangePlanData;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface StudioInventory {
  success: boolean;
  settings: WebsiteBuilderSettings;
  pages: ManagedPage[];
  rules: ManagedRule[];
  plans: ChangePlan[];
  diagnostics: { database: boolean; workersAi: boolean; model: string; serviceState: string };
  error?: string;
  correlationId?: string;
}

type WorkspaceTab = 'chat' | 'files' | 'code' | 'preview' | 'history' | 'settings';
type Busy = 'load' | 'chat' | 'publish' | 'save' | 'discard' | null;
type SelectedFile =
  | { type: 'global-css'; path: 'website/styles/global.css' }
  | { type: 'page-html'; path: string; pageId: string }
  | { type: 'page-css'; path: string; pageId: string }
  | { type: 'page-json'; path: string; pageId: string }
  | { type: 'rule-json'; path: string; ruleId: string }
  | { type: 'plan-json'; path: string; planId: string };

const DEFAULT_SETTINGS: WebsiteBuilderSettings = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The AI Website Builder is temporarily unavailable while maintenance is completed.',
  maintenanceStart: '', maintenanceEnd: '', readOnly: false, acknowledgementSound: true,
  previewEnabled: true, publishConfirmation: true, allowHtml: true, allowCss: true,
  allowCreatePages: true, allowDeletePages: true, allowExistingPageRules: true,
  maxHistory: 20, maxOperations: 30, model: '@cf/meta/llama-3.1-8b-instruct-fast',
  systemInstructions: '', globalCss: '',
};

async function api<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/website-studio', {
    method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; error?: string; correlationId?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(`${payload.error || 'The AI Website Studio could not complete the request.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
  }
  return payload;
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalisePath(path: string) {
  const trimmed = path.trim() || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fileSafePath(path: string) {
  return path.replace(/^\//, '').replaceAll('/', '_') || 'homepage';
}

export default function AdminAIWebsiteBuilderPage() {
  const initialSettingsView = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'settings';
  const [tab, setTab] = useState<WorkspaceTab>(initialSettingsView ? 'settings' : 'chat');
  const [inventory, setInventory] = useState<StudioInventory | null>(null);
  const [settings, setSettings] = useState<WebsiteBuilderSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState<Busy>('load');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [targetPath, setTargetPath] = useState('/');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hello Alfie. Tell me what you want to build or change. I will prepare it in the live draft preview, and nothing goes to production until you approve it.' },
  ]);
  const [conversationId, setConversationId] = useState('');
  const [activePlan, setActivePlan] = useState<ChangePlanData | null>(null);
  const [pageSnapshot, setPageSnapshot] = useState('');
  const [previewRefresh, setPreviewRefresh] = useState(0);
  const [selectedFile, setSelectedFile] = useState<SelectedFile>({ type: 'global-css', path: 'website/styles/global.css' });
  const [codeValue, setCodeValue] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundPreferenceLoaded, setSoundPreferenceLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy('load');
    setError('');
    try {
      const data = await api<StudioInventory>();
      setInventory(data);
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
      if (!soundPreferenceLoaded) {
        const stored = localStorage.getItem('planyx_builder_sound');
        setSoundEnabled(stored === null ? Boolean(data.settings?.acknowledgementSound) : stored === '1');
        setSoundPreferenceLoaded(true);
      }
      if (selectedFile.type === 'global-css') setCodeValue(data.settings?.globalCss || '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The Website Studio could not be loaded.'); }
    finally { if (!silent) setBusy(null); }
  }, [selectedFile.type, soundPreferenceLoaded]);

  useEffect(() => { void load(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);

  const draftOperations = activePlan?.operations || [];
  const previewPath = useMemo(() => {
    const managed = draftOperations.find(operation => ['create_page', 'update_page'].includes(operation.type) && operation.path);
    return normalisePath(managed?.path || targetPath);
  }, [draftOperations, targetPath]);

  const draftPlans = useMemo(() => inventory?.plans.filter(plan => plan.status === 'draft') || [], [inventory]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 4500);
  }

  function playAcknowledgement() {
    if (!soundEnabled || !settings.acknowledgementSound) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
      gain.connect(context.destination);
      [659.25, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.08);
        oscillator.connect(gain);
        oscillator.start(context.currentTime + index * 0.08);
        oscillator.stop(context.currentTime + 0.28 + index * 0.08);
      });
      window.setTimeout(() => void context.close(), 700);
    } catch {
      // Audio is an enhancement; browser restrictions must never block the builder.
    }
  }

  function toggleSound() {
    setSoundEnabled(current => {
      const next = !current;
      localStorage.setItem('planyx_builder_sound', next ? '1' : '0');
      return next;
    });
  }

  async function sendMessage() {
    const message = chatInput.trim();
    if (!message || busy) return;
    setBusy('chat'); setError(''); setChatInput('');
    setMessages(current => [...current, { role: 'user', content: message }]);
    try {
      const result = await api<{ success: boolean; conversationId: string; reply: string; plan: ChangePlanData; messages: ChatMessage[]; settings: WebsiteBuilderSettings }>({
        action: 'chat', message, targetPath: normalisePath(targetPath), conversationId: conversationId || undefined,
        currentPlan: activePlan || undefined, pageSnapshot,
      });
      setConversationId(result.conversationId);
      setActivePlan(result.plan);
      setMessages(result.messages?.length ? result.messages : current => [...current, { role: 'assistant', content: result.reply }]);
      setSettings(current => ({ ...current, ...(result.settings || {}) }));
      setPreviewRefresh(value => value + 1);
      playAcknowledgement();
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The builder could not answer that message.');
      setMessages(current => [...current, { role: 'assistant', content: 'I could not complete that change. Check the error above, then reword the request or open Website Builder Settings.' }]);
    } finally { setBusy(null); }
  }

  async function openConversation(plan: ChangePlan) {
    setBusy('load'); setError('');
    try {
      const result = await api<{ success: boolean; conversation: ChangePlan; messages: ChatMessage[] }>({ action: 'get_conversation', id: plan.id });
      setConversationId(plan.id);
      setActivePlan(result.conversation.plan);
      setMessages(result.messages?.length ? result.messages : [{ role: 'assistant', content: result.conversation.plan.summary }]);
      setTargetPath(result.conversation.target_path || '/');
      setTab('chat');
      setPreviewRefresh(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'That builder conversation could not be opened.'); }
    finally { setBusy(null); }
  }

  function newConversation() {
    setConversationId(''); setActivePlan(null); setChatInput(''); setTargetPath('/');
    setMessages([{ role: 'assistant', content: 'New website conversation started. What would you like me to build or change?' }]);
    setPreviewRefresh(value => value + 1); setTab('chat');
  }

  async function publishDraft() {
    if (!conversationId || !activePlan) return;
    if (settings.publishConfirmation && !window.confirm('Publish this approved draft to the live Planyx production website now?')) return;
    setBusy('publish'); setError('');
    try {
      await api({ action: 'publish_plan', id: conversationId });
      flash('Draft published to the production website.');
      setMessages(current => [...current, { role: 'assistant', content: 'The approved draft has now been published to production.' }]);
      setActivePlan(null); setPreviewRefresh(value => value + 1); playAcknowledgement();
      await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The draft could not be published.'); }
    finally { setBusy(null); }
  }

  async function discardDraft() {
    if (!conversationId || !window.confirm('Discard this draft conversation and its unpublished website changes?')) return;
    setBusy('discard'); setError('');
    try {
      await api({ action: 'discard_plan', id: conversationId });
      newConversation(); flash('Draft discarded.'); await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The draft could not be discarded.'); }
    finally { setBusy(null); }
  }

  function chooseFile(file: SelectedFile) {
    setSelectedFile(file);
    if (!inventory) return;
    if (file.type === 'global-css') setCodeValue(settings.globalCss || '');
    if (file.type.startsWith('page-')) {
      const page = inventory.pages.find(item => item.id === file.pageId);
      if (!page) return;
      if (file.type === 'page-html') setCodeValue(page.html || '');
      if (file.type === 'page-css') setCodeValue(page.css || '');
      if (file.type === 'page-json') setCodeValue(JSON.stringify({ title: page.title, path: page.path, status: page.status, seoTitle: page.seo_title, seoDescription: page.seo_description, noindex: Boolean(page.noindex) }, null, 2));
    }
    if (file.type === 'rule-json') setCodeValue(JSON.stringify(inventory.rules.find(item => item.id === file.ruleId) || {}, null, 2));
    if (file.type === 'plan-json') setCodeValue(JSON.stringify(inventory.plans.find(item => item.id === file.planId)?.plan || {}, null, 2));
    setTab('code');
  }

  function createManagedPage() {
    const page: ManagedPage = {
      id: crypto.randomUUID(), path: `/new-page-${Date.now()}`, title: 'New page', status: 'draft',
      html: '<main class="managed-page"><section><h1>New page</h1><p>Start editing this page.</p></section></main>',
      css: '.managed-page{max-width:72rem;margin:0 auto;padding:4rem 1.5rem}', seo_title: 'New page — Planyx', seo_description: '', noindex: 1,
    };
    setInventory(current => current ? { ...current, pages: [page, ...current.pages] } : current);
    setSelectedFile({ type: 'page-html', pageId: page.id, path: `website/pages/${fileSafePath(page.path)}/page.html` });
    setCodeValue(page.html); setTab('code');
  }

  async function saveCode() {
    if (!inventory) return;
    setBusy('save'); setError('');
    try {
      if (selectedFile.type === 'global-css') {
        await api({ action: 'save_global_css', css: codeValue });
      } else if (selectedFile.type.startsWith('page-')) {
        const page = inventory.pages.find(item => item.id === selectedFile.pageId);
        if (!page) throw new Error('That page file could not be found.');
        let updated = { ...page };
        if (selectedFile.type === 'page-html') updated.html = codeValue;
        if (selectedFile.type === 'page-css') updated.css = codeValue;
        if (selectedFile.type === 'page-json') {
          const metadata = JSON.parse(codeValue) as Record<string, unknown>;
          updated = {
            ...updated,
            title: String(metadata.title || updated.title), path: normalisePath(String(metadata.path || updated.path)),
            status: ['draft', 'published', 'archived'].includes(String(metadata.status)) ? String(metadata.status) as ManagedPage['status'] : updated.status,
            seo_title: String(metadata.seoTitle || updated.seo_title), seo_description: String(metadata.seoDescription || updated.seo_description),
            noindex: metadata.noindex ? 1 : 0,
          };
        }
        await api({ action: 'save_page', page: updated });
        setTargetPath(updated.path); setPreviewRefresh(value => value + 1);
      } else if (selectedFile.type === 'plan-json') {
        const plan = JSON.parse(codeValue) as ChangePlanData;
        await api({ action: 'save_plan', id: selectedFile.planId, plan });
        if (selectedFile.planId === conversationId) setActivePlan(plan);
        setPreviewRefresh(value => value + 1);
      } else {
        throw new Error('Published rule files are read-only. Delete the rule and ask the AI to create a revised one.');
      }
      flash('File saved.'); await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The file could not be saved.'); }
    finally { setBusy(null); }
  }

  async function deleteSelected() {
    if (!inventory) return;
    if (selectedFile.type.startsWith('page-')) {
      const page = inventory.pages.find(item => item.id === selectedFile.pageId);
      if (!page || !window.confirm(`Delete managed page ${page.path}?`)) return;
      await api({ action: 'delete_page', path: page.path });
    } else if (selectedFile.type === 'rule-json') {
      if (!window.confirm('Delete this published website rule?')) return;
      await api({ action: 'delete_rule', id: selectedFile.ruleId });
    } else return;
    setSelectedFile({ type: 'global-css', path: 'website/styles/global.css' }); setCodeValue(settings.globalCss || '');
    flash('Website file removed.'); await load(true);
  }

  const tabs: Array<[WorkspaceTab, string, typeof MessageSquare]> = [
    ['chat', 'Chat', MessageSquare], ['files', 'Files', Files], ['code', 'Code', Code2],
    ['preview', 'Preview', PanelTop], ['history', 'History', History], ['settings', 'Settings', Settings2],
  ];

  const builderUnavailable = !settings.enabled || settings.maintenanceEnabled;
  const title = tab === 'settings' ? 'Website Builder Settings' : 'AI Website Studio';

  return (
    <AdminLayout title={title}>
      <Helmet><title>{title} | Planyx Admin Centre</title></Helmet>
      <div className="space-y-4">
        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-1 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500" />
          <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><WandSparkles className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-bold text-slate-950 dark:text-white">Planyx AI Website Studio</h1><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${builderUnavailable ? 'bg-red-100 text-red-700' : settings.readOnly ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{!settings.enabled ? 'Offline' : settings.maintenanceEnabled ? 'Maintenance' : settings.readOnly ? 'Read-only' : 'Live'}</span>{activePlan && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Unpublished draft</span>}</div><p className="truncate text-xs text-slate-500">Chat, files, code and live website preview in one workspace.</p></div></div>
            <div className="flex flex-wrap items-center gap-2"><Input aria-label="Target website path" value={targetPath} onChange={event => setTargetPath(event.target.value)} className="h-9 w-48 font-mono text-xs" /><Button variant="outline" size="sm" onClick={toggleSound} title={soundEnabled ? 'Acknowledgement sound on' : 'Acknowledgement sound off'}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</Button><Button variant="outline" size="sm" onClick={() => void load()} disabled={busy !== null}><RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} /></Button>{activePlan && <><Button variant="outline" size="sm" onClick={() => void discardDraft()} disabled={busy !== null}><Trash2 className="mr-1.5 h-4 w-4" />Discard</Button><Button size="sm" onClick={() => void publishDraft()} disabled={busy !== null || settings.readOnly}>{busy === 'publish' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}Publish</Button></>}</div>
          </div>
          <nav className="flex overflow-x-auto border-t border-slate-200 px-2 dark:border-slate-800" aria-label="Website Studio workspace">
            {tabs.map(([id, label, Icon]) => id === 'settings' ? <a key={id} href="/admin/website-builder-settings" className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold ${tab === id ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}><Icon className="mr-2 h-4 w-4" />{label}</a> : <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold ${tab === id ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}><Icon className="mr-2 h-4 w-4" />{label}</button>)}
          </nav>
        </header>

        {notice && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        {settings.maintenanceEnabled && tab !== 'settings' && <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Builder maintenance:</strong> {settings.maintenanceMessage}</AlertDescription></Alert>}

        {busy === 'load' && !inventory ? <div className="flex min-h-[600px] items-center justify-center rounded-2xl border bg-white dark:bg-slate-900"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : tab === 'settings' ? (
          <WebsiteBuilderSettingsPanel settings={settings} diagnostics={inventory?.diagnostics} counts={{ pages: inventory?.pages.length || 0, rules: inventory?.rules.length || 0, plans: inventory?.plans.length || 0 }} onSaved={saved => setSettings(saved)} />
        ) : tab === 'chat' ? (
          <div className={`grid min-h-0 gap-4 ${settings.previewEnabled ? 'xl:grid-cols-[minmax(360px,0.72fr)_minmax(520px,1.28fr)]' : ''}`}>
            <section className="flex h-[calc(100vh-250px)] min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div><h2 className="text-sm font-bold text-slate-950 dark:text-white">Conversation</h2><p className="text-xs text-slate-500">Talk naturally. Follow-up requests revise the same draft.</p></div><Button variant="ghost" size="sm" onClick={newConversation}><FilePlus2 className="mr-1.5 h-4 w-4" />New chat</Button></div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{messages.map((item, index) => <div key={item.id || index} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === 'user' ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>{item.content}</div></div>)}{busy === 'chat' && <div className="flex justify-start"><div className="flex items-center rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reading the page and building your draft…</div></div>}<div ref={chatEndRef} /></div>
              {activePlan && <div className="border-t border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100"><strong>{activePlan.summary}</strong><span className="ml-2">{activePlan.operations.length} draft changes</span>{activePlan.warnings?.map((warning, index) => <p key={index} className="mt-1 text-amber-700 dark:text-amber-200">⚠ {warning}</p>)}</div>}
              <div className="border-t border-slate-200 p-3 dark:border-slate-800"><div className="relative"><textarea value={chatInput} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={3} disabled={builderUnavailable} placeholder={builderUnavailable ? settings.maintenanceMessage : 'Ask the builder to change, add, remove or redesign anything…'} className="w-full resize-none rounded-2xl border border-slate-300 bg-white py-3 pl-4 pr-14 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950" /><button type="button" onClick={() => void sendMessage()} disabled={busy !== null || builderUnavailable || chatInput.trim().length < 2} className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40" aria-label="Send builder message"><Send className="h-4 w-4" /></button></div><p className="mt-2 text-[10px] text-slate-500">Enter sends · Shift+Enter adds a new line · A soft chime plays after acknowledgement when enabled.</p></div>
            </section>
            {settings.previewEnabled && <AIWebsiteBuilderPreview path={previewPath} operations={draftOperations} refreshKey={previewRefresh} onSnapshot={setPageSnapshot} />}
          </div>
        ) : tab === 'files' ? (
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"><FileExplorer inventory={inventory} settings={settings} onChoose={chooseFile} onCreate={createManagedPage} /><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><Files className="h-8 w-8 text-blue-600" /><h2 className="mt-4 text-xl font-bold">Website file workspace</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose a file from the explorer. HTML, CSS, page metadata, website rules and AI drafts are represented as managed files. Selecting one opens it in the Code tab.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><SummaryCard title="Managed pages" value={inventory?.pages.length || 0} /><SummaryCard title="Live rules" value={inventory?.rules.length || 0} /><SummaryCard title="Builder history" value={inventory?.plans.length || 0} /></div></section></div>
        ) : tab === 'code' ? (
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]"><FileExplorer inventory={inventory} settings={settings} onChoose={chooseFile} onCreate={createManagedPage} compact /><section className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3"><div className="flex min-w-0 items-center gap-2 text-slate-200"><FileCode2 className="h-4 w-4 text-blue-400" /><code className="truncate text-xs">{selectedFile.path}</code>{selectedFile.type === 'rule-json' && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">READ ONLY</span>}</div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setTab('preview')}><PanelTop className="mr-1.5 h-4 w-4" />Preview</Button>{(selectedFile.type.startsWith('page-') || selectedFile.type === 'rule-json') && <Button variant="destructive" size="sm" onClick={() => void deleteSelected()} disabled={busy !== null || settings.readOnly}><Trash2 className="h-4 w-4" /></Button>}<Button size="sm" onClick={() => void saveCode()} disabled={busy !== null || selectedFile.type === 'rule-json' || settings.readOnly}>{busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save file</Button></div></div><textarea value={codeValue} onChange={event => setCodeValue(event.target.value)} readOnly={selectedFile.type === 'rule-json'} spellCheck={false} className="min-h-0 flex-1 resize-none border-0 bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100 outline-none" /></section></div>
        ) : tab === 'preview' ? (
          <AIWebsiteBuilderPreview path={previewPath} operations={draftOperations} refreshKey={previewRefresh} onSnapshot={setPageSnapshot} />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Builder conversations and history</h2><p className="mt-1 text-sm text-slate-500">Reopen an unpublished conversation, inspect a published plan or continue refining a draft.</p></div><Button variant="outline" onClick={newConversation}><FilePlus2 className="mr-1.5 h-4 w-4" />New conversation</Button></div><div className="mt-5 space-y-2">{inventory?.plans.length ? inventory.plans.map(plan => <button key={plan.id} type="button" onClick={() => void openConversation(plan)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:bg-blue-500/5"><div className="min-w-0"><p className="font-semibold text-slate-950 dark:text-white">{plan.plan.summary || plan.prompt}</p><p className="mt-1 text-xs text-slate-500">{plan.target_path} · {plan.plan.operations.length} changes · {formatTime(plan.created_at)}</p></div><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${plan.status === 'published' ? 'bg-emerald-100 text-emerald-700' : plan.status === 'draft' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>{plan.status}</span><ChevronRight className="h-4 w-4 text-slate-400" /></div></button>) : <p className="py-12 text-center text-sm text-slate-500">No builder history yet.</p>}</div></section>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p></div>;
}

function FileExplorer({ inventory, settings, onChoose, onCreate, compact = false }: {
  inventory: StudioInventory | null; settings: WebsiteBuilderSettings; onChoose: (file: SelectedFile) => void; onCreate: () => void; compact?: boolean;
}) {
  return (
    <aside className={`${compact ? 'max-h-[680px]' : 'min-h-[620px]'} overflow-y-auto rounded-2xl border border-slate-200 bg-slate-950 p-3 text-slate-200 shadow-sm`}>
      <div className="flex items-center justify-between px-2 py-2"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Explorer</p><p className="mt-0.5 text-[10px] text-slate-500">Managed website files</p></div><Button size="sm" variant="outline" onClick={onCreate} disabled={!settings.allowCreatePages || settings.readOnly}><FilePlus2 className="h-4 w-4" /></Button></div>
      <div className="mt-2 space-y-1 text-xs"><ExplorerFolder label="website" defaultOpen><ExplorerFolder label="styles" defaultOpen><ExplorerFile label="global.css" icon={Code2} onClick={() => onChoose({ type: 'global-css', path: 'website/styles/global.css' })} /></ExplorerFolder><ExplorerFolder label={`pages (${inventory?.pages.length || 0})`} defaultOpen>{inventory?.pages.map(page => <ExplorerFolder key={page.id} label={`${fileSafePath(page.path)} ${page.status === 'published' ? '●' : '○'}`}><ExplorerFile label="page.html" icon={FileCode2} onClick={() => onChoose({ type: 'page-html', pageId: page.id, path: `website/pages/${fileSafePath(page.path)}/page.html` })} /><ExplorerFile label="page.css" icon={Code2} onClick={() => onChoose({ type: 'page-css', pageId: page.id, path: `website/pages/${fileSafePath(page.path)}/page.css` })} /><ExplorerFile label="page.json" icon={FileJson2} onClick={() => onChoose({ type: 'page-json', pageId: page.id, path: `website/pages/${fileSafePath(page.path)}/page.json` })} /></ExplorerFolder>)}</ExplorerFolder><ExplorerFolder label={`rules (${inventory?.rules.length || 0})`}>{inventory?.rules.map(rule => <ExplorerFile key={rule.id} label={`${fileSafePath(rule.path_pattern)}-${rule.operation}.json`} icon={FileJson2} onClick={() => onChoose({ type: 'rule-json', ruleId: rule.id, path: `website/rules/${rule.id}.json` })} />)}</ExplorerFolder><ExplorerFolder label={`drafts (${inventory?.plans.length || 0})`}>{inventory?.plans.map(plan => <ExplorerFile key={plan.id} label={`${plan.id.slice(0, 8)}-${plan.status}.json`} icon={FileJson2} onClick={() => onChoose({ type: 'plan-json', planId: plan.id, path: `website/drafts/${plan.id}.json` })} />)}</ExplorerFolder></ExplorerFolder></div>
    </aside>
  );
}

function ExplorerFolder({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div><button type="button" onClick={() => setOpen(current => !current)} className="flex w-full items-center rounded px-2 py-1.5 text-left text-slate-300 hover:bg-slate-800"><ChevronRight className={`mr-1 h-3.5 w-3.5 transition ${open ? 'rotate-90' : ''}`} /><Folder className="mr-1.5 h-3.5 w-3.5 text-blue-400" />{label}</button>{open && <div className="ml-3 border-l border-slate-800 pl-2">{children}</div>}</div>;
}

function ExplorerFile({ label, icon: Icon, onClick }: { label: string; icon: typeof Code2; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center rounded px-2 py-1.5 text-left text-slate-400 hover:bg-slate-800 hover:text-white"><Icon className="mr-2 h-3.5 w-3.5 text-slate-500" />{label}</button>;
}
