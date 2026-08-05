/**
 * Admin Portal — Test Tools
 * Send test emails and trigger test flows directly from the admin portal.
 * Requires admin session. All actions are audit-logged.
 */
import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  CheckCircle2, XCircle, Loader2, Send, Mail, KeyRound,
  ShieldCheck, MessageSquare, CalendarOff, PenLine, AlertTriangle,
  TestTube2, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  success: boolean;
  messageId?: string;
  sentTo?: string;
  pin?: string;
  error?: string;
}

interface ToolState {
  loading: boolean;
  result: TestResult | null;
}

function useToolState(): [ToolState, (loading: boolean, result?: TestResult | null) => void] {
  const [state, setState] = useState<ToolState>({ loading: false, result: null });
  const set = (loading: boolean, result: TestResult | null = null) =>
    setState({ loading, result });
  return [state, set];
}

async function runTool(action: string, payload: Record<string, unknown>): Promise<TestResult> {
  const res = await fetch('/api/admin/test-tools', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    return { success: false, error: data.error ?? `HTTP ${res.status}` };
  }
  return data as TestResult;
}

// ── Result badge ──────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  if (result.success) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2.5 text-sm">
        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div className="text-green-800 dark:text-green-300 space-y-0.5">
          <p className="font-medium">Success</p>
          {result.sentTo   && <p className="text-xs opacity-80">Sent to: {result.sentTo}</p>}
          {result.messageId && <p className="text-xs opacity-80">Message ID: {result.messageId}</p>}
          {result.pin       && <p className="text-xs font-mono font-bold">PIN: {result.pin}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm">
      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
      <div className="text-red-800 dark:text-red-300">
        <p className="font-medium">Failed</p>
        {result.error && <p className="text-xs opacity-80">{result.error}</p>}
      </div>
    </div>
  );
}

// ── Tool card wrapper ─────────────────────────────────────────────────────────

function ToolCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs text-gray-500 dark:text-slate-400">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── Individual tools ──────────────────────────────────────────────────────────

