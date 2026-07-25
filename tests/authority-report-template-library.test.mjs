import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Authority Reporting opens as a template library and only renders the long workspace when selected', async () => {
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  assert.match(route, /AuthorityReportingLibraryPage/);
  assert.match(route, /if \(!workspaceOpen\) return <AuthorityReportingLibraryPage \/>/);
  assert.match(route, /searchParams\.has\('report'\)/);
  assert.match(route, /searchParams\.has\('template'\)/);
  assert.match(route, /searchParams\.has\('session_id'\)/);
  assert.match(route, /<AdminAuthorityReportingPage \/>/);
  assert.match(route, /<AuthorityReportTemplateBridge \/>/);
  assert.match(route, /<EmbeddedAuthoritySelection \/>/);
  assert.match(route, /<EmbeddedAuthorityReportLinking \/>/);
});

test('Report library contains searchable grouped templates and saved report links', async () => {
  const library = await read('src/pages/admin/authority-reporting-library.tsx');
  assert.match(library, /Report Template Library/);
  assert.match(library, /Choose the right report before opening the workspace/);
  assert.match(library, /Search templates, authorities, report references, people or email addresses/);
  assert.match(library, /Saved report library/);
  assert.match(library, /Recent and matching reports/);
  assert.match(library, /view=workspace&template=/);
  assert.match(library, /view=workspace&report=/);
  assert.match(library, /Blank report/);
  assert.match(library, /Call 999 first/);
  assert.match(library, /Protect first, record second/);
});

test('Template catalogue covers core authority and safeguarding reporting categories', async () => {
  const templates = await read('src/lib/authority-report-templates.ts');
  for (const category of [
    'Police & crime',
    'Safeguarding',
    'Data & cyber',
    'Council & public protection',
    'Government & public bodies',
    'Finance & consumer',
    'Health, education & work',
    'Transport & other regulators',
  ]) assert.match(templates, new RegExp(category.replace(/[&]/g, '\\&')));

  for (const templateId of [
    'emergency-police-incident',
    'police-101-online-report',
    'child-safeguarding-referral',
    'adult-safeguarding-referral',
    'personal-data-breach-ico',
    'cybercrime-security-incident',
    'hmrc-tax-customs-report',
    'dwp-benefit-public-funds',
    'companies-house-company-conduct',
    'financial-services-fca',
    'consumer-trading-standards',
    'health-cqc-nhs',
    'education-ofsted-local-authority',
    'employment-health-safety',
    'transport-regulator',
  ]) assert.match(templates, new RegExp(templateId));
});

test('Selected templates prefill the existing report workspace and retain library navigation', async () => {
  const bridge = await read('src/components/admin/AuthorityReportTemplateBridge.tsx');
  assert.match(bridge, /getAuthorityReportTemplate/);
  assert.match(bridge, /setSelect\('report-type', template\.reportType\)/);
  assert.match(bridge, /setInput\('authority-name', template\.authority\)/);
  assert.match(bridge, /setInput\('authority-channel', template\.channel\)/);
  assert.match(bridge, /setSelect\('urgency', template\.urgency\)/);
  assert.match(bridge, /to="\/admin\/authority-reporting"/);
  assert.match(bridge, /Report library/);
});
