/**
 * EmailBuilder — Dedicated structured email builder.
 * Sections: recipient, subject, greeting, opening, main message,
 * action/request, deadline, closing, sign-off, signature, attachments, disclaimer.
 * Variable panel, placeholder highlighting, email-style preview.
 */
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Save, RefreshCw, CheckCircle2,
  Search, FolderOpen, Mail, Eye, Plus, X, GripVertical,
  AlertTriangle, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { BuilderTemplate } from '@/lib/builder-framework';
// EMAIL_BUILDER_TEMPLATES import removed — templates now loaded from DB via /api/builders/templates

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailSection {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea';
  value: string;
  enabled: boolean;
  required?: boolean;
  placeholder?: string;
}

interface EmailDoc {
  sections: EmailSection[];
  variables: Record<string, string>;
  branding: { color: string; orgName: string; logoUrl: string };
}

// ── Default sections ──────────────────────────────────────────────────────────

const DEFAULT_SECTIONS: Omit<EmailSection, 'id' | 'value' | 'enabled'>[] = [
  { key: 'to',          label: 'To (Recipient)',        type: 'text',     required: true,  placeholder: 'recipient@example.com or [Name]' },
  { key: 'subject',     label: 'Subject Line',          type: 'text',     required: true,  placeholder: 'e.g. Your Invoice — Ref [Invoice Number]' },
  { key: 'greeting',    label: 'Greeting',              type: 'text',     required: true,  placeholder: 'Dear [Name],' },
  { key: 'opening',     label: 'Opening Paragraph',     type: 'textarea', required: false, placeholder: 'Brief context or reason for writing…' },
  { key: 'body',        label: 'Main Message',          type: 'textarea', required: true,  placeholder: 'The main content of your email…' },
  { key: 'action',      label: 'Action / Request',      type: 'textarea', required: false, placeholder: 'What you need the recipient to do…' },
  { key: 'deadline',    label: 'Deadline / Date',       type: 'text',     required: false, placeholder: 'e.g. Please respond by [Due Date]' },
  { key: 'closing',     label: 'Closing Paragraph',     type: 'textarea', required: false, placeholder: 'Any final remarks or pleasantries…' },
  { key: 'signoff',     label: 'Sign-off',              type: 'text',     required: true,  placeholder: 'Kind regards,' },
  { key: 'signature',   label: 'Signature',             type: 'textarea', required: true,  placeholder: '[Your Name]\n[Your Title]\n[Organisation]\n[Phone]' },
  { key: 'attachments', label: 'Attachments Note',      type: 'text',     required: false, placeholder: 'e.g. Please find attached: Invoice INV-001' },
  { key: 'disclaimer',  label: 'Disclaimer (optional)', type: 'textarea', required: false, placeholder: 'This email and any attachments are confidential…' },
];

// ── Common placeholder tokens ─────────────────────────────────────────────────

