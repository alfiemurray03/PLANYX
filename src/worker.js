import { EmailMessage } from 'cloudflare:email';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_FIELD_LENGTHS = { name: 120, email: 254, subject: 200, message: 10000, category: 60, priority: 30 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function safeHeader(value) {
  return value.replace(/[\r\n]+/g, ' ');
}

function createTicketReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  return `PLX-${date}-${random}`;
}

function emailBody(ticket, enquiry) {
  const received = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'long' });
  return [
    `Planyx support ticket: ${ticket}`,
    '',
    `Received: ${received}`,
    `Customer: ${enquiry.name}`,
    `Reply email: ${enquiry.email}`,
    `Category: ${enquiry.category}`,
    `Priority: ${enquiry.priority}`,
    `Subject: ${enquiry.subject}`,
    '',
    'FULL ENQUIRY',
    '------------',
    enquiry.message,
    '',
    `When telephoning, the customer should quote: ${ticket}`
  ].join('\r\n');
}

function rawEmail(from, to, ticket, enquiry) {
  const subject = safeHeader(`[${ticket}] [${enquiry.priority.toUpperCase()}] ${enquiry.subject}`);
  return [
    `From: Planyx Ticketing <${from}>`,
    `To: ${to}`,
    `Reply-To: ${safeHeader(enquiry.email)}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    emailBody(ticket, enquiry)
  ].join('\r\n');
}

function teamsPayload(ticket, enquiry) {
  const facts = [
    { title: 'Ticket', value: ticket },
    { title: 'Customer', value: escapeHtml(enquiry.name) },
    { title: 'Reply to', value: escapeHtml(enquiry.email) },
    { title: 'Category', value: escapeHtml(enquiry.category) },
    { title: 'Priority', value: escapeHtml(enquiry.priority) },
    { title: 'Subject', value: escapeHtml(enquiry.subject) }
  ];
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: 'New Planyx support ticket', weight: 'Bolder', size: 'Large', color: 'Accent' },
          { type: 'TextBlock', text: ticket, weight: 'Bolder', size: 'Medium' },
          { type: 'FactSet', facts },
          { type: 'TextBlock', text: 'Full enquiry', weight: 'Bolder', separator: true },
          { type: 'TextBlock', text: enquiry.message, wrap: true }
        ]
      }
    }]
  };
}

async function loadContactAvailability(env) {
  if (!env.DB) return { status: 'online', enabled: true, message: '' };
  try {
    const result = await env.DB.prepare(`
      SELECT key, value FROM site_settings
      WHERE key IN ('contact_page_status', 'contact_page_enabled', 'contact_maintenance_message', 'contact_offline_message')
    `).all();
    const settings = Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
    const status = ['online', 'maintenance', 'offline'].includes(settings.contact_page_status)
      ? settings.contact_page_status
      : 'online';
    return {
      status,
      enabled: settings.contact_page_enabled !== 'false',
      message: status === 'maintenance'
        ? clean(settings.contact_maintenance_message || 'Contact support is temporarily unavailable while maintenance is completed.', 800)
        : clean(settings.contact_offline_message || 'The Contact Us page is currently offline.', 800),
    };
  } catch (error) {
    console.error('Contact availability lookup failed', { error: String(error) });
    return { status: 'online', enabled: true, message: '' };
  }
}

async function submitSupport(request, env) {
  const availability = await loadContactAvailability(env);
  if (availability.status === 'maintenance') {
    return json({ success: false, maintenance: true, error: availability.message }, 503);
  }
  if (availability.status === 'offline') {
    return json({ success: false, offline: true, error: availability.message }, 503);
  }
  if (!availability.enabled) {
    return json({ success: false, error: 'Online Contact Us enquiries are currently disabled.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'The enquiry could not be read. Please check the form and try again.' }, 400);
  }

  const enquiry = {
    name: clean(body.name, MAX_FIELD_LENGTHS.name),
    email: clean(body.email, MAX_FIELD_LENGTHS.email).toLowerCase(),
    subject: clean(body.subject, MAX_FIELD_LENGTHS.subject),
    message: clean(body.message, MAX_FIELD_LENGTHS.message),
    category: clean(body.category, MAX_FIELD_LENGTHS.category) || 'general',
    priority: clean(body.priority, MAX_FIELD_LENGTHS.priority) || 'normal'
  };

  if (!enquiry.name || !enquiry.email || !enquiry.subject || !enquiry.message) {
    return json({ success: false, error: 'Please complete all required fields.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)) {
    return json({ success: false, error: 'Please enter a valid email address.' }, 400);
  }
  if (!env.SUPPORT_EMAIL || !env.TEAMS_WEBHOOK_URL) {
    console.error('Support delivery bindings are not fully configured');
    return json({ success: false, error: 'Support is temporarily unavailable. Please email us or telephone the switchboard.' }, 503);
  }

  const ticketReference = createTicketReference();
  const to = env.ENQUIRY_TO_EMAIL || 'planyx@jagroupservices.co.uk';
  const from = env.ENQUIRY_FROM_EMAIL || 'tickets@jagroupservices.co.uk';

  try {
    const email = new EmailMessage(from, to, rawEmail(from, to, ticketReference, enquiry));
    const [emailResult, teamsResult] = await Promise.allSettled([
      env.SUPPORT_EMAIL.send(email),
      fetch(env.TEAMS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(teamsPayload(ticketReference, enquiry))
      }).then(response => {
        if (!response.ok) throw new Error(`Teams webhook returned ${response.status}`);
      })
    ]);

    if (emailResult.status === 'rejected' || teamsResult.status === 'rejected') {
      console.error('Ticket delivery failed', {
        ticketReference,
        email: emailResult.status,
        teams: teamsResult.status
      });
      return json({
        success: false,
        error: 'We could not safely route your enquiry. Nothing has been confirmed—please try again or contact us by telephone.'
      }, 502);
    }

    return json({ success: true, ticketReference });
  } catch (error) {
    console.error('Support submission failed', { ticketReference, error: String(error) });
    return json({ success: false, error: 'We could not submit your enquiry. Please try again or contact us by telephone.' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/support/submit') {
      if (request.method !== 'POST') {
        return json({ success: false, error: 'Method not allowed.' }, 405);
      }
      return submitSupport(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
