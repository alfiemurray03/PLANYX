import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import RichDocumentEditor, { type EditorState } from '@/components/RichDocumentEditor';
import { updateDocument, deleteDocument, duplicateDocument } from '@/lib/document-store';
import { CATEGORY_LABELS } from '@/lib/document-types';
import { renderDocument } from '@/lib/document-layouts';
import { formatDocDate } from '@/lib/doc-ref';
import { useFeatureConfig } from '@/lib/feature-config-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft,
  Download,
  Printer,
  CheckCircle2,
  Copy,
  Trash2,
  MoreVertical,
  FileText,
  Edit3,
  FileCode,
  Save,
  ZoomIn,
  ZoomOut,
  Clock,
  RefreshCw,
  Pencil,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from '@/lib/date-utils';
import type { SavedDocument } from '@/lib/document-types';
import '@/styles/pdf-document.css';

// ── Status colours ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-yellow-100 text-yellow-800 border-yellow-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  archived:  'bg-gray-100 text-gray-600 border-gray-200',
};

// ── PDF CSS for print/export ───────────────────────────────────────────────────

function getPdfCss(): string {
  return `
    body { font-family: 'Times New Roman', serif; }
    .pdf-workspace { background: #e8eaed; padding: 32px 24px; }
    .pdf-page { background: #fff; width: 210mm; min-height: 297mm; padding: 20mm 18mm; box-shadow: 0 4px 40px rgba(0,0,0,.15); font-family: 'Times New Roman',serif; font-size: 10.5pt; line-height: 1.55; color: #1a1a1a; margin: 0 auto; box-sizing: border-box; }
    .pdf-header { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; padding-bottom: 14px; border-bottom: 3px solid #1B4F8A; margin-bottom: 20px; }
    .pdf-logo { width: 52px; height: 52px; background: #1B4F8A; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; font-weight: 900; font-family: Arial,sans-serif; }
    .pdf-company h1 { font-size: 14pt; font-weight: 700; color: #1B4F8A; margin: 0 0 2px; font-family: Arial,sans-serif; }
    .pdf-company p { font-size: 8.5pt; color: #6b7280; margin: 0; font-family: Arial,sans-serif; }
    .pdf-meta { text-align: right; font-family: Arial,sans-serif; }
    .pdf-meta p { font-size: 8pt; color: #374151; margin: 0 0 2px; }
    .pdf-title { background: #1B4F8A; color: #fff; padding: 12px 18px; margin: 0 -18mm 20px; text-align: center; }
    .pdf-title h2 { font-size: 14pt; font-weight: 700; margin: 0; font-family: Arial,sans-serif; text-transform: uppercase; }
    .pdf-section { margin-bottom: 18px; }
    .pdf-section h3 { font-size: 10.5pt; font-weight: 700; color: #1B4F8A; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1.5px solid #1B4F8A; font-family: Arial,sans-serif; }
    .pdf-info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }
    .pdf-info-table td { padding: 5px 10px; border: 1px solid #dde1e8; }
    .pdf-info-table td:first-child { font-weight: 600; color: #1B4F8A; background: #f0f4fa; width: 35%; font-family: Arial,sans-serif; }
    .pdf-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }
    .pdf-table thead tr { background: #1B4F8A; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pdf-table thead th { padding: 7px 10px; text-align: left; font-family: Arial,sans-serif; }
    .pdf-table tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    .pdf-signatures { margin-top: 28px; padding-top: 16px; border-top: 1.5px solid #dde1e8; }
    .pdf-signatures h3 { font-size: 10.5pt; font-weight: 700; color: #1B4F8A; text-transform: uppercase; margin: 0 0 16px; font-family: Arial,sans-serif; }
    .pdf-sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .signature-box { border: 1px solid #dde1e8; border-radius: 4px; padding: 14px; background: #fafafa; }
    .sig-label { font-size: 8.5pt; font-weight: 700; color: #1B4F8A; text-transform: uppercase; margin: 0 0 10px; font-family: Arial,sans-serif; }
    .signature-line { height: 1px; background: #374151; margin: 28px 0 8px; }
    .sig-field { font-size: 8.5pt; color: #6b7280; margin: 4px 0 0; font-family: Arial,sans-serif; }
    .pdf-footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #dde1e8; display: flex; justify-content: space-between; }
    .pdf-footer p { font-size: 7.5pt; color: #9ca3af; margin: 0; font-family: Arial,sans-serif; }
    .pdf-disclaimer { margin-top: 16px; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 7.5pt; color: #9ca3af; font-family: Arial,sans-serif; }
    .pdf-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; padding: 14px; background: #f8f9fb; border: 1px solid #dde1e8; }
    .pdf-party-block h4 { font-size: 8pt; font-weight: 700; color: #1B4F8A; text-transform: uppercase; margin: 0 0 6px; font-family: Arial,sans-serif; border-bottom: 1px solid #dde1e8; padding-bottom: 4px; }
    .pdf-status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; font-family: Arial,sans-serif; text-transform: uppercase; }
    .pdf-status-badge.draft { background: #fef3c7; color: #92400e; }
    .pdf-status-badge.completed { background: #d1fae5; color: #065f46; }
    .pdf-notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 10px 14px; margin: 12px 0; font-size: 9pt; }
    .pdf-divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    @media print { .pdf-workspace { background: white; padding: 0; } .pdf-page { box-shadow: none; } @page { size: A4; margin: 0; } }
  `;
}

