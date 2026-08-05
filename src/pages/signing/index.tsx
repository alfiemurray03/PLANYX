import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { canUseSigning } from '@/lib/plan-config';
import type { PlanId } from '@/lib/plan-config';
import type { SigningRequest, SigningStatus } from '@/lib/signing-types';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/signing-types';
import {
  PenLine, Plus, Search, FileText, Clock, CheckCircle2,
  XCircle, AlertTriangle, RefreshCw, Download, Eye,
  Lock, ArrowRight,
} from 'lucide-react';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Requests' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'partially_signed', label: 'Partially Signed' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function SigningDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const plan = (user?.plan ?? 'free') as PlanId;
  const hasAccess = canUseSigning(plan);

  const [requests, setRequests] = useState<(SigningRequest & { signerCount: number; signedCount: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!hasAccess) { setLoading(false); return; }
    fetch('/api/signing/requests', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setRequests(d.requests); })
      .finally(() => setLoading(false));
  }, [hasAccess]);

  const filtered = requests.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const stats = {
    total: requests.length,
    draft: requests.filter(r => r.status === 'draft').length,
    sent: requests.filter(r => ['sent', 'viewed', 'partially_signed'].includes(r.status)).length,
    completed: requests.filter(r => r.status === 'completed').length,
    declined: requests.filter(r => ['declined', 'expired', 'cancelled'].includes(r.status)).length,
  };

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <Helmet><title>Document Signing — Sousa Murray Planeia</title></Helmet>
        <div className="max-w-2xl mx-auto py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">Document Signing</h1>
          <p className="text-muted-foreground mb-2">
            Send documents for secure online signing with a full audit trail.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Document Signing is available on the <strong>Professional</strong> plan and above.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-left">
            {[
              { icon: PenLine, title: 'Secure Online Signing', desc: 'Signers sign directly in their browser — no account needed.' },
              { icon: CheckCircle2, title: 'Full Audit Trail', desc: 'Every action is logged with timestamps, IP addresses, and browser details.' },
              { icon: FileText, title: 'Audit Certificate', desc: 'Download a tamper-evident completion certificate for every signed document.' },
            ].map(f => (
              <div key={f.title} className="p-4 rounded-xl border border-border bg-card">
                <f.icon className="w-5 h-5 text-primary mb-2" />
                <div className="font-semibold text-sm text-foreground mb-1">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate('/settings?tab=subscription')} className="gap-2">
              Upgrade to Professional <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate('/pricing')} className="gap-2">
              Compare Plans
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet><title>Document Signing — Sousa Murray Planeia</title></Helmet>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <PenLine className="w-6 h-6 text-primary" /> Document Signing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage signing requests</p>
          </div>
          <Button onClick={() => navigate('/signing/new')} className="gap-2">
            <Plus className="w-4 h-4" /> New Signing Request
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: FileText, color: 'text-slate-600' },
            { label: 'Awaiting Signature', value: stats.sent, icon: Clock, color: 'text-blue-600' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Declined / Expired', value: stats.declined, icon: XCircle, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by title…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <PenLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No signing requests found</p>
            <p className="text-sm mt-1">Create your first signing request to get started.</p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate('/signing/new')}>
              <Plus className="w-4 h-4" /> Create Signing Request
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <div
                key={r.uuid}
                onClick={() => navigate(`/signing/${r.uuid}`)}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/40 hover:bg-muted/20 cursor-pointer transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <PenLine className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">{r.title}</span>
                    <Badge className={`text-[10px] h-5 px-2 ${STATUS_COLORS[r.status as SigningStatus]}`}>
                      {STATUS_LABELS[r.status as SigningStatus]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span>{r.signerCount} signer{r.signerCount !== 1 ? 's' : ''}</span>
                    <span>{r.signedCount}/{r.signerCount} signed</span>
                    {r.expiresAt && <span>Expires {new Date(r.expiresAt).toLocaleDateString('en-GB')}</span>}
                    <span>Created {new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'completed' && (
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={e => { e.stopPropagation(); window.open(`/api/signing/requests/${r.uuid}/certificate`, '_blank'); }}>
                      <Download className="w-3 h-3" /> Certificate
                    </Button>
                  )}
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
