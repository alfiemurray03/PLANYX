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
assert.match(bridge, /2026-08-02-connection-recovery-1/);
assert.match(bridge, /X-JA-Customer-Service-Bridge/);
assert.match(bridge, /keyPresent: centralCustomerServiceKeyPresent\(env\)/);
assert.match(bridge, /supportSwitchEnabled: centralCustomerServiceSwitchEnabled\(env\)/);
assert.match(bridge, /centralHttpStatus/);
assert.match(bridge, /CUSTOMEROPS_API_KEY_MISSING/);
assert.match(bridge, /CENTRAL_SUPPORT_TIMEOUT/);
assert.doesNotMatch(bridge, /Bearer\s+[A-Za-z0-9._-]{20,}/);
assert.doesNotMatch(bridge, /diagnostics[\s\S]*CUSTOMEROPS_API_KEY\s*:/, 'Diagnostics must never return the credential value.');

assert.match(shared, /HEAD_OFFICE_SUPPORT_CENTRE_ENABLED/);
assert.match(shared, /CUSTOMEROPS_API_KEY/);
assert.match(shared, /HEAD_OFFICE_CUSTOMEROPS_URL/);
assert.match(shared, /centralCustomerServiceKeyPresent/);
assert.match(shared, /centralCustomerServiceSwitchEnabled/);
assert.match(shared, /centralCustomerServiceOrigin/);
assert.match(shared, /\/api\/v1\/platform\/support\//);
assert.match(shared, /centralSupportIdentity/);
assert.match(shared, /senderType: "customer"/);
assert.match(shared, /senderType: "ai"/);
assert.match(shared, /HUMAN_ONLY_CATEGORIES/);
assert.match(shared, /request_human/);
assert.match(shared, /HEAD_OFFICE_HTTP_/);

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
assert.match(client, /Sousa Murray Planeia Support Assistant/);
assert.match(client, /Head Office/);

console.log('Sousa Murray Planeia Head Office Customer Service connection diagnostics and controls checks passed.');