const PLACEHOLDER_TOKENS = [
  '[Name]', '[Company]', '[Date]', '[Reference]', '[Invoice Number]',
  '[Amount]', '[Due Date]', '[Appointment Date]', '[Job Title]',
  '[Address]', '[Phone]', '[Email]', '[Custom Field]',
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function makeSections(overrides: Partial<Record<string, string>> = {}): EmailSection[] {
  return DEFAULT_SECTIONS.map(s => ({
    ...s,
    id: uid(),
    value: overrides[s.key] ?? '',
    enabled: s.required !== false || ['greeting', 'body', 'signoff', 'signature'].includes(s.key),
  }));
}

function applyTemplate(template: BuilderTemplate): EmailSection[] {
  // Extract field values from template fields as defaults
  const overrides: Partial<Record<string, string>> = {};
  for (const f of template.fields) {
    if (f.defaultValue) overrides[f.id] = f.defaultValue;
  }
  // Map template field ids to section keys
  const keyMap: Record<string, string> = {
    subject: 'subject', greeting: 'greeting', opening: 'opening',
    body: 'body', action: 'action', deadline: 'deadline',
    closing: 'closing', signoff: 'signoff', signature: 'signature',
    attachments: 'attachments', disclaimer: 'disclaimer',
  };
  const sectionOverrides: Partial<Record<string, string>> = {};
  for (const [fid, val] of Object.entries(overrides)) {
    const key = keyMap[fid] ?? fid;
    sectionOverrides[key] = val;
  }
  // Use bodyTemplate as body if no body field
  if (!sectionOverrides.body && template.bodyTemplate) {
    // Strip the "Subject: ..." header line if present
    const lines = template.bodyTemplate.split('\n');
    const bodyStart = lines.findIndex(l => l.startsWith('Dear ') || l.startsWith('Hello ') || l.startsWith('Hi '));
    sectionOverrides.body = bodyStart > 0 ? lines.slice(bodyStart).join('\n') : template.bodyTemplate;
  }
  return makeSections(sectionOverrides);
}

// ── Missing placeholder detection ────────────────────────────────────────────

function findMissingPlaceholders(sections: EmailSection[]): string[] {
  const allText = sections.filter(s => s.enabled).map(s => s.value).join(' ');
  const found = allText.match(/\[[A-Za-z ]+\]/g) ?? [];
  return [...new Set(found)];
}

// ── Preview renderer ──────────────────────────────────────────────────────────

function EmailPreview({ sections, branding }: { sections: EmailSection[]; branding: EmailDoc['branding'] }) {
  const get = (key: string) => sections.find(s => s.key === key && s.enabled)?.value ?? '';
  const to = get('to');
  const subject = get('subject');
  const greeting = get('greeting');
  const opening = get('opening');
  const body = get('body');
  const action = get('action');
  const deadline = get('deadline');
  const closing = get('closing');
  const signoff = get('signoff');
  const signature = get('signature');
  const attachments = get('attachments');
  const disclaimer = get('disclaimer');

  const accent = branding.color || '#1B4F8A';

  function renderText(text: string) {
    // Highlight unfilled placeholders in amber
    return text.split(/(\[[A-Za-z ]+\])/).map((part, i) =>
      /^\[[A-Za-z ]+\]$/.test(part)
        ? <mark key={i} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '0 2px' }}>{part}</mark>
        : <span key={i}>{part}</span>
    );
  }

  return (
    <div id="email-preview-content" style={{ fontFamily: 'Arial, Helvetica, sans-serif', background: '#f3f4f6', padding: '24px 0', minHeight: '100%' }}>
      {/* Email client chrome */}
      <div style={{ maxWidth: 640, margin: '0 auto', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
        {/* Header bar */}
        {branding.orgName && (
          <div style={{ background: accent, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: 36, objectFit: 'contain' }} />}
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{branding.orgName}</span>
          </div>
        )}
        {/* Meta block */}
        <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '12px 32px', fontSize: 13, color: '#6b7280' }}>
          {to && <div><strong style={{ color: '#374151' }}>To:</strong> {renderText(to)}</div>}
          {subject && <div style={{ marginTop: 4 }}><strong style={{ color: '#374151' }}>Subject:</strong> {renderText(subject)}</div>}
        </div>
        {/* Body */}
        <div style={{ padding: '28px 32px', fontSize: 15, lineHeight: 1.7, color: '#1f2937' }}>
          {greeting && <p style={{ marginBottom: 16, fontWeight: 500 }}>{renderText(greeting)}</p>}
          {opening && <p style={{ marginBottom: 14 }}>{renderText(opening)}</p>}
          {body && <p style={{ marginBottom: 14, whiteSpace: 'pre-wrap' }}>{renderText(body)}</p>}
          {action && (
            <div style={{ background: '#eff6ff', border: `1px solid ${accent}40`, borderLeft: `4px solid ${accent}`, borderRadius: 6, padding: '12px 16px', margin: '16px 0' }}>
              <p style={{ margin: 0, fontWeight: 600, color: accent }}>Action Required</p>
              <p style={{ margin: '6px 0 0', color: '#374151' }}>{renderText(action)}</p>
            </div>
          )}
          {deadline && <p style={{ marginBottom: 14, color: '#dc2626', fontWeight: 500 }}>{renderText(deadline)}</p>}
          {closing && <p style={{ marginBottom: 14 }}>{renderText(closing)}</p>}
          {signoff && <p style={{ marginBottom: 8, fontWeight: 500 }}>{renderText(signoff)}</p>}
          {signature && (
            <div style={{ borderTop: `2px solid ${accent}`, paddingTop: 12, marginTop: 8, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap' }}>
              {renderText(signature)}
            </div>
          )}
          {attachments && (
            <div style={{ marginTop: 20, padding: '10px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, color: '#6b7280' }}>
              📎 {renderText(attachments)}
            </div>
          )}
        </div>
        {/* Disclaimer */}
        {disclaimer && (
          <div style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '12px 32px', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
            {renderText(disclaimer)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmailBuilder() {
  const [sections, setSections] = useState<EmailSection[]>(makeSections());
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [branding, setBranding] = useState({ color: '#7c3aed', orgName: '', logoUrl: '' });
  const [activeTab, setActiveTab] = useState<'template' | 'compose' | 'variables' | 'branding'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<BuilderTemplate | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [savedDocs, setSavedDocs] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const missing = findMissingPlaceholders(sections);

  // Load saved docs
  useEffect(() => {
    fetch('/api/builder-docs?builderId=email')
      .then(r => r.json())
      .then(d => { if (d.docs) setSavedDocs(d.docs); })
      .catch(() => {});
  }, []);

  // ── Load templates from DB ────────────────────────────────────────────────
  const [dbTemplates, setDbTemplates] = useState<BuilderTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    setTemplatesLoading(true);
    fetch('/api/builders/templates?builderId=email', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { success: boolean; templates: BuilderTemplate[] }) => {
        if (d.success) setDbTemplates(d.templates);
        else setTemplatesError('Failed to load templates.');
      })
      .catch(() => setTemplatesError('Could not load templates. Please refresh.'))
      .finally(() => setTemplatesLoading(false));
  }, []);

  // Active templates — filter out retired
  const mergedTemplates = dbTemplates.filter(t => t.status !== 'retired');

  const categories = ['all', ...Array.from(new Set(mergedTemplates.map(t => t.category)))];

  const filtered = mergedTemplates.filter(t => {
    const matchCat = categoryFilter === 'all' || t.category === categoryFilter;
    const matchInd = industryFilter === 'all'
      || (industryFilter === 'Popular' && t.popular)
      || (t.industries ?? []).includes(industryFilter as any);
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchInd && matchSearch && t.status === 'active';
  });

  function selectTemplate(t: BuilderTemplate) {
    setSelectedTemplate(t);
    setSections(applyTemplate(t));
    setDocTitle(t.name);
    setSaved(false);
    setBranding(prev => ({ ...prev, color: t.accentColor ?? '#7c3aed' }));
    setActiveTab('compose');
  }

  function handleNew() {
    if (!confirm('Start a new email? Unsaved changes will be lost.')) return;
    setSelectedTemplate(null);
    setSections(makeSections());
    setDocTitle('');
    setSaved(false);
    setActiveTab('template');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        builderId: 'email',
        templateId: selectedTemplate?.id ?? 'custom',
        title: docTitle || 'Untitled Email',
        fields: Object.fromEntries(sections.map(s => [s.key, s.value])),
        brandColor: branding.color,
        logoUrl: branding.logoUrl,
      };
      const r = await fetch('/api/builder-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) { setSaved(true); }
    } catch { /* ignore */ }
    setSaving(false);
  }

  function getFullEmailText() {
    const get = (key: string) => sections.find(s => s.key === key && s.enabled)?.value ?? '';
    return [
      get('to') && `To: ${get('to')}`,
      get('subject') && `Subject: ${get('subject')}`,
      '',
      get('greeting'),
      '',
      get('opening'),
      get('body'),
      get('action'),
      get('deadline'),
      get('closing'),
      '',
      get('signoff'),
      get('signature'),
      '',
      get('attachments') && `Attachments: ${get('attachments')}`,
      get('disclaimer') && `\n---\n${get('disclaimer')}`,
    ].filter((l): l is string => typeof l === 'string' && l !== '').join('\n');
  }

  function copyText(what: 'subject' | 'body' | 'full') {
    let text = '';
    if (what === 'subject') text = sections.find(s => s.key === 'subject')?.value ?? '';
    else if (what === 'body') {
      const keys = ['greeting', 'opening', 'body', 'action', 'deadline', 'closing', 'signoff', 'signature'];
      text = keys.map(k => sections.find(s => s.key === k && s.enabled)?.value ?? '').filter(Boolean).join('\n\n');
    } else text = getFullEmailText();
    navigator.clipboard.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 2000); });
  }

  function openInMailClient() {
    const subject = encodeURIComponent(sections.find(s => s.key === 'subject')?.value ?? '');
    const keys = ['greeting', 'opening', 'body', 'action', 'deadline', 'closing', 'signoff', 'signature'];
    const bodyText = keys.map(k => sections.find(s => s.key === k && s.enabled)?.value ?? '').filter(Boolean).join('\n\n');
    const to = sections.find(s => s.key === 'to')?.value ?? '';
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  }

  function toggleSection(id: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function updateSection(id: string, value: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, value } : s));
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function insertToken(sectionId: string, token: string) {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, value: s.value + token } : s));
  }

  return (
    <>
      <Helmet>
        <title>Email Builder — Sousa Murray Planeia</title>
        <meta name="description" content="Create professional emails with structured sections, variable placeholders, and email-style preview." />
      </Helmet>
      <DashboardLayout noPadding>
        <div className="flex flex-col h-full">
          {/* Top bar */}
          <div className="px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-foreground">Email Builder</h1>
              <p className="text-xs text-muted-foreground">Structured emails with sections, placeholders, and live preview</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleNew}>
                <RefreshCw className="w-3.5 h-3.5" /> New
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSaved(v => !v)}>
                <FolderOpen className="w-3.5 h-3.5" /> Saved ({savedDocs.length})
              </Button>
              {selectedTemplate && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyText('subject')}>
                    <Copy className="w-3.5 h-3.5" /> {copied === 'subject' ? 'Copied!' : 'Copy Subject'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyText('body')}>
                    <Copy className="w-3.5 h-3.5" /> {copied === 'body' ? 'Copied!' : 'Copy Body'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyText('full')}>
                    <Copy className="w-3.5 h-3.5" /> {copied === 'full' ? 'Copied!' : 'Copy All'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={openInMailClient}>
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Email Client
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                    {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save Draft'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Saved docs */}
          {showSaved && (
            <div className="px-6 py-3 border-b border-border bg-muted/30">
              {savedDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved emails yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedDocs.map(d => (
                    <button key={d.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 text-sm transition-colors">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{d.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString('en-GB')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Missing placeholders warning */}
          {missing.length > 0 && selectedTemplate && (
            <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800 font-medium">Unfilled placeholders:</span>
              {missing.map(m => (
                <Badge key={m} variant="outline" className="text-[10px] h-5 border-amber-400 text-amber-700 bg-amber-50">{m}</Badge>
              ))}
            </div>
          )}

          {/* Main layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel */}
            <div className="w-[340px] shrink-0 border-r border-border flex flex-col overflow-hidden">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 pt-3 border-b border-border">
                  <TabsList className="h-8 w-full grid grid-cols-4">
                    <TabsTrigger value="template"  className="text-xs h-7">Template</TabsTrigger>
                    <TabsTrigger value="compose"   className="text-xs h-7" disabled={!selectedTemplate}>Compose</TabsTrigger>
                    <TabsTrigger value="variables" className="text-xs h-7" disabled={!selectedTemplate}>Variables</TabsTrigger>
                    <TabsTrigger value="branding"  className="text-xs h-7">Branding</TabsTrigger>
                  </TabsList>
                </div>

                {/* ── Template picker ── */}
                <TabsContent value="template" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="p-3 space-y-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email templates…" className="pl-8 h-8 text-sm" />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {['all', 'Popular', 'Business', 'HR', 'Finance', 'Education', 'Charity'].map(ind => (
                        <button key={ind} onClick={() => setIndustryFilter(ind)}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${industryFilter === ind ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                          {ind === 'all' ? 'All' : ind}
                        </button>
                      ))}
                    </div>
                    <ScrollArea className="h-7">
                      <div className="flex gap-1.5 pb-1">
                        {categories.map(c => (
                          <button key={c} onClick={() => setCategoryFilter(c)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${categoryFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                            {c === 'all' ? 'All Categories' : c}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-3 space-y-2">
                      {templatesLoading && (
                        <div className="flex items-center justify-center py-12">
                          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!templatesLoading && templatesError && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-3">
                          <AlertTriangle className="w-4 h-4 shrink-0" /> {templatesError}
                        </div>
                      )}
                      {!templatesLoading && !templatesError && filtered.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No templates match your filters.</p>
                      )}
                      {!templatesLoading && filtered.map(t => (
                        <button key={t.id} onClick={() => selectTemplate(t)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${selectedTemplate?.id === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}>
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: (t.accentColor ?? '#7c3aed') + '20' }}>
                              <Mail className="w-3.5 h-3.5" style={{ color: t.accentColor ?? '#7c3aed' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-foreground">{t.name}</span>
                                {t.popular && <Badge variant="secondary" className="text-[10px] h-4">Popular</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <Badge variant="outline" className="text-[10px] h-4">{t.category}</Badge>
                                <Badge variant="outline" className="text-[10px] h-4 capitalize">{t.planRequired}</Badge>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* ── Compose (sections) ── */}
                <TabsContent value="compose" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="px-4 py-2 border-b border-border bg-muted/20">
                    <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Email title / name…" className="h-8 text-sm font-medium" />
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-3 space-y-2">
                      {sections.map((section, idx) => (
                        <div key={section.id} className={`rounded-xl border transition-all ${section.enabled ? 'border-border bg-card' : 'border-dashed border-border/50 bg-muted/20 opacity-60'}`}>
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-semibold text-foreground flex-1">{section.label}</span>
                            {section.required && <Badge variant="outline" className="text-[10px] h-4">Required</Badge>}
                            <div className="flex items-center gap-1">
                              <button onClick={() => moveSection(section.id, -1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button onClick={() => moveSection(section.id, 1)} disabled={idx === sections.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button onClick={() => toggleSection(section.id)} className="p-0.5 rounded hover:bg-muted">
                                {section.enabled ? <X className="w-3 h-3 text-muted-foreground" /> : <Plus className="w-3 h-3 text-primary" />}
                              </button>
                            </div>
                          </div>
                          {section.enabled && (
                            <div className="p-3">
                              {section.type === 'text' ? (
                                <Input value={section.value} onChange={e => updateSection(section.id, e.target.value)}
                                  placeholder={section.placeholder} className="h-8 text-sm" />
                              ) : (
                                <Textarea value={section.value} onChange={e => updateSection(section.id, e.target.value)}
                                  placeholder={section.placeholder} rows={3} className="text-sm resize-none" />
                              )}
                              {/* Quick token insert */}
                              <div className="flex gap-1 flex-wrap mt-1.5">
                                {PLACEHOLDER_TOKENS.slice(0, 5).map(tok => (
                                  <button key={tok} onClick={() => insertToken(section.id, tok)}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition-colors">
                                    {tok}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* ── Variables panel ── */}
                <TabsContent value="variables" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="p-4 border-b border-border bg-muted/20">
                    <p className="text-xs font-semibold text-foreground mb-0.5">Fill Placeholders</p>
                    <p className="text-[11px] text-muted-foreground">Replace [tokens] with real values. Changes apply to the preview instantly.</p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-3">
                      {PLACEHOLDER_TOKENS.map(token => {
                        const key = token.replace(/[\[\]]/g, '').replace(/ /g, '_').toLowerCase();
                        return (
                          <div key={token} className="space-y-1">
                            <Label className="text-xs">{token}</Label>
                            <Input value={variables[key] ?? ''} onChange={e => {
                              const val = e.target.value;
                              setVariables(prev => ({ ...prev, [key]: val }));
                              // Replace token in all sections
                              setSections(prev => prev.map(s => ({
                                ...s,
                                value: s.value.replace(new RegExp(token.replace(/[[\]]/g, '\\$&'), 'g'), val || token),
                              })));
                            }} placeholder={`Value for ${token}`} className="h-8 text-sm" />
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* ── Branding ── */}
                <TabsContent value="branding" className="p-4 space-y-4 mt-0">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organisation Name</Label>
                    <Input value={branding.orgName} onChange={e => setBranding(p => ({ ...p, orgName: e.target.value }))} className="h-8 text-sm" placeholder="Appears in email header" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Accent Colour</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={branding.color} onChange={e => setBranding(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                      <Input value={branding.color} onChange={e => setBranding(p => ({ ...p, color: e.target.value }))} className="h-8 text-sm w-32 font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Logo URL</Label>
                    <Input value={branding.logoUrl} onChange={e => setBranding(p => ({ ...p, logoUrl: e.target.value }))} className="h-8 text-sm" placeholder="https://example.com/logo.png" />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right panel — preview */}
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
              <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Email Preview</span>
                {selectedTemplate && <Badge variant="outline" className="text-[10px] h-5">{selectedTemplate.name}</Badge>}
                {missing.length > 0 && (
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-400 text-amber-700">
                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />{missing.length} unfilled
                  </Badge>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {selectedTemplate ? (
                    <EmailPreview sections={sections} branding={branding} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                      <Mail className="w-12 h-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">Select a template to start composing</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Or start from scratch with the blank template</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}
