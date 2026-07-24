import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('runtime uses the conversation-first chatbot', async () => {
  const runtime = await read('src/components/AIHelpChatbotRuntime.tsx');
  assert.match(runtime, /import ConversationalAIHelpChatbot from '\.\/ConversationalAIHelpChatbot'/);
  assert.match(runtime, /return <ConversationalAIHelpChatbot\s*\/>/);
  assert.doesNotMatch(runtime, /return <ManagedAIHelpChatbot\s*\/>/);
});

test('chat starts with the configured welcome message and useful topics', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /text: config\.welcomeMessage/);
  assert.match(chatbot, /suggestions: STARTER_SUGGESTIONS/);
  assert.match(chatbot, /Tell me what you need help with/);
  assert.doesNotMatch(chatbot, /Before we look at the issue, what is your full name/);
  assert.doesNotMatch(chatbot, /intakeStep/);
  assert.doesNotMatch(chatbot, /looksLikePersonName/);
});

test('the first visitor message goes directly to the support assistant', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /const userMessage: ChatMessage = \{ id: id\('user'\), role: 'user', text: value \}/);
  assert.match(chatbot, /fetch\('\/api\/support-assistant'/);
  assert.match(chatbot, /history: issueHistory\(next\)/);
});

test('personal details are collected only when an enquiry is opened', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /Now add your contact details/);
  assert.match(chatbot, /requested only because you have chosen to send the conversation/);
  assert.match(chatbot, /name: current\.name \|\| displayName\(user\)/);
  assert.match(chatbot, /email: current\.email \|\| user\?\.email/);
  assert.match(chatbot, /if \(!name \|\| !email\) \{\s*startEnquiry/);
});

test('signed-in customers remain linked at human handover', async () => {
  const chatbot = await read('src/components/ConversationalAIHelpChatbot.tsx');
  assert.match(chatbot, /Your name and email are taken from your signed-in account only at this handover stage/);
  assert.match(chatbot, /event: 'verify_support_pin'/);
  assert.match(chatbot, /email: user\?\.email \|\| form\.email\.trim\(\)/);
});
