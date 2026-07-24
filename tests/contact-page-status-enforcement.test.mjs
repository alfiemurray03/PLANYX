import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Contact Us and the Support Assistant share one availability source', async () => {
  const status = await read('functions/_shared/contact-service-status.js');
  const endpoint = await read('functions/api/support-assistant.js');

  assert.match(status, /contactServiceStatusFromSettings/);
  assert.match(status, /enabled && status === "online"/);
  assert.match(status, /contact_page_enabled/);
  assert.match(status, /contact_page_status/);
  assert.match(status, /contact_maintenance_message/);
  assert.match(status, /contact_offline_message/);

  assert.match(endpoint, /contactServiceStatusFromSettings\(settings\)/);
  assert.match(endpoint, /contactEnquiriesAvailable: contact\.available/);
  assert.match(endpoint, /escalationEnabled: config\.escalationEnabled && contact\.available/);
  assert.match(endpoint, /contactPageStatus: contact\.status/);
  assert.match(endpoint, /attemptedHandover/);
  assert.match(endpoint, /Online enquiries are unavailable in this mode/);
  assert.match(endpoint, /"Cache-Control": "no-store"/);
});

test('chatbot maintenance panel never links to an offline Contact page', async () => {
  const runtime = await read('src/components/AIHelpChatbotRuntime.tsx');

  assert.match(runtime, /contactEnquiriesAvailable/);
  assert.match(runtime, /contactPageStatus === 'online'/);
  assert.match(runtime, /const canCreateEnquiry = contactAvailable && config\.escalationEnabled/);
  assert.match(runtime, /canCreateEnquiry \? \(/);
  assert.match(runtime, /Online Contact Enquiries are unavailable/);
  assert.match(runtime, /Email support/);
  assert.match(runtime, /Call \{config\.contactPhoneDisplay\}/);
  assert.match(runtime, /will not direct anyone to an unavailable enquiry form/);
});

test('Contact page reports chatbot maintenance while manual contact remains online', async () => {
  const layout = await read('src/layouts/RootLayout.tsx');
  const gate = await read('src/components/ContactStatusGate.tsx');
  const middleware = await read('functions/_middleware.js');

  assert.match(layout, /isContactPage\(location\.pathname\)/);
  assert.match(layout, /<ContactStatusGate>\{children\}<\/ContactStatusGate>/);
  assert.match(gate, /config\.contactPageEnabled && config\.contactPageStatus === 'online'/);
  assert.match(gate, /assistantUnavailable/);
  assert.match(gate, /The AI Help Centre assistant is currently unavailable/);
  assert.match(gate, /manual enquiry form remain available/);
  assert.match(gate, /Contact Us is currently offline/);
  assert.match(gate, /Support Assistant is also prevented from offering or submitting an enquiry/);
  assert.match(gate, /cache: 'no-store'/);
  assert.match(middleware, /contactStatus !== "online"/);
});

test('all public enquiry submission routes reject Contact maintenance, offline and disabled states', async () => {
  const worker = await read('src/worker.js');
  const chatbotSubmit = await read('functions/api/support/submit.js');
  const manualSubmit = await read('functions/api/support/manual-submit.js');

  assert.match(worker, /loadContactAvailability\(env\)/);
  assert.match(worker, /availability\.status === 'maintenance'/);
  assert.match(worker, /availability\.status === 'offline'/);
  assert.match(worker, /!availability\.enabled/);

  for (const route of [chatbotSubmit, manualSubmit]) {
    assert.match(route, /loadContactServiceStatus\(context\.env\.DB\)/);
    assert.match(route, /if \(!contact\.available\)/);
    assert.match(route, /contactUnavailable: true/);
    assert.match(route, /contactPageStatus: contact\.status/);
    assert.match(route, /return handleSupportRequest\(context\)/);
  }
});
