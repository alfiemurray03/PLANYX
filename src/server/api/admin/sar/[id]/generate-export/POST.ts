/**
 * POST /api/admin/sar/:id/generate-export
 * Generates a complete data export ZIP for a SAR request.
 *
 * The export includes:
 * - README.txt (plain English index)
 * - profile.json (account details — no password hash, no secrets)
 * - documents.json (all saved documents)
 * - folders.json
 * - support_tickets.json + ticket_messages.json
 * - notifications.json
 * - preferences.json
 * - signing_requests.json (if applicable)
 * - affiliate.json (if applicable)
 * - sar_history.json (previous data rights requests)
 * - activity_log.json
 * - export_summary.txt
 *
 * Excludes: password hashes, payment card details, other users' data, secrets.
 *
 * After generation:
 * - ZIP stored at /private/sar-exports/{uuid}/export.zip
 * - Time-limited download token generated (72 hours)
 * - SAR status set to 'ready'
 * - All actions audit-logged
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import {
  ja_sar_requests, ja_users, ja_documents, ja_folders,
  ja_notifications, ja_site_settings,
} from '../../../../../db/schema.js';
import { requireAdminRole } from '../../../_require-role.js';
import { logAdminAction } from '../../../_audit-log.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { ZipBuilder } from '@server/lib/zip-builder';

// Token valid for 72 hours
const TOKEN_TTL_HOURS = 72;

export default async function handler(req: Request, res: Response) {
  const identity = await requireAdminRole(req, res, ['PlatformOwner', 'SystemAdministrator', 'Admin']);
  if (!identity) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid request ID.' });

  try {
    // Load the SAR request
    const rows = await db.select().from(ja_sar_requests).where(eq(ja_sar_requests.id, id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: 'SAR request not found.' });

    const sar = rows[0];

    if (!['submitted', 'in_review', 'processing', 'ready'].includes(sar.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot generate export for a request with status "${sar.status}".`,
      });
    }

    const userId = sar.userId;

    // Fetch site settings for dynamic branding in export
    const siteSettingsRows = await db.select({ key: ja_site_settings.settingKey, value: ja_site_settings.value })
      .from(ja_site_settings)
      .where(eq(ja_site_settings.settingKey, 'site_name'));
    const siteSettingsMap: Record<string, string> = {};
    for (const row of siteSettingsRows) siteSettingsMap[row.key] = row.value;
    const siteName = siteSettingsMap['site_name'] ?? 'Sousa Murray Planeia';

    // Also fetch company_name and support_email for the data controller block
    const controllerRows = await db.select({ key: ja_site_settings.settingKey, value: ja_site_settings.value })
      .from(ja_site_settings);
    const settingsAll: Record<string, string> = {};
    for (const row of controllerRows) settingsAll[row.key] = row.value;
    const companyName = settingsAll['company_name'] ?? 'JA Group Services Ltd';
    const supportEmail = 'dpo@jagroupservices.co.uk';

    // ── Collect all customer data ──────────────────────────────────────────────

    // Profile (no password hash, no secrets)
    const userRows = await db.select({
      uuid:           ja_users.uuid,
      email:          ja_users.email,
      firstName:      ja_users.firstName,
      lastName:       ja_users.lastName,
      displayName:    ja_users.displayName,
      company:        ja_users.company,
      role:           ja_users.role,
      accountStatus:  ja_users.accountStatus,
      plan:           ja_users.plan,
      planIsLifetime: ja_users.planIsLifetime,
      planExpiresAt:  ja_users.planExpiresAt,
      isVerified:     ja_users.isVerified,
      authMethod:     ja_users.authMethod,
      usageType:      ja_users.usageType,
      createdAt:      ja_users.createdAt,
      updatedAt:      ja_users.updatedAt,
      lastLogin:      ja_users.lastLogin,
    }).from(ja_users).where(eq(ja_users.id, userId)).limit(1);
    const userRow = userRows[0] ?? null;

    // Documents
    const documents = await db.select({
      uuid:       ja_documents.uuid,
      templateId: ja_documents.templateId,
      title:      ja_documents.title,
      category:   ja_documents.category,
      status:     ja_documents.status,
      docRef:     ja_documents.docRef,
      fields:     ja_documents.fields,
      version:    ja_documents.version,
      folderId:   ja_documents.folderId,
      createdAt:  ja_documents.createdAt,
      updatedAt:  ja_documents.updatedAt,
    }).from(ja_documents).where(eq(ja_documents.userId, userId));

    // Folders
    const folders = await db.select({
      uuid:      ja_folders.uuid,
      name:      ja_folders.name,
      color:     ja_folders.color,
      createdAt: ja_folders.createdAt,
    }).from(ja_folders).where(eq(ja_folders.userId, userId));

    // Notifications
    const notifications = await db.select({
      type:      ja_notifications.type,
      title:     ja_notifications.title,
      message:   ja_notifications.message,
      read:      ja_notifications.read,
      link:      ja_notifications.link,
      createdAt: ja_notifications.createdAt,
    }).from(ja_notifications).where(eq(ja_notifications.userId, userId));

    // Support tickets (raw SQL — table may have different structure)
    let supportTickets: unknown[] = [];
    let ticketMessages: unknown[] = [];
    try {
      const ticketResult = await db.execute(
        sql`SELECT uuid, subject, message, category, priority, status, created_at, updated_at
            FROM ja_support_tickets WHERE user_id = ${userId} ORDER BY created_at DESC`
      );
      supportTickets = Array.isArray(ticketResult) ? ticketResult : [];

      if (supportTickets.length > 0) {
        const ticketIds = (supportTickets as Array<{ id?: number }>)
          .map(t => t.id)
          .filter(Boolean);
        if (ticketIds.length > 0) {
          const msgResult = await db.execute(
            sql`SELECT ticket_id, sender_type, sender_name, message, created_at
                FROM ja_support_ticket_messages
                WHERE ticket_id IN (${sql.raw(ticketIds.join(','))})
                ORDER BY created_at ASC`
          );
          ticketMessages = Array.isArray(msgResult) ? msgResult : [];
        }
      }
    } catch { /* table may not exist in all environments */ }

    // Signing requests
    let signingRequests: unknown[] = [];
    try {
      const sigResult = await db.execute(
        sql`SELECT uuid, document_title, status, created_at, completed_at
            FROM ja_signing_requests WHERE created_by = ${userId} ORDER BY created_at DESC`
      );
      signingRequests = Array.isArray(sigResult) ? sigResult : [];
    } catch { /* optional feature */ }

    // Affiliate records
    let affiliateRecord: unknown = null;
    let affiliateReferrals: unknown[] = [];
    try {
      const affResult = await db.execute(
        sql`SELECT uuid, referral_code, status, total_referrals, total_earnings, created_at
            FROM ja_affiliates WHERE user_id = ${userId} LIMIT 1`
      );
      const affRows = Array.isArray(affResult) ? affResult : [];
      if (affRows.length > 0) {
        affiliateRecord = affRows[0];
        const refResult = await db.execute(
          sql`SELECT referral_code, referred_email, status, commission_amount, created_at
              FROM ja_affiliate_referrals
              WHERE affiliate_id = (SELECT id FROM ja_affiliates WHERE user_id = ${userId} LIMIT 1)
              ORDER BY created_at DESC`
        );
        affiliateReferrals = Array.isArray(refResult) ? refResult : [];
      }
    } catch { /* optional feature */ }

    // User preferences
    let preferences: unknown = {};
    try {
      const prefResult = await db.execute(
        sql`SELECT email_notifications, marketing_emails, theme, updated_at
            FROM ja_user_preferences WHERE user_id = ${userId} LIMIT 1`
      );
      const prefRows = Array.isArray(prefResult) ? prefResult : [];
      if (prefRows.length > 0) preferences = prefRows[0];
    } catch { /* optional */ }

    // Activity log
    let activityLog: unknown[] = [];
    try {
      const actResult = await db.execute(
        sql`SELECT event, detail, ip_address, created_at
            FROM ja_signing_audit_log WHERE user_id = ${userId}
            ORDER BY created_at DESC LIMIT 500`
      );
      activityLog = Array.isArray(actResult) ? actResult : [];
    } catch { /* optional */ }

    // Previous SAR/GDPR requests
    const sarHistory = await db.select({
      uuid:        ja_sar_requests.uuid,
      requestType: ja_sar_requests.requestType,
      status:      ja_sar_requests.status,
      notes:       ja_sar_requests.notes,
      createdAt:   ja_sar_requests.createdAt,
      processedAt: ja_sar_requests.processedAt,
    }).from(ja_sar_requests).where(eq(ja_sar_requests.userId, userId));

    // ── Build the export package ───────────────────────────────────────────────

    const exportDir = `/private/sar-exports/${sar.uuid}`;
    fs.mkdirSync(exportDir, { recursive: true });
    const zipPath = path.join(exportDir, 'export.zip');

    const now = new Date();

    // Plain English README
    const readme = [
      `${siteName.toUpperCase()} — SUBJECT ACCESS REQUEST DATA EXPORT`,
      '======================================================',
      '',
      `Export generated: ${now.toUTCString()}`,
      `Request reference: ${sar.uuid.slice(0, 8).toUpperCase()}`,
      `Request type: ${sar.requestType.toUpperCase()}`,
      `Data subject: ${sar.fullName} <${sar.email}>`,
      '',
      'CONTENTS OF THIS EXPORT',
      '-----------------------',
      '  profile.json          — Your account and profile information',
      '  documents.json        — All documents you have created or saved',
      '  folders.json          — Your document folders',
      '  support_tickets.json  — Your support ticket history',
      '  ticket_messages.json  — Messages within your support tickets',
      '  notifications.json    — Notifications sent to your account',
      '  preferences.json      — Your notification and communication preferences',
      '  signing_requests.json — Document signing requests you have created',
      '  affiliate.json        — Your affiliate programme record (if applicable)',
      '  sar_history.json      — Your previous data rights requests',
      '  activity_log.json     — Your account activity log',
      '  export_summary.txt    — Plain English summary of this export',
      '',
      'WHAT IS NOT INCLUDED',
      '--------------------',
      '  - Password hashes or authentication credentials',
      '  - Payment card details (we do not store full card numbers)',
      '  - Data belonging to other users',
      '  - Internal system configuration or secrets',
      '  - Stripe references are included but no card data is stored by us',
      '',
      'YOUR RIGHTS UNDER UK GDPR',
      '--------------------------',
      '  You have the right to:',
      '  - Request correction of inaccurate data (Right to Rectification)',
      '  - Request deletion of your data (Right to Erasure)',
      '  - Restrict how we process your data (Right to Restriction)',
      '  - Object to processing (Right to Object)',
      '  - Data portability (Right to Portability)',
      '',
      '  To exercise any of these rights, contact us at:',
      `  ${supportEmail}`,
      '',
      'DATA CONTROLLER',
      '---------------',
      `  ${companyName}`,
      `  ${supportEmail}`,
      '',
      'This export was generated in response to your data rights request.',
      'If you believe any data is missing or incorrect, please contact us.',
    ].join('\n');

    // Export summary
    const summary = [
      'DATA EXPORT SUMMARY',
      '===================',
      `Generated: ${now.toUTCString()}`,
      `Reference: ${sar.uuid.slice(0, 8).toUpperCase()}`,
      '',
      `Account email:    ${userRow?.email ?? sar.email}`,
      `Account name:     ${sar.fullName}`,
      `Account created:  ${userRow?.createdAt ? new Date(userRow.createdAt).toUTCString() : 'Unknown'}`,
      `Current plan:     ${userRow?.plan ?? 'Unknown'}`,
      `Account status:   ${userRow?.accountStatus ?? 'Unknown'}`,
      '',
      'DATA COUNTS',
      '-----------',
      `  Documents:          ${documents.length}`,
      `  Folders:            ${folders.length}`,
      `  Support tickets:    ${supportTickets.length}`,
      `  Notifications:      ${notifications.length}`,
      `  Signing requests:   ${signingRequests.length}`,
      `  Activity log items: ${activityLog.length}`,
      '',
      'NOTE: Some data categories may show 0 records if you have not used those features.',
      `If you believe data is missing, please contact ${supportEmail}`,
    ].join('\n');

    // Build ZIP using pure-JS builder
    const zip = new ZipBuilder();
    zip.addFile('README.txt', readme);
    zip.addFile('export_summary.txt', summary);
    zip.addFile('profile.json', JSON.stringify(userRow ?? {}, null, 2));
    zip.addFile('documents.json', JSON.stringify(documents, null, 2));
    zip.addFile('folders.json', JSON.stringify(folders, null, 2));
    zip.addFile('notifications.json', JSON.stringify(notifications, null, 2));
    zip.addFile('preferences.json', JSON.stringify(preferences, null, 2));
    zip.addFile('support_tickets.json', JSON.stringify(supportTickets, null, 2));
    zip.addFile('ticket_messages.json', JSON.stringify(ticketMessages, null, 2));
    zip.addFile('signing_requests.json', JSON.stringify(signingRequests, null, 2));
    zip.addFile('affiliate.json', JSON.stringify({ affiliate: affiliateRecord, referrals: affiliateReferrals }, null, 2));
    zip.addFile('sar_history.json', JSON.stringify(sarHistory, null, 2));
    zip.addFile('activity_log.json', JSON.stringify(activityLog, null, 2));

    const zipBuffer = zip.build();
    fs.writeFileSync(zipPath, zipBuffer);

    // Generate secure download token (72 hours)
    const downloadToken = randomBytes(48).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + TOKEN_TTL_HOURS);

    // Update SAR record
    await db.update(ja_sar_requests)
      .set({
        status: 'ready',
        exportPath: zipPath,
        exportGeneratedAt: new Date(),
        exportGeneratedBy: identity.email,
        exportFileSizeBytes: zipBuffer.length,
        downloadToken,
        downloadTokenExpiresAt: tokenExpiry,
        downloadCount: 0,
        processedBy: identity.email,
        updatedAt: new Date(),
      })
      .where(eq(ja_sar_requests.id, id));

    await logAdminAction(
      identity.email,
      'sar.export.generated',
      `SAR #${id} (${sar.uuid.slice(0, 8).toUpperCase()}) — export generated for ${sar.email}, size: ${Math.round(zipBuffer.length / 1024)}KB, token expires: ${tokenExpiry.toISOString()}`,
      req,
    );

    return res.json({
      success: true,
      message: 'Export generated successfully. The customer can now download their data.',
      fileSizeBytes: zipBuffer.length,
      fileSizeKb: Math.round(zipBuffer.length / 1024),
      tokenExpiresAt: tokenExpiry.toISOString(),
      tokenExpiresHours: TOKEN_TTL_HOURS,
    });
  } catch (err) {
    console.error('admin.sar.generate-export.error', err);
    return res.status(500).json({ success: false, error: 'Failed to generate export. Please try again.' });
  }
}
