import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the UCN is loaded inside the customer profile settings page', async () => {
  const [index, script, style] = await Promise.all([
    read('../index.html'),
    read('../static/assets/customer-ucn-profile.js'),
    read('../static/assets/customer-ucn-profile.css'),
  ]);

  assert.match(index, /customer-ucn-profile\.css/);
  assert.match(index, /customer-ucn-profile\.js/);
  assert.match(script, /Email Address/i);
  assert.match(script, /Universal Customer Number \(UCN\)/);
  assert.match(script, /\/api\/account\/customer-number/);
  assert.match(script, /\^\\d\{10\}\$/);
  assert.match(style, /\.planyx-ucn-profile/);
  assert.doesNotMatch(script, /CUSTOMEROPS_API_KEY/);
});

test('the old standalone customer-number page redirects to profile information', async () => {
  const page = await read('../static/account/customer-number/index.html');
  assert.match(page, /\/settings\?tab=profile#universal-customer-number/);
  assert.doesNotMatch(page, /data-ucn-value|Retry connection/);
});
