import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Coming Soon route renders directly from the shared D1 gate configuration', async () => {
  const route = await read('functions/coming-soon/[[path]].js');
  const renderer = await read('functions/_shared/site-gates.js');
  const visibility = await read('functions/_shared/site-gates-v2.js');
  assert.match(route, /site-gates-v2\.js/);
  assert.match(route, /readGateSettings\(env\.DB\)/);
  assert.match(route, /renderLaunchGate\(config\)/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(renderer, /SELECT key,value FROM site_settings/);
  assert.match(renderer, /coming_soon_headline/);
  assert.match(renderer, /coming_soon_features/);
  assert.match(renderer, /coming_soon_custom_html/);
  assert.match(renderer, /coming_soon_custom_css/);
  assert.match(visibility, /coming_soon_headline_enabled/);
});

test('Launch Gate includes editable bottom-centre owner sign-in control', async () => {
  const renderer = await read('functions/_shared/site-gates.js');
  const visibility = await read('functions/_shared/site-gates-v2.js');
  assert.match(renderer, /Owner of this website\?/);
  assert.match(renderer, /SIGN IN HERE/);
  assert.match(renderer, /owner-access/);
  assert.match(renderer, /owner-button/);
  assert.match(renderer, /coming_soon_owner_enabled/);
  assert.match(renderer, /coming_soon_owner_url/);
  assert.match(visibility, /owner-zone/);
  assert.match(visibility, /replace\("<\/main>"/);
});

test('Gate settings API saves granular settings and exact rendered HTML for both gates', async () => {
  const api = await read('functions/api/admin/gate-settings.js');
  assert.match(api, /site-gates-v2\.js/);
  assert.match(api, /gateSettingsEntries/);
  assert.match(api, /entries\.launchgateway_content_mode = "html"/);
  assert.match(api, /entries\.launchgateway_content = renderLaunchGate\(config\)/);
  assert.match(api, /entries\.maintenance_content_mode = "html"/);
  assert.match(api, /entries\.maintenance_content = renderMaintenanceGate\(config\)/);
  assert.match(api, /site_gate_settings_saved/);
  assert.match(api, /isSameOriginRequest/);
});

test('Gate Control Centre supports add, update and remove controls with live preview', async () => {
  const page = await read('functions/admin/gates.js');
  const client = await read('static/assets/admin-gates.js');
  assert.match(page, /Gate Control Centre/);
  assert.match(client, /Launch Gate content and design/);
  assert.match(client, /Maintenance Gate content and design/);
  assert.match(client, /data-add-list/);
  assert.match(client, /data-remove-list/);
  assert.match(client, /Additional safe HTML/);
  assert.match(client, /Custom CSS/);
  assert.match(client, /action: 'preview'/);
  assert.match(client, /frame\.srcdoc = html/);
});

test('Gate Control Centre can remove every built-in launch and maintenance section', async () => {
  const client = await read('static/assets/admin-gates.js');
  const visibility = await read('functions/_shared/site-gates-v2.js');
  for (const key of [
    'launch.logoEnabled', 'launch.signalEnabled', 'launch.statusEnabled',
    'launch.headlineEnabled', 'launch.subtextEnabled', 'launch.descriptionEnabled',
    'launch.footerEnabled', 'maintenance.logoEnabled', 'maintenance.statusEnabled',
    'maintenance.reasonEnabled', 'maintenance.titleEnabled',
    'maintenance.messageEnabled', 'maintenance.footerEnabled',
  ]) assert.match(client, new RegExp(key.replace('.', '\\.')));
  assert.match(visibility, /coming_soon_logo_enabled/);
  assert.match(visibility, /maintenance_message_enabled/);
  assert.match(visibility, /if \(!c\.launch\.headlineEnabled\)/);
  assert.match(visibility, /if \(!c\.maintenance\.messageEnabled\)/);
});

test('Admin navigation exposes Gate Control Centre and replaces limited gate forms', async () => {
  const nav = await read('static/assets/admin-builder-nav.js');
  assert.match(nav, /\/admin\/gates/);
  assert.match(nav, /Gate Control Centre/);
  assert.match(nav, /Coming Soon Launch Gate\|Dedicated Maintenance Page/);
  assert.match(nav, /Open Gate Control Centre/);
});

test('Maintenance gate supports all operational content and owner controls', async () => {
  const renderer = await read('functions/_shared/site-gates.js');
  const visibility = await read('functions/_shared/site-gates-v2.js');
  assert.match(renderer, /maintenance_status_label/);
  assert.match(renderer, /maintenance_timeline_enabled/);
  assert.match(renderer, /maintenance_contact_enabled/);
  assert.match(renderer, /maintenance_custom_html/);
  assert.match(renderer, /maintenance_custom_css/);
  assert.match(renderer, /maintenance_owner_enabled/);
  assert.match(renderer, /renderMaintenanceGate/);
  assert.match(visibility, /renderBaseMaintenance/);
});
