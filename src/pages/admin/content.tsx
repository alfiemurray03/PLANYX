/**
 * Admin — Content Manager
 * Manage platform content blocks: hero text, feature descriptions, legal pages,
 * help articles. Supports draft/published status, inline editing, and preview.
 * All data persisted to ja_page_content via /api/admin/page-content.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { useAdmin } from '@/lib/admin-context';
import { hasWritePermission } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Edit2, Eye, CheckCircle2, Plus, Search, Trash2, Save,
  Globe, FileText, Scale, HelpCircle, AlertCircle,
  Archive, RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ContentStatus = 'published' | 'draft' | 'archived';
type ContentType = 'marketing' | 'legal' | 'help' | 'policy' | 'announcement';

interface ContentItem {
  id: string;
  title: string;
  slug: string;
  type: ContentType;
  status: ContentStatus;
  body: string;
  excerpt: string;
  lastUpdated: string;
  updatedBy: string;
  publishedAt?: string;
  version: number;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_CONTENT: ContentItem[] = [
  {
    id: 'c-001', title: 'Homepage Hero',       slug: 'homepage-hero',
    type: 'marketing', status: 'published',
    body: 'Build personalised plans step by step. Sousa Murray Planeia provides guided builders for destinations, itineraries, experiences, budgets, accessibility and practical travel preparation.',
    excerpt: 'Main homepage hero text',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 3,
  },
  {
    id: 'c-002', title: 'Homepage Features Section', slug: 'homepage-features',
    type: 'marketing', status: 'published',
    body: 'Guided planning builders, personalised outputs, secure saved plans, discovery tools and practical planning support.',
    excerpt: 'Feature highlights on homepage',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 2,
  },
  {
    id: 'c-003', title: 'Privacy Policy',      slug: 'privacy-policy',
    type: 'legal', status: 'published',
    body: 'This Privacy Policy explains how Sousa Murray Planeia collects, uses, and protects your personal data in accordance with the UK GDPR and the Data Protection Act 2018.',
    excerpt: 'Full privacy policy document',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 1,
  },
  {
    id: 'c-004', title: 'Terms & Conditions',  slug: 'terms-conditions',
    type: 'legal', status: 'published',
    body: 'These Terms and Conditions govern your use of Sousa Murray Planeia. By using our platform, you agree to these terms.',
    excerpt: 'Platform terms of service',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 1,
  },
  {
    id: 'c-005', title: 'Cookie Policy',       slug: 'cookie-policy',
    type: 'policy', status: 'published',
    body: 'This Cookie Policy explains how Sousa Murray Planeia uses cookies and similar tracking technologies on our website.',
    excerpt: 'Cookie usage policy',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 1,
  },
  {
    id: 'c-006', title: 'Getting Started Guide', slug: 'help-getting-started',
    type: 'help', status: 'draft',
    body: 'Welcome to Sousa Murray Planeia. This guide will walk you through creating your first document, choosing a template, and exporting your work.',
    excerpt: 'Onboarding help article',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 1,
  },
  {
    id: 'c-007', title: 'Template Library Guide', slug: 'help-templates',
    type: 'help', status: 'draft',
    body: 'The Template Library contains over 1,000 professionally drafted documents. Learn how to search, filter, and use templates effectively.',
    excerpt: 'Template library help article',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 1,
  },
  {
    id: 'c-008', title: 'Pricing Page Intro',  slug: 'pricing-intro',
    type: 'marketing', status: 'published',
    body: 'Choose the plan that works for you. Start free and upgrade when you need more. All plans include access to our core template library.',
    excerpt: 'Pricing page introductory text',
    lastUpdated: '2026-06-02', updatedBy: 'Platform Owner', version: 2,
  },
];

const STORAGE_KEY = 'ja_admin_content_v1';

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGetContent(): Promise<ContentItem[]> {
  const res = await fetch('/api/admin/page-content', { credentials: 'include' });
  const data = await res.json() as { success: boolean; items?: ContentItem[] };
  if (data.success && data.items) return data.items;
  // Fallback to localStorage seed if API fails
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ContentItem[];
  } catch { /* ignore */ }
  return SEED_CONTENT;
}

