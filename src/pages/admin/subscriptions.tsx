import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Crown,
  Eye,
  FileText,
  LockKeyhole,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  personal: 'Explore Plan',
  standard: 'Plan Plan',
  professional: 'Complete Plan',
  org_starter: 'Together Plan',
};

const PLAN_OPTIONS = Object.keys(PLAN_LABELS);

type AccountType = 'individual' | 'organisation';

interface CustomerUser {
  id: string;
  email: string;
  displayName?: string | null;
  firstName: string;
  lastName: string;
  company?: string | null;
  accountType: AccountType;
  accountTypeConfirmed: boolean;
  usageType?: string | null;
  plan: string;
  role?: string | null;
  accountStatus: string;
  isVerified: boolean;
  planIsLifetime?: boolean;
  planExpiresAt?: string | null;
  subscriptionStatus?: string | null;
  sharingLevel: string;
  canInviteEditors: boolean;
  memberWorkspace: boolean;
  activeInvitations: number;
  createdAt: string;
  updatedAt?: string | null;
  lastLogin?: string | null;
}

interface DocumentSummary {
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
  documents: DocumentSummary;
  workspace: {
    accountType: AccountType;
    accountTypeConfirmed: boolean;
    sharingLevel: string;
    canShareItineraries: boolean;
    canInviteEditors: boolean;
    memberWorkspace: boolean;
    invitations: {
      total: number;
      active: number;
      readOnly: number;
      editable: number;
      recent: Array<Record<string, unknown>>;
    };
  };
}

