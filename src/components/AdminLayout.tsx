import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';
import AdminLayoutStable from './AdminLayoutStable';

type AdminLayoutProps = ComponentProps<typeof AdminLayoutStable>;

type AdminFooterLink = {
  label: string;
  href: string;
  section?: string;
};

type AdminPinState = {
  loading: boolean;
  configured: boolean;
  unlocked: boolean;
  expiresAt?: string | null;
  lockedUntil?: string | null;
  attemptsRemaining?: number;
  error?: string;
};

const ADMIN_PIN_TIMEOUT_MS = 7000;

const ADMIN_FOOTER_LINKS: AdminFooterLink[] = [
  { label: 'Dashboard', href: '/admin/dashboard', section: 'dashboard' },
  { label: 'Customer CRM', href: '/admin/users', section: 'customers' },
  { label: 'Gate Control Centre', href: '/admin/status', section: 'status' },
  { label: 'Partner Galleries', href: '/admin/affiliate-content', section: 'affiliate' },
  { label: 'Audit Log', href: '/admin/audit', section: 'audit' },
  { label: 'Site Settings', href: '/admin/site-settings', section: 'systemsettings' },
];

const POLICY_LINKS: AdminFooterLink[] = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookies' },
  { label: 'Accessibility', href: '/accessibility-support' },
];