async function apiSaveContent(item: ContentItem): Promise<void> {
  await fetch('/api/admin/page-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      slug: item.slug,
      title: item.title,
      type: item.type,
      status: item.status,
      bodyHtml: item.body,
      bodyText: item.excerpt,
    }),
  });
}

async function apiDeleteContent(slug: string): Promise<void> {
  await fetch(`/api/admin/page-content/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ContentType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  marketing:    { label: 'Marketing',    icon: Globe,       color: 'text-blue-600 dark:text-blue-400' },
  legal:        { label: 'Legal',        icon: Scale,       color: 'text-red-600 dark:text-red-400' },
  help:         { label: 'Help',         icon: HelpCircle,  color: 'text-emerald-600 dark:text-emerald-400' },
  policy:       { label: 'Policy',       icon: FileText,    color: 'text-purple-600 dark:text-purple-400' },
  announcement: { label: 'Announcement', icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400' },
};

const STATUS_CONFIG: Record<ContentStatus, { label: string; classes: string }> = {
  published: { label: 'Published', classes: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40' },
  draft:     { label: 'Draft',     classes: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/40' },
  archived:  { label: 'Archived',  classes: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700' },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminContent() {
  const { admin } = useAdmin();
  const canWrite = admin ? hasWritePermission(admin, 'content') : false;

  const [items, setItems]               = useState<ContentItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState<ContentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [editing, setEditing]           = useState<ContentItem | null>(null);
  const [previewing, setPreviewing]     = useState<ContentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [savedMsg, setSavedMsg]         = useState('');
  const [saving, setSaving]             = useState(false);

  // Load from DB on mount
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetContent();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const persist = (next: ContentItem[]) => { setItems(next); };

  const filtered = useMemo(() => {
    let list = items;
    if (typeFilter !== 'all')   list = list.filter(i => i.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q) || i.excerpt.toLowerCase().includes(q));
    }
    return list;
  }, [items, typeFilter, statusFilter, search]);

  function handleNew() {
    const item: ContentItem = {
      id: `c-${Date.now()}`,
      title: 'New Content Item',
      slug: `new-content-${Date.now()}`,
      type: 'marketing',
      status: 'draft',
      body: '',
      excerpt: '',
      lastUpdated: new Date().toISOString().slice(0, 10),
      updatedBy: admin?.name ?? 'Admin',
      version: 1,
    };
    persist([item, ...items]);
    setEditing(item);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const updated = {
      ...editing,
      lastUpdated: new Date().toISOString().slice(0, 10),
      updatedBy: admin?.name ?? 'Admin',
      version: editing.version + 1,
    };
    try {
      await apiSaveContent(updated);
      persist(items.map(i => i.id === updated.id ? updated : i));
      setEditing(null);
      setSavedMsg('Saved successfully.');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch {
      setSavedMsg('Save failed. Please try again.');
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, status: 'published' as ContentStatus, publishedAt: new Date().toISOString(), lastUpdated: new Date().toISOString().slice(0, 10), updatedBy: admin?.name ?? 'Admin' };
    await apiSaveContent(updated);
    persist(items.map(i => i.id === id ? updated : i));
  }

  async function handleUnpublish(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, status: 'draft' as ContentStatus };
    await apiSaveContent(updated);
    persist(items.map(i => i.id === id ? updated : i));
  }

  async function handleArchive(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, status: 'archived' as ContentStatus };
    await apiSaveContent(updated);
    persist(items.map(i => i.id === id ? updated : i));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiDeleteContent(deleteTarget.slug);
    persist(items.filter(i => i.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  const base = 'bg-white border-gray-200 text-gray-900 dark:bg-slate-900 dark:border-slate-800 dark:text-white';
  const muted = 'text-gray-500 dark:text-slate-400';
  const inputCls = 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500';
  const rowHover = 'hover:bg-gray-50 dark:hover:bg-slate-800/50';
  const divider = 'border-gray-200 dark:border-slate-800';

  const stats = [
    { label: 'Total Items', value: items.length, color: 'text-gray-900 dark:text-white' },
    { label: 'Published',   value: items.filter(i => i.status === 'published').length, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Drafts',      value: items.filter(i => i.status === 'draft').length,     color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Archived',    value: items.filter(i => i.status === 'archived').length,  color: 'text-gray-400 dark:text-slate-500' },
  ];

  return (
    <>
      <Helmet>
        <title>Content Manager — Admin Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Content Manager" subtitle="Manage platform content, legal pages, and help articles — all changes persist to the database">
        <div className="space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${base}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
                <p className={`text-xs mt-0.5 ${muted}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Saved message */}
          {savedMsg && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-lg px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4" /> {savedMsg}
            </div>
          )}

          {/* Toolbar */}
          <div className={`rounded-xl border p-4 ${base}`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${muted}`} />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search content…"
                  className={`pl-9 h-9 ${inputCls}`} />
              </div>
              <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className={`w-36 h-9 ${inputCls}`}>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent className={'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700'}>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                    <SelectItem key={v} value={v}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className={`w-36 h-9 ${inputCls}`}>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent className={'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700'}>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              {canWrite && (
                <Button onClick={handleNew} size="sm" className="bg-primary hover:bg-primary/90 text-white gap-1.5 h-9">
                  <Plus className="w-4 h-4" /> New Item
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className={`rounded-xl border overflow-hidden ${base}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs font-medium ${muted} ${divider} ${'bg-gray-50 dark:bg-slate-900/80'}`}>
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Version</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Last Updated</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Updated By</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`px-4 py-12 text-center text-sm ${muted}`}>
                        No content items found.
                      </td>
                    </tr>
                  ) : filtered.map(item => {
                    const TypeIcon = TYPE_CONFIG[item.type]?.icon ?? FileText;
                    const typeColor = TYPE_CONFIG[item.type]?.color ?? muted;
                    const statusCfg = STATUS_CONFIG[item.status];
                    return (
                      <tr key={item.id} className={`border-b transition-colors ${divider} ${rowHover}`}>
                        <td className="px-4 py-3">
                          <p className={`font-medium text-sm ${'text-gray-900 dark:text-white'}`}>{item.title}</p>
                          <p className={`text-[11px] font-mono mt-0.5 ${muted}`}>{item.slug}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-1.5 text-xs ${typeColor}`}>
                            <TypeIcon className="w-3.5 h-3.5" />
                            {TYPE_CONFIG[item.type]?.label}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.classes}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-xs hidden md:table-cell ${muted}`}>v{item.version}</td>
                        <td className={`px-4 py-3 text-xs hidden lg:table-cell ${muted}`}>{item.lastUpdated}</td>
                        <td className={`px-4 py-3 text-xs hidden lg:table-cell ${muted}`}>{item.updatedBy}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setPreviewing(item)} title="Preview"
                              className={`p-1.5 rounded-lg transition-colors ${'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700'}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canWrite && (
                              <>
                                <button onClick={() => setEditing({ ...item })} title="Edit"
                                  className={`p-1.5 rounded-lg transition-colors ${'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700'}`}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {item.status === 'draft' && (
                                  <button onClick={() => handlePublish(item.id)} title="Publish"
                                    className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {item.status === 'published' && (
                                  <button onClick={() => handleUnpublish(item.id)} title="Unpublish to draft"
                                    className={`p-1.5 rounded-lg transition-colors ${'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-900/20'}`}>
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {item.status !== 'archived' && (
                                  <button onClick={() => handleArchive(item.id)} title="Archive"
                                    className={`p-1.5 rounded-lg transition-colors ${'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-700'}`}>
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => setDeleteTarget(item)} title="Delete"
                                  className={`p-1.5 rounded-lg transition-colors ${'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-900/20'}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Edit dialog ── */}
        <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
          <DialogContent className={`max-w-2xl ${'bg-white border-gray-200 text-gray-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white'}`}>
            <DialogHeader>
              <DialogTitle className={'text-gray-900 dark:text-white'}>
                {editing?.id.startsWith('c-') && items.find(i => i.id === editing?.id) ? 'Edit Content Item' : 'New Content Item'}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={`text-xs mb-1 block ${muted}`}>Title</Label>
                    <Input value={editing.title}
                      onChange={e => setEditing(ed => ed ? { ...ed, title: e.target.value } : ed)}
                      className={`h-9 ${inputCls}`} />
                  </div>
                  <div>
                    <Label className={`text-xs mb-1 block ${muted}`}>Slug</Label>
                    <Input value={editing.slug}
                      onChange={e => setEditing(ed => ed ? { ...ed, slug: e.target.value } : ed)}
                      className={`h-9 font-mono text-sm ${inputCls}`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={`text-xs mb-1 block ${muted}`}>Type</Label>
                    <Select value={editing.type} onValueChange={v => setEditing(ed => ed ? { ...ed, type: v as ContentType } : ed)}>
                      <SelectTrigger className={`h-9 ${inputCls}`}><SelectValue /></SelectTrigger>
                      <SelectContent className={'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700'}>
                        {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                          <SelectItem key={v} value={v}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={`text-xs mb-1 block ${muted}`}>Status</Label>
                    <Select value={editing.status} onValueChange={v => setEditing(ed => ed ? { ...ed, status: v as ContentStatus } : ed)}>
                      <SelectTrigger className={`h-9 ${inputCls}`}><SelectValue /></SelectTrigger>
                      <SelectContent className={'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700'}>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className={`text-xs mb-1 block ${muted}`}>Excerpt / Description</Label>
                  <Input value={editing.excerpt}
                    onChange={e => setEditing(ed => ed ? { ...ed, excerpt: e.target.value } : ed)}
                    placeholder="Short description of this content item"
                    className={`h-9 ${inputCls}`} />
                </div>
                <div>
                  <Label className={`text-xs mb-1 block ${muted}`}>Body Content</Label>
                  <Textarea value={editing.body}
                    onChange={e => setEditing(ed => ed ? { ...ed, body: e.target.value } : ed)}
                    rows={10}
                    placeholder="Enter the full content here…"
                    className={`resize-none text-sm leading-relaxed ${inputCls}`} />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}
                className={'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}>
                Cancel
              </Button>
              {editing && (
                <Button variant="outline" onClick={() => { setPreviewing({ ...editing }); }}
                  className={'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}>
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-white gap-1.5">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Preview dialog ── */}
        <Dialog open={!!previewing} onOpenChange={o => { if (!o) setPreviewing(null); }}>
          <DialogContent className={`max-w-2xl ${'bg-white border-gray-200 text-gray-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white'}`}>
            <DialogHeader>
              <DialogTitle className={'text-gray-900 dark:text-white'}>
                Preview — {previewing?.title}
              </DialogTitle>
            </DialogHeader>
            {previewing && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[previewing.status].classes}`}>
                    {STATUS_CONFIG[previewing.status].label}
                  </span>
                  <span className={`text-xs ${muted}`}>{TYPE_CONFIG[previewing.type]?.label}</span>
                  <span className={`text-xs ${muted}`}>v{previewing.version}</span>
                  <span className={`text-xs ${muted}`}>Updated {previewing.lastUpdated} by {previewing.updatedBy}</span>
                </div>
                <div className={`rounded-xl border p-5 ${'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  <h2 className={`text-lg font-semibold mb-3 ${'text-gray-900 dark:text-white'}`}>{previewing.title}</h2>
                  {previewing.excerpt && (
                    <p className={`text-sm italic mb-4 ${muted}`}>{previewing.excerpt}</p>
                  )}
                  <div className={`text-sm leading-relaxed whitespace-pre-wrap ${'text-gray-700 dark:text-slate-300'}`}>
                    {previewing.body || <span className={muted}>(No content)</span>}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewing(null)}
                className={'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}>
                Close
              </Button>
              {canWrite && previewing && (
                <Button onClick={() => { setEditing({ ...previewing }); setPreviewing(null); }}
                  className="bg-primary hover:bg-primary/90 text-white gap-1.5">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent className={'bg-white border-gray-200 text-gray-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white'}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete content item?</AlertDialogTitle>
              <AlertDialogDescription className={muted}>
                Are you sure you want to permanently delete <strong className={'text-gray-900 dark:text-white'}>{deleteTarget?.title}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminLayout>
    </>
  );
}
