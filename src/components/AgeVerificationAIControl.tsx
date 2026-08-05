import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Bot, CheckCircle2, ExternalLink, Fingerprint,
  Loader2, RefreshCw, Save, ShieldCheck, Sparkles, Wrench,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AgeAiSettings {
  enabled: boolean;
  guidanceEnabled: boolean;
  privacyExplanationsEnabled: boolean;
  safeguardingTriageEnabled: boolean;
  failureSupportEnabled: boolean;
  contactHandoverEnabled: boolean;
  debugEnabled: boolean;
  welcomeMessage: string;
  inputPlaceholder: string;
  guardrailMessage: string;
  maxTurns: number;
}

interface AgeControlStatus {
  serviceStatus: 'live' | 'maintenance' | 'paused';
  verificationMethod: 'self_declaration' | 'independent_provider';
  providerName: string;
  provider: { ready: boolean; adapter: string };
  minimumAge: number;
  minorSafeguardsLocked: boolean;
}

const DEFAULTS: AgeAiSettings = {
  enabled: true,
  guidanceEnabled: true,
  privacyExplanationsEnabled: true,
  safeguardingTriageEnabled: true,
  failureSupportEnabled: true,
  contactHandoverEnabled: false,
  debugEnabled: false,
  welcomeMessage: 'Hello. I can explain Sousa Murray Planeia’s 16+ age check, privacy safeguards and what to do if verification is not working. I cannot guess or approve anyone’s age.',
  inputPlaceholder: 'Ask about the 16+ age check…',
  guardrailMessage: 'Only the secure Sousa Murray Planeia age check or an approved independent provider can decide account eligibility. The AI assistant cannot estimate, approve or override age verification.',
  maxTurns: 6,
};

function bool(value: string | undefined, fallback: boolean) {
  return value === undefined ? fallback : value === 'true';
}

function fromRecord(record: Record<string, string>): AgeAiSettings {
  return {
    enabled: bool(record.age_ai_enabled, DEFAULTS.enabled),
    guidanceEnabled: bool(record.age_ai_guidance_enabled, DEFAULTS.guidanceEnabled),
    privacyExplanationsEnabled: bool(record.age_ai_privacy_explanations_enabled, DEFAULTS.privacyExplanationsEnabled),
    safeguardingTriageEnabled: bool(record.age_ai_safeguarding_triage_enabled, DEFAULTS.safeguardingTriageEnabled),
    failureSupportEnabled: bool(record.age_ai_failure_support_enabled, DEFAULTS.failureSupportEnabled),
    contactHandoverEnabled: bool(record.age_ai_contact_handover_enabled, DEFAULTS.contactHandoverEnabled),
    debugEnabled: bool(record.age_ai_debug_enabled, DEFAULTS.debugEnabled),
    welcomeMessage: record.age_ai_welcome_message || DEFAULTS.welcomeMessage,
    inputPlaceholder: record.age_ai_input_placeholder || DEFAULTS.inputPlaceholder,
    guardrailMessage: record.age_ai_guardrail_message || DEFAULTS.guardrailMessage,
    maxTurns: Math.min(12, Math.max(1, Number(record.age_ai_max_turns || DEFAULTS.maxTurns))),
  };
}

function toRecord(settings: AgeAiSettings): Record<string, string> {
  return {
    age_ai_enabled: String(settings.enabled),
    age_ai_guidance_enabled: String(settings.guidanceEnabled),
    age_ai_privacy_explanations_enabled: String(settings.privacyExplanationsEnabled),
    age_ai_safeguarding_triage_enabled: String(settings.safeguardingTriageEnabled),
    age_ai_failure_support_enabled: String(settings.failureSupportEnabled),
    age_ai_contact_handover_enabled: String(settings.contactHandoverEnabled),
    age_ai_debug_enabled: String(settings.debugEnabled),
    age_ai_welcome_message: settings.welcomeMessage,
    age_ai_input_placeholder: settings.inputPlaceholder,
    age_ai_guardrail_message: settings.guardrailMessage,
    age_ai_max_turns: String(settings.maxTurns),
  };
}

