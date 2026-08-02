import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync('functions/api/customer-service/[[path]].js', 'utf8');
const shared = fs.readFileSync('functions/_shared/customer-service-centre.js', 'utf8');
const handler = fs.readFileSync('functions/api/support-assistant.js', 'utf8');
const runtime = fs.readFileSync('src/components/AIHelpChatbotRuntime.tsx', 'utf8');
const client = fs.readFileSync('src/components/CentralCustomerServiceChatbot.tsx', 'utf8');

assert.match(bridge, /centralCustomerServiceEnabled/);
assert.match(bridge, /centralBranchConfig/);
assert.match(bridge, /ensureCentralConversation/);
assert.doesNotMatch(bridge, /Bearer\s+[A-Za-z0-9._-]{20,}/);

assert.match(shared, /HEAD_OFFICE_SUPPORT_CENTRE_ENABLED/);
assert.match(shared, /CUSTOMEROPS_API_KEY/);
assert.match(shared, /\/api\/v1\/platform\/support\//);
assert.match(shared, /centralSupportIdentity/);
assert.match(shared, /senderType: "customer"/);
assert.match(shared, /senderType: "ai"/);
assert.match(shared, /HUMAN_ONLY_CATEGORIES/);
assert.match(shared, /request_human/);

assert.match(handler, /mirrorCentralAssistantExchange/);
assert.match(handler, /centralCategoryFromSupportResult/);
assert.match(runtime, /CentralCustomerServiceChatbot/);
assert.doesNotMatch(runtime, /return <AtlassianCustomerServiceWidget/);
assert.match(client, /Planyx Support Assistant/);
assert.match(client, /Head Office/);

console.log('Planyx Head Office customer service bridge checks passed.');
