import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Admin Support manuals have a dedicated Admin Centre route', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /const AdminManualsPage = lazy\(\(\) => import\('\.\/pages\/admin\/manuals'\)\)/);
  assert.match(app, /path: '\/admin\/manuals'/);
  assert.match(app, /<AdminManualsPage\s*\/>/);
  assert.match(app, /<AdminSupportLauncher\s*\/>/);
});

test('Admin Support page contains three separate PDF manuals', async () => {
  const page = await read('src/pages/admin/manuals.tsx');
  assert.match(page, /id: 'admin-centre'/);
  assert.match(page, /id: 'customer-portal'/);
  assert.match(page, /id: 'public-website'/);
  assert.match(page, /Admin Centre Manual/);
  assert.match(page, /Customer Portal Manual/);
  assert.match(page, /Public Website Manual/);
  assert.match(page, /createAdminManualPdf/);
  assert.match(page, /Open or download the current manuals/);
});

test('PDF generator creates branded multi-page PDF documents', async () => {
  const generator = await read('src/lib/admin-manual-pdf.ts');
  assert.match(generator, /import \{ jsPDF \} from 'jspdf'/);
  assert.match(generator, /pdf\.addPage\(\)/);
  assert.match(generator, /pdf\.output\('blob'\)/);
  assert.match(generator, /Version 1\.0 - July 2026/);
  assert.match(generator, /planyx-admin-centre-manual\.pdf/);
  assert.match(generator, /planyx-customer-portal-manual\.pdf/);
  assert.match(generator, /planyx-public-website-manual\.pdf/);
  assert.match(generator, /Page \$\{page\} of \$\{total\}/);
});

test('Admin manual access is permission-aware and hidden before PIN unlock', async () => {
  const launcher = await read('src/components/AdminSupportLauncher.tsx');
  assert.match(launcher, /hasPermission\(admin, 'support'\)/);
  assert.match(launcher, /document\.querySelector\('\.admin-portal'\)/);
  assert.match(launcher, /href="\/admin\/manuals"/);

  const shortcuts = await read('src/components/AdminKeyboardShortcuts.tsx');
  assert.match(shortcuts, /key: 'm'[\s\S]{0,180}href: '\/admin\/manuals'[\s\S]{0,80}section: 'support'/);
});

test('Customer ticket Support Centre remains separate', async () => {
  const routes = await read('src/routes.tsx');
  const supportPage = await read('src/pages/admin/support.tsx');
  assert.match(routes, /const AdminSupportPage = lazy\(\(\) => import\('\.\/pages\/admin\/support'\)\)/);
  assert.match(routes, /path: '\/admin\/support'/);
  assert.match(supportPage, /Full ticket management/);
});