function Toggle({ checked, onChange, label, description, locked = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string; locked?: boolean }) {
  return (
    <button type="button" disabled={locked} onClick={() => !locked && onChange(!checked)} className={`flex w-full items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/40 ${locked ? 'cursor-not-allowed opacity-75' : ''}`}>
      <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span>
      <span className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} /></span>
    </button>
  );
}

export default function AgeVerificationAIControl() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ageControl, setAgeControl] = useState<AgeControlStatus | null>(null);
  const [sharedProvider, setSharedProvider] = useState('Built-in');
  const [sharedModel, setSharedModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [testQuestion, setTestQuestion] = useState('Why does Sousa Murray Planeia need an age check?');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const [siteResponse, ageResponse, assistantResponse] = await Promise.all([
        fetch('/api/admin/site-settings', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/age-verification', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/age-verification-assistant', { credentials: 'include', cache: 'no-store' }),
      ]);
      const site = await siteResponse.json() as { success?: boolean; settings?: Record<string, string>; error?: string };
      const age = await ageResponse.json() as { success?: boolean; settings?: AgeControlStatus; error?: string };
      const assistant = await assistantResponse.json().catch(() => ({})) as { provider?: string; model?: string };
      if (!siteResponse.ok || !site.success) throw new Error(site.error || 'AI system settings could not be loaded.');
      if (!ageResponse.ok || !age.success || !age.settings) throw new Error(age.error || 'Age verification status could not be loaded.');
      setSettings(fromRecord(site.settings || {}));
      setAgeControl(age.settings);
      setSharedProvider(assistant.provider === 'workers_ai' ? 'Cloudflare Workers AI' : 'Built-in guidance engine');
      setSharedModel(assistant.model || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Age Verification AI controls could not be loaded.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function patch<K extends keyof AgeAiSettings>(key: K, value: AgeAiSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/site-settings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: toRecord(settings) }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Age Verification AI settings could not be saved.');
      setNotice('Age Verification AI settings saved and published.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Age Verification AI settings could not be saved.'); }
    finally { setSaving(false); }
  }

  async function runTest() {
    if (testQuestion.trim().length < 2) return;
    setTesting(true); setTestReply(''); setError('');
    try {
      const response = await fetch('/api/age-verification-assistant', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testQuestion, history: [] }),
      });
      const data = await response.json() as { success?: boolean; reply?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Age Verification AI test failed.');
      setTestReply(data.reply || 'No reply was returned.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Age Verification AI test failed.'); }
    finally { setTesting(false); }
  }

  const statusLabel = useMemo(() => ageControl?.serviceStatus === 'paused' ? 'Registrations paused' : ageControl?.serviceStatus || 'Unknown', [ageControl]);

  return (
    <section id="age-verification-ai-controls" className="mt-6 space-y-5 rounded-2xl border border-violet-300 bg-violet-50/70 p-4 shadow-sm dark:border-violet-800 dark:bg-violet-950/20 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-foreground">Age Verification AI</h2><Badge className={settings.enabled ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-700'}>{settings.enabled ? 'Enabled' : 'Off'}</Badge><Badge variant="outline">{statusLabel}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">AI guidance for the 16+ journey, powered by the shared Sousa Murray Planeia AI engine. The AI explains and supports; it never decides age eligibility.</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button><Button type="button" size="sm" onClick={() => void save()} disabled={saving || loading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Age AI</Button><Button asChild type="button" variant="outline" size="sm"><Link to="/admin/age-verification">Full age controls<ExternalLink className="ml-2 h-4 w-4" /></Link></Button></div>
      </div>

      <Alert className="border-violet-200 bg-white/70 text-violet-950 dark:border-violet-800 dark:bg-slate-950/50 dark:text-violet-100"><ShieldCheck className="h-4 w-4" /><AlertDescription><strong>Decision firewall:</strong> the AI cannot estimate, infer, approve, fail or override age. Only the secure signed check or an approved independent provider can create the eligibility result.</AlertDescription></Alert>
      {notice && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-violet-600" />AI guidance controls</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
            <Toggle checked={settings.enabled} onChange={value => patch('enabled', value)} label="Age Verification AI enabled" description="Display and run the AI guidance system on the secure age-check page." />
            <Toggle checked={settings.guidanceEnabled} onChange={value => patch('guidanceEnabled', value)} label="Conversational guidance" description="Answer questions about the 16+ rule, account journey and verification process." />
            <Toggle checked={settings.privacyExplanationsEnabled} onChange={value => patch('privacyExplanationsEnabled', value)} label="Privacy explanations" description="Explain data minimisation and warn users not to place full birth dates or documents into AI chat." />
            <Toggle checked={settings.safeguardingTriageEnabled} onChange={value => patch('safeguardingTriageEnabled', value)} label="Safeguarding triage" description="Recognise safety concerns and route visitors to the published safeguarding and emergency guidance." />
            <Toggle checked={settings.failureSupportEnabled} onChange={value => patch('failureSupportEnabled', value)} label="Verification-failure support" description="Explain maintenance, failed checks and safe retry steps without weakening the age rule." />
            <Toggle checked={settings.contactHandoverEnabled} onChange={value => patch('contactHandoverEnabled', value)} label="Contact-team handover" description="Allow the AI to mention Contact Us only when that service is online. Never request documents through ordinary enquiries." />
            <Toggle checked={settings.debugEnabled} onChange={value => patch('debugEnabled', value)} label="Age AI debugging" description="Log technical failures without storing the visitor’s question, full DOB, documents, tokens or provider secrets." />
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Published conversation wording</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Welcome message</Label><Textarea rows={3} value={settings.welcomeMessage} onChange={event => patch('welcomeMessage', event.target.value)} /></div><div><Label>Input placeholder</Label><Input value={settings.inputPlaceholder} onChange={event => patch('inputPlaceholder', event.target.value)} /></div><div><Label>Decision guardrail message</Label><Textarea rows={4} value={settings.guardrailMessage} onChange={event => patch('guardrailMessage', event.target.value)} /></div><div><Label>Maximum conversation turns</Label><Input type="number" min={1} max={12} value={settings.maxTurns} onChange={event => patch('maxTurns', Number(event.target.value))} /></div></CardContent></Card>
        </div>

        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Fingerprint className="h-4 w-4 text-violet-600" />Shared AI engine</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Engine</span><strong>{sharedProvider}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Model</span><strong className="max-w-[220px] break-all text-right">{sharedModel || 'Built-in approved guidance'}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Minimum age</span><strong>{ageControl?.minimumAge || 16}+</strong></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Verification method</span><strong>{ageControl?.verificationMethod === 'independent_provider' ? 'Independent provider' : 'Signed declaration'}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Provider readiness</span><strong>{ageControl?.provider?.ready ? 'Ready' : 'Not ready'}</strong></div><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">16–17 safeguards</span><strong>{ageControl?.minorSafeguardsLocked ? 'Mandatory' : 'Check required'}</strong></div></CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-violet-600" />Runtime test</CardTitle></CardHeader><CardContent className="space-y-3"><Label>Test question</Label><Textarea rows={3} value={testQuestion} onChange={event => setTestQuestion(event.target.value)} /><Button type="button" variant="outline" onClick={() => void runTest()} disabled={testing || testQuestion.trim().length < 2}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Test Age AI</Button>{testReply && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">{testReply}</div>}</CardContent></Card>

          <Alert><BadgeCheck className="h-4 w-4" /><AlertDescription>The full service status, maintenance wording, provider credentials/readiness, DPIA record, legal reviews, event log and age-band test remain in the dedicated <Link className="font-bold underline" to="/admin/age-verification">Age Verification Control Centre</Link>.</AlertDescription></Alert>
        </div>
      </div>}
    </section>
  );
}
