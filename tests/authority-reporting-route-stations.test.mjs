import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Dedicated authority reporting URLs render the same protected Admin page', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /AdminAuthorityReportingRoutePage/);
  assert.match(app, /\['\/admin\/authority-reporting', '\/admin\/reports'\]/);
  assert.match(app, /<AdminAuthorityReportingRoutePage\s*\/>/);

  const edgeRoute = await read('functions/admin/authority-reporting.js');
  assert.match(edgeRoute, /return context\.next\(\)/);
  assert.doesNotMatch(edgeRoute, /status:\s*302/);
  assert.doesNotMatch(edgeRoute, /Location:/);
});

test('Authority reporting includes an official-source server-backed UK police station directory', async () => {
  const embedded = await read('src/components/admin/EmbeddedAuthorityReportLinking.tsx');
  const directory = await read('src/components/admin/PoliceStationDirectory.tsx');
  const endpoint = await read('functions/api/admin/police-directory.js');

  assert.match(embedded, /UK police station directory/);
  assert.match(embedded, /setInput\('authority-name'/);
  assert.match(embedded, /setInput\('authority-channel'/);
  assert.match(embedded, /Official source:/);
  assert.match(embedded, /Checked:/);

  assert.match(directory, /\/api\/admin\/police-directory/);
  assert.doesNotMatch(directory, /fetch\(`https:\/\/data\.police\.uk/);
  assert.match(directory, /Search published stations/);
  assert.match(directory, /Station, town, address or postcode/);
  assert.match(directory, /Verified manual station entry/);
  assert.match(directory, /Always verify public-access arrangements/);

  assert.match(endpoint, /https:\/\/data\.police\.uk\/api/);
  assert.match(endpoint, /\/neighbourhoods/);
  assert.match(endpoint, /detail\?\.locations/);
  assert.match(endpoint, /cacheTtl/);
  assert.match(endpoint, /Administrator session required/);
});

test('Police directory falls back to official Home Office and GOV.UK station data when Police.uk is incomplete', async () => {
  const endpoint = await read('functions/api/admin/police-directory.js');
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  const migration = await read('src/components/admin/PoliceDirectoryCacheMigration.tsx');

  assert.match(endpoint, /GOVUK_CONTENT_API/);
  assert.match(endpoint, /ninja-sword-surrender-and-compensation-scheme/);
  assert.match(endpoint, /GOVUK_FORCE_HEADINGS/);
  assert.match(endpoint, /METROPOLITAN_OFFICIAL_FALLBACK/);
  assert.match(endpoint, /Bethnal Green Police Station/);
  assert.match(endpoint, /Wembley Police Station/);
  assert.match(endpoint, /loadGovUkFallback/);
  assert.match(endpoint, /Official Home Office\/GOV\.UK designated-station directory/);
  assert.match(endpoint, /Verify current opening hours, public-counter access/);

  assert.match(route, /PoliceDirectoryCacheMigration/);
  assert.match(migration, /planyx-police-stations-server-v2:/);
  assert.match(migration, /localStorage\.removeItem/);
});

test('Police directory covers every UK territorial and specialist force category without pretending unavailable data is complete', async () => {
  const directory = await read('src/components/admin/PoliceStationDirectory.tsx');

  for (const force of [
    'Metropolitan Police Service',
    'Police Scotland',
    'Police Service of Northern Ireland',
    'British Transport Police',
    'Civil Nuclear Constabulary',
    'Ministry of Defence Police',
  ]) assert.match(directory, new RegExp(force));

  const forceEntries = directory.match(/\{ id: '[^']+', name: '[^']+', nation:/g) || [];
  assert.equal(forceEntries.length, 48);
  assert.match(directory, /Police Scotland station records are not included/);
  assert.match(directory, /British Transport Police is excluded/);
  assert.match(directory, /does not operate ordinary public police-station reporting counters/);
  assert.match(directory, /Use the official BTP finder/);
});

test('Published and manual station choices attach immediately and confirm the assignment', async () => {
  const directory = await read('src/components/admin/PoliceStationDirectory.tsx');
  const embedded = await read('src/components/admin/EmbeddedAuthorityReportLinking.tsx');

  assert.match(directory, /onClick=\{\(\) => onSelect\(station\)\}/);
  assert.match(directory, /onSelect\(\{ \.\.\.manual/);
  assert.match(embedded, /assignedStation: station/);
  assert.match(embedded, /setDirectoryOpen\(false\)/);
  assert.match(embedded, /Police station assigned/);
  assert.match(embedded, /Save the report to preserve the assignment/);
});

test('Station selection remains part of the saved report and PDF fields', async () => {
  const embedded = await read('src/components/admin/EmbeddedAuthorityReportLinking.tsx');
  const reportPage = await read('src/pages/admin/authority-reporting.tsx');

  assert.match(reportPage, /id="authority-name"/);
  assert.match(reportPage, /id="authority-channel"/);
  assert.match(embedded, /station\.forceName/);
  assert.match(embedded, /station\.stationName/);
  assert.match(embedded, /station\.address/);
  assert.match(embedded, /station\.postcode/);
  assert.match(embedded, /station\.sourceUrl/);
});
