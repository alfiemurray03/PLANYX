import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  KeyRound, RefreshCw, Clock, CheckCircle2, XCircle, Link2, Hash,
  AlertTriangle, User, Mail,
} from 'lucide-react';
import { getAdminSession } from '@/lib/admin-types';

interface ResetRequest {
  id: number;
  uuid: string;
  userId: number;
  email: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  deliveryMethod: 'link' | 'pin' | null;
  used: boolean;
  expiresAt: string | null;
  adminNotes: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  rejected:  'bg-red-500/20 text-red-300 border-red-500/30',
  completed: 'bg-green-500/20 text-green-300 border-green-500/30',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:   <Clock className="w-3.5 h-3.5" />,
  approved:  <CheckCircle2 className="w-3.5 h-3.5" />,
  rejected:  <XCircle className="w-3.5 h-3.5" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5" />,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

export default function AdminPasswordResetsPage() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionRequest, setActionRequest] = useState<ResetRequest | null>(null);
  const [actionType, setActionType] = useState<'approve_link' | 'approve_pin' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/password-resets');
      const data = await res.json() as { success: boolean; requests?: ResetRequest[]; error?: string };
      if (data.success && data.requests) {
        setRequests(data.requests);
      } else {
        setError(data.error ?? 'Failed to load requests.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAction = (req: ResetRequest, type: 'approve_link' | 'approve_pin' | 'reject') => {
    setActionRequest(req);
    setActionType(type);
    setNotes('');
    setActionError(null);
    setActionSuccess(null);
  };

  const submitAction = async () => {
    if (!actionRequest || !actionType) return;
    const admin = getAdminSession();
    if (!admin) return;

    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/password-resets/${actionRequest.uuid}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, adminEmail: admin.email, notes }),
      });
      const data = await res.json() as { success: boolean; message?: string; error?: string };
      if (data.success) {
        setActionSuccess(data.message ?? 'Action completed.');
        void load();
        setTimeout(() => {
          setActionRequest(null);
          setActionType(null);
          setActionSuccess(null);
        }, 2000);
      } else {
        setActionError(data.error ?? 'Action failed.');
      }
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');

  const actionLabels: Record<string, string> = {
    approve_link: 'Approve & Send Reset Link',
    approve_pin:  'Approve & Send Reset PIN',
    reject:       'Reject Request',
  };

  const actionDescriptions: Record<string, string> = {
    approve_link: 'A secure one-time reset link will be emailed to the customer. The link expires in 24 hours.',
    approve_pin:  'A secure 6-digit PIN will be emailed to the customer. The PIN expires in 24 hours.',
    reject:       'The customer will be notified that their request could not be processed.',
  };

  return (
    <AdminLayout title="Password Resets" subtitle="Review and process customer password reset requests">
      <Helmet>
        <title>Password Resets — Sousa Murray Planeia Admin</title>
      </Helmet>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Password Resets</h1>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending', value: requests.filter(r => r.status === 'pending').length, color: 'text-amber-400' },
            { label: 'Approved', value: requests.filter(r => r.status === 'approved').length, color: 'text-blue-400' },
            { label: 'Completed', value: requests.filter(r => r.status === 'completed').length, color: 'text-green-400' },
            { label: 'Rejected', value: requests.filter(r => r.status === 'rejected').length, color: 'text-red-400' },
          ].map(stat => (
            <Card key={stat.label} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide">{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Pending requests */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Pending Requests ({pending.length})
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-24 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-slate-400">No pending requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map(req => (
                <Card key={req.uuid} className="bg-slate-800/50 border-amber-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-white font-medium text-sm">{req.email}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Requested {formatDate(req.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => openAction(req, 'approve_link')}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1.5" />
                          Send Link
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openAction(req, 'approve_pin')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
                        >
                          <Hash className="w-3.5 h-3.5 mr-1.5" />
                          Send PIN
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAction(req, 'reject')}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs h-8"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Processed requests */}
        {processed.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">
              Request History ({processed.length})
            </h2>
            <div className="space-y-2">
              {processed.map(req => (
                <Card key={req.uuid} className="bg-slate-800/30 border-slate-700/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div>
                          <span className="text-slate-300 text-sm">{req.email}</span>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {req.processedAt ? `Processed ${formatDate(req.processedAt)}` : formatDate(req.createdAt)}
                            {req.processedBy ? ` by ${req.processedBy}` : ''}
                            {req.deliveryMethod ? ` · via ${req.deliveryMethod}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[req.status]}`}>
                        {STATUS_ICONS[req.status]}
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </div>
                    {req.adminNotes && (
                      <p className="text-xs text-slate-500 mt-2 pl-11 italic">{req.adminNotes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionRequest} onOpenChange={(open) => { if (!open) { setActionRequest(null); setActionType(null); } }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'reject' ? (
                <XCircle className="w-5 h-5 text-red-400" />
              ) : (
                <KeyRound className="w-5 h-5 text-blue-400" />
              )}
              {actionType ? actionLabels[actionType] : ''}
            </DialogTitle>
          </DialogHeader>

          {actionRequest && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-800 rounded-lg text-sm">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Customer</p>
                <p className="text-white">{actionRequest.email}</p>
                <p className="text-slate-400 text-xs mt-1">Requested {formatDate(actionRequest.createdAt)}</p>
              </div>

              <p className="text-sm text-slate-400">
                {actionType ? actionDescriptions[actionType] : ''}
              </p>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">
                  Admin Notes (optional)
                </label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add any notes about this decision..."
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                  rows={3}
                />
              </div>

              {actionError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {actionError}
                </div>
              )}

              {actionSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {actionSuccess}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setActionRequest(null); setActionType(null); }}
              disabled={submitting}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitAction()}
              disabled={submitting || !!actionSuccess}
              className={actionType === 'reject'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}
            >
              {submitting ? 'Processing...' : (actionType ? actionLabels[actionType] : 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