function GatewayPingTool() {
  const [state, set] = useToolState();
  const [to, setTo]  = useState('');

  async function run() {
    set(true);
    const result = await runTool('gateway_ping', to ? { to } : {});
    set(false, result);
  }

  return (
    <ToolCard icon={Mail} title="Email Gateway Ping" description="Send a test email to verify the email gateway is working.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Recipient (optional — defaults to ADMIN_NOTIFICATION_EMAIL)</Label>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="test@example.com"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <Button size="sm" onClick={run} disabled={state.loading} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send Test Email
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

function CustomerResetPinTool() {
  const [state, set] = useToolState();
  const [email, setEmail] = useState('');

  async function run() {
    if (!email.trim()) return;
    set(true);
    const result = await runTool('customer_reset_pin', { email: email.trim() });
    set(false, result);
  }

  return (
    <ToolCard icon={KeyRound} title="Customer Reset PIN" description="Generate and email a password reset PIN to a customer account.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Customer email address <span className="text-red-500">*</span></Label>
          <Input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          This will cancel any existing pending reset and create a new one. The PIN will be shown in the result.
        </div>
        <Button size="sm" onClick={run} disabled={state.loading || !email.trim()} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          Send Reset PIN
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

function AdminResetPinTool() {
  const [state, set] = useToolState();
  const [email, setEmail] = useState('');

  async function run() {
    if (!email.trim()) return;
    set(true);
    const result = await runTool('admin_reset_pin', { email: email.trim() });
    set(false, result);
  }

  return (
    <ToolCard icon={ShieldCheck} title="Admin Temp Password" description="Generate and email a temporary password to an admin account.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Admin email address <span className="text-red-500">*</span></Label>
          <Input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@jagroupservices.co.uk"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          This will overwrite the admin's current password with a temporary one and set mustResetPassword = true.
        </div>
        <Button size="sm" onClick={run} disabled={state.loading || !email.trim()} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Send Temp Password
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

function TicketReplyTool() {
  const [state, set]       = useToolState();
  const [ticketId, setId]  = useState('');
  const [message, setMsg]  = useState('This is a test reply from the Sousa Murray Planeia support team. Please disregard this message.');

  async function run() {
    if (!ticketId.trim()) return;
    set(true);
    const result = await runTool('ticket_reply', { ticketId: Number(ticketId), message });
    set(false, result);
  }

  return (
    <ToolCard icon={MessageSquare} title="Ticket Reply Email" description="Send a test reply email for an existing support ticket.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Ticket ID (numeric) <span className="text-red-500">*</span></Label>
          <Input
            type="number"
            value={ticketId}
            onChange={e => setId(e.target.value)}
            placeholder="42"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Message body</Label>
          <Textarea
            value={message}
            onChange={e => setMsg(e.target.value)}
            rows={3}
            className="mt-1 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          />
        </div>
        <Button size="sm" onClick={run} disabled={state.loading || !ticketId.trim()} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          Send Test Reply
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

function AwayEmailTool() {
  const [state, set]           = useToolState();
  const [to, setTo]            = useState('');
  const [message, setMessage]  = useState('Our support team is currently away. We will respond to your enquiry as soon as possible.');
  const [returnDate, setReturn] = useState('');

  async function run() {
    if (!to.trim()) return;
    set(true);
    const result = await runTool('away_email', {
      to: to.trim(),
      message,
      ...(returnDate ? { returnDate } : {}),
    });
    set(false, result);
  }

  return (
    <ToolCard icon={CalendarOff} title="Away / Out of Office Email" description="Send a test out-of-office notification email.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Recipient <span className="text-red-500">*</span></Label>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="customer@example.com"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Message</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={2}
            className="mt-1 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Expected return date (optional)</Label>
          <Input
            value={returnDate}
            onChange={e => setReturn(e.target.value)}
            placeholder="e.g. Monday 9 June 2026"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <Button size="sm" onClick={run} disabled={state.loading || !to.trim()} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarOff className="w-3.5 h-3.5" />}
          Send Away Email
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

function CustomEmailTool() {
  const [state, set]         = useToolState();
  const [to, setTo]          = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody]      = useState('');

  async function run() {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    set(true);
    const result = await runTool('custom_email', { to: to.trim(), subject: subject.trim(), body: body.trim() });
    set(false, result);
  }

  const disabled = state.loading || !to.trim() || !subject.trim() || !body.trim();

  return (
    <ToolCard icon={PenLine} title="Custom Email" description="Compose and send a fully custom test email to any address.">
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">To <span className="text-red-500">*</span></Label>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Subject <span className="text-red-500">*</span></Label>
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Test subject line"
            className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 dark:text-slate-400">Body <span className="text-red-500">*</span></Label>
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            placeholder="Email body text..."
            className="mt-1 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          />
        </div>
        <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Subject will be prefixed with [TEST] in the sent email.
        </div>
        <Button size="sm" onClick={run} disabled={disabled} className="gap-2">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
          Send Custom Email
        </Button>
        <ResultBadge result={state.result} />
      </div>
    </ToolCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminTestTools() {

  return (
    <AdminLayout>
      <Helmet>
        <title>Test Tools — Sousa Murray Planeia Admin</title>
      </Helmet>

      <div className="p-6 max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <TestTube2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Test Tools</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Send test emails and trigger test flows. All actions are audit-logged.
              </p>
            </div>
          </div>

          {/* Warning banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Test environment only.</strong> All emails sent from this panel are prefixed with [TEST] and are logged in the audit trail. Some actions (e.g. Admin Temp Password) make real database changes.
            </div>
          </div>

          {/* Tools grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <GatewayPingTool />
            <CustomerResetPinTool />
            <AdminResetPinTool />
            <TicketReplyTool />
            <AwayEmailTool />
            <CustomEmailTool />
          </div>

        </div>
    </AdminLayout>
  );
}
