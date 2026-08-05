/**
 * GET /api/signing/requests/:id/pack
 * Download the final document pack as a ZIP:
 *   - Original signed document
 *   - Attachments flagged appendToFinalPack=true
 *   - Audit certificate (HTML)
 * Uses Node's built-in zlib + streams — no native addons.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { ja_signing_requests, ja_signing_signers, ja_signing_audit, ja_signing_attachments, ja_users, ja_site_settings } from '../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { resolveSession } from '../../../../auth/_session.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Minimal ZIP builder (no native addons, pure Node.js)
// Implements ZIP local file headers + central directory + end-of-central-directory.
function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(0, 8);             // compression (stored)
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    local.writeUInt32LE(crc, 14);          // crc32
    local.writeUInt32LE(size, 18);         // compressed size
    local.writeUInt32LE(size, 22);         // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // filename length
    local.writeUInt16LE(0, 28);            // extra field length
    nameBytes.copy(local, 30);

    localHeaders.push(local);
    localHeaders.push(file.data);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(0, 10);           // compression
    central.writeUInt16LE(0, 12);           // mod time
    central.writeUInt16LE(0, 14);           // mod date
    central.writeUInt32LE(crc, 16);         // crc32
    central.writeUInt32LE(size, 20);        // compressed size
    central.writeUInt32LE(size, 24);        // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28); // filename length
    central.writeUInt16LE(0, 30);           // extra field length
    central.writeUInt16LE(0, 32);           // comment length
    central.writeUInt16LE(0, 34);           // disk start
    central.writeUInt16LE(0, 36);           // internal attr
    central.writeUInt32LE(0, 38);           // external attr
    central.writeUInt32LE(offset, 42);      // local header offset
    nameBytes.copy(central, 46);

    centralDirs.push(central);
    offset += local.length + size;
  }

  const centralDirBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // signature
  eocd.writeUInt16LE(0, 4);                // disk number
  eocd.writeUInt16LE(0, 6);                // disk with central dir
  eocd.writeUInt16LE(files.length, 8);     // entries on disk
  eocd.writeUInt16LE(files.length, 10);    // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // central dir size
  eocd.writeUInt32LE(offset, 16);          // central dir offset
  eocd.writeUInt16LE(0, 20);              // comment length

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

function crc32(buf: Buffer): number {
  const table = makeCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function makeCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}

function buildAuditCertificateHtml(
  request: { uuid: string; title: string; status: string; createdAt: Date; completedAt: Date | null; documentHash: string | null },
  owner: { firstName: string; lastName: string; email: string } | undefined,
  signers: Array<{ name: string; email: string; role: string | null; status: string; signedAt: Date | null; ipAddress: string | null }>,
  audit: Array<{ createdAt: Date; event: string; signerEmail: string | null; userId: number | null; adminId: number | null; ipAddress: string | null; detail: string | null }>,
  siteName = 'Sousa Murray Planeia',
): string {
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : 'Unknown';
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'long', timeStyle: 'long' });

  const signerRows = signers.map(s => `
    <tr>
      <td>${s.name}</td><td>${s.email}</td><td>${s.role ?? '—'}</td>
      <td>${s.status}</td>
      <td>${s.signedAt ? new Date(s.signedAt).toLocaleString('en-GB') : '—'}</td>
      <td>${s.ipAddress ?? '—'}</td>
    </tr>`).join('');

  const auditRows = audit.map(a => `
    <tr>
      <td>${new Date(a.createdAt).toLocaleString('en-GB')}</td>
      <td><code>${a.event}</code></td>
      <td>${a.signerEmail ?? (a.userId ? 'Owner' : a.adminId ? 'Admin' : '—')}</td>
      <td>${a.ipAddress ?? '—'}</td>
      <td>${a.detail ?? '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Audit Certificate — ${request.title}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:40px}
  h1{font-size:20px;color:#1B4F8A;border-bottom:2px solid #1B4F8A;padding-bottom:8px}
  h2{font-size:14px;color:#1B4F8A;margin-top:24px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1B4F8A;color:#fff;padding:6px 10px;text-align:left;font-size:11px}
  td{padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:11px}
  tr:nth-child(even) td{background:#f9fafb}
  .meta{background:#f0f4ff;border:1px solid #c7d7f5;border-radius:6px;padding:14px;margin:16px 0}
  .meta p{margin:4px 0;font-size:12px}
  .hash{font-family:monospace;font-size:10px;word-break:break-all;background:#f3f4f6;padding:4px 8px;border-radius:4px}
  .footer{margin-top:40px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:10px;color:#6b7280}
</style></head><body>
<h1>Audit Certificate — Document Signing</h1>
<div class="meta">
  <p><strong>Document:</strong> ${request.title}</p>
  <p><strong>Request ID:</strong> ${request.uuid}</p>
  <p><strong>Owner:</strong> ${ownerName} (${owner?.email ?? ''})</p>
  <p><strong>Status:</strong> ${request.status.toUpperCase()}</p>
  <p><strong>Created:</strong> ${new Date(request.createdAt).toLocaleString('en-GB')}</p>
  ${request.completedAt ? `<p><strong>Completed:</strong> ${new Date(request.completedAt).toLocaleString('en-GB')}</p>` : ''}
  ${request.documentHash ? `<p><strong>Document SHA-256:</strong> <span class="hash">${request.documentHash}</span></p>` : ''}
  <p><strong>Certificate generated:</strong> ${now}</p>
</div>
<h2>Signers</h2>
<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Signed At</th><th>IP Address</th></tr></thead>
<tbody>${signerRows}</tbody></table>
<h2>Audit Trail</h2>
<table><thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>IP Address</th><th>Detail</th></tr></thead>
<tbody>${auditRows}</tbody></table>
<div class="footer">
  <p>This certificate was generated by ${siteName} on ${now}.</p>
  <p>The document hash above can be used to verify the integrity of the original document.</p>
</div></body></html>`;
}

export default async function handler(req: Request, res: Response) {
  const userId = await resolveSession(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Please sign in to continue.', code: 'NOT_AUTHENTICATED' });

  const { id } = req.params;
  const [request] = await db
    .select()
    .from(ja_signing_requests)
    .where(and(eq(ja_signing_requests.uuid, id), eq(ja_signing_requests.userId, userId as number)))
    .limit(1);

  if (!request) return res.status(404).json({ success: false, error: 'Signing request not found.' });

  const [signers, audit, attachments, ownerRows, siteNameRow] = await Promise.all([
    db.select().from(ja_signing_signers).where(eq(ja_signing_signers.requestId, request.id)).orderBy(asc(ja_signing_signers.order)),
    db.select().from(ja_signing_audit).where(eq(ja_signing_audit.requestId, request.id)).orderBy(asc(ja_signing_audit.createdAt)),
    db.select().from(ja_signing_attachments).where(eq(ja_signing_attachments.requestId, request.id)),
    db.select({ firstName: ja_users.firstName, lastName: ja_users.lastName, email: ja_users.email }).from(ja_users).where(eq(ja_users.id, userId as number)).limit(1),
    db.select({ value: ja_site_settings.value }).from(ja_site_settings).where(eq(ja_site_settings.settingKey, 'site_name')).limit(1),
  ]);

  const siteName = siteNameRow[0]?.value ?? 'Sousa Murray Planeia';

  const owner = ownerRows[0];
  const packFiles: Array<{ name: string; data: Buffer }> = [];

  // 1. Original document
  if (request.documentPath) {
    try {
      const docBuf = await fs.readFile(`/shared-storage/public/assets/${request.documentPath}`);
      const ext = path.extname(request.documentName ?? 'document');
      packFiles.push({ name: `document${ext || '.pdf'}`, data: docBuf });
    } catch { /* file missing — skip */ }
  }

  // 2. Attachments flagged for final pack
  for (const att of attachments.filter(a => a.appendToFinalPack)) {
    try {
      const buf = await fs.readFile(`/shared-storage/public/assets/${att.filePath}`);
      packFiles.push({ name: `attachments/${att.originalName}`, data: buf });
    } catch { /* skip missing */ }
  }

  // 3. Audit certificate
  const certHtml = buildAuditCertificateHtml(request, owner, signers, audit, siteName);
  packFiles.push({ name: 'audit-certificate.html', data: Buffer.from(certHtml, 'utf8') });

  // 4. Pack manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    requestId: request.uuid,
    title: request.title,
    status: request.status,
    files: packFiles.map(f => f.name),
    documentHash: request.documentHash,
    packHash: crypto.createHash('sha256').update(packFiles.map(f => f.data).reduce((a, b) => Buffer.concat([a, b]))).digest('hex'),
  };
  packFiles.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });

  const zip = buildZip(packFiles);
  const safeTitle = (request.title ?? 'document').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="signing-pack-${safeTitle}-${request.uuid.slice(0, 8)}.zip"`);
  res.setHeader('Content-Length', zip.length);
  return res.send(zip);
}