function printHtmlDocument(html: string, title: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>${getPdfCss()}</style>
</head>
<body>
  <div class="pdf-workspace" style="background:white;padding:0;">${html}</div>
  <script>window.onload = () => { window.print(); window.close(); }<\/script>
</body>
</html>`);
  win.document.close();
}

function exportHtmlFile(html: string, title: string) {
  const blob = new Blob([`<!DOCTYPE html><html><head><title>${title}</title><style>${getPdfCss()}</style></head><body><div class="pdf-workspace">${html}</div></body></html>`], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^a-z0-9]/gi, '-')}.html`;
  a.click();
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentViewPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { config } = useFeatureConfig();
  const [doc, setDoc] = useState<SavedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [zoom, setZoom] = useState(100);
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!docId) return;
    fetch(`/api/documents/${docId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { success: boolean; document?: SavedDocument }) => {
        if (data.success && data.document) {
          setDoc(data.document);
          setTitle(data.document.title);
        }
      })
      .catch(() => {});
  }, [docId]);

  const triggerAutoSave = useCallback((newTitle: string, currentDoc: SavedDocument) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('idle');
    autoSaveTimer.current = setTimeout(async () => {
      if (currentDoc.status !== 'completed') {
        setAutoSaveStatus('saving');
        try {
          await updateDocument(currentDoc.id, { title: newTitle });
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } catch {
          setAutoSaveStatus('idle');
        }
      }
    }, 3000);
  }, []);

  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  if (!doc) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Document not found.</p>
          <Button asChild className="mt-4"><Link to="/documents">Back to Documents</Link></Button>
        </div>
      </DashboardLayout>
    );
  }

  // Build the current rendered HTML for export/print
  function getCurrentHtml(): string {
    const fields = doc?.fields as Record<string, unknown> | undefined;
    const savedLayout   = (fields?._layout   as string | undefined) ?? 'corporate';
    const savedBranding = (() => { try { return JSON.parse(fields?._branding as string ?? '{}'); } catch { return {}; } })();
    const savedFlags    = (() => { try { return JSON.parse(fields?._flags    as string ?? '{}'); } catch { return {}; } })();
    const body = (() => {
      const raw = doc?.content ?? doc?.generatedContent ?? '';
      if (!raw) return '';
      const parser = new DOMParser();
      const parsed = parser.parseFromString(raw, 'text/html');
      const article = parsed.querySelector('article.pdf-page');
      if (!article) return raw;
      article.querySelectorAll('header, .pdf-title, footer, .pdf-footer, .pdf-disclaimer').forEach(el => el.remove());
      return article.innerHTML.trim();
    })();
    return renderDocument({
      layout:  savedLayout as import('@/lib/document-layouts').LayoutId,
      title:   doc?.title ?? '',
      docRef:  doc?.docRef ?? 'DOC-001',
      date:    formatDocDate(),
      version: String(doc?.version ?? '1.0'),
      status:  String(doc?.status ?? 'Draft'),
      body,
      branding: savedBranding,
      flags:    savedFlags,
    });
  }

  function handleSave(status?: 'draft' | 'complete' | 'completed') {
    if (!doc) return;
    const normalizedStatus = status === 'complete' ? 'completed' : status;
    const updates: Partial<SavedDocument> = { title };
    if (normalizedStatus) updates.status = normalizedStatus;
    void updateDocument(doc.id, updates);
    setDoc((d) => d ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d);
    setIsDirty(false);
    setSaveMessage(normalizedStatus === 'completed' ? 'Marked as completed!' : normalizedStatus === 'draft' ? 'Reverted to draft.' : 'Saved!');
    setTimeout(() => setSaveMessage(''), 2500);
  }

  // Called by RichDocumentEditor when user saves
  async function handleEditorSave(state: EditorState) {
    if (!doc) return;
    setAutoSaveStatus('saving');
    try {
      // Rebuild full HTML from editor state
      const fullHtml = renderDocument({
        layout:  state.layout,
        title:   state.title,
        docRef:  doc.docRef  ?? 'DOC-001',
        date:    formatDocDate(),
        version: String(doc.version ?? '1.0'),
        status:  String(doc.status  ?? 'Draft'),
        body:    state.bodyHtml,
        branding: state.branding,
        flags:    state.flags,
      });
      await updateDocument(doc.id, {
        title:   state.title,
        content: fullHtml,
        fields: {
          ...(doc.fields as Record<string, unknown>),
          _layout:   state.layout,
          _branding: JSON.stringify(state.branding),
          _flags:    JSON.stringify(state.flags),
        },
      });
      setDoc(d => d ? {
        ...d,
        title:   state.title,
        content: fullHtml,
        updatedAt: new Date().toISOString(),
      } : d);
      setTitle(state.title);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch {
      setAutoSaveStatus('idle');
    }
  }

  function handleDuplicate() {
    if (!doc) return;
    void duplicateDocument(doc.id).then((copy) => {
      if (copy) navigate(`/documents/${copy.id}`);
    });
  }

  function handleDelete() {
    if (!doc) return;
    void deleteDocument(doc.id).then(() => navigate('/documents'));
  }

  const zoomIn  = () => setZoom((z) => Math.min(z + 10, 150));
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 60));

  const exportHtml = doc.content ?? doc.generatedContent ?? getCurrentHtml();

  return (
    <>
      <Helmet>
        <title>{doc.title} — Sousa Murray Planeia</title>
      </Helmet>
      <DashboardLayout noPadding>
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0 gap-3">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link to="/documents">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Documents
              </Link>
            </Button>
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              {isEditingTitle ? (
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsDirty(true);
                    if (doc) triggerAutoSave(e.target.value, doc);
                  }}
                  className="h-7 text-sm font-semibold w-64"
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                  autoFocus
                />
              ) : (
                <button
                  className="flex items-center gap-1.5 group"
                  onClick={() => setIsEditingTitle(true)}
                >
                  <span className="text-sm font-semibold text-foreground truncate max-w-xs">{title}</span>
                  <Edit3 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
              <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[doc.status]}`}>
                {doc.status}
              </Badge>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Auto-save indicator */}
            {autoSaveStatus === 'saving' && (
              <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Auto-saving…
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-xs text-green-600 hidden sm:flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
            {saveMessage && autoSaveStatus === 'idle' && (
              <span className="text-xs text-green-600 font-medium hidden sm:flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {saveMessage}
              </span>
            )}

            {/* Edit / View toggle */}
            <Button
              size="sm"
              variant={editorMode === 'edit' ? 'default' : 'outline'}
              onClick={() => setEditorMode(m => m === 'edit' ? 'view' : 'edit')}
              className="gap-1.5 text-xs"
            >
              {editorMode === 'edit'
                ? <><Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">View</span></>
                : <><Pencil className="w-3.5 h-3.5" /><span className="hidden sm:inline">Edit</span></>
              }
            </Button>

            {isDirty && (
              <Button size="sm" variant="outline" onClick={() => handleSave()} className="gap-1.5 text-xs">
                <Save className="w-3.5 h-3.5" /> Save
              </Button>
            )}

            {/* Status toggle */}
            {doc.status !== 'completed' ? (
              <Button size="sm" onClick={() => handleSave('completed')} className="gap-1.5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark Complete</span>
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => handleSave('draft')} className="gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Revert to Draft</span>
              </Button>
            )}

            {/* Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {config.pdf_export ? (
                  <DropdownMenuItem onClick={() => printHtmlDocument(exportHtml, doc.title)}>
                    <FileText className="w-4 h-4 mr-2 text-red-500" />
                    Print / Save as PDF
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                    PDF Export Disabled
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => exportHtmlFile(exportHtml, doc.title)}>
                  <FileCode className="w-4 h-4 mr-2 text-orange-500" />
                  Download as HTML
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {config.pdf_export ? (
                  <DropdownMenuItem onClick={() => printHtmlDocument(exportHtml, doc.title)}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Document
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <Printer className="w-4 h-4 mr-2 text-muted-foreground" />
                    Print Disabled
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="w-4 h-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Metadata bar (view mode only) ── */}
        {editorMode === 'view' && (
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{CATEGORY_LABELS[doc.category]}</span>
              <span>·</span>
              <span>Updated {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</span>
              <span>·</span>
              <span>v{doc.version}</span>
              {doc.docRef && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[10px]">{doc.docRef}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={zoomOut} className="h-6 w-6 p-0">
                <ZoomOut className="w-3 h-3" />
              </Button>
              <span className="text-xs text-muted-foreground w-10 text-center">{zoom}%</span>
              <Button variant="ghost" size="sm" onClick={zoomIn} className="h-6 w-6 p-0">
                <ZoomIn className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Main content area ── */}
        {editorMode === 'edit' ? (
          /* Rich editor — full height, manages its own scroll */
          <div className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 108px)' }}>
            <RichDocumentEditor
              doc={doc}
              onSave={handleEditorSave}
            />
          </div>
        ) : (
          /* View mode — A4 preview with zoom */
          <ScrollArea className="flex-1">
            <div
              className="pdf-workspace"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', minHeight: '100%' }}
              dangerouslySetInnerHTML={{ __html: exportHtml }}
            />
          </ScrollArea>
        )}

        {/* Delete dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Document</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{doc.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}
