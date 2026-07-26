import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('runtime uses the Atlassian Customer Service AI widget', async () => {
  const runtime = await read('src/components/AIHelpChatbotRuntime.tsx');
  const widget = await read('src/components/AtlassianCustomerServiceWidget.tsx');

  assert.match(runtime, /import AtlassianCustomerServiceWidget from '\.\/AtlassianCustomerServiceWidget'/);
  assert.match(runtime, /return <AtlassianCustomerServiceWidget\s*\/>/);
  assert.doesNotMatch(runtime, /return <ConversationalAIHelpChatbot\s*\/>/);
  assert.match(runtime, /window\.location\.pathname\.startsWith\('\/admin'\)/);
  assert.match(runtime, /window\.location\.pathname\.startsWith\('\/reseller'\)/);
  assert.match(runtime, /if \(config\.maintenanceEnabled\) return <MaintenanceWidget config=\{config\} \/>/);

  assert.match(widget, /2e5cd7dc-e84b-41b5-a6c8-805909741566/);
  assert.match(widget, /jagroupservices\.atlassian\.net/);
  assert.match(widget, /b3c01f24-8059-47ab-b1fb-52544f659458/);
  assert.match(widget, /csm\/widget\/script\.js/);
  assert.match(widget, /window\.csmWidgetSettings/);
  assert.match(widget, /document\.body\.appendChild\(script\)/);
  assert.match(widget, /document\.getElementById\(SCRIPT_ID\)/);
});

test('legacy conversation-first implementation remains available for controlled fallback work', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /text: config\.welcomeMessage/);
  assert.match(chatbot, /suggestions: STARTER_SUGGESTIONS/);
  assert.match(chatbot, /Tell me what you need help with/);
  assert.doesNotMatch(chatbot, /Before we look at the issue, what is your full name/);
  assert.doesNotMatch(chatbot, /intakeStep/);
  assert.doesNotMatch(chatbot, /looksLikePersonName/);
});

test('the legacy first visitor message goes directly to the support assistant', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /const userMessage: ChatMessage = \{ id: id\('user'\), role: 'user', text: value \}/);
  assert.match(chatbot, /fetch\('\/api\/support-assistant'/);
  assert.match(chatbot, /history: issueHistory\(next\)/);
});

test('legacy personal details are collected only when an enquiry is opened', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /Now add your contact details/);
  assert.match(chatbot, /requested only because you have chosen to send the conversation/);
  assert.match(chatbot, /name: current\.name \|\| displayName\(user\)/);
  assert.match(chatbot, /email: current\.email \|\| user\?\.email/);
  assert.match(chatbot, /if \(!name \|\| !email\) \{\s*startEnquiry/);
});

test('legacy signed-in customers remain linked at human handover', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /Your name and email are taken from your signed-in account only at this handover stage/);
  assert.match(chatbot, /event: 'verify_support_pin'/);
  assert.match(chatbot, /email: user\?\.email \|\| form\.email\.trim\(\)/);
});
