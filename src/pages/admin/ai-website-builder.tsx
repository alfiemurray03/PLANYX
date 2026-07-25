import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertTriangle, Bot, CheckCircle2, Code2, ExternalLink, FileCode2, Loader2,
  Paintbrush, Plus, RefreshCw, Rocket, Save, Trash2, WandSparkles,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
}

interface Operation {
  type: string;
  path?: string;
  selector?: string;
  value?: string;
  attributeName?: string;
  title?: string;
  html?: string;
  css?: string;
}

interface ChangePlan {
  id: string;
  prompt: string;
  target_path: string;
  status: string;
  created_at?: string;
  created_by?: string;
  plan: { summary: string; warnings?: string[]; operations: Operation[] };
}

interface Inventory {
  success: boolean;
  settings: { global_css: string };
  pages: ManagedPage[];
  rules: ManagedRule[];
  plans: ChangePlan[];
  aiAvailable: boolean;
  error?: string;
  correlationId?: string;
}

type Section = 'ai' | 'pages' | 'rules' | 'css' | 'history';
type Busy = 'load' | 'generate' | 'publish' | 'save' | null;

const EMPTY_PAGE: ManagedPage = {
  id: '', path: '/new-page', title: 'New page', status: 'draft', html: '', css: '',
  seo_title: '', seo_description: '', noindex: 0,
};

const EMPTY_RULE = {
  path: '/', operation: 'replace_text', selector: 'main h1', value: '', attributeName: '', sortOrder: 100,
};

