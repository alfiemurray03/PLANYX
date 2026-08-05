/**
 * Admin — Users / Customer Accounts
 *
 * Shows all Microsoft-authenticated customer accounts from ja_users.
 * Supports search, filter by plan / status / role, and per-user actions:
 *   • View full profile (sheet)
 *   • Activate / Suspend account
 *   • Assign role (user / manager / admin)
 *   • Change plan
 *
 * Theme-aware (light/dark/system via AdminThemeProvider).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search, MoreHorizontal, RefreshCw, Eye,
  Users, CreditCard, FileText, Calendar,
  CheckCircle2, XCircle, Crown, AlertTriangle,
  ShieldCheck,
  UserCheck, UserX, UserCog, Fingerprint, Globe,
  Clock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerUser {
  id: string;
  email: string;
  displayName?: string | null;
  firstName: string;
  lastName: string;
  company?: string | null;
  photoUrl?: string | null;

  // Microsoft Entra
  oidcSub?: string | null;
  tenantId?: string | null;
  authMethod?: string | null;

  // App permissions
  role?: string | null;
  accountStatus?: string | null;

  // Billing
  plan: string;
  usageType?: string | null;
  isVerified: boolean;
  planIsLifetime?: boolean;
  planExpiresAt?: string | null;

  // Timestamps
  createdAt: string;
  updatedAt?: string | null;
  lastLogin?: string | null;
}

interface CustomerProfile {
  customer: CustomerUser;
  subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    status: string;
    trialStart: string | null;
    trialEnd: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  documents: {
    total: number;
    drafts: number;
    completed: number;
    archived: number;
    recent: Array<{
      uuid: string;
      title: string;
      templateId: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

interface IdentityVerification {
  verified: boolean;
  method?: string;
  expires_at?: string | null;
  locked?: boolean;
  failed_pin_attempts?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free:             'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  personal:         'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  standard:         'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
  professional:     'bg-primary/10 text-primary border-primary/20',
  org_starter:      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  org_growth:       'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
  org_professional: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free', personal: 'Explore Plan', standard: 'Plan Plan',
  professional: 'Complete Plan', org_starter: 'Together Plan',
};

const ROLE_COLORS: Record<string, string> = {
  user:    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
  manager: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300',
  admin:   'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300',
  suspended: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300',
  pending:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function displayName(u: CustomerUser) {
  if (u.displayName) return u.displayName;
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

function initials(u: CustomerUser) {
  const n = displayName(u);
  const parts = n.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 'md' }: { user: CustomerUser; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';
  if (user.photoUrl) {
    return (
      <img
        src={user.photoUrl}
        alt={displayName(user)}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-primary/10 flex items-center justify-center shrink-0`}>
      <span className="text-primary font-bold">{initials(user)}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers]           = useState<CustomerUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Detail sheet
  const [selectedUser, setSelectedUser]     = useState<CustomerUser | null>(null);
  const [profile, setProfile]               = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [identityVerification, setIdentityVerification] = useState<IdentityVerification | null>(null);
  const [identityPin, setIdentityPin] = useState('');
  const [identityMessage, setIdentityMessage] = useState('');

  // Action feedback
  const [actionMsg, setActionMsg]     = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // ── Load users ──────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json() as { success: boolean; users?: CustomerUser[]; error?: string };
      if (data.success && data.users) {
        setUsers(data.users);
      } else {
        setError(data.error ?? 'Failed to load users.');
      }
    } catch {
      setError('Network error loading users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || u.email.toLowerCase().includes(q)
      || displayName(u).toLowerCase().includes(q)
      || (u.company ?? '').toLowerCase().includes(q)
      || (u.oidcSub ?? '').toLowerCase().includes(q)
      || (u.tenantId ?? '').toLowerCase().includes(q);
    const matchPlan   = planFilter   === 'all' || u.plan === planFilter;
    const matchStatus = statusFilter === 'all' || (u.accountStatus ?? 'active') === statusFilter;
    const matchRole   = roleFilter   === 'all' || (u.role ?? 'user') === roleFilter;
    return matchSearch && matchPlan && matchStatus && matchRole;
  });

  // ── Load profile ────────────────────────────────────────────────────────────

  async function openProfile(u: CustomerUser) {
    navigate(`/admin/users/${encodeURIComponent(u.email)}`);
    return;
    setSelectedUser(u);
    setProfile(null);
    setProfileLoading(true);
    setIdentityVerification(null); setIdentityPin(''); setIdentityMessage('');
    try {
      const [res, verificationResponse] = await Promise.all([
        fetch(`/api/admin/customers/${u.id}`),
        fetch(`/admin/api?section=customer&email=${encodeURIComponent(u.email)}`),
      ]);
      const data = await res.json() as { success: boolean; profile?: CustomerProfile };
      if (data.success && data.profile) setProfile(data.profile);
      const verificationData = await verificationResponse.json().catch(() => ({})) as { verification?: IdentityVerification; customer?: { verification?: IdentityVerification } };
      setIdentityVerification(verificationData.verification || verificationData.customer?.verification || null);
    } catch { /* silent */ }
    finally { setProfileLoading(false); }
  }

  async function verifyCustomerIdentity() {
    if (!selectedUser || !/^\d{6}$/.test(identityPin)) { setIdentityMessage('Enter the customer’s six-digit Support PIN.'); return; }
    setActionLoading(true); setIdentityMessage('');
    try {
      const response = await fetch('/admin/api?section=customer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'verify_pin', email: selectedUser.email, pin: identityPin, method: 'Support PIN' }),
      });
      const data = await response.json() as { saved?: boolean; verification?: IdentityVerification; error?: string };
      setIdentityPin('');
      if (!response.ok || !data.saved) throw new Error(data.error || 'Identity could not be verified.');
      setIdentityVerification(data.verification || null);
      setIdentityMessage('Identity verified. This single-use PIN has now been reset.');
    } catch (reason) { setIdentityMessage(reason instanceof Error ? reason.message : 'Identity could not be verified.'); }
    finally { setActionLoading(false); }
  }

  // ── Generic action helper ───────────────────────────────────────────────────

  async function doAction(userId: string, payload: Record<string, unknown>, successMsg: string) {
    setActionError('');
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        setActionMsg(successMsg);
        setTimeout(() => setActionMsg(''), 5000);
        loadUsers();
        // Refresh open profile
        if (selectedUser?.id === userId) {
          const updated = users.find(u => u.id === userId);
          if (updated) openProfile(updated);
        }
      } else {
        setActionError(data.error ?? 'Action failed.');
      }
    } catch {
      setActionError('Network error.');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = {
    total:     users.length,
    active:    users.filter(u => (u.accountStatus ?? 'active') === 'active').length,
    suspended: users.filter(u => u.accountStatus === 'suspended').length,
    microsoft: users.filter(u => !!u.oidcSub).length,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Helmet>
        <title>Users — Admin — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AdminLayout title="Users" subtitle="Microsoft-authenticated customer accounts">
        <TooltipProvider>
        <div className="space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Users',   value: stats.total,     icon: Users,       color: 'text-foreground' },
              { label: 'Active',        value: stats.active,    icon: UserCheck,   color: 'text-green-600' },
              { label: 'Suspended',     value: stats.suspended, icon: UserX,       color: 'text-red-500' },
              { label: 'Microsoft SSO', value: stats.microsoft, icon: ShieldCheck, color: 'text-blue-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-3 flex items-center gap-3">
                  <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                  <div>
                    <p className={`text-xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Feedback */}
          {actionMsg && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-400">{actionMsg}</AlertDescription>
            </Alert>
          )}
          {actionError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, company, Entra ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All Plans" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {Object.entries(PLAN_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadUsers} className="gap-1.5 h-9">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Last Login</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading users…</p>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center">
                        <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-2" />
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={loadUsers}>Retry</Button>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        {search || planFilter !== 'all' || statusFilter !== 'all' || roleFilter !== 'all'
                          ? 'No users match your filters.'
                          : 'No registered users yet.'}
                      </td>
                    </tr>
                  ) : filtered.map(u => {
                    const status = u.accountStatus ?? 'active';
                    const role   = u.role ?? 'user';
                    return (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">

                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={u} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium text-foreground truncate max-w-[160px]">
                                  {displayName(u)}
                                </p>
                                {u.planIsLifetime && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent>Lifetime plan</TooltipContent>
                                  </Tooltip>
                                )}
                                {u.oidcSub && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <ShieldCheck className="w-3 h-3 text-blue-500 shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent>Signed in with Microsoft</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</p>
                              {u.company && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{u.company}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] h-5 px-2 border capitalize ${ROLE_COLORS[role] ?? ROLE_COLORS.user}`}>
                            {role}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] h-5 px-2 border capitalize ${STATUS_COLORS[status] ?? STATUS_COLORS.active}`}>
                            {status}
                          </Badge>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] h-5 px-2 border ${PLAN_COLORS[u.plan] ?? PLAN_COLORS.free}`}>
                            {PLAN_LABELS[u.plan] ?? u.plan}
                          </Badge>
                        </td>

                        {/* Last login */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(u.lastLogin)}
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(u.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={() => openProfile(u)}
                              title="View profile"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  {displayName(u)}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openProfile(u)} className="text-xs gap-2">
                                  <Eye className="w-3.5 h-3.5" /> View Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">
                                  Account Status
                                </DropdownMenuLabel>
                                {status !== 'active' && (
                                  <DropdownMenuItem
                                    onClick={() => doAction(u.id, { action: 'activate' }, `${displayName(u)} activated.`)}
                                    className="text-xs gap-2 text-green-700 dark:text-green-400"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" /> Activate Account
                                  </DropdownMenuItem>
                                )}
                                {status !== 'suspended' && (
                                  <DropdownMenuItem
                                    onClick={() => doAction(u.id, { action: 'suspend' }, `${displayName(u)} suspended.`)}
                                    className="text-xs gap-2 text-red-600 dark:text-red-400"
                                  >
                                    <UserX className="w-3.5 h-3.5" /> Suspend Account
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">
                                  Assign Role
                                </DropdownMenuLabel>
                                {(['user', 'manager', 'admin'] as const).filter(r => r !== role).map(r => (
                                  <DropdownMenuItem
                                    key={r}
                                    onClick={() => doAction(u.id, { action: 'set_role', role: r }, `Role set to ${r} for ${displayName(u)}.`)}
                                    className="text-xs gap-2 capitalize"
                                  >
                                    <UserCog className="w-3.5 h-3.5" /> Set as {r}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
              </p>
              {(planFilter !== 'all' || statusFilter !== 'all' || roleFilter !== 'all' || search) && (
                <Button
                  variant="ghost" size="sm" className="text-xs h-7 gap-1"
                  onClick={() => { setSearch(''); setPlanFilter('all'); setStatusFilter('all'); setRoleFilter('all'); }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </Card>

        </div>
        </TooltipProvider>
      </AdminLayout>

      {/* ── User Profile Sheet ─────────────────────────────────────────────────── */}
      <Sheet
        open={!!selectedUser}
        onOpenChange={open => { if (!open) { setSelectedUser(null); setProfile(null); } }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader className="mb-5">
                <SheetTitle>
                  <div className="flex items-center gap-3">
                    <UserAvatar user={selectedUser} size="lg" />
                    <div>
                      <p className="font-semibold text-base">{displayName(selectedUser)}</p>
                      <p className="text-xs text-muted-foreground font-normal">{selectedUser.email}</p>
                      {selectedUser.company && (
                        <p className="text-xs text-muted-foreground font-normal">{selectedUser.company}</p>
                      )}
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>

              {profileLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : profile ? (
                <div className="space-y-6">

                  {/* Quick status badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge className={`text-xs border capitalize ${STATUS_COLORS[profile.customer.accountStatus ?? 'active'] ?? ''}`}>
                      {profile.customer.accountStatus ?? 'active'}
                    </Badge>
                    <Badge className={`text-xs border capitalize ${ROLE_COLORS[profile.customer.role ?? 'user'] ?? ''}`}>
                      {profile.customer.role ?? 'user'}
                    </Badge>
                    <Badge className={`text-xs border ${PLAN_COLORS[profile.customer.plan] ?? PLAN_COLORS.free}`}>
                      {PLAN_LABELS[profile.customer.plan] ?? profile.customer.plan}
                      {profile.customer.planIsLifetime && ' · Lifetime'}
                    </Badge>
                    {profile.customer.oidcSub && (
                      <Badge variant="outline" className="text-xs gap-1 border-blue-200 text-blue-700 dark:text-blue-300">
                        <ShieldCheck className="w-3 h-3" /> Microsoft SSO
                      </Badge>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Joined',      value: formatDate(profile.customer.createdAt),  icon: Calendar },
                      { label: 'Last Login',  value: formatDateTime(profile.customer.lastLogin), icon: Clock },
                      { label: 'Last Updated', value: formatDate(profile.customer.updatedAt),  icon: RefreshCw },
                      { label: 'Verified',    value: profile.customer.isVerified ? 'Yes' : 'No', icon: profile.customer.isVerified ? CheckCircle2 : XCircle },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="w-3 h-3 text-muted-foreground" />
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                        </div>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Microsoft Entra identity */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Fingerprint className="w-4 h-4 text-muted-foreground" /> Verify Identity</h3>
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium">Support identity status</p><p className="text-[11px] text-muted-foreground">Uses the customer’s single-use Sousa Murray Planeia Support PIN.</p></div><Badge className={identityVerification?.verified ? 'bg-green-100 text-green-700 border-green-200' : identityVerification?.locked ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>{identityVerification?.verified ? 'Verified' : identityVerification?.locked ? 'Locked' : 'Verification required'}</Badge></div>
                      {identityVerification?.verified ? <div className="rounded-md bg-green-50 p-2 text-xs text-green-800"><p className="font-semibold">Verified via {identityVerification.method || 'Support PIN'}</p>{identityVerification.expires_at && <p className="mt-0.5">CRM verification expires {formatDateTime(identityVerification.expires_at)}.</p>}</div> : <><label htmlFor="crm-support-pin" className="block text-xs font-semibold">Customer’s Support PIN</label><div className="flex gap-2"><Input id="crm-support-pin" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={identityPin} onChange={event => setIdentityPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" className="font-mono tracking-[0.25em]" /><Button type="button" size="sm" onClick={() => void verifyCustomerIdentity()} disabled={actionLoading || identityPin.length !== 6}>Verify Identity</Button></div></>}
                      {identityMessage && <p role="status" className="text-xs text-muted-foreground">{identityMessage}</p>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Microsoft Identity
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Fingerprint className="w-3 h-3" /> Auth method
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5 px-2 capitalize">
                          {profile.customer.authMethod ?? 'oidc'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-muted-foreground shrink-0 flex items-center gap-1.5">
                          <Fingerprint className="w-3 h-3" /> Entra object ID
                        </span>
                        {profile.customer.oidcSub ? (
                          <code className="font-mono text-[10px] text-foreground break-all text-right max-w-[200px]">
                            {profile.customer.oidcSub}
                          </code>
                        ) : (
                          <span className="text-muted-foreground italic">Not linked</span>
                        )}
                      </div>
                      {profile.customer.tenantId && (
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-muted-foreground shrink-0 flex items-center gap-1.5">
                            <Globe className="w-3 h-3" /> Tenant ID
                          </span>
                          <code className="font-mono text-[10px] text-foreground break-all text-right max-w-[200px]">
                            {profile.customer.tenantId}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Documents */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> Documents
                    </h3>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[
                        { label: 'Total',    value: profile.documents.total },
                        { label: 'Drafts',   value: profile.documents.drafts },
                        { label: 'Complete', value: profile.documents.completed },
                        { label: 'Archived', value: profile.documents.archived },
                      ].map(d => (
                        <div key={d.label} className="bg-muted/30 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">{d.value}</p>
                          <p className="text-[10px] text-muted-foreground">{d.label}</p>
                        </div>
                      ))}
                    </div>
                    {profile.documents.recent.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Recent documents</p>
                        {profile.documents.recent.slice(0, 5).map(doc => (
                          <div key={doc.uuid} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2.5 py-1.5">
                            <span className="truncate max-w-[200px] text-foreground">{doc.title}</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 capitalize ml-2 shrink-0">
                              {doc.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subscription */}
                  {profile.subscription && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-muted-foreground" /> Subscription
                      </h3>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <span className="font-medium capitalize">{profile.subscription.status}</span>
                        </div>
                        {profile.subscription.trialEnd && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Trial ends</span>
                            <span className="font-medium">{formatDate(profile.subscription.trialEnd)}</span>
                          </div>
                        )}
                        {profile.subscription.currentPeriodEnd && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Period ends</span>
                            <span className="font-medium">{formatDate(profile.subscription.currentPeriodEnd)}</span>
                          </div>
                        )}
                        {profile.subscription.stripeCustomerId && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Stripe ID</span>
                            <code className="font-mono text-[10px]">{profile.subscription.stripeCustomerId}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Admin actions */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Admin Actions</h3>
                    <div className="space-y-3">

                      {/* Account status toggle */}
                      <div className="flex gap-2">
                        {(profile.customer.accountStatus ?? 'active') !== 'active' ? (
                          <Button
                            variant="outline" size="sm" className="flex-1 gap-2 text-xs text-green-700 border-green-200 hover:bg-green-50"
                            disabled={actionLoading}
                            onClick={() => doAction(selectedUser.id, { action: 'activate' }, `${displayName(selectedUser)} activated.`)}
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Activate Account
                          </Button>
                        ) : (
                          <Button
                            variant="outline" size="sm" className="flex-1 gap-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={actionLoading}
                            onClick={() => doAction(selectedUser.id, { action: 'suspend' }, `${displayName(selectedUser)} suspended.`)}
                          >
                            <UserX className="w-3.5 h-3.5" /> Suspend Account
                          </Button>
                        )}
                      </div>

                      {/* Role */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={profile.customer.role ?? 'user'}
                          onValueChange={v => doAction(selectedUser.id, { action: 'set_role', role: v }, `Role set to ${v}.`)}
                        >
                          <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Assign role</span>
                      </div>

                      {/* Plan */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={profile.customer.plan}
                          onValueChange={v => doAction(selectedUser.id, { action: 'change_plan', plan: v }, `Plan set to ${PLAN_LABELS[v] ?? v}.`)}
                        >
                          <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(PLAN_LABELS).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Change plan</span>
                      </div>

                    </div>
                  </div>

                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Could not load profile details.
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
