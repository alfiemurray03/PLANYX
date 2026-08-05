import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import {
  getDocuments, deleteDocument, duplicateDocument,
  getFolders, createFolder,
} from '@/lib/document-store';
import { CATEGORY_LABELS } from '@/lib/document-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText, Search, Plus, MoreVertical, Copy, Trash2, Eye,
  FolderPlus, Folder, RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from '@/lib/date-utils';
import type { SavedDocument, DocumentFolder } from '@/lib/document-types';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  complete: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [allDocs, setAllDocs] = useState<SavedDocument[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [docs, fols] = await Promise.all([getDocuments(), getFolders()]);
    setAllDocs(docs);
    setFolders(fols);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!search) return allDocs;
    const q = search.toLowerCase();
    return allDocs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.templateName ?? '').toLowerCase().includes(q) ||
        (CATEGORY_LABELS[d.category] ?? d.category ?? '').toLowerCase().includes(q)
    );
  }, [allDocs, search]);

  const drafts = filtered.filter((d) => d.status === 'draft');
  const completed = filtered.filter((d) => d.status === 'complete' || d.status === 'completed');
  const all = [...filtered].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  async function handleDuplicate(id: string) {
    const copy = await duplicateDocument(id);
    if (copy) navigate(`/documents/${copy.id}`);
  }

  async function handleDelete() {
    if (deleteTarget) {
      await deleteDocument(deleteTarget);
      setDeleteTarget(null);
      void loadData();
    }
  }

  async function handleCreateFolder() {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim(), '#1B4F8A');
      setNewFolderName('');
      setShowNewFolder(false);
      void loadData();
    }
  }

  function DocCard({ doc }: { doc: SavedDocument }) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group border border-transparent hover:border-border">
        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <Link
            to={`/documents/${doc.id}`}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
          >
            {doc.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[doc.category] ?? doc.category} · {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
          </p>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[doc.status] ?? ''}`}>
          {doc.status}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/documents/${doc.id}`}>
                <Eye className="w-4 h-4 mr-2" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicate(doc.id)}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteTarget(doc.id)}
              className="text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function EmptyState({ label }: { label: string }) {
    return (
      <div className="text-center py-12">
        <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{label}</p>
        <Button asChild size="sm" className="mt-3 gap-2">
          <Link to="/builders">
            <Plus className="w-4 h-4" />
            Create Document
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>My Documents — Sousa Murray Planeia</title>
      </Helmet>
      <DashboardLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Documents</h1>
              <p className="text-sm text-muted-foreground mt-1">{allDocs.length} document{allDocs.length !== 1 ? 's' : ''} total</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-2">
                <FolderPlus className="w-4 h-4" />
                New Folder
              </Button>
              <Button asChild size="sm" className="gap-2">
                <Link to="/builders">
                  <Plus className="w-4 h-4" />
                  New Document
                </Link>
              </Button>
            </div>
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <Card>
              <CardContent className="p-4 flex gap-2">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  autoFocus
                />
                <Button size="sm" onClick={handleCreateFolder}>Create</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>Cancel</Button>
              </CardContent>
            </Card>
          )}

          {/* Folders */}
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <div key={f.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-sm text-muted-foreground hover:bg-muted/80 cursor-pointer">
                  <Folder className="w-4 h-4" style={{ color: f.color ?? undefined }} />
                  {f.name}
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({all.length})</TabsTrigger>
                <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {all.length === 0 ? (
                  <EmptyState label={search ? 'No documents match your search.' : 'No documents yet. Create your first one!'} />
                ) : (
                  <div className="space-y-1">
                    {all.map((doc) => <DocCard key={doc.id} doc={doc} />)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="drafts" className="mt-4">
                {drafts.length === 0 ? (
                  <EmptyState label="No drafts. Start a new document to save as draft." />
                ) : (
                  <div className="space-y-1">
                    {drafts.map((doc) => <DocCard key={doc.id} doc={doc} />)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="mt-4">
                {completed.length === 0 ? (
                  <EmptyState label="No completed documents yet." />
                ) : (
                  <div className="space-y-1">
                    {completed.map((doc) => <DocCard key={doc.id} doc={doc} />)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Document</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this document? This action cannot be undone.
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
