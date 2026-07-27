import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  atlassianErrorHelp,
  classifyAtlassianRequestType,
  getAtlassianSupportConfig,
} from '../functions/_shared/atlassian-support.js';

const configuredEnv = {
  ATLASSIAN_CLOUD_ID: 'cloud-id',
  ATLASSIAN_SERVICE_DESK_ID: '169',
  ATLASSIAN_SERVICE_EMAIL: 'service-account@example.com',
  ATLASSIAN_API_TOKEN: 'not-a-real-token',
  ATLASSIAN_REQUEST_TYPE_QUESTION_ID: '356',
  ATLASSIAN_REQUEST_TYPE_PROBLEM_ID: '357',
  ATLASSIAN_REQUEST_TYPE_SUGGESTION_ID: '358',
};

test('Atlassian support configuration uses the scoped service-account variables', () => {
  const config = getAtlassianSupportConfig(configuredEnv);
  assert.equal(config.configured, true);
  assert.equal(config.cloudId, 'cloud-id');
  assert.equal(config.serviceDeskId, '169');
  assert.equal(config.authMode, 'auto');
  assert.equal(config.requestTypes.question, '356');
  assert.equal(config.requestTypes.problem, '357');
  assert.equal(config.requestTypes.suggestion, '358');
});

test('Atlassian request classification selects Question, Problem and Suggestion safely', () => {
  assert.deepEqual(
    classifyAtlassianRequestType(configuredEnv, { category: 'General Enquiry', subject: 'How do I share a plan?' }),
    { kind: 'question', requestTypeId: '356' },
  );
  assert.deepEqual(
    classifyAtlassianRequestType(configuredEnv, { category: 'Technical Support', subject: 'Export is not working' }),
    { kind: 'problem', requestTypeId: '357' },
  );
  assert.deepEqual(
    classifyAtlassianRequestType(configuredEnv, { category: 'Feedback', subject: 'Please add a calendar view' }),
    { kind: 'suggestion', requestTypeId: '358' },
  );
  assert.deepEqual(
    classifyAtlassianRequestType(configuredEnv, { requestKind: 'question', category: 'Technical Support', subject: 'Explicit override' }),
    { kind: 'question', requestTypeId: '356' },
  );
});

test('ticket creation uses the Atlassian gateway, scoped auth compatibility and verified customer identity', async () => {
  const source = await readFile(new URL('../functions/_shared/atlassian-support.js', import.meta.url), 'utf8');
  assert.match(source, /https:\/\/api\.atlassian\.com\/ex\/jira/);
  assert.match(source, /mode === "bearer"/);
  assert.match(source, /Bearer \$\{config\.apiToken\}/);
  assert.match(source, /Basic \$\{btoa\(`\$\{config\.serviceEmail\}:\$\{config\.apiToken\}`\)\}/);
  assert.match(source, /\["bearer", "basic"\]/);
  assert.match(source, /raiseOnBehalfOf:\s*customerEmail/);
  assert.match(source, /canRaiseOnBehalfOf/);
  assert.match(source, /serviceDeskId:\s*config\.serviceDeskId/);
  assert.match(source, /requestTypeId:\s*classification\.requestTypeId/);
  assert.match(source, /requestFieldValues:\s*\{[\s\S]*summary,[\s\S]*description:/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*apiToken/);
});

test('diagnostics prove authentication through the Customer Service API without requiring Jira myself scope', async () => {
  const source = await readFile(new URL('../functions/_shared/atlassian-support.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/rest\/api\/3\/myself/);
  assert.match(source, /service-account token was accepted by the Atlassian Customer Service API/);
  assert.match(source, /const readyToCreate = Boolean\(serviceDesk\)/);
  assert.match(source, /PXCS Customer Service Team or Administrator role/);
});

test('HTTP 403 is translated into useful scope and customer-service role guidance', () => {
  const help = atlassianErrorHelp(403, 'Forbidden');
  assert.match(help, /write:servicedesk-request/);
  assert.match(help, /Customer Service Team or administrator role/i);
});

test('signed-in AI escalation creates an Atlassian ticket without trusting typed email', async () => {
  const source = await readFile(new URL('../functions/api/support/submit.js', import.meta.url), 'utf8');
  assert.match(source, /x-ja-auth-email/);
  assert.match(source, /customerEmail:\s*customer\.email/);
  assert.doesNotMatch(source, /customerEmail:\s*submittedBody\.email/);
  assert.match(source, /reference:\s*atlassian\.issueKey/);
  assert.match(source, /planyxReference:\s*localReference/);
  assert.match(source, /Never lose a successfully stored Planyx enquiry/);
});
