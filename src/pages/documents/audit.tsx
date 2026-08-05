/**
 * Document Audit & History Page
 * Shows a full activity log for all documents: creation, edits, saves,
 * exports, prints, signing requests, and signing completions.
 */
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  FileText, PenLine, Download, Printer, Save, Eye,
  RefreshCw, Search, Clock, CheckCircle2, XCircle,
  AlertTriangle, FileDown, Edit3, Plus, Send,
  Shield, User, Calendar,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  type: 'document' | 'signing';
  event: string;
  title: string;
  detail: string | null;
  builderId: string | null;
  signingStatus: string | null;
  signerEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ── Event metadata ─────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  // Document events
  document_created:   { label: 'Document Created',    icon: Plus,         color: 'text-green-600',  bg: 'bg-green-50' },
  document_saved:     { label: 'Draft Saved',          icon: Save,         color: 'text-blue-600',   bg: 'bg-blue-50' },
  document_edited:    { label: 'Document Edited',      icon: Edit3,        color: 'text-indigo-600', bg: 'bg-indigo-50' },
  document_viewed:    { label: 'Document Viewed',      icon: Eye,          color: 'text-slate-600',  bg: 'bg-slate-50' },
  document_exported_pdf:  { label: 'Exported as PDF',  icon: FileDown,     color: 'text-red-600',    bg: 'bg-red-50' },
  document_exported_html: { label: 'Exported as HTML', icon: Download,     color: 'text-purple-600', bg: 'bg-purple-50' },
  document_printed:   { label: 'Sent to Print',        icon: Printer,      color: 'text-slate-600',  bg: 'bg-slate-50' },
  document_deleted:   { label: 'Document Deleted',     icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-50' },
  // Signing events
  signing_created:    { label: 'Signing Request Created', icon: PenLine,   color: 'text-primary',    bg: 'bg-primary/5' },
  signing_sent:       { label: 'Sent for Signing',     icon: Send,         color: 'text-blue-600',   bg: 'bg-blue-50' },
  signing_viewed:     { label: 'Document Viewed',      icon: Eye,          color: 'text-slate-600',  bg: 'bg-slate-50' },
  signing_signed:     { label: 'Signed',               icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50' },
  signing_declined:   { label: 'Declined',             icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-50' },
  signing_completed:  { label: 'Signing Completed',    icon: Shield,       color: 'text-green-700',  bg: 'bg-green-50' },
  signing_cancelled:  { label: 'Signing Cancelled',    icon: XCircle,      color: 'text-slate-500',  bg: 'bg-slate-50' },
  signing_expired:    { label: 'Signing Expired',      icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50' },
  signing_reminder:   { label: 'Reminder Sent',        icon: Send,         color: 'text-amber-600',  bg: 'bg-amber-50' },
};

function getEventMeta(event: string) {
  return EVENT_META[event] ?? { label: event.replace(/_/g, ' '), icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted/30' };
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtRelative(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return fmtDate(iso);
  } catch { return iso; }
}

const BUILDER_LABELS: Record<string, string> = {
  letter: 'Letter', email: 'Email', invoice: 'Invoice', contract: 'Contract',
  policy: 'Policy', form: 'Form', report: 'Report', minutes: 'Minutes',
  proposal: 'Proposal', checklist: 'Checklist',
};

const TYPE_FILTERS = [
  { value: 'all',      label: 'All Activity' },
  { value: 'document', label: 'Documents' },
  { value: 'signing',  label: 'Signing' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function DocumentAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PER_PAGE = 30;

  function load() {
    setLoading(true);
    setError(null);
    fetch('/api/documents/audit', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { success: boolean; entries: AuditEntry[] }) => {
        if (d.success) setEntries(d.entries);
        else setError('Failed to load audit history.');
      })
      .catch(() => setError('Could not load audit history. Please refresh.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = entries.filter(e => {
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    const matchSearch = !search
      || e.title.toLowerCase().includes(search.toLowerCase())
      || e.event.toLowerCase().includes(search.toLowerCase())
      || (e.signerEmail ?? '').toLowerCase().includes(search.toLowerCase())
      || (e.detail ?? '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Stats
  const stats = {
    total:    entries.length,
    docs:     entries.filter(e => e.type === 'document').length,
    signing:  entries.filter(e => e.type === 'signing').length,
    exports:  entries.filter(e => ['document_exported_pdf','document_exported_html','document_printed'].includes(e.event)).length,
    signed:   entries.filter(e => e.event === 'signing_signed').length,
    completed:entries.filter(e => e.event === 'signing_completed').length,
  };

  return (
    <>
      <Helmet>
        <title>Audit & History — Sousa Murray Planeia</title>
        <meta name="description" content="Full activity log for your documents and signing requests." />
      </Helmet>
      <DashboardLayout>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Audit & History</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Full activity log for your documents and signing requests</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Events',    value: stats.total,     icon: FileText,     color: 'text-foreground' },
            { label: 'Document Events', value: stats.docs,      icon: FileText,     color: 'text-blue-600' },
            { label: 'Signing Events',  value: stats.signing,   icon: PenLine,      color: 'text-primary' },
            { label: 'Exports',         value: stats.exports,   icon: Download,     color: 'text-purple-600' },
            { label: 'Signatures',      value: stats.signed,    icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Completed',       value: stats.completed, icon: Shield,       color: 'text-green-700' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search events, documents, signers…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground mb-3">
          {loading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}${typeFilter !== 'all' || search ? ' matching filters' : ''}`}
        </p>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-14 h-14 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground font-medium">No activity found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {search || typeFilter !== 'all' ? 'Try adjusting your filters' : 'Activity will appear here as you create and manage documents'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {paginated.map((entry, idx) => {
                const meta = getEventMeta(entry.event);
                const Icon = meta.icon;
                return (
                  <div key={entry.id}>
                    {idx > 0 && <Separator />}
                    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {entry.type === 'signing' ? 'Signing' : (entry.builderId ? (BUILDER_LABELS[entry.builderId] ?? entry.builderId) : 'Document')}
                          </Badge>
                          {entry.signingStatus && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">
                              {entry.signingStatus.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-0.5 truncate">{entry.title}</p>
                        {entry.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
                        )}
                        {entry.signerEmail && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{entry.signerEmail}</span>
                          </div>
                        )}
                      </div>
                      {/* Time */}
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground" title={fmtDate(entry.createdAt)}>
                          {fmtRelative(entry.createdAt)}
                        </p>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <Calendar className="w-3 h-3 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground/50">{fmtDate(entry.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {filtered.length} events
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Signing quick links */}
        <div className="mt-8 bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-0.5">Document Signing Records</h3>
            <p className="text-xs text-muted-foreground">View detailed signing requests, signer status, and completed audit trails in the Signing section.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Link to="/signing">
              <PenLine className="w-3.5 h-3.5" /> View Signing
            </Link>
          </Button>
        </div>
      </DashboardLayout>
    </>
  );
}
