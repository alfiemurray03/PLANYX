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

test('Authority reporting includes an official-source UK police station directory', async () => {
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  const directory = await read('src/components/admin/PoliceStationDirectory.tsx');

  assert.match(route, /UK police station directory/);
  assert.match(route, /updateControlledInput\('authority-name'/);
  assert.match(route, /updateControlledInput\('authority-channel'/);
  assert.match(route, /Official source:/);
  assert.match(route, /Checked:/);

  assert.match(directory, /https:\/\/data\.police\.uk\/api/);
  assert.match(directory, /\/neighbourhoods/);
  assert.match(directory, /detail\?\.locations/);
  assert.match(directory, /Search published stations/);
  assert.match(directory, /Station, town, address or postcode/);
  assert.match(directory, /Verified manual station entry/);
  assert.match(directory, /Always verify the selected address/);
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

test('Station selection remains part of the saved report and PDF fields', async () => {
  const route = await read('src/pages/admin/authority-reporting-route.tsx');
  const reportPage = await read('src/pages/admin/authority-reporting.tsx');

  assert.match(reportPage, /id="authority-name"/);
  assert.match(reportPage, /id="authority-channel"/);
  assert.match(route, /station\.forceName/);
  assert.match(route, /station\.stationName/);
  assert.match(route, /station\.address/);
  assert.match(route, /station\.postcode/);
  assert.match(route, /station\.sourceUrl/);
});
