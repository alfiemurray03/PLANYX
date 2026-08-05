/**
 * POST /api/org/members
 * Invite a user to the organisation by email.
 * The invited user must already have a Sousa Murray Planeia account.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { ja_sessions, ja_users, ja_organisations, ja_org_members } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const token = req.cookies?.session_token as string | undefined;
    if (!token) return res.status(401).json({ success: false, error: 'Please sign in to continue.', code: 'NOT_AUTHENTICATED' });

    const [session] = await db.select().from(ja_sessions).where(eq(ja_sessions.token, token)).limit(1);
    if (!session || session.expiresAt < new Date()) return res.status(401).json({ success: false, error: 'Session expired.' });

    const [user] = await db.select().from(ja_users).where(eq(ja_users.id, session.userId)).limit(1);
    if (!user) return res.status(401).json({ success: false, error: 'User not found.' });
    if (user.usageType !== 'business') {
      return res.status(403).json({ success: false, error: 'An explicitly selected Organisation account is required.' });
    }
    if (!['org_starter', 'org_growth', 'org_professional'].includes(user.plan)) {
      return res.status(403).json({ success: false, error: 'The Together Plan is required to invite organisation members.' });
    }

    const { email, role = 'member' } = req.body as { email?: string; role?: string };
    if (!email || typeof email !== 'string') return res.status(400).json({ success: false, error: 'Email is required.' });
    const validRoles = ['admin', 'manager', 'member', 'read_only'];
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role. Must be admin, manager, member, or read_only.' });

    const [myMembership] = await db.select().from(ja_org_members).where(eq(ja_org_members.userId, user.id)).limit(1);
    if (!myMembership || (myMembership.role !== 'owner' && myMembership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Only organisation owners and admins can invite members.' });
    }

    const [org] = await db.select().from(ja_organisations).where(eq(ja_organisations.id, myMembership.orgId)).limit(1);
    if (!org) return res.status(404).json({ success: false, error: 'Organisation not found.' });
    const currentMembers = await db.select().from(ja_org_members).where(eq(ja_org_members.orgId, org.id));
    if (currentMembers.length >= org.maxSeats) return res.status(400).json({ success: false, error: `Seat limit reached (${org.maxSeats} seats). Upgrade your plan to add more members.` });

    const [invitedUser] = await db.select().from(ja_users).where(eq(ja_users.email, email.toLowerCase().trim())).limit(1);
    if (!invitedUser) return res.status(404).json({ success: false, error: 'No account found with that email address. They must register first.' });
    if (invitedUser.id === user.id) return res.status(400).json({ success: false, error: 'You cannot invite yourself.' });

    const [existing] = await db.select().from(ja_org_members).where(and(eq(ja_org_members.orgId, org.id), eq(ja_org_members.userId, invitedUser.id))).limit(1);
    if (existing) return res.status(400).json({ success: false, error: 'This user is already a member of your organisation.' });

    await db.insert(ja_org_members).values({ orgId: org.id, userId: invitedUser.id, role: role as 'admin' | 'manager' | 'member' | 'read_only', invitedBy: user.id });
    return res.status(201).json({
      success: true,
      message: `${invitedUser.firstName ?? invitedUser.email} has been added to your organisation.`,
      member: { userId: invitedUser.id, email: invitedUser.email, firstName: invitedUser.firstName, lastName: invitedUser.lastName, role },
    });
  } catch (err) {
    console.error('POST /api/org/members error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
}
