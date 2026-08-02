import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync('functions/api/customer-service/[[path]].js', 'utf8');
const shared = fs.readFileSync('functions/_shared/customer-service-centre.js', 'utf8');
const handler = fs.readFileSync('functions/api/support-assistant.js', 'utf8');
const runtime = fs.readFileSync('src/components/AIHelpChatbotRuntime.tsx', 'utf8');
const client = fs.readFileSync('src/components/CentralCustomerServiceChatbot.tsx', 'utf8');

assert.match(bridge, /centralCustomerServiceEnabled/);
assert.match(bridge, /centralSupportRequest/);
assert.match(bridge, /\/api\/v1\/platform\/support-control/);
assert.match(bridge, /ensureCentralConversation/);
assert.match(bridge, /connection: payload\.connection/);
assert.doesNotMatch(bridge, /Bearer\s+[A-Za-z0-9._-]{20,}/);

assert.match(shared, /HEAD_OFFICE_SUPPORT_CENTRE_ENABLED/);
assert.match(shared, /CUSTOMEROPS_API_KEY/);
assert.match(shared, /\/api\/v1\/platform\/support\//);
assert.match(shared, /centralSupportIdentity/);
assert.match(shared, /senderType: "customer"/);
assert.match(shared, /senderType: "ai"/);
assert.match(shared, /HUMAN_ONLY_CATEGORIES/);
assert.match(shared, /request_human/);

assert.match(handler, /centralPreflight/);
assert.match(handler, /centralRecordAnswer/);
assert.match(handler, /\["safeguarding", "data protection", "security"\]/);
assert.match(handler, /centralConversationEvent\(context\.env, body\.sessionId, "request_human"/);
assert.match(runtime, /CentralCustomerServiceChatbot/);
assert.match(runtime, /applyHeadOfficeControls/);
assert.match(runtime, /\/api\/customer-service\/config/);
assert.match(runtime, /launcherColour/);
assert.match(runtime, /headerBackground/);
assert.match(runtime, /panelWidth/);
assert.match(runtime, /assistantEnabled/);
assert.doesNotMatch(runtime, /return <AtlassianCustomerServiceWidget/);
assert.match(client, /Planyx Support Assistant/);
assert.match(client, /Head Office/);

console.log('Planyx full Head Office customer service control checks passed.');
