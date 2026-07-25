import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Code2, ExternalLink, FileCode2,
  FilePlus2, Folder, GitBranch, Github, Loader2, RefreshCw, Save, Search, Trash2,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SourceFileSummary {
  path: string;
  sha: string;
  size: number;
  editable: boolean;
}

interface SourceFileContent {
  path: string;
  sha: string;
  size: number;
  content: string;
  htmlUrl: string;
}

interface TreePayload {
  success: boolean;
  repository: string;
  branch: string;
  writable: boolean;
  files: SourceFileSummary[];
  truncated: boolean;
  error?: string;
  correlationId?: string;
}

interface FilePayload {
  success: boolean;
  repository: string;
  branch: string;
  writable: boolean;
  file: SourceFileContent;
  error?: string;
  correlationId?: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  file?: SourceFileSummary;
  children: TreeNode[];
}

type Busy = 'tree' | 'file' | 'save' | 'delete' | null;

async function sourceApi<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; error?: string; correlationId?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(`${payload.error || 'The source repository could not be accessed.'}${payload.correlationId ? ` Reference: ${payload.correlationId}` : ''}`);
  }
  return payload;
}

function buildTree(files: SourceFileSummary[]): TreeNode[] {
  const root: TreeNode = { name: 'PLANYX', path: '', type: 'folder', children: [] };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let parent = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      const last = index === parts.length - 1;
      let node = parent.children.find(item => item.name === part && item.type === (last ? 'file' : 'folder'));
      if (!node) {
        node = { name: part, path, type: last ? 'file' : 'folder', file: last ? file : undefined, children: [] };
        parent.children.push(node);
      }
      parent = node;
    });
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'en-GB');
    });
    nodes.forEach(node => sort(node.children));
  }
  sort(root.children);
  return root.children;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function languageForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  const names: Record<string, string> = {
    tsx: 'TypeScript React', ts: 'TypeScript', jsx: 'JavaScript React', js: 'JavaScript',
    mjs: 'JavaScript module', css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON',
    md: 'Markdown', yml: 'YAML', yaml: 'YAML', sql: 'SQL', svg: 'SVG', sh: 'Shell',
  };
  return names[extension] || 'Text';
}

