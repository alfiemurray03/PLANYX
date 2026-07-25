import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface WebsiteBuilderOperation {
  type: string;
  path?: string;
  selector?: string;
  value?: string;
  attributeName?: string;
  title?: string;
  html?: string;
  css?: string;
  seoTitle?: string;
  seoDescription?: string;
}

interface Props {
  path: string;
  operations?: WebsiteBuilderOperation[];
  refreshKey?: number;
  compact?: boolean;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function buildManagedDocument(operation: WebsiteBuilderOperation, globalCss: string) {
  const title = escapeHtml(operation.title || 'Planyx page preview');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
a{color:inherit}${globalCss || ''}\n${operation.css || ''}
</style></head><body>${operation.html || '<main style="padding:4rem 1.5rem"><h1>Empty managed page</h1></main>'}</body></html>`;
}

function applyOperations(document: Document, operations: WebsiteBuilderOperation[]) {
  const pageCss = operations
    .filter(operation => operation.type === 'set_page_css' || operation.type === 'set_global_css')
    .map(operation => operation.css || operation.value || '')
    .join('\n');
  if (pageCss) {
    let style = document.getElementById('planyx-builder-draft-css') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'planyx-builder-draft-css';
      document.head.appendChild(style);
    }
    style.textContent = pageCss;
  }

  for (const operation of operations) {
    if (!operation.selector || ['set_page_css', 'set_global_css', 'create_page', 'update_page', 'delete_page'].includes(operation.type)) continue;
    let elements: Element[] = [];
    try { elements = Array.from(document.querySelectorAll(operation.selector)); } catch { continue; }
    for (const element of elements) {
      const htmlElement = element as HTMLElement;
      switch (operation.type) {
        case 'replace_text': htmlElement.textContent = operation.value || ''; break;
        case 'replace_html': htmlElement.innerHTML = operation.value || ''; break;
        case 'append_html': htmlElement.insertAdjacentHTML('beforeend', operation.value || ''); break;
        case 'hide': htmlElement.hidden = true; htmlElement.setAttribute('aria-hidden', 'true'); break;
        case 'set_attribute': if (operation.attributeName) htmlElement.setAttribute(operation.attributeName, operation.value || ''); break;
        case 'add_class': (operation.value || '').split(/\s+/).filter(Boolean).forEach(name => htmlElement.classList.add(name)); break;
        default: break;
      }
    }
  }

  if (!document.getElementById('planyx-builder-preview-lock')) {
    const style = document.createElement('style');
    style.id = 'planyx-builder-preview-lock';
    style.textContent = 'html{scroll-behavior:auto!important}a,button,input,select,textarea{cursor:default!important}';
    document.head.appendChild(style);
    document.addEventListener('submit', event => event.preventDefault(), true);
    document.addEventListener('click', event => event.preventDefault(), true);
  }
}

export default function AIWebsiteBuilderPreview({ path, operations = [], refreshKey = 0, compact = false }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);

  const managedOperation = useMemo(
    () => operations.find(operation => ['create_page', 'update_page'].includes(operation.type) && (!operation.path || operation.path === path)),
    [operations, path],
  );
  const globalCss = useMemo(
    () => operations.filter(operation => operation.type === 'set_global_css').map(operation => operation.css || operation.value || '').join('\n'),
    [operations],
  );
  const srcDoc = managedOperation ? buildManagedDocument(managedOperation, globalCss) : undefined;
  const src = srcDoc ? undefined : `${path || '/'}${(path || '/').includes('?') ? '&' : '?'}admin_builder_preview=1&draft=${refreshKey}-${reload}`;
  const widthClass = viewport === 'mobile' ? 'max-w-[390px]' : viewport === 'tablet' ? 'max-w-[820px]' : 'max-w-none';

  function prepare() {
    const document = frameRef.current?.contentDocument;
    if (!document?.body) return;
    applyOperations(document, operations);
    setReady(true);
  }

  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(prepare, 120);
    return () => window.clearTimeout(timer);
  }, [path, operations, refreshKey, reload]);

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${compact ? 'h-[660px]' : 'h-[calc(100vh-250px)] min-h-[620px]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex gap-1" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
          <div className="max-w-[340px] truncate rounded-md bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{path || '/'}</div>
          {operations.length > 0 && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">DRAFT PREVIEW</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setViewport('desktop')} aria-label="Desktop preview" className={`rounded-md p-1.5 ${viewport === 'desktop' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'text-slate-500'}`}><Monitor className="h-4 w-4" /></button>
          <button type="button" onClick={() => setViewport('tablet')} aria-label="Tablet preview" className={`rounded-md p-1.5 ${viewport === 'tablet' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'text-slate-500'}`}><Tablet className="h-4 w-4" /></button>
          <button type="button" onClick={() => setViewport('mobile')} aria-label="Mobile preview" className={`rounded-md p-1.5 ${viewport === 'mobile' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'text-slate-500'}`}><Smartphone className="h-4 w-4" /></button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setReady(false); setReload(value => value + 1); }}><RefreshCw className="h-4 w-4" /></Button>
          <a href={path || '/'} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Open live page"><ExternalLink className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-3 dark:bg-slate-950">
        {!ready && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm font-medium text-slate-500 backdrop-blur-sm dark:bg-slate-950/80 dark:text-slate-300"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Building preview…</div>}
        <div className={`h-full w-full overflow-hidden rounded-lg bg-white shadow-xl transition-[max-width] duration-300 ${widthClass}`}>
          <iframe key={`${path}-${refreshKey}-${reload}-${viewport}`} ref={frameRef} src={src} srcDoc={srcDoc} title="Planyx AI website builder preview" className="h-full w-full border-0 bg-white" onLoad={prepare} sandbox="allow-same-origin" />
        </div>
      </div>
      <p className="border-t border-slate-200 bg-white px-3 py-2 text-center text-[10px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">Preview mode blocks links, forms and submissions. Draft changes are not live until approved.</p>
    </section>
  );
}
