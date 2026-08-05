/**
 * Organisation Member Management
 * Supports: Owner, Admin, Manager, Member, Read-Only roles
 * Admins can: invite, remove, suspend/unsuspend, change roles
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users, UserPlus, Trash2, Crown, Shield, User, Building2,
  AlertCircle, CheckCircle2, Loader2, ArrowRight, RefreshCw,
  MoreVertical, UserX, UserCheck, BookOpen, Eye,
} from 'lucide-react';
import { isOrgPlan, ORG_BASE_SEATS, PLAN_LABELS, type PlanId } from '@/lib/plan-config';

type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'read_only';

interface OrgMember {
  id: number;
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: OrgRole;
  suspended: boolean;
  joinedAt: string;
}

interface OrgData {
  id: number;
  uuid: string;
  name: string;
  plan: string;
  maxSeats: number;
  memberCount: number;
}

const ROLE_META: Record<OrgRole, { label: string; icon: React.ElementType; description: string; badgeClass: string }> = {
  owner:     { label: 'Owner',     icon: Crown,    description: 'Full control of the organisation and billing', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400' },
  admin:     { label: 'Admin',     icon: Shield,   description: 'Can manage members, templates, and settings',  badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400' },
  manager:   { label: 'Manager',   icon: Users,    description: 'Can create and edit documents for the team',   badgeClass: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400' },
  member:    { label: 'Member',    icon: User,     description: 'Can create and manage their own documents',    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300' },
  read_only: { label: 'Read Only', icon: Eye,      description: 'Can view documents but cannot create or edit', badgeClass: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400' },
};

function memberName(m: OrgMember): string {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ');
  return m.email;
}

function RoleBadge({ role, suspended }: { role: OrgRole; suspended: boolean }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  if (suspended) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">
        <UserX className="w-3 h-3" aria-hidden="true" /> Suspended
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}>
      <Icon className="w-3 h-3" aria-hidden="true" /> {meta.label}
    </span>
  );
}

export default function OrgMembersPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<OrgData | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Remove confirm dialog
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState(false);

  // Role change dialog
  const [roleTarget, setRoleTarget] = useState<OrgMember | null>(null);
  const [newRole, setNewRole] = useState<OrgRole>('member');
  const [changingRole, setChangingRole] = useState(false);

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate('/sign-in?redirect=/org/members', { replace: true });
    if (!isLoading && user && !isOrgPlan(user.plan as PlanId)) navigate('/dashboard', { replace: true });
  }, [user, isLoading, navigate]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/org/members', { credentials: 'include' });
      const data = await res.json() as {
        success: boolean; error?: string;
        org?: OrgData; members?: OrgMember[];
        isOwnerOrAdmin?: boolean; currentUserId?: number;
      };
      if (!data.success) { setError(data.error ?? 'Failed to load organisation.'); return; }
      setOrg(data.org ?? null);
      setMembers(data.members ?? []);
      setIsOwnerOrAdmin(data.isOwnerOrAdmin ?? false);
      setCurrentUserId(data.currentUserId ?? null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  function showMsg(type: 'success' | 'error', text: string) {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) { setInviteError('Please enter an email address.'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json() as { success: boolean; error?: string; message?: string };
      if (!data.success) { setInviteError(data.error ?? 'Failed to add member.'); return; }
      setInviteSuccess(data.message ?? 'Member added successfully.');
      setInviteEmail('');
      setInviteRole('member');
      void loadMembers();
    } catch {
      setInviteError('Network error. Please try again.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/org/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId: removeTarget.id }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) showMsg('error', data.error ?? 'Failed to remove member.');
      else { showMsg('success', `${memberName(removeTarget)} has been removed.`); void loadMembers(); }
    } catch {
      showMsg('error', 'Network error. Please try again.');
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  async function handleMemberAction(member: OrgMember, action: 'suspend' | 'unsuspend') {
    try {
      const res = await fetch('/api/org/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId: member.id, action }),
      });
      const data = await res.json() as { success: boolean; error?: string; message?: string };
      if (!data.success) showMsg('error', data.error ?? 'Action failed.');
      else { showMsg('success', data.message ?? 'Done.'); void loadMembers(); }
    } catch {
      showMsg('error', 'Network error. Please try again.');
    }
  }

  async function handleRoleChange() {
    if (!roleTarget) return;
    setChangingRole(true);
    try {
      const res = await fetch('/api/org/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId: roleTarget.id, action: 'change_role', role: newRole }),
      });
      const data = await res.json() as { success: boolean; error?: string; message?: string };
      if (!data.success) showMsg('error', data.error ?? 'Failed to change role.');
      else { showMsg('success', `${memberName(roleTarget)}'s role updated to ${ROLE_META[newRole].label}.`); void loadMembers(); }
    } catch {
      showMsg('error', 'Network error. Please try again.');
    } finally {
      setChangingRole(false);
      setRoleTarget(null);
    }
  }

  const plan = user?.plan as PlanId | undefined;
  const seatLimit = org?.maxSeats ?? (plan ? ORG_BASE_SEATS[plan] : 2);
  const seatsUsed = members.length;
  const seatsLeft = seatLimit - seatsUsed;

  // Roles that can be assigned when inviting (not owner)
  const assignableRoles: OrgRole[] = ['admin', 'manager', 'member', 'read_only'];

  return (
    <>
      <Helmet>
        <title>Organisation Members — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary" aria-hidden="true" />
                Organisation Members
              </h1>
              {org && (
                <p className="text-sm text-muted-foreground mt-1">
                  {org.name} · <span className="font-medium">{PLAN_LABELS[org.plan as PlanId] ?? org.plan}</span>
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadMembers()} className="gap-1.5 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
            </Button>
          </div>

          {/* Action feedback */}
          {actionMsg && (
            <div role="alert" className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm border ${
              actionMsg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}>
              {actionMsg.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                : <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              }
              {actionMsg.text}
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20" aria-label="Loading members">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : (
            <>
              {/* Seat usage */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {seatsUsed} / {seatLimit} seats used
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {seatsLeft > 0
                            ? `${seatsLeft} seat${seatsLeft !== 1 ? 's' : ''} available`
                            : 'All seats filled — upgrade to add more members'
                          }
                        </p>
                      </div>
                    </div>
                    {seatsLeft === 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
                        <Link to="/pricing">
                          Upgrade plan <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Role guide */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                    Role Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.entries(ROLE_META) as [OrgRole, typeof ROLE_META[OrgRole]][]).map(([role, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <div key={role} className="flex items-start gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border shrink-0 mt-0.5 ${meta.badgeClass}`}>
                            <Icon className="w-3 h-3" aria-hidden="true" /> {meta.label}
                          </span>
                          <span className="text-muted-foreground">{meta.description}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Invite form */}
              {isOwnerOrAdmin && seatsLeft > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-primary" aria-hidden="true" />
                      Add a Member
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <form onSubmit={handleInvite} className="space-y-4" aria-label="Invite member form">
                      {inviteError && (
                        <div role="alert" className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-3 py-2 text-sm">
                          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {inviteError}
                        </div>
                      )}
                      {inviteSuccess && (
                        <div role="status" className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400 rounded-lg px-3 py-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {inviteSuccess}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label htmlFor="invite-email">Email address</Label>
                          <Input
                            id="invite-email"
                            type="email"
                            placeholder="colleague@example.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            required
                            autoComplete="email"
                            aria-describedby="invite-email-hint"
                          />
                          <p id="invite-email-hint" className="text-xs text-muted-foreground">
                            They must already have a Sousa Murray Planeia account.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="invite-role">Role</Label>
                          <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                            <SelectTrigger id="invite-role" aria-label="Select role for new member">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map(r => (
                                <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button type="submit" disabled={inviting} className="gap-2">
                        {inviting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
                        {inviting ? 'Adding…' : 'Add Member'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {/* Members list */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" aria-hidden="true" />
                    Members ({members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No members yet.</p>
                  ) : (
                    <ul className="divide-y divide-border" role="list" aria-label="Organisation members">
                      {members.map(member => {
                        const isCurrentUser = member.userId === currentUserId;
                        const canManage = isOwnerOrAdmin && !isCurrentUser && member.role !== 'owner';
                        return (
                          <li key={member.id} className={`flex items-center gap-3 px-4 py-3 ${member.suspended ? 'opacity-60' : ''}`}>
                            {/* Avatar */}
                            <div
                              className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary"
                              aria-hidden="true"
                            >
                              {memberName(member).charAt(0).toUpperCase()}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {memberName(member)}
                                  {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                                </span>
                                <RoleBadge role={member.role} suspended={member.suspended} />
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                            </div>

                            {/* Actions */}
                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 shrink-0"
                                    aria-label={`Actions for ${memberName(member)}`}
                                  >
                                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    onClick={() => { setRoleTarget(member); setNewRole(member.role); }}
                                  >
                                    <Shield className="w-4 h-4 mr-2" aria-hidden="true" />
                                    Change Role
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {member.suspended ? (
                                    <DropdownMenuItem onClick={() => handleMemberAction(member, 'unsuspend')}>
                                      <UserCheck className="w-4 h-4 mr-2" aria-hidden="true" />
                                      Unsuspend
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => handleMemberAction(member, 'suspend')}>
                                      <UserX className="w-4 h-4 mr-2" aria-hidden="true" />
                                      Suspend Access
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setRemoveTarget(member)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                                    Remove from Org
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DashboardLayout>

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{removeTarget ? memberName(removeTarget) : ''}</strong> from your organisation?
              They will lose access to all shared resources immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing} className="gap-2">
              {removing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
              {removing ? 'Removing…' : 'Remove Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change dialog */}
      <Dialog open={!!roleTarget} onOpenChange={open => { if (!open) setRoleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for <strong>{roleTarget ? memberName(roleTarget) : ''}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="new-role-select">New Role</Label>
            <Select value={newRole} onValueChange={v => setNewRole(v as OrgRole)}>
              <SelectTrigger id="new-role-select" aria-label="Select new role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map(r => (
                  <SelectItem key={r} value={r}>
                    <div>
                      <div className="font-medium">{ROLE_META[r].label}</div>
                      <div className="text-xs text-muted-foreground">{ROLE_META[r].description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRoleTarget(null)} disabled={changingRole}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} disabled={changingRole || newRole === roleTarget?.role} className="gap-2">
              {changingRole ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Shield className="w-4 h-4" aria-hidden="true" />}
              {changingRole ? 'Saving…' : 'Save Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
