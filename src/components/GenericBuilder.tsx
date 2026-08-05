/**
 * GenericBuilder — Shared builder UI used by Contract, Policy, Form,
 * Report, Minutes, Proposal, Checklist, Letter, and Invoice builders.
 *
 * Templates are loaded from the DB via GET /api/builders/templates.
 * The `templates` prop is no longer used and has been removed.
 */
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Save, Printer, Download, Eye, RefreshCw,
  CheckCircle2, Search, FolderOpen,
  AlertTriangle, FileText, Lock, FileDown, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BuilderTemplate, BuilderDocument, BuilderId, BuilderLayoutId } from '@/lib/builder-framework';
import { todayISO, BUILDER_LAYOUTS, BUILDER_DEFAULT_LAYOUT } from '@/lib/builder-framework';
import { Layout } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { canAccessBuilderTemplate, canSaveDrafts, type PlanId } from '@/lib/plan-config';
import type { BuilderIndustry } from '@/lib/builder-framework';
export interface BrandingState {
  color: string;
  logoUrl: string;
  orgName: string;
}

interface GenericBuilderProps {
  builderId: BuilderId;
  title: string;
  subtitle: string;
  metaDescription: string;
  /** @deprecated Templates are now loaded from the DB. This prop is ignored. */
  templates?: BuilderTemplate[];
  defaultAccentColor?: string;
  renderPreview: (
    fields: Record<string, string>,
    template: BuilderTemplate,
    branding: BrandingState,
    layoutId?: BuilderLayoutId,
  ) => React.ReactNode;
}


function buildDefaultFields(template: BuilderTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.type === 'section_heading') continue;
    out[f.id] = f.defaultValue ?? (f.type === 'date' ? todayISO() : '');
  }
  return out;
}

const PRESET_COLORS = ['#1B4F8A','#1e1b8a','#0f766e','#7c3aed','#b45309','#dc2626','#16a34a','#0891b2','#374151'];