function AdminFooterLinks() {
  const { admin } = useAdmin();
  const [footer, setFooter] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setFooter(document.querySelector<HTMLElement>('.admin-portal footer'));
  }, []);

  const permittedAdminLinks = useMemo(() => ADMIN_FOOTER_LINKS.filter(link => (
    !link.section || Boolean(admin && hasPermission(admin, link.section))
  )), [admin]);

  if (!footer) return null;

  return createPortal(
    <div className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 text-xs sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:px-8">
        <nav aria-label="Admin footer navigation">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Admin tools</p>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {permittedAdminLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="font-semibold text-slate-600 transition hover:text-blue-700 hover:underline dark:text-slate-300 dark:hover:text-blue-300"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <nav aria-label="Admin footer policy links" className="md:text-right">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Policies and support</p>
          <div className="flex flex-wrap gap-x-5 gap-y-3 md:justify-end">
            {POLICY_LINKS.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="font-medium text-slate-500 transition hover:text-blue-700 hover:underline dark:text-slate-400 dark:hover:text-blue-300"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>,
    footer,
  );
}

function AdminPinGate({ children }: { children: ReactNode }) {
  const { admin, isLoading, logout } = useAdmin();
  const [pinState, setPinState] = useState<AdminPinState>({
    loading: true,
    configured: false,
    unlocked: false,
  });
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  useEffect(() => {
    if (!admin) {
      setPinState({ loading: true, configured: false, unlocked: false });
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), ADMIN_PIN_TIMEOUT_MS);

    setPinState(current => ({ ...current, loading: true, error: '' }));
    fetch('/api/admin/pin', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => ({
        response,
        payload: await response.json().catch(() => ({})) as Partial<AdminPinState>,
      }))
      .then(({ response, payload }) => {
        if (!active) return;
        setPinState({
          loading: false,
          configured: Boolean(payload.configured),
          unlocked: Boolean(payload.unlocked),
          expiresAt: payload.expiresAt,
          lockedUntil: payload.lockedUntil,
          attemptsRemaining: payload.attemptsRemaining,
          error: response.ok ? '' : (payload.error || 'Administrator PIN verification is unavailable. The Admin Centre remains locked.'),
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const timedOut = error instanceof DOMException && error.name === 'AbortError';
        setPinState({
          loading: false,
          configured: true,
          unlocked: false,
          error: timedOut
            ? 'Administrator PIN verification timed out. The Admin Centre remains securely locked. Refresh the page or sign in again.'
            : 'Administrator PIN verification is unavailable. The Admin Centre remains securely locked.',
        });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [admin?.email]);

  useEffect(() => {
    if (!pinState.unlocked || !pinState.expiresAt) return;
    const remaining = Date.parse(pinState.expiresAt) - Date.now();
    if (remaining <= 0) {
      setPinState(current => ({
        ...current,
        unlocked: false,
        error: 'Your administrator PIN session expired. Enter your PIN again.',
      }));
      return;
    }
    const timer = window.setTimeout(() => {
      setPinState(current => ({
        ...current,
        unlocked: false,
        error: 'Your administrator PIN session expired. Enter your PIN again.',
      }));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [pinState.unlocked, pinState.expiresAt]);

  async function submitAdminPin() {
    if (!pinState.configured && pin !== pinConfirm) {
      setPinState(current => ({ ...current, error: 'The PIN confirmation does not match.' }));
      return;
    }

    setPinSubmitting(true);
    try {
      const response = await fetch('/api/admin/pin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: pinState.configured ? 'verify' : 'setup',
          pin,
        }),
      });
      const payload = await response.json().catch(() => ({})) as Partial<AdminPinState>;
      if (!response.ok || !payload.unlocked) {
        setPinState(current => ({
          ...current,
          configured: payload.configured ?? current.configured,
          unlocked: false,
          lockedUntil: payload.lockedUntil ?? current.lockedUntil,
          attemptsRemaining: payload.attemptsRemaining,
          error: payload.error || 'The administrator PIN could not be verified.',
        }));
        return;
      }

      setPin('');
      setPinConfirm('');
      setPinState({
        loading: false,
        configured: true,
        unlocked: true,
        expiresAt: payload.expiresAt,
        lockedUntil: null,
        error: '',
      });
    } catch {
      setPinState(current => ({
        ...current,
        unlocked: false,
        error: 'The administrator PIN could not be verified. The Admin Centre remains locked.',
      }));
    } finally {
      setPinSubmitting(false);
    }
  }

  if (isLoading || !admin) return <>{children}</>;

  if (pinState.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm">Checking administrator PIN security…</span>
        </div>
      </div>
    );
  }

  if (!pinState.unlocked) {
    const locked = Boolean(pinState.lockedUntil && Date.parse(pinState.lockedUntil) > Date.now());
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-500/15">
            <Lock className="h-5 w-5 text-blue-700 dark:text-blue-300" />
          </div>
          <h1 className="text-xl font-semibold text-slate-950 dark:text-white">Administrator security PIN</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {pinState.configured
              ? 'Enter your personal four-digit PIN to continue after Microsoft sign-in.'
              : 'Create your personal four-digit PIN. It will protect privileged Admin Centre and customer CRM access.'}
          </p>

          <label htmlFor="admin-security-pin" className="mt-5 block text-xs font-semibold text-slate-800 dark:text-slate-200">Four-digit PIN</label>
          <input
            id="admin-security-pin"
            type="password"
            inputMode="numeric"
            autoComplete={pinState.configured ? 'current-password' : 'new-password'}
            maxLength={4}
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={locked}
            className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-xl tracking-[0.5em] text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100"
          />

          {!pinState.configured && (
            <>
              <label htmlFor="admin-security-pin-confirm" className="mt-3 block text-xs font-semibold text-slate-800 dark:text-slate-200">Confirm PIN</label>
              <input
                id="admin-security-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={pinConfirm}
                onChange={event => setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))}
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-xl tracking-[0.5em] text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </>
          )}

          {pinState.error && <p role="alert" className="mt-3 text-xs text-red-700">{pinState.error}</p>}
          {locked && pinState.lockedUntil && (
            <p role="alert" className="mt-3 text-xs text-amber-700">
              PIN access is locked until {new Date(pinState.lockedUntil).toLocaleString('en-GB')}.
            </p>
          )}
          {!locked && typeof pinState.attemptsRemaining === 'number' && pinState.attemptsRemaining < 5 && (
            <p className="mt-3 text-xs text-amber-700">Attempts remaining: {pinState.attemptsRemaining}</p>
          )}

          <button
            type="button"
            onClick={() => void submitAdminPin()}
            disabled={locked || pinSubmitting || pin.length !== 4 || (!pinState.configured && pinConfirm.length !== 4)}
            className="mt-5 h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pinSubmitting ? 'Checking…' : pinState.configured ? 'Unlock Admin Centre' : 'Create PIN and continue'}
          </button>
          <button type="button" onClick={() => void logout()} className="mt-3 w-full text-xs font-medium text-slate-500 underline">
            Sign out of Microsoft
          </button>
          <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
            Your PIN is personal to you, cannot be displayed by administrators, and does not replace your Microsoft account security.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AdminLayout(props: AdminLayoutProps) {
  return (
    <AdminPinGate>
      <AdminLayoutStable {...props}>
        {props.children}
        <AdminFooterLinks />
      </AdminLayoutStable>
    </AdminPinGate>
  );
}