async function request<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/website-builder', {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; error?: string; correlationId?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(`${payload.error || 'The AI Website Builder could not complete the request.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
  }
  return payload;
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function AdminAIWebsiteBuilderPage() {
  const [section, setSection] = useState<Section>('ai');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState<Busy>('load');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetPath, setTargetPath] = useState('/');
  const [activePlan, setActivePlan] = useState<ChangePlan | null>(null);
  const [planJson, setPlanJson] = useState('');
  const [page, setPage] = useState<ManagedPage>(EMPTY_PAGE);
  const [rule, setRule] = useState(EMPTY_RULE);
  const [globalCss, setGlobalCss] = useState('');

  const load = useCallback(async () => {
    setBusy('load');
    setError('');
    try {
      const data = await request<Inventory>();
      setInventory(data);
      setGlobalCss(data.settings?.global_css || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The builder could not be loaded.');
    } finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const drafts = useMemo(() => inventory?.plans.filter(item => item.status === 'draft') || [], [inventory]);

  function notice(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 4000);
  }

  function choosePlan(item: ChangePlan) {
    setActivePlan(item);
    setPlanJson(JSON.stringify(item.plan, null, 2));
    setPrompt(item.prompt);
    setTargetPath(item.target_path);
    setSection('ai');
  }

  async function generate() {
    setBusy('generate'); setError('');
    try {
      const result = await request<{ success: boolean; plan: ChangePlan }>({ action: 'generate_plan', prompt, targetPath });
      choosePlan(result.plan);
      notice('Draft plan generated. Review it before publication.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'A plan could not be generated.'); }
    finally { setBusy(null); }
  }

  async function savePlan() {
    if (!activePlan) return;
    setBusy('save'); setError('');
    try {
      const result = await request<{ success: boolean; plan: ChangePlan }>({ action: 'save_plan_json', id: activePlan.id, plan: planJson });
      choosePlan(result.plan);
      notice('Draft plan updated.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The plan could not be saved.'); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!activePlan || !window.confirm('Publish this approved plan to the live Planyx website now?')) return;
    setBusy('publish'); setError('');
    try {
      await request({ action: 'publish_plan', id: activePlan.id });
      setActivePlan(null); setPlanJson('');
      notice('Approved changes published to production.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The plan could not be published.'); }
    finally { setBusy(null); }
  }

  async function discard() {
    if (!activePlan) return;
    setBusy('save'); setError('');
    try {
      await request({ action: 'discard_plan', id: activePlan.id });
      setActivePlan(null); setPlanJson('');
      notice('Draft discarded.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The draft could not be discarded.'); }
    finally { setBusy(null); }
  }

  async function savePage() {
    setBusy('save'); setError('');
    try {
      await request({ action: 'save_page', page: { ...page, seoTitle: page.seo_title, seoDescription: page.seo_description, noindex: Boolean(page.noindex) } });
      notice('Managed page saved.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The page could not be saved.'); }
    finally { setBusy(null); }
  }

  async function deletePage(path: string) {
    if (!window.confirm(`Delete ${path} and its managed rules?`)) return;
    setBusy('save'); setError('');
    try {
      await request({ action: 'delete_page', path });
      setPage(EMPTY_PAGE); notice('Managed page deleted.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The page could not be deleted.'); }
    finally { setBusy(null); }
  }

  async function saveRule() {
    setBusy('save'); setError('');
    try {
      await request({ action: 'save_rule', rule });
      setRule(EMPTY_RULE); notice('Page change published.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The page change could not be saved.'); }
    finally { setBusy(null); }
  }

  async function deleteRule(id: string) {
    if (!window.confirm('Remove this live website rule?')) return;
    setBusy('save'); setError('');
    try {
      await request({ action: 'delete_rule', id }); notice('Page rule removed.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The rule could not be removed.'); }
    finally { setBusy(null); }
  }

  async function saveCss() {
    setBusy('save'); setError('');
    try {
      await request({ action: 'save_global_css', css: globalCss }); notice('Global customer-site CSS published.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Global CSS could not be saved.'); }
    finally { setBusy(null); }
  }

  const tabs: Array<[Section, string, typeof Bot]> = [
    ['ai', 'AI builder', WandSparkles], ['pages', 'Pages & HTML', FileCode2],
    ['rules', 'Existing pages', Code2], ['css', 'Global CSS', Paintbrush], ['history', 'History', RefreshCw],
  ];

  return (
    <AdminLayout title="AI Website Builder">
      <Helmet><title>AI Website Builder | Planyx Admin Centre</title></Helmet>
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-600" />
          <div className="flex flex-col gap-5 p-5 pt-7 sm:p-7 sm:pt-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white"><WandSparkles className="h-6 w-6" /></span>
              <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">AI Website Builder</h1><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Production managed</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Ask Planyx to change customer pages, create or remove pages, edit HTML and CSS, and publish approved changes without editing application code.</p><p className="mt-2 text-xs text-slate-500">Admin, API, authentication and secure signing routes remain protected. AI plans require your approval before going live.</p></div>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={busy !== null}><RefreshCw className={`mr-2 h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </section>

        <Alert className="rounded-2xl border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Review before publication:</strong> generated content is a drafting and publishing aid. Check wording, legal claims, privacy, safeguarding, links and mobile layout before approving it.</AlertDescription></Alert>
        {message && <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-950"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
        {error && <Alert variant="destructive" className="rounded-2xl"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="AI Website Builder sections">
          {tabs.map(([id, text, Icon]) => <button key={id} type="button" onClick={() => setSection(id)} className={`inline-flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold transition ${section === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}><Icon className="mr-2 h-4 w-4" />{text}</button>)}
        </nav>

        {busy === 'load' && !inventory ? <div className="flex min-h-72 items-center justify-center rounded-3xl border bg-white"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : section === 'ai' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Tell the builder what to change</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Include the page path, wording, section, colour or layout you want changed.</p>
              <div className="mt-5"><Label htmlFor="builder-target">Target page</Label><Input id="builder-target" value={targetPath} onChange={event => setTargetPath(event.target.value)} className="mt-1 font-mono" placeholder="/age-check" /></div>
              <div className="mt-4"><Label htmlFor="builder-prompt">Request</Label><textarea id="builder-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows={8} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6" placeholder="On /age-check, make the wording clearer, add a privacy section and soften the background. Keep the 16+ safeguards." /></div>
              <Button className="mt-4" onClick={() => void generate()} disabled={busy !== null || prompt.trim().length < 8}>{busy === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Generate draft plan</Button>

              {activePlan && <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/30 dark:bg-blue-500/10"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-blue-700">Draft plan</p><h3 className="mt-1 font-semibold text-slate-950 dark:text-white">{activePlan.plan.summary}</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">{activePlan.plan.operations.length} changes</span></div>{activePlan.plan.warnings?.map((warning, index) => <p key={index} className="mt-2 text-xs text-amber-800">⚠ {warning}</p>)}<div className="mt-4 space-y-2">{activePlan.plan.operations.map((operation, index) => <div key={index} className="rounded-xl border border-blue-100 bg-white p-3 text-sm dark:bg-slate-900"><strong>{index + 1}. {label(operation.type)}</strong>{operation.path && <code className="ml-2 text-xs">{operation.path}</code>}{operation.selector && <p className="mt-1 text-xs text-slate-500">Selector: {operation.selector}</p>}</div>)}</div><div className="mt-4"><Label htmlFor="plan-json">Advanced plan JSON</Label><textarea id="plan-json" value={planJson} onChange={event => setPlanJson(event.target.value)} rows={14} spellCheck={false} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs leading-5 text-slate-100" /></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void savePlan()} disabled={busy !== null}><Save className="mr-2 h-4 w-4" />Save edited plan</Button><Button onClick={() => void publish()} disabled={busy !== null}>{busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Approve and publish live</Button><Button variant="ghost" onClick={() => void discard()} disabled={busy !== null}><Trash2 className="mr-2 h-4 w-4" />Discard</Button></div></div>}
            </section>
            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-950 dark:text-white">Unpublished drafts</h2><div className="mt-3 space-y-2">{drafts.length ? drafts.map(item => <button key={item.id} type="button" onClick={() => choosePlan(item)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300 dark:border-slate-800"><p className="line-clamp-2 text-sm font-semibold">{item.plan.summary}</p><p className="mt-1 text-xs text-slate-500">{item.target_path} · {item.plan.operations.length} changes</p></button>) : <p className="text-sm text-slate-500">No draft plans.</p>}</div></aside>
          </div>
        ) : section === 'pages' ? (
          <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold">Managed pages</h2><Button size="sm" onClick={() => setPage({ ...EMPTY_PAGE, id: crypto.randomUUID(), path: `/new-page-${Date.now()}` })}><Plus className="mr-1 h-4 w-4" />New</Button></div><div className="mt-3 space-y-2">{inventory?.pages.map(item => <button key={item.id} type="button" onClick={() => setPage({ ...item })} className={`w-full rounded-xl border p-3 text-left ${page.path === item.path ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-800'}`}><strong className="text-sm">{item.title}</strong><code className="mt-1 block text-xs text-slate-500">{item.path}</code></button>)}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Full page HTML and CSS</h2><p className="mt-1 text-sm text-slate-500">Create, edit, publish or remove a complete managed page.</p></div>{page.status === 'published' && <a href={page.path} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700">Open live <ExternalLink className="ml-1 inline h-3.5 w-3.5" /></a>}</div><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label>Title</Label><Input value={page.title} onChange={event => setPage(current => ({ ...current, title: event.target.value }))} className="mt-1" /></div><div><Label>Path</Label><Input value={page.path} onChange={event => setPage(current => ({ ...current, path: event.target.value }))} className="mt-1 font-mono" /></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label>Status</Label><select value={page.status} onChange={event => setPage(current => ({ ...current, status: event.target.value as ManagedPage['status'] }))} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={Boolean(page.noindex)} onChange={event => setPage(current => ({ ...current, noindex: event.target.checked ? 1 : 0 }))} /> No search indexing</label></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label>SEO title</Label><Input value={page.seo_title} onChange={event => setPage(current => ({ ...current, seo_title: event.target.value }))} className="mt-1" /></div><div><Label>SEO description</Label><Input value={page.seo_description} onChange={event => setPage(current => ({ ...current, seo_description: event.target.value }))} className="mt-1" /></div></div><div className="mt-4"><Label>HTML</Label><textarea value={page.html} onChange={event => setPage(current => ({ ...current, html: event.target.value }))} rows={18} spellCheck={false} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100" /></div><div className="mt-4"><Label>Page CSS</Label><textarea value={page.css} onChange={event => setPage(current => ({ ...current, css: event.target.value }))} rows={12} spellCheck={false} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100" /></div><div className="mt-4 flex gap-2"><Button onClick={() => void savePage()} disabled={busy !== null}><Save className="mr-2 h-4 w-4" />Save page</Button>{inventory?.pages.some(item => item.path === page.path) && <Button variant="destructive" onClick={() => void deletePage(page.path)} disabled={busy !== null}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>}</div></section></div>
        ) : section === 'rules' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Edit an existing page</h2><p className="mt-1 text-sm text-slate-500">Target existing website or customer-portal markup with HTML, text or CSS changes.</p><div className="mt-5"><Label>Path</Label><Input value={rule.path} onChange={event => setRule(current => ({ ...current, path: event.target.value }))} className="mt-1 font-mono" /></div><div className="mt-4"><Label>Change type</Label><select value={rule.operation} onChange={event => setRule(current => ({ ...current, operation: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"><option value="replace_text">Replace text</option><option value="replace_html">Replace HTML</option><option value="append_html">Add HTML</option><option value="hide">Hide/remove visually</option><option value="set_attribute">Set attribute</option><option value="add_class">Add CSS class</option><option value="set_page_css">Page CSS</option></select></div>{rule.operation !== 'set_page_css' && <div className="mt-4"><Label>CSS selector</Label><Input value={rule.selector} onChange={event => setRule(current => ({ ...current, selector: event.target.value }))} className="mt-1 font-mono" /></div>}{rule.operation === 'set_attribute' && <div className="mt-4"><Label>Attribute</Label><Input value={rule.attributeName} onChange={event => setRule(current => ({ ...current, attributeName: event.target.value }))} className="mt-1 font-mono" /></div>}<div className="mt-4"><Label>{rule.operation === 'set_page_css' ? 'CSS' : rule.operation.includes('html') ? 'HTML' : 'Value'}</Label><textarea value={rule.value} onChange={event => setRule(current => ({ ...current, value: event.target.value }))} rows={12} spellCheck={false} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100" /></div><Button className="mt-4" onClick={() => void saveRule()} disabled={busy !== null}><Rocket className="mr-2 h-4 w-4" />Publish change</Button></section><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Published page changes</h2><div className="mt-4 space-y-2">{inventory?.rules.length ? inventory.rules.map(item => <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-2"><div><strong className="text-sm">{label(item.operation)}</strong><code className="ml-2 text-xs">{item.path_pattern}</code>{item.selector && <p className="mt-1 text-xs text-slate-500">{item.selector}</p>}<p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.value}</p></div><Button size="sm" variant="ghost" onClick={() => void deleteRule(item.id)}><Trash2 className="h-4 w-4" /></Button></div></div>) : <p className="text-sm text-slate-500">No published rules.</p>}</div></section></div>
        ) : section === 'css' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Global customer-site CSS</h2><p className="mt-1 text-sm text-slate-500">Applies across public and signed-in customer pages, excluding protected admin, API, authentication and signing routes.</p><textarea value={globalCss} onChange={event => setGlobalCss(event.target.value)} rows={28} spellCheck={false} className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100" /><Button className="mt-4" onClick={() => void saveCss()} disabled={busy !== null}><Save className="mr-2 h-4 w-4" />Publish global CSS</Button></section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold">Website change history</h2><div className="mt-4 space-y-2">{inventory?.plans.map(item => <button key={item.id} type="button" onClick={() => choosePlan(item)} className="w-full rounded-xl border border-slate-200 p-4 text-left dark:border-slate-800"><div className="flex items-start justify-between gap-2"><div><strong>{item.plan.summary}</strong><p className="mt-1 text-xs text-slate-500">{item.target_path} · {item.created_by || 'Administrator'} · {item.created_at || ''}</p></div><span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{item.status}</span></div></button>)}</div></section>
        )}
      </div>
    </AdminLayout>
  );
}
