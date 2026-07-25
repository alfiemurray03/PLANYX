import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, Clock3, Code2, Database, Eye, FilePlus2,
  LockKeyhole, RefreshCw, Save, Settings2, ShieldCheck, Trash2, Volume2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface WebsiteBuilderSettings {
  enabled: boolean;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  readOnly: boolean;
  acknowledgementSound: boolean;
  previewEnabled: boolean;
  publishConfirmation: boolean;
  allowHtml: boolean;
  allowCss: boolean;
  allowCreatePages: boolean;
  allowDeletePages: boolean;
  allowExistingPageRules: boolean;
  maxHistory: number;
  maxOperations: number;
  model: string;
  systemInstructions: string;
  globalCss?: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface Diagnostics {
  database: boolean;
  workersAi: boolean;
  model: string;
  serviceState: string;
}

interface Props {
  settings?: WebsiteBuilderSettings | null;
  diagnostics?: Diagnostics | null;
  counts?: { pages: number; rules: number; plans: number };
  onSaved?: (settings: WebsiteBuilderSettings) => void;
}

const FALLBACK: WebsiteBuilderSettings = {
  enabled: true,
  maintenanceEnabled: false,
  maintenanceMessage: 'The AI Website Builder is temporarily unavailable while maintenance is completed.',
  maintenanceStart: '',
  maintenanceEnd: '',
  readOnly: false,
  acknowledgementSound: true,
  previewEnabled: true,
  publishConfirmation: true,
  allowHtml: true,
  allowCss: true,
  allowCreatePages: true,
  allowDeletePages: true,
  allowExistingPageRules: true,
  maxHistory: 20,
  maxOperations: 30,
  model: '@cf/meta/llama-3.1-8b-instruct-fast',
  systemInstructions: 'Use accessible, responsive British English website design. Preserve Planyx legal, privacy, age, safeguarding, security and authentication controls.',
};

async function api(body?: Record<string, unknown>) {
  const response = await fetch('/api/admin/website-studio', {
    method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || payload.success === false) throw new Error(payload.error || 'Website Builder Settings could not be completed.');
  return payload;
}

function SwitchRow({ checked, onChange, icon: Icon, title, description, danger = false }: {
  checked: boolean; onChange: (value: boolean) => void; icon: typeof Settings2; title: string; description: string; danger?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition ${checked ? danger ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10' : 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
      <span className="flex min-w-0 gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${checked ? danger ? 'bg-red-600 text-white' : 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}><Icon className="h-4 w-4" /></span><span><strong className="block text-sm text-slate-950 dark:text-white">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span></span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-2 h-4 w-4 accent-blue-600" />
    </label>
  );
}

export default function WebsiteBuilderSettingsPanel({ settings: supplied, diagnostics: suppliedDiagnostics, counts, onSaved }: Props) {
  const [settings, setSettings] = useState<WebsiteBuilderSettings>(supplied || FALLBACK);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(suppliedDiagnostics || null);
  const [localCounts, setLocalCounts] = useState(counts || { pages: 0, rules: 0, plans: 0 });
  const [loading, setLoading] = useState(!supplied);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (supplied) setSettings(supplied); }, [supplied]);
  useEffect(() => { if (suppliedDiagnostics) setDiagnostics(suppliedDiagnostics); }, [suppliedDiagnostics]);

  useEffect(() => {
    if (supplied) return;
    setLoading(true);
    api().then(payload => {
      setSettings({ ...FALLBACK, ...(payload.settings || {}) });
      setDiagnostics(payload.diagnostics || null);
      setLocalCounts({ pages: payload.pages?.length || 0, rules: payload.rules?.length || 0, plans: payload.plans?.length || 0 });
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Settings could not be loaded.')).finally(() => setLoading(false));
  }, [supplied]);

  function update<K extends keyof WebsiteBuilderSettings>(key: K, value: WebsiteBuilderSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const payload = await api({ action: 'save_settings', settings });
      const saved = { ...FALLBACK, ...(payload.settings || {}) } as WebsiteBuilderSettings;
      setSettings(saved); onSaved?.(saved); setMessage('Website Builder settings saved and enforced.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Settings could not be saved.'); }
    finally { setSaving(false); }
  }

  async function runDiagnostics() {
    setChecking(true); setError('');
    try {
      const payload = await api({ action: 'diagnostics' });
      setDiagnostics(payload.diagnostics || null); setLocalCounts(payload.counts || localCounts); setMessage('Website Builder diagnostics completed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Diagnostics could not be completed.'); }
    finally { setChecking(false); }
  }

  if (loading) return <div className="flex min-h-80 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>;

  const state = !settings.enabled ? 'Offline' : settings.maintenanceEnabled ? 'Maintenance' : settings.readOnly ? 'Read-only' : 'Live';
  const stateClass = state === 'Live' ? 'bg-emerald-100 text-emerald-700' : state === 'Read-only' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500" />
        <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white"><Settings2 className="h-6 w-6" /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-slate-950 dark:text-white">Website Builder Settings</h1><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stateClass}`}>{state}</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Control availability, maintenance, AI behaviour, sound, previews and what website changes administrators are permitted to publish.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => void runDiagnostics()} disabled={checking || saving}>{checking ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Diagnostics</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save settings</Button></div></div>
      </section>

      {message && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="grid gap-4 xl:grid-cols-3">
        <SwitchRow checked={settings.enabled} onChange={value => update('enabled', value)} icon={Bot} title="Builder online" description="Allows administrators to open the conversational AI Website Builder." />
        <SwitchRow checked={settings.maintenanceEnabled} onChange={value => update('maintenanceEnabled', value)} icon={Clock3} title="Maintenance mode" description="Stops AI requests and publishing while maintenance is completed." danger />
        <SwitchRow checked={settings.readOnly} onChange={value => update('readOnly', value)} icon={LockKeyhole} title="Emergency read-only mode" description="Allows review and chat drafts but blocks production writes." danger />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Maintenance window</h2><div className="mt-4"><Label>Maintenance message</Label><textarea value={settings.maintenanceMessage} onChange={event => update('maintenanceMessage', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" /></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label>Start</Label><Input type="datetime-local" value={settings.maintenanceStart} onChange={event => update('maintenanceStart', event.target.value)} className="mt-1" /></div><div><Label>Expected end</Label><Input type="datetime-local" value={settings.maintenanceEnd} onChange={event => update('maintenanceEnd', event.target.value)} className="mt-1" /></div></div></section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Workspace behaviour</h2><SwitchRow checked={settings.acknowledgementSound} onChange={value => update('acknowledgementSound', value)} icon={Volume2} title="Acknowledgement sound" description="Play one soft chime after the AI has understood and answered a message." /><SwitchRow checked={settings.previewEnabled} onChange={value => update('previewEnabled', value)} icon={Eye} title="Live draft preview" description="Show draft changes beside the conversation before publication." /><SwitchRow checked={settings.publishConfirmation} onChange={value => update('publishConfirmation', value)} icon={ShieldCheck} title="Confirm before publishing" description="Require an explicit production confirmation for every draft." /></div>
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Allowed website changes</h2><SwitchRow checked={settings.allowHtml} onChange={value => update('allowHtml', value)} icon={Code2} title="HTML editing" description="Allow full managed-page HTML and selected block HTML changes." /><SwitchRow checked={settings.allowCss} onChange={value => update('allowCss', value)} icon={Code2} title="CSS editing" description="Allow global CSS and page-specific CSS changes." /><SwitchRow checked={settings.allowExistingPageRules} onChange={value => update('allowExistingPageRules', value)} icon={Eye} title="Edit existing application pages" description="Allow selectors to change existing website and customer-portal pages." /><SwitchRow checked={settings.allowCreatePages} onChange={value => update('allowCreatePages', value)} icon={FilePlus2} title="Create new pages" description="Allow the AI and file editor to create managed public pages." /><SwitchRow checked={settings.allowDeletePages} onChange={value => update('allowDeletePages', value)} icon={Trash2} title="Delete managed pages" description="Allow permanent removal of managed pages and their rules." danger /></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">AI model and conversation</h2><div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2"><Label>Cloudflare Workers AI model</Label><Input value={settings.model} onChange={event => update('model', event.target.value)} className="mt-1 font-mono text-xs" /></div><div><Label>Conversation messages retained</Label><Input type="number" min={4} max={80} value={settings.maxHistory} onChange={event => update('maxHistory', Number(event.target.value))} className="mt-1" /></div><div><Label>Maximum changes per draft</Label><Input type="number" min={1} max={60} value={settings.maxOperations} onChange={event => update('maxOperations', Number(event.target.value))} className="mt-1" /></div></div><div className="mt-4"><Label>Permanent builder instructions</Label><textarea value={settings.systemInstructions} onChange={event => update('systemInstructions', event.target.value)} rows={6} className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm leading-6" /></div></section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
        ['Database', diagnostics?.database ? 'Connected' : 'Unavailable', Database],
        ['Workers AI', diagnostics?.workersAi ? 'Available' : 'Unavailable', Bot],
        ['Managed pages', String(localCounts.pages), FilePlus2],
        ['Live rules', String(localCounts.rules), Code2],
        ['Draft/history', String(localCounts.plans), Clock3],
      ].map(([title, value, Icon]) => <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><Icon className="h-4 w-4 text-blue-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title as string}</p><p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{value as string}</p></div>)}</section>

      <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>Admin, API, authentication and secure signing routes remain protected regardless of these settings. Legal, privacy, safeguarding and age controls must still be reviewed before publishing.</AlertDescription></Alert>
    </div>
  );
}