export default function GenericBuilder({
  builderId, title, subtitle, metaDescription,
  defaultAccentColor = '#1B4F8A', renderPreview,
}: GenericBuilderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userPlan = (user?.plan ?? 'free') as PlanId;

  const [selectedTemplate, setSelectedTemplate] = useState<BuilderTemplate | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [branding, setBranding] = useState<BrandingState>({ color: defaultAccentColor, logoUrl: '', orgName: '' });
  const [activeTab, setActiveTab] = useState<'template' | 'fields' | 'branding' | 'layout'>('template');
  const [selectedLayout, setSelectedLayout] = useState<BuilderLayoutId>(BUILDER_DEFAULT_LAYOUT[builderId] ?? 'letter');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDocs, setSavedDocs] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [currentDocId, setCurrentDocId] = useState<string | null>(null); // tracks the saved doc UUID
  const [industryFilter, setIndustryFilter] = useState<'all' | BuilderIndustry>('all');
  const [planError, setPlanError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (user === null && !user) {
      // user is null after loading completes — redirect
    }
  }, [user, navigate]);

  // ── Load templates from DB ────────────────────────────────────────────────
  const [dbTemplates, setDbTemplates] = useState<BuilderTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    fetch(`/api/builders/templates?builderId=${builderId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { success: boolean; templates: BuilderTemplate[] }) => {
        if (d.success) setDbTemplates(d.templates);
        else setTemplatesError('Failed to load templates.');
      })
      .catch(() => setTemplatesError('Could not load templates. Please refresh.'))
      .finally(() => setTemplatesLoading(false));
  }, [builderId]);

  // Active templates — filter out retired
  const templates = dbTemplates.filter(t => t.status !== 'retired');

  // Load saved docs list
  useEffect(() => {
    fetch(`/api/builder-docs?builderId=${builderId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.docs) setSavedDocs(d.docs); })
      .catch(() => {});
  }, [builderId]);

  function selectTemplate(t: BuilderTemplate) {
    // Enforce plan access
    if (!canAccessBuilderTemplate(userPlan, t.planRequired)) {
      setPlanError(`This template requires the ${t.planRequired.charAt(0).toUpperCase() + t.planRequired.slice(1)} plan or above. Upgrade to access it.`);
      return;
    }
    setPlanError(null);
    setSelectedTemplate(t);
    setFields(buildDefaultFields(t));
    setBranding(prev => ({ ...prev, color: t.accentColor ?? defaultAccentColor }));
    setDocTitle(t.name);
    setSaved(false);
    setCurrentDocId(null); // new template = new doc
    setActiveTab('fields');
    // Apply template's default layout if set
    if (t.defaultLayout) setSelectedLayout(t.defaultLayout);
    else setSelectedLayout(BUILDER_DEFAULT_LAYOUT[builderId] ?? 'letter');
  }

  function updateField(id: string, value: string) {
    setFields(prev => ({ ...prev, [id]: value }));
    setSaved(false);
  }

  async function handleSaveDraft() {
    if (!selectedTemplate) return;
    if (!canSaveDrafts(userPlan)) {
      setPlanError('Saving documents requires a paid plan. Upgrade to Personal or above to save your work.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        builderId,
        templateId: selectedTemplate.id,
        title: docTitle || selectedTemplate.name,
        fields,
        brandColor: branding.color,
        logoUrl: branding.logoUrl,
        layoutId: selectedLayout,
        status: 'draft',
      };

      let res: Response;
      if (currentDocId) {
        // Update existing doc — no new row created
        res = await fetch(`/api/builder-docs/${currentDocId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } else {
        // First save — create new doc
        res = await fetch('/api/builder-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        setSaved(true);
        const d = await res.json() as { doc?: { id: string; title: string; updatedAt: string } };
        if (d.doc) {
          setCurrentDocId(d.doc.id); // remember the ID for future saves
          setSavedDocs(prev => [d.doc!, ...prev.filter(x => x.id !== d.doc!.id)]);
        }
      } else {
        // Fallback: persist to localStorage so work isn't lost
        localStorage.setItem(`ja_builder_${builderId}_draft`, JSON.stringify(body));
        setSaved(true);
      }
    } catch {
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  // Keep handleSave as alias for draft save
  async function handleSave() { return handleSaveDraft(); }

  async function loadDoc(id: string) {
    try {
      const res = await fetch(`/api/builder-docs/${id}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json() as { doc?: BuilderDocument };
        if (d.doc) {
          const t = templates.find(t => t.id === d.doc!.templateId);
          if (t) {
            setSelectedTemplate(t);
            setFields(d.doc!.fields);
            setBranding(prev => ({ ...prev, color: d.doc!.brandColor ?? defaultAccentColor, logoUrl: d.doc!.logoUrl ?? '' }));
            setDocTitle(d.doc!.title);
            setCurrentDocId(id); // track so subsequent saves use PUT
            if (d.doc!.layoutId) setSelectedLayout(d.doc!.layoutId);
            setSaved(true);
            setShowSaved(false);
            setActiveTab('fields');
          }
        }
      }
    } catch { /* ignore */ }
  }

  /** Extract the inner document HTML, stripping the preview wrapper's shadow/rounded classes */
  function getExportHTML(): string {
    const wrapper = document.getElementById('builder-preview-content');
    if (!wrapper) return '';
    // Clone so we don't mutate the live DOM
    const clone = wrapper.cloneNode(true) as HTMLElement;
    // Remove preview-only classes (shadow, rounded, overflow-hidden)
    clone.className = '';
    clone.style.boxShadow = 'none';
    clone.style.borderRadius = '0';
    clone.style.overflow = 'visible';
    return clone.outerHTML;
  }

  const PRINT_STYLES = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: #ffffff; }
    @page { size: A4; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      * { box-shadow: none !important; }
    }
  `;

  function handlePrint() {
    if (!selectedTemplate) return;
    if (!canAccessBuilderTemplate(userPlan, selectedTemplate.planRequired)) {
      setPlanError('This template requires a paid plan. Upgrade to print or export it.');
      return;
    }
    const html = getExportHTML();
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title>
      <style>${PRINT_STYLES}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  function handleSavePDF() {
    if (!selectedTemplate) return;
    if (!canAccessBuilderTemplate(userPlan, selectedTemplate.planRequired)) {
      setPlanError('This template requires a paid plan. Upgrade to export it.');
      return;
    }
    const html = getExportHTML();
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const filename = docTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'document';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
      <style>${PRINT_STYLES}</style>
      <script>
        window.onload = function() {
          document.title = '${filename}';
          window.print();
        };
      <\/script>
      </head><body>${html}</body></html>`);
    win.document.close();
  }

  function handleDownloadHTML() {
    if (!selectedTemplate) return;
    if (!canAccessBuilderTemplate(userPlan, selectedTemplate.planRequired)) {
      setPlanError('This template requires a paid plan. Upgrade to download it.');
      return;
    }
    const html = getExportHTML();
    if (!html) return;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title>
      <style>${PRINT_STYLES}</style>
      </head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'document'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Legacy alias
  function handleDownload() { handleDownloadHTML(); }

  function handleNew() {
    if (!confirm('Start a new document? Unsaved changes will be lost.')) return;
    setSelectedTemplate(null);
    setFields({});
    setDocTitle('');
    setSaved(false);
    setCurrentDocId(null); // clear so next save creates a fresh doc
    setSelectedLayout(BUILDER_DEFAULT_LAYOUT[builderId] ?? 'letter');
    setActiveTab('template');
  }

  // Filter templates
  const categories = ['all', ...Array.from(new Set(templates.map(t => t.category)))];

  // Collect industries present in this builder's templates
  const availableIndustries: Array<'all' | BuilderIndustry> = [
    'all',
    'Popular',
    ...Array.from(new Set(
      templates.flatMap(t => t.industries ?? [])
    )).sort(),
  ] as Array<'all' | BuilderIndustry>;

  const filtered = templates.filter(t => {
    const matchCat = categoryFilter === 'all' || t.category === categoryFilter;
    const matchInd = industryFilter === 'all'
      || (industryFilter === 'Popular' && t.popular)
      || (t.industries ?? []).includes(industryFilter as BuilderIndustry);
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchInd && matchSearch && t.status === 'active';
  });

  return (
    <>
      <Helmet>
        <title>{title} — Sousa Murray Planeia</title>
        <meta name="description" content={metaDescription} />
      </Helmet>
      <DashboardLayout noPadding>
        <div className="flex flex-col h-full">
          {/* Top bar */}
          <div className="px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
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
                  {/* Export split menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3 ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={handleSavePDF} className="gap-2 cursor-pointer">
                        <FileDown className="w-4 h-4 text-red-500" />
                        <div>
                          <div className="text-sm font-medium">Save as PDF</div>
                          <div className="text-xs text-muted-foreground">Print to PDF via browser</div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownloadHTML} className="gap-2 cursor-pointer">
                        <FileText className="w-4 h-4 text-blue-500" />
                        <div>
                          <div className="text-sm font-medium">Download HTML</div>
                          <div className="text-xs text-muted-foreground">Save as .html file</div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handlePrint} className="gap-2 cursor-pointer">
                        <Printer className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Print Document</div>
                          <div className="text-xs text-muted-foreground">Open print dialog</div>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* Save draft button */}
                  <Button size="sm" className="gap-1.5" onClick={handleSaveDraft} disabled={saving}>
                    {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save Draft'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Saved docs dropdown */}
          {showSaved && (
            <div className="px-6 py-3 border-b border-border bg-muted/30">
              {savedDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved documents yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedDocs.map(doc => (
                    <button key={doc.id} onClick={() => loadDoc(doc.id)}
                      className="text-xs px-3 py-1.5 bg-card border border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      {doc.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            {/* Left: Editor */}
            <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col border-r border-border shrink-0">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 pt-3 border-b border-border">
                  <TabsList className="h-8 w-full grid grid-cols-4">
                    <TabsTrigger value="template" className="text-xs h-7">Template</TabsTrigger>
                    <TabsTrigger value="fields" className="text-xs h-7" disabled={!selectedTemplate}>Fields</TabsTrigger>
                    <TabsTrigger value="branding" className="text-xs h-7" disabled={!selectedTemplate}>Branding</TabsTrigger>
                    <TabsTrigger value="layout" className="text-xs h-7" disabled={!selectedTemplate}>Layout</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  {/* Template picker */}
                  <TabsContent value="template" className="p-4 space-y-3 mt-0">
                    {/* Plan error banner */}
                    {planError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{planError}</p>
                          <button onClick={() => navigate('/pricing')} className="text-xs underline mt-0.5 hover:no-underline">View plans →</button>
                        </div>
                        <button onClick={() => setPlanError(null)} className="text-amber-600 hover:text-amber-800 text-xs">✕</button>
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
                    </div>
                    {/* Industry filter */}
                    {availableIndustries.length > 2 && (
                      <div className="flex flex-wrap gap-1.5">
                        {availableIndustries.map(ind => (
                          <button key={ind} onClick={() => { setIndustryFilter(ind); setCategoryFilter('all'); }}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${industryFilter === ind ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>
                            {ind === 'all' ? 'All Industries' : ind}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Category filter */}
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map(cat => (
                        <button key={cat} onClick={() => setCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${categoryFilter === cat ? 'bg-secondary text-secondary-foreground border-secondary' : 'border-border text-muted-foreground hover:border-secondary/50'}`}>
                          {cat === 'all' ? 'All Categories' : cat}
                        </button>
                      ))}
                    </div>
                    {/* Results count */}
                    <p className="text-[11px] text-muted-foreground">
                      {templatesLoading ? 'Loading templates…' : `${filtered.length} template${filtered.length !== 1 ? 's' : ''}${(industryFilter !== 'all' || categoryFilter !== 'all' || search) ? ' matching filters' : ' available'}`}
                    </p>
                    <div className="space-y-2">
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
                        <p className="text-sm text-muted-foreground text-center py-8">No templates found.</p>
                      )}
                      {!templatesLoading && filtered.map(t => {
                        const accessible = canAccessBuilderTemplate(userPlan, t.planRequired);
                        return (
                          <button key={t.id} onClick={() => selectTemplate(t)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedTemplate?.id === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : accessible ? 'border-border hover:border-primary/40 hover:bg-muted/30' : 'border-border opacity-60 hover:border-amber-400/60 hover:bg-amber-50/30'}`}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: (t.accentColor ?? defaultAccentColor) + '20' }}>
                              {accessible
                                ? <FileText className="w-4 h-4" style={{ color: t.accentColor ?? defaultAccentColor }} />
                                : <Lock className="w-4 h-4 text-amber-600" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-foreground">{t.name}</span>
                                {t.popular && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Popular</Badge>}
                                {!accessible && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-400 text-amber-700">Upgrade required</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{t.description}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <Badge variant="outline" className="text-[10px] h-4">{t.category}</Badge>
                                {t.planRequired !== 'free' && (
                                  <Badge variant="outline" className="text-[10px] h-4 capitalize border-amber-400 text-amber-700">{t.planRequired}</Badge>
                                )}
                              </div>
                            </div>
                            {selectedTemplate?.id === t.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>

                  {/* Fields */}
                  <TabsContent value="fields" className="p-4 space-y-4 mt-0">
                    {selectedTemplate && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Document Title</Label>
                          <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} className="h-8 text-sm" placeholder="Document title…" />
                        </div>
                        <Separator />
                        {selectedTemplate.fields.map(field => {
                          if (field.type === 'section_heading') {
                            return (
                              <div key={field.id} className="pt-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{field.label}</p>
                              </div>
                            );
                          }
                          return (
                            <div key={field.id} className="space-y-1.5">
                              <Label className="text-xs">
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </Label>
                              {field.type === 'textarea' ? (
                                <Textarea
                                  value={fields[field.id] ?? ''}
                                  onChange={e => updateField(field.id, e.target.value)}
                                  placeholder={field.placeholder}
                                  rows={4}
                                  className="text-sm resize-none"
                                />
                              ) : field.type === 'select' ? (
                                <Select value={fields[field.id] ?? ''} onValueChange={v => updateField(field.id, v)}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={field.placeholder} /></SelectTrigger>
                                  <SelectContent>
                                    {(field.options ?? []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : field.type === 'toggle' ? (
                                <div className="flex items-center gap-3">
                                  <Switch
                                    checked={fields[field.id] === 'true'}
                                    onCheckedChange={v => updateField(field.id, v ? 'true' : 'false')}
                                  />
                                  <span className="text-sm text-muted-foreground">{field.placeholder}</span>
                                </div>
                              ) : (
                                <Input
                                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                                  value={fields[field.id] ?? ''}
                                  onChange={e => updateField(field.id, e.target.value)}
                                  placeholder={field.placeholder}
                                  className="h-8 text-sm"
                                />
                              )}
                              {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </TabsContent>

                  {/* Branding */}
                  <TabsContent value="branding" className="p-4 space-y-4 mt-0">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Organisation / Business Name</Label>
                      <Input value={branding.orgName} onChange={e => setBranding(prev => ({ ...prev, orgName: e.target.value }))} className="h-8 text-sm" placeholder="Appears in document header" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Accent Colour</Label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={branding.color} onChange={e => setBranding(prev => ({ ...prev, color: e.target.value }))}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                        <Input value={branding.color} onChange={e => setBranding(prev => ({ ...prev, color: e.target.value }))} className="h-8 text-sm w-32 font-mono" />
                        <div className="flex gap-1.5 flex-wrap">
                          {PRESET_COLORS.map(c => (
                            <button key={c} onClick={() => setBranding(prev => ({ ...prev, color: c }))}
                              className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                              style={{ background: c, borderColor: branding.color === c ? '#000' : 'transparent' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Logo URL</Label>
                      <Input value={branding.logoUrl} onChange={e => setBranding(prev => ({ ...prev, logoUrl: e.target.value }))} className="h-8 text-sm" placeholder="https://example.com/logo.png" />
                      <p className="text-[11px] text-muted-foreground">Enter a public URL to your logo. It will appear in the document header.</p>
                    </div>
                    {branding.logoUrl && (
                      <div className="border border-border rounded-lg p-3 bg-muted/20">
                        <img src={branding.logoUrl} alt="Logo preview" className="max-h-16 max-w-48 object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                  </TabsContent>

                  {/* Layout */}
                  <TabsContent value="layout" className="p-4 space-y-3 mt-0">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-0.5">Document Layout</p>
                      <p className="text-[11px] text-muted-foreground mb-3">Choose how the document is structured and presented. The default is set by the template.</p>
                    </div>
                    {(() => {
                      const suitableLayouts = BUILDER_LAYOUTS.filter(l => l.suitableFor.includes(builderId));
                      const otherLayouts = BUILDER_LAYOUTS.filter(l => !l.suitableFor.includes(builderId));
                      return (
                        <div className="space-y-2">
                          {suitableLayouts.length > 0 && (
                            <>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recommended for this builder</p>
                              {suitableLayouts.map(layout => (
                                <button key={layout.id} onClick={() => setSelectedLayout(layout.id)}
                                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${selectedLayout === layout.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}>
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${selectedLayout === layout.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                    <Layout className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-foreground">{layout.name}</div>
                                    <div className="text-xs text-muted-foreground">{layout.description}</div>
                                    {selectedTemplate?.defaultLayout === layout.id && (
                                      <Badge variant="outline" className="text-[10px] h-4 mt-1">Template default</Badge>
                                    )}
                                  </div>
                                  {selectedLayout === layout.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                                </button>
                              ))}
                            </>
                          )}
                          {otherLayouts.length > 0 && (
                            <>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3">Other layouts</p>
                              {otherLayouts.map(layout => (
                                <button key={layout.id} onClick={() => setSelectedLayout(layout.id)}
                                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${selectedLayout === layout.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}>
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${selectedLayout === layout.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                    <Layout className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-foreground">{layout.name}</div>
                                    <div className="text-xs text-muted-foreground">{layout.description}</div>
                                  </div>
                                  {selectedLayout === layout.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>

            {/* Right: Preview */}
            <div className="hidden lg:flex flex-1 flex-col bg-muted/30 overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Live Preview</span>
                  {selectedTemplate && <Badge variant="outline" className="text-[10px] h-5">{selectedTemplate.name}</Badge>}
                  {selectedTemplate && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                      <Layout className="w-2.5 h-2.5" />
                      {BUILDER_LAYOUTS.find(l => l.id === selectedLayout)?.name ?? selectedLayout}
                    </Badge>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6 flex justify-center">
                  {selectedTemplate ? (
                    <div id="builder-preview-content" className="shadow-xl rounded-sm overflow-hidden" style={{ width: '210mm' }}>
                      {renderPreview(fields, selectedTemplate, branding, selectedLayout)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground font-medium">Select a template to begin</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Choose from the Template tab on the left</p>
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
