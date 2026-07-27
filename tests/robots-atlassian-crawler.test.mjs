import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
const lines = robots.split(/\r?\n/).map(line => line.trim());

function groupFor(userAgent) {
  const start = lines.findIndex(line => line.toLowerCase() === `user-agent: ${userAgent}`.toLowerCase());
  assert.notEqual(start, -1, `Missing robots.txt group for ${userAgent}`);
  const next = lines.findIndex((line, index) => index > start && line.toLowerCase().startsWith('user-agent:'));
  return lines.slice(start, next === -1 ? lines.length : next).filter(Boolean);
}

const protectedPaths = [
  '/admin',
  '/api',
  '/csm-widget-token',
  '/csm-widget-session',
  '/auth/',
  '/dashboard',
  '/documents',
  '/builders',
  '/settings',
  '/support',
  '/privacy-settings',
  '/org/',
  '/signing',
  '/sign/',
  '/affiliate/dashboard',
  '/reseller',
  '/checkout',
  '/payment',
  '/billing',
  '/account',
  '/customer',
  '/invoices',
  '/subscriptions',
];

test('Atlassian Teamwork Graph crawler can index public Planyx pages', () => {
  const atlassian = groupFor('atlassian-bot');
  assert.ok(atlassian.includes('Allow: /'));
  assert.ok(atlassian.includes('Allow: /reseller/apply'));
  assert.ok(!atlassian.includes('Disallow: /'), 'Atlassian must not be blocked from the whole site');
});

test('Atlassian and ordinary crawlers are blocked from private Planyx areas', () => {
  for (const userAgent of ['atlassian-bot', '*']) {
    const group = groupFor(userAgent);
    for (const path of protectedPaths) {
      assert.ok(group.includes(`Disallow: ${path}`), `${userAgent} must be blocked from ${path}`);
    }
  }
});

test('robots.txt publishes the production Planyx sitemap', () => {
  assert.ok(lines.includes('Sitemap: https://planyx.jagroupservices.co.uk/sitemap.xml'));
});
