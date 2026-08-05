/**
 * GET /api/user/sar/:uuid/download?token=<download_token>
 * Secure, time-limited download of a SAR export package.
 *
 * Security:
 * - Customer must be authenticated and own the request
 * - Download token must match and not be expired
 * - Every download is audit-logged
 * - Max 10 downloads per request (abuse prevention)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { ja_sar_requests } from '../../../../../db/schema.js';
import { resolveSession } from '../../../../auth/_session.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const MAX_DOWNLOADS = 10;

export default async function handler(req: Request, res: Response) {
  const userId = await resolveSession(req);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Please sign in to continue.', code: 'NOT_AUTHENTICATED' });
  }

  const { uuid } = req.params;
  const { token } = req.query as { token?: string };

  if (!token) {
    return res.status(400).json({ success: false, error: 'Download token is required.' });
  }

  try {
    const rows = await db
      .select()
      .from(ja_sar_requests)
      .where(and(eq(ja_sar_requests.uuid, uuid), eq(ja_sar_requests.userId, userId)))
      .limit(1);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    const sar = rows[0];

    // Verify status
    if (sar.status !== 'ready' && sar.status !== 'completed') {
      return res.status(403).json({ success: false, error: 'Your data export is not yet ready for download.' });
    }

    // Verify token
    if (!sar.downloadToken || sar.downloadToken !== token) {
      return res.status(403).json({ success: false, error: 'Invalid or expired download link.' });
    }

    // Check token expiry
    if (!sar.downloadTokenExpiresAt || new Date(sar.downloadTokenExpiresAt) < new Date()) {
      return res.status(403).json({ success: false, error: 'This download link has expired. Please contact support to request a new one.' });
    }

    // Check download count
    if (sar.downloadCount >= MAX_DOWNLOADS) {
      return res.status(403).json({ success: false, error: 'Maximum download limit reached for this export. Please contact support.' });
    }

    // Verify export file exists
    if (!sar.exportPath) {
      return res.status(404).json({ success: false, error: 'Export file not found. Please contact support.' });
    }

    const filePath = sar.exportPath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Export file not found on server. Please contact support.' });
    }

    // Update download count and last download time
    await db.update(ja_sar_requests)
      .set({
        downloadCount: (sar.downloadCount ?? 0) + 1,
        lastDownloadAt: new Date(),
        // Mark as completed after first download
        status: sar.status === 'ready' ? 'completed' : sar.status,
        updatedAt: new Date(),
      })
      .where(eq(ja_sar_requests.id, sar.id));

    // Log the download
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    console.info('sar.download', { sarId: sar.id, uuid, userId, ip, downloadCount: (sar.downloadCount ?? 0) + 1 });

    // Stream the file
    const filename = `Sousa Murray Planeia-Data-Export-${sar.uuid.slice(0, 8).toUpperCase()}.zip`;
    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('user.sar.download.error', err);
    return res.status(500).json({ success: false, error: 'Download failed. Please try again.' });
  }
}
