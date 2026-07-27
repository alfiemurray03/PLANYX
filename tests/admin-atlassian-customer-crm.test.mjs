import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Atlassian Control Centre can raise an issue for a selected CRM customer', async () => {
  const [page, form] = await Promise.all([
    read('src/pages/admin/atlassian-support.tsx'),
    read('src/components/admin/AtlassianCustomerRequestForm.tsx'),
  ]);

  assert.match(page, /AtlassianCustomerRequestForm/);
  assert.match(page, /raise issues for CRM customers/i);
  assert.match(form, /fetch\('\/api\/admin\/customers'/);
  assert.match(form, /action:\s*'create_customer_request'/);
  assert.match(form, /customerEmail:\s*selectedCustomer\.email/);
  assert.match(form, /Raise issue for customer/);
  assert.match(form, /\/admin\/users\/\$\{encodeURIComponent\(selectedCustomer\.email\)\}/);
  assert.doesNotMatch(form, /ATLASSIAN_API_TOKEN/);
});

test('manual issue creation validates the customer in profiles and writes CRM support history', async () => {
  const endpoint = await read('functions/api/admin/atlassian-connection.js');

  assert.match(endpoint, /create_customer_request/);
  assert.match(endpoint, /FROM profiles WHERE lower\(email\)=lower\(\?\)/);
  assert.match(endpoint, /INSERT INTO customer_support_cases/);
  assert.match(endpoint, /planyx_reference/);
  assert.match(endpoint, /atlassian_issue_key/);
  assert.match(endpoint, /Planyx Admin Centre – raised for customer/);
  assert.match(endpoint, /force:\s*true/);
  assert.match(endpoint, /INSERT INTO customer_timeline_events/);
  assert.match(endpoint, /atlassian_support_raised_for_customer/);
  assert.match(endpoint, /savedToCrm:\s*true/);
  assert.doesNotMatch(endpoint, /apiToken\s*:/);
});

test('manual CRM cases can be retried and remain visible in the existing CRM support tab', async () => {
  const [endpoint, crm] = await Promise.all([
    read('functions/api/admin/atlassian-connection.js'),
    read('src/pages/admin/customer-crm.tsx'),
  ]);

  assert.match(endpoint, /c\.planyx_reference=\? OR c\.reference=\?/);
  assert.match(endpoint, /matching Planyx enquiry or CRM support case/);
  assert.match(endpoint, /updateManualCase/);
  assert.match(crm, /customer\.supportCases/);
  assert.match(crm, /Support cases/);
  assert.match(crm, /\[\["reference","Reference"\]/);
});