const EMPTY_DOCUMENTS: DocumentSummary = {
  total: 0,
  drafts: 0,
  completed: 0,
  archived: 0,
  recent: [],
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function displayName(customer: CustomerUser) {
  return customer.displayName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email;
}

function accountTypeLabel(type: AccountType) {
  return type === 'organisation' ? 'Organisation' : 'Individual';
}

function accountBadge(type: AccountType) {
  return type === 'organisation'
    ? 'border-violet-200 bg-violet-50 text-violet-700'
    : 'border-blue-200 bg-blue-50 text-blue-700';
}

function planBadge(plan: string) {
  if (plan === 'org_starter') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (plan === 'professional') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (plan === 'standard') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (plan === 'personal') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function normaliseProfile(result: Record<string, unknown>): CustomerProfile | null {
  const source = (result.profile && typeof result.profile === 'object'
    ? result.profile
    : result) as Partial<CustomerProfile>;
  if (!source.customer) return null;
  const customer = source.customer as CustomerUser;
  const accountType: AccountType = customer.accountType === 'organisation' ? 'organisation' : 'individual';
  const documents = source.documents && typeof source.documents === 'object'
    ? { ...EMPTY_DOCUMENTS, ...source.documents, recent: Array.isArray(source.documents.recent) ? source.documents.recent : [] }
    : EMPTY_DOCUMENTS;
  const workspace = source.workspace && typeof source.workspace === 'object'
    ? source.workspace
    : {
        accountType,
        accountTypeConfirmed: Boolean(customer.accountTypeConfirmed),
        sharingLevel: customer.sharingLevel || (accountType === 'organisation' ? 'Read-only' : 'Private'),
        canShareItineraries: accountType === 'organisation' && customer.plan !== 'free',
        canInviteEditors: Boolean(customer.canInviteEditors),
        memberWorkspace: Boolean(customer.memberWorkspace),
        invitations: { total: 0, active: customer.activeInvitations || 0, readOnly: 0, editable: 0, recent: [] },
      };
  return {
    customer: { ...customer, accountType },
    subscription: source.subscription || null,
    documents,
    workspace: {
      ...workspace,
      invitations: {
        total: workspace.invitations?.total || 0,
        active: workspace.invitations?.active || 0,
        readOnly: workspace.invitations?.readOnly || 0,
        editable: workspace.invitations?.editable || 0,
        recent: Array.isArray(workspace.invitations?.recent) ? workspace.invitations.recent : [],
      },
    },
  };
}

export default function AdminSubscriptions() {
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [accountTypeDraft, setAccountTypeDraft] = useState<AccountType>('individual');
  const [planDraft, setPlanDraft] = useState('free');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newType, setNewType] = useState<AccountType>('individual');
  const [newPlan, setNewPlan] = useState('free');
  const [createError, setCreateError] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/customers', { credentials: 'include', cache: 'no-store' });
      const result = await response.json() as { success?: boolean; users?: CustomerUser[]; customers?: CustomerUser[]; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'Membership data could not be loaded.');
      const rows = Array.isArray(result.users) ? result.users : Array.isArray(result.customers) ? result.customers : [];
      setCustomers(rows.map(customer => ({
        ...customer,
        accountType: customer.accountType === 'organisation' ? 'organisation' : 'individual',
        accountTypeConfirmed: Boolean(customer.accountTypeConfirmed),
        activeInvitations: Number(customer.activeInvitations || 0),
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Membership data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const openCustomer = useCallback(async (email: string) => {
    setSelectedEmail(email);
    setProfile(null);
    setProfileError('');
    setActionMessage('');
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(email)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const result = await response.json() as Record<string, unknown> & { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'This membership record could not be opened.');
      const next = normaliseProfile(result);
      if (!next) throw new Error('The membership record was incomplete.');
      setProfile(next);
      setAccountTypeDraft(next.customer.accountType);
      setPlanDraft(next.customer.plan || 'free');
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : 'This membership record could not be opened.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  async function updateCustomer(payload: Record<string, unknown>, successMessage: string) {
    if (!selectedEmail) return;
    setActionLoading(true);
    setActionMessage('');
    setProfileError('');
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(selectedEmail)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as Record<string, unknown> & { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'The membership change could not be saved.');
      const next = normaliseProfile(result);
      if (next) {
        setProfile(next);
        setAccountTypeDraft(next.customer.accountType);
        setPlanDraft(next.customer.plan);
      } else {
        await openCustomer(selectedEmail);
      }
      setActionMessage(successMessage);
      await loadCustomers();
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : 'The membership change could not be saved.');
    } finally {
      setActionLoading(false);
    }
  }

  async function createCustomer() {
    setCreateError('');
    const email = newEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setCreateError('Enter a valid email address.');
      return;
    }
    setActionLoading(true);
    try {
      const [firstName, ...rest] = newName.trim().split(/\s+/);
      const response = await fetch('/api/admin/customers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName || email.split('@')[0],
          lastName: rest.join(' '),
          email,
          company: newCompany.trim() || null,
          accountType: newType,
          plan: newPlan,
        }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'The customer could not be created.');
      setShowAdd(false);
      setNewName(''); setNewEmail(''); setNewCompany(''); setNewType('individual'); setNewPlan('free');
      await loadCustomers();
      await openCustomer(email);
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : 'The customer could not be created.');
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = useMemo(() => customers.filter(customer => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query
      || customer.email.toLowerCase().includes(query)
      || displayName(customer).toLowerCase().includes(query)
      || String(customer.company || '').toLowerCase().includes(query);
    const matchesType = accountFilter === 'all' || customer.accountType === accountFilter;
    const matchesPlan = planFilter === 'all' || customer.plan === planFilter;
    return matchesSearch && matchesType && matchesPlan;
  }), [customers, search, accountFilter, planFilter]);

  const totals = useMemo(() => ({
    total: customers.length,
    individual: customers.filter(customer => customer.accountType === 'individual').length,
    organisation: customers.filter(customer => customer.accountType === 'organisation').length,
    confirmationRequired: customers.filter(customer => !customer.accountTypeConfirmed).length,
  }), [customers]);

  return (
    <>
      <Helmet>
        <title>Membership — Admin — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <AdminLayout title="Membership" subtitle="Monitor Individual and Organisation accounts, subscriptions and sharing permissions">
        <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total accounts', value: totals.total, icon: Users },
              { label: 'Individual', value: totals.individual, icon: User },
              { label: 'Organisation', value: totals.organisation, icon: Building2 },
              { label: 'Confirmation required', value: totals.confirmationRequired, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="border-slate-200 bg-white">
                <CardContent className="flex min-w-0 items-center gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0"><p className="text-2xl font-bold text-slate-950">{loading ? '—' : value}</p><p className="break-words text-sm text-slate-500">{label}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-950">Customer memberships</h2>
                  <p className="text-sm text-slate-500">Account type and subscription are separate. A company name never changes an Individual account.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadCustomers()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
                  <Button size="sm" onClick={() => setShowAdd(true)}><UserPlus className="mr-2 h-4 w-4" />Add customer</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email or company" className="pl-9" /></div>
                <Select value={accountFilter} onValueChange={setAccountFilter}><SelectTrigger><SelectValue placeholder="All account types" /></SelectTrigger><SelectContent><SelectItem value="all">All account types</SelectItem><SelectItem value="individual">Individual</SelectItem><SelectItem value="organisation">Organisation</SelectItem></SelectContent></Select>
                <Select value={planFilter} onValueChange={setPlanFilter}><SelectTrigger><SelectValue placeholder="All plans" /></SelectTrigger><SelectContent><SelectItem value="all">All plans</SelectItem>{PLAN_OPTIONS.map(plan => <SelectItem key={plan} value={plan}>{PLAN_LABELS[plan]}</SelectItem>)}</SelectContent></Select>
              </div>

              {error && <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert></div>}

              <div className="admin-table-scroll">
                <table className="admin-data-table min-w-[1040px]" aria-label="Customer memberships">
                  <thead><tr><th>Customer</th><th>Account type</th><th>Plan</th><th>Sharing</th><th>Invitations</th><th>Status</th><th>Last login</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan={8} className="py-14 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading memberships…</td></tr>
                    : filtered.length === 0 ? <tr><td colSpan={8} className="py-14 text-center text-slate-500">No membership records match the selected filters.</td></tr>
                    : filtered.map(customer => (
                      <tr key={customer.email} className="cursor-pointer" onClick={() => void openCustomer(customer.email)}>
                        <td><div className="min-w-0"><button type="button" className="break-words text-left font-semibold text-slate-950 hover:text-blue-700" onClick={event => { event.stopPropagation(); void openCustomer(customer.email); }}>{displayName(customer)}</button><p className="break-all text-xs text-slate-500">{customer.email}</p>{customer.company && <p className="break-words text-xs text-slate-400">{customer.company}</p>}</div></td>
                        <td><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={accountBadge(customer.accountType)}>{accountTypeLabel(customer.accountType)}</Badge>{!customer.accountTypeConfirmed && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Confirmation required</Badge>}</div></td>
                        <td><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={planBadge(customer.plan)}>{PLAN_LABELS[customer.plan] || customer.plan}</Badge>{customer.planIsLifetime && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700"><Crown className="mr-1 h-3 w-3" />Lifetime</Badge>}</div></td>
                        <td><span className="break-words text-sm text-slate-700">{customer.sharingLevel || 'Private'}</span>{customer.memberWorkspace && <p className="text-xs text-slate-500">Member workspace enabled</p>}</td>
                        <td>{Number(customer.activeInvitations || 0).toLocaleString('en-GB')}</td>
                        <td><Badge variant="outline" className={customer.accountStatus === 'suspended' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{customer.accountStatus === 'suspended' ? 'Suspended' : 'Active'}</Badge></td>
                        <td className="whitespace-nowrap text-sm text-slate-500">{formatDate(customer.lastLogin)}</td>
                        <td><Button variant="ghost" size="sm" onClick={event => { event.stopPropagation(); void openCustomer(customer.email); }}><Eye className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing {filtered.length.toLocaleString('en-GB')} of {customers.length.toLocaleString('en-GB')} accounts</div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>

      <Sheet open={Boolean(selectedEmail)} onOpenChange={open => { if (!open) { setSelectedEmail(null); setProfile(null); setProfileError(''); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="mb-5"><SheetTitle>Membership details</SheetTitle></SheetHeader>
          {profileLoading ? <div className="flex min-h-80 items-center justify-center text-slate-500"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading customer…</div>
          : profileError && !profile ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{profileError}</AlertDescription></Alert>
          : profile ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex min-w-0 items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">{profile.customer.accountType === 'organisation' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-bold text-slate-950">{displayName(profile.customer)}</h2><p className="break-all text-sm text-slate-500">{profile.customer.email}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline" className={accountBadge(profile.customer.accountType)}>{accountTypeLabel(profile.customer.accountType)}</Badge><Badge variant="outline" className={planBadge(profile.customer.plan)}>{PLAN_LABELS[profile.customer.plan]}</Badge>{!profile.customer.accountTypeConfirmed && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Confirmation required</Badge>}</div></div></div>
              </div>

              {profileError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{profileError}</AlertDescription></Alert>}
              {actionMessage && <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertDescription className="text-emerald-800">{actionMessage}</AlertDescription></Alert>}

              <Tabs defaultValue="workspace">
                <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="workspace">Workspace</TabsTrigger><TabsTrigger value="billing">Billing</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="manage">Manage</TabsTrigger></TabsList>

                <TabsContent value="workspace" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Account type', value: accountTypeLabel(profile.customer.accountType), icon: profile.customer.accountType === 'organisation' ? Building2 : User },
                      { label: 'Sharing permission', value: profile.workspace.sharingLevel, icon: Share2 },
                      { label: 'Invited editors', value: profile.workspace.canInviteEditors ? 'Allowed on Together' : 'Not allowed', icon: Pencil },
                      { label: 'Member workspace', value: profile.workspace.memberWorkspace ? 'Enabled' : 'Not included', icon: Users },
                      { label: 'Active invitations', value: profile.workspace.invitations.active.toLocaleString('en-GB'), icon: Mail },
                      { label: 'Classification', value: profile.customer.accountTypeConfirmed ? 'Confirmed' : 'Confirmation required', icon: ShieldCheck },
                    ].map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 p-4"><Icon className="mb-2 h-4 w-4 text-blue-600" /><p className="text-xs text-slate-500">{label}</p><p className="break-words font-semibold text-slate-900">{value}</p></div>)}
                  </div>
                  {profile.customer.accountType === 'individual' ? <Alert><LockKeyhole className="h-4 w-4" /><AlertDescription>Individual accounts remain private. Organisation invitations and member controls are not available, regardless of the plan selected.</AlertDescription></Alert> : <Alert><Building2 className="h-4 w-4" /><AlertDescription>{profile.customer.plan === 'org_starter' ? 'Together permits read-only or editable invitations and enables the Organisation member workspace.' : profile.customer.plan === 'free' ? 'This Organisation currently has no paid sharing entitlement.' : 'Explore, Plan and Complete Organisation accounts may invite read-only viewers. Editing is blocked.'}</AlertDescription></Alert>}
                </TabsContent>

                <TabsContent value="billing" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4"><CreditCard className="mb-2 h-4 w-4 text-blue-600" /><p className="text-xs text-slate-500">Current plan</p><p className="font-semibold text-slate-900">{PLAN_LABELS[profile.customer.plan] || profile.customer.plan}</p></div>
                    <div className="rounded-xl border border-slate-200 p-4"><ShieldCheck className="mb-2 h-4 w-4 text-blue-600" /><p className="text-xs text-slate-500">Subscription status</p><p className="font-semibold capitalize text-slate-900">{profile.subscription?.status || profile.customer.subscriptionStatus || 'No active Stripe subscription'}</p></div>
                    <div className="rounded-xl border border-slate-200 p-4"><Calendar className="mb-2 h-4 w-4 text-blue-600" /><p className="text-xs text-slate-500">Period end</p><p className="font-semibold text-slate-900">{formatDate(profile.subscription?.currentPeriodEnd)}</p></div>
                    <div className="rounded-xl border border-slate-200 p-4"><Crown className="mb-2 h-4 w-4 text-blue-600" /><p className="text-xs text-slate-500">Lifetime override</p><p className="font-semibold text-slate-900">{profile.customer.planIsLifetime ? 'Enabled' : 'Not enabled'}</p></div>
                  </div>
                  {profile.subscription?.stripeCustomerId && <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Stripe customer</p><code className="break-all text-xs text-slate-800">{profile.subscription.stripeCustomerId}</code></div>}
                </TabsContent>

                <TabsContent value="activity" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Total', profile.documents.total],
                      ['Drafts', profile.documents.drafts],
                      ['Completed', profile.documents.completed],
                      ['Archived', profile.documents.archived],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 p-4 text-center"><p className="text-xl font-bold text-slate-950">{Number(value || 0).toLocaleString('en-GB')}</p><p className="text-xs text-slate-500">{label}</p></div>)}
                  </div>
                  <div className="space-y-2"><h3 className="font-semibold text-slate-900">Recent itineraries</h3>{profile.documents.recent.length ? profile.documents.recent.map(document => <div key={document.uuid} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="break-words font-medium text-slate-900">{document.title}</p><p className="text-xs text-slate-500">{formatDateTime(document.updatedAt)}</p></div><Badge variant="outline" className="shrink-0 capitalize">{document.status}</Badge></div>) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><FileText className="mx-auto mb-2 h-6 w-6" />No itineraries have been created.</div>}</div>
                </TabsContent>

                <TabsContent value="manage" className="mt-4 space-y-5">
                  <div className="rounded-xl border border-slate-200 p-4"><Label>Account type</Label><p className="mb-3 mt-1 text-sm text-slate-500">This is authoritative. Organisation permissions are never inferred from a company name.</p><div className="flex flex-col gap-2 sm:flex-row"><Select value={accountTypeDraft} onValueChange={value => setAccountTypeDraft(value as AccountType)}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="individual">Individual</SelectItem><SelectItem value="organisation">Organisation</SelectItem></SelectContent></Select><Button disabled={actionLoading || accountTypeDraft === profile.customer.accountType} onClick={() => void updateCustomer({ action: 'set_account_type', accountType: accountTypeDraft }, `Account changed to ${accountTypeLabel(accountTypeDraft)}.`)}>Save account type</Button></div></div>
                  <div className="rounded-xl border border-slate-200 p-4"><Label>Subscription plan</Label><p className="mb-3 mt-1 text-sm text-slate-500">The plan controls limits. Account type separately controls whether Organisation sharing is available.</p><div className="flex flex-col gap-2 sm:flex-row"><Select value={planDraft} onValueChange={setPlanDraft}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent>{PLAN_OPTIONS.map(plan => <SelectItem key={plan} value={plan}>{PLAN_LABELS[plan]}</SelectItem>)}</SelectContent></Select><Button disabled={actionLoading || planDraft === profile.customer.plan} onClick={() => void updateCustomer({ action: 'change_plan', plan: planDraft }, `Plan changed to ${PLAN_LABELS[planDraft]}.`)}>Save plan</Button></div></div>
                  <div className="grid gap-3 sm:grid-cols-2"><Button variant="outline" disabled={actionLoading || profile.customer.plan === 'free'} onClick={() => void updateCustomer({ action: profile.customer.planIsLifetime ? 'revoke_lifetime' : 'grant_lifetime', plan: profile.customer.plan }, profile.customer.planIsLifetime ? 'Lifetime access revoked.' : 'Lifetime access granted.')}><Crown className="mr-2 h-4 w-4" />{profile.customer.planIsLifetime ? 'Revoke lifetime' : 'Grant lifetime'}</Button><Button variant="outline" disabled={actionLoading} className={profile.customer.accountStatus === 'suspended' ? 'text-emerald-700' : 'text-red-700'} onClick={() => void updateCustomer({ action: profile.customer.accountStatus === 'suspended' ? 'activate' : 'suspend' }, profile.customer.accountStatus === 'suspended' ? 'Account activated.' : 'Account suspended.')}><UserX className="mr-2 h-4 w-4" />{profile.customer.accountStatus === 'suspended' ? 'Activate account' : 'Suspend account'}</Button></div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent><DialogHeader><DialogTitle>Add customer membership</DialogTitle><DialogDescription>Create an explicitly classified Individual or Organisation account.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="new-name">Name</Label><Input id="new-name" value={newName} onChange={event => setNewName(event.target.value)} /></div><div><Label htmlFor="new-email">Email</Label><Input id="new-email" type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} /></div><div><Label htmlFor="new-company">Organisation name</Label><Input id="new-company" value={newCompany} onChange={event => setNewCompany(event.target.value)} placeholder="Optional" /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Account type</Label><Select value={newType} onValueChange={value => setNewType(value as AccountType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="individual">Individual</SelectItem><SelectItem value="organisation">Organisation</SelectItem></SelectContent></Select></div><div><Label>Plan</Label><Select value={newPlan} onValueChange={setNewPlan}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLAN_OPTIONS.map(plan => <SelectItem key={plan} value={plan}>{PLAN_LABELS[plan]}</SelectItem>)}</SelectContent></Select></div></div>{createError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{createError}</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={() => void createCustomer()} disabled={actionLoading}>{actionLoading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Create customer</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  );
}