export default function WebsiteSourceFilesPage() {
  const [files, setFiles] = useState<SourceFileSummary[]>([]);
  const [repository, setRepository] = useState('alfiemurray03/PLANYX');
  const [branch, setBranch] = useState('main');
  const [writable, setWritable] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SourceFileContent | null>(null);
  const [code, setCode] = useState('');
  const [commitMessage, setCommitMessage] = useState('Update website source from Planyx Website Builder');
  const [busy, setBusy] = useState<Busy>('tree');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newPath, setNewPath] = useState('');

  const loadTree = useCallback(async () => {
    setBusy('tree'); setError('');
    try {
      const payload = await sourceApi<TreePayload>('/api/admin/website-source?action=tree');
      setFiles(payload.files || []);
      setRepository(payload.repository);
      setBranch(payload.branch);
      setWritable(payload.writable);
      setTruncated(Boolean(payload.truncated));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The repository tree could not be loaded.');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void loadTree(); }, [loadTree]);

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? files.filter(file => file.path.toLowerCase().includes(term)) : files;
  }, [files, search]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 4500);
  }

  async function openFile(file: SourceFileSummary) {
    if (!file.editable) {
      setError(`${file.path} is a binary or oversized file. It is listed in the repository but cannot be opened in the browser editor.`);
      return;
    }
    setBusy('file'); setError('');
    try {
      const payload = await sourceApi<FilePayload>(`/api/admin/website-source?action=file&path=${encodeURIComponent(file.path)}`);
      setSelected(payload.file);
      setCode(payload.file.content);
      setWritable(payload.writable);
      setCommitMessage(`Update ${file.path} from Planyx Website Builder`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That source file could not be opened.');
    } finally {
      setBusy(null);
    }
  }

  function beginNewFile() {
    const path = newPath.trim().replace(/^\/+/, '');
    if (!path) {
      setError('Enter the repository path for the new source file first.');
      return;
    }
    setSelected({ path, sha: '', size: 0, content: '', htmlUrl: '' });
    setCode('');
    setCommitMessage(`Create ${path} from Planyx Website Builder`);
    setNewPath('');
    setError('');
  }

  async function saveFile() {
    if (!selected) return;
    setBusy('save'); setError('');
    try {
      const result = await sourceApi<{ success: boolean; sha: string; commitSha: string; htmlUrl?: string }>('/api/admin/website-source', {
        action: 'save', path: selected.path, sha: selected.sha || undefined, content: code, commitMessage,
      });
      setSelected(current => current ? { ...current, sha: result.sha || current.sha, content: code, size: new Blob([code]).size, htmlUrl: result.htmlUrl || current.htmlUrl } : current);
      flash(`Saved ${selected.path} to ${branch}. Production deployment has been triggered.`);
      await loadTree();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The source file could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteFile() {
    if (!selected?.sha || !window.confirm(`Delete ${selected.path} from ${branch}? This commits directly to production source.`)) return;
    setBusy('delete'); setError('');
    try {
      await sourceApi('/api/admin/website-source', {
        action: 'delete', path: selected.path, sha: selected.sha,
        commitMessage: `Delete ${selected.path} from Planyx Website Builder`,
      });
      setSelected(null); setCode('');
      flash('Source file deleted and committed to production.');
      await loadTree();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The source file could not be deleted.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout title="Website Source Code">
      <Helmet><title>Website Source Code | Planyx Admin Centre</title></Helmet>
      <div className="space-y-4">
        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-1 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500" />
          <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-blue-600"><Github className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-bold text-slate-950 dark:text-white">Planyx Source Code</h1><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${writable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{writable ? 'Write access' : 'Read-only'}</span></div>
                <p className="truncate text-xs text-slate-500">Actual GitHub repository files — not database-managed page files.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"><GitBranch className="mr-2 h-4 w-4" />{repository} · {branch}</span><Button variant="outline" size="sm" onClick={() => void loadTree()} disabled={busy !== null}><RefreshCw className={`h-4 w-4 ${busy === 'tree' ? 'animate-spin' : ''}`} /></Button></div>
          </div>
          <nav className="flex overflow-x-auto border-t border-slate-200 px-2 dark:border-slate-800" aria-label="Website Studio workspace">
            <a href="/admin/pages" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">Chat</a>
            <a href="/admin/pages?view=files" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">Managed Files</a>
            <a href="/admin/pages?view=code" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">Managed Code</a>
            <span className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-blue-600 px-3 text-sm font-semibold text-blue-700 dark:text-blue-300"><Code2 className="mr-2 h-4 w-4" />Source Code</span>
            <a href="/admin/pages?view=preview" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">Preview</a>
            <a href="/admin/pages?view=history" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">History</a>
            <a href="/admin/website-builder-settings" className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900">Settings</a>
          </nav>
        </header>

        {!writable && files.length > 0 && <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>The full repository is visible, but editing is read-only.</strong> Add the encrypted Cloudflare secret <code>GITHUB_WEBSITE_BUILDER_TOKEN</code> with write access to <code>{repository}</code> to enable creating, saving and deleting source files directly on <code>{branch}</code>.</AlertDescription></Alert>}
        {truncated && <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>GitHub marked the recursive repository tree as truncated. Use search or open GitHub for files omitted by the API response.</AlertDescription></Alert>}
        {notice && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="grid min-w-0 gap-4 xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-200 shadow-sm">
            <div className="border-b border-slate-800 p-3">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Source Explorer</p><p className="mt-0.5 text-[10px] text-slate-500">{files.length.toLocaleString('en-GB')} repository files</p></div><Github className="h-5 w-5 text-slate-500" /></div>
              <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search source files…" className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-xs text-white outline-none focus:border-blue-500" /></div>
              <div className="mt-3 flex gap-2"><Input value={newPath} onChange={event => setNewPath(event.target.value)} placeholder="src/pages/new-page.tsx" className="h-9 border-slate-700 bg-slate-900 font-mono text-xs text-white" /><Button size="sm" variant="outline" onClick={beginNewFile} disabled={!writable}><FilePlus2 className="h-4 w-4" /></Button></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">{busy === 'tree' && !files.length ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> : search.trim() ? <div className="space-y-0.5">{filteredFiles.map(file => <SourceFileRow key={file.path} file={file} selected={selected?.path === file.path} onOpen={() => void openFile(file)} />)}</div> : <SourceTree nodes={tree} selectedPath={selected?.path || ''} onOpen={file => void openFile(file)} />}</div>
          </aside>

          <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm">
            {selected ? <>
              <div className="border-b border-slate-800 bg-slate-900 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2 text-slate-200"><FileCode2 className="h-4 w-4 shrink-0 text-blue-400" /><code className="truncate text-xs">{selected.path}</code></div><p className="mt-1 text-[10px] text-slate-500">{languageForPath(selected.path)} · {formatBytes(new Blob([code]).size)} · branch {branch}</p></div><div className="flex flex-wrap gap-2">{selected.htmlUrl && <a href={selected.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800"><ExternalLink className="mr-1.5 h-4 w-4" />GitHub</a>}<Button variant="destructive" size="sm" onClick={() => void deleteFile()} disabled={!writable || !selected.sha || busy !== null}><Trash2 className="h-4 w-4" /></Button><Button size="sm" onClick={() => void saveFile()} disabled={!writable || busy !== null}>{busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Commit to {branch}</Button></div></div>
                <Input value={commitMessage} onChange={event => setCommitMessage(event.target.value)} aria-label="Git commit message" className="mt-3 h-9 border-slate-700 bg-slate-950 text-xs text-white" />
              </div>
              {busy === 'file' ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> : <textarea value={code} onChange={event => setCode(event.target.value)} readOnly={!writable} spellCheck={false} className="min-h-0 flex-1 resize-none border-0 bg-slate-950 p-4 font-mono text-[12px] leading-6 text-slate-100 outline-none sm:p-5" />}
              <p className="border-t border-slate-800 bg-slate-900 px-4 py-2 text-[10px] text-slate-500">Source changes commit directly to <strong>{branch}</strong> and trigger the normal production build. Repository secrets and binary files are protected.</p>
            </> : <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><Github className="h-12 w-12 text-slate-700" /><h2 className="mt-4 text-xl font-bold text-white">Choose a source file</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">The explorer contains the real Planyx repository: React pages, components, Cloudflare Functions, static assets, tests and configuration. Choose an editable text file to open its full source code.</p></div>}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function SourceTree({ nodes, selectedPath, onOpen }: { nodes: TreeNode[]; selectedPath: string; onOpen: (file: SourceFileSummary) => void }) {
  return <div className="space-y-0.5">{nodes.map(node => node.type === 'folder' ? <SourceFolder key={node.path} node={node} selectedPath={selectedPath} onOpen={onOpen} /> : node.file ? <SourceFileRow key={node.path} file={node.file} selected={selectedPath === node.path} onOpen={() => onOpen(node.file!)} /> : null)}</div>;
}

function SourceFolder({ node, selectedPath, onOpen }: { node: TreeNode; selectedPath: string; onOpen: (file: SourceFileSummary) => void }) {
  const important = ['src', 'functions', 'static', 'tests'].includes(node.path);
  return <details open={important} className="group"><summary className="flex cursor-pointer list-none items-center rounded px-2 py-1.5 text-slate-300 hover:bg-slate-800 [&::-webkit-details-marker]:hidden"><ChevronRight className="mr-1 h-3.5 w-3.5 transition group-open:rotate-90" /><Folder className="mr-1.5 h-3.5 w-3.5 text-blue-400" /><span className="truncate">{node.name}</span></summary><div className="ml-3 border-l border-slate-800 pl-2"><SourceTree nodes={node.children} selectedPath={selectedPath} onOpen={onOpen} /></div></details>;
}

function SourceFileRow({ file, selected, onOpen }: { file: SourceFileSummary; selected: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={`flex w-full min-w-0 items-center rounded px-2 py-1.5 text-left ${selected ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><FileCode2 className={`mr-2 h-3.5 w-3.5 shrink-0 ${file.editable ? 'text-slate-500' : 'text-amber-500'}`} /><span className="truncate">{file.path.split('/').pop()}</span>{!file.editable && <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">BINARY</span>}</button>;
}
