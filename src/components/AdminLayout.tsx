import { useState, useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';
import {
  LayoutDashboard, Users, CreditCard, Settings,
  ClipboardList, HeadphonesIcon, ShieldCheck, BarChart2, LogOut,
  Menu, ChevronRight, Shield, Bell, Send,
  Globe, Wrench, FileEdit, Palette, Activity, FileText, HeartPulse,
  X, UserCog, Clock, Mail, AlertTriangle, CircleDollarSign, PackagePlus, MoreHorizontal, Lock,
  Bot, Moon, Sun, ChevronDown, BadgeCheck,
} from 'lucide-react';
import { useAdminTheme } from '@/lib/admin-theme-context';
import { useBranding } from '@/lib/branding';

// ── Nav structure ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  section: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { label: 'Dashboard',       href: '/admin/dashboard',   icon: LayoutDashboard, section: 'dashboard' },
      { label: 'Production Health', href: '/admin/health',     icon: HeartPulse,      section: 'health' },
      { label: 'Operations',      href: '/admin/operations',  icon: Activity,        section: 'operations' },
      { label: 'Analytics',       href: '/admin/analytics',   icon: BarChart2,       section: 'analytics' },
      { label: 'Reports',         href: '/admin/reports',     icon: FileText,        section: 'reports' },
      { label: 'Status Centre',   href: '/admin/status',      icon: HeartPulse,      section: 'status' },
      { label: 'Audit Log',       href: '/admin/audit',       icon: ClipboardList,   section: 'audit' },
    ],
  },
  {
    label: 'Customer Operations',
    items: [
      { label: 'Customer CRM',    href: '/admin/users',       icon: Users,           section: 'customers' },
      { label: 'Security',        href: '/admin/security',    icon: ShieldCheck,     section: 'security' },
      { label: 'Notifications',   href: '/admin/notifications', icon: Mail,          section: 'notifications' },
      { label: 'Data Protection Requests', href: '/admin/gdpr', icon: Shield,        section: 'datarequests' },
      { label: 'System Reports',  href: '/admin/system-reports', icon: AlertTriangle, section: 'systemreports' },
      { label: 'Closure Requests', href: '/admin/closure-requests', icon: Shield,     section: 'closures' },
      { label: 'Contact Enquiries', href: '/admin/enquiries', icon: Mail,            section: 'enquiries' },
      { label: 'Support',         href: '/admin/support',     icon: HeadphonesIcon,  section: 'support' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Admin Users',     href: '/admin/admin-users', icon: UserCog,         section: 'admins' },
      { label: 'Roles',           href: '/admin/roles',       icon: Users,           section: 'roles' },
      { label: 'Sessions',        href: '/admin/sessions',    icon: Clock,           section: 'sessions' },
      { label: 'Experience Builders', href: '/admin/builders', icon: Wrench,         section: 'builders' },
      { label: 'Subscription Plans', href: '/admin/plans',        icon: CreditCard, section: 'plans' },
      { label: 'Builder Usage Tokens', href: '/admin/credits', icon: CircleDollarSign, section: 'credits' },
      { label: 'Customer Usage',  href: '/admin/usage',       icon: BarChart2,       section: 'usage' },
      { label: 'Paid Add-Ons',    href: '/admin/addons',      icon: PackagePlus,     section: 'addons' },
      { label: 'System',          href: '/admin/system',      icon: AlertTriangle,   section: 'system' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Branding',        href: '/admin/branding',      icon: Palette,       section: 'branding' },
      { label: 'Website CMS',     href: '/admin/content',     icon: FileEdit,        section: 'cms' },
      { label: 'Website Pages',   href: '/admin/pages',       icon: Globe,           section: 'cms' },
      { label: 'Legal Policies',  href: '/admin/legal',       icon: FileText,        section: 'cms' },
      { label: 'Affiliate Content', href: '/admin/affiliate-content', icon: Globe,   section: 'affiliate' },
    ],
  },
  {
    label: 'Site Status & Settings',
    items: [
      { label: 'AI Chatbot Control', href: '/admin/ai-chatbot', icon: Bot, section: 'systemsettings' },
      { label: 'Age Verification', href: '/admin/age-verification', icon: BadgeCheck, section: 'systemsettings', badge: '16+' },
      { label: 'Site Status & Settings', href: '/admin/site-settings', icon: Settings, section: 'systemsettings' },
    ],
  },
];

// ── Layout wrapper (inner — has access to theme context) ──────────────────────

interface AdminLayoutInnerProps {
  children: ReactNode;
  title?: string;
}

function AdminLayoutInner({ children, title }: AdminLayoutInnerProps) {
  const { admin, isLoading, logout } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useAdminTheme();
  const branding = useBranding();
  const [pinState, setPinState] = useState<{ loading: boolean; configured: boolean; unlocked: boolean; expiresAt?: string | null; lockedUntil?: string | null; error?: string }>({ loading: true, configured: false, unlocked: false });
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const visibleItems = NAV_GROUPS.flatMap(group => group.items)
    .filter(item => admin && hasPermission(admin, item.section));
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => admin && hasPermission(admin, item.section)),
  })).filter(group => group.items.length > 0);
  const primaryHeaderPaths = [
    '/admin/dashboard',
    '/admin/users',
    '/admin/enquiries',
    '/admin/analytics',
    '/admin/site-settings',
  ];
  const primaryHeaderItems = primaryHeaderPaths
    .map(path => visibleItems.find(item => item.href === path))
    .filter((item): item is NavItem => Boolean(item));
  const currentItem = visibleItems.find(item =>
    location.pathname === item.href ||
    (item.href !== '/admin/dashboard' && location.pathname.startsWith(item.href))
  );
  const currentGroup = NAV_GROUPS.find(group =>
    group.items.some(item => item.href === currentItem?.href)
  );

  async function handleLogout() {
    setAccountMenuOpen(false);
    await logout();
    navigate('/admin', { replace: true });
  }

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeAccountMenu(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function closeAccountMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }
    document.addEventListener('mousedown', closeAccountMenu);
    document.addEventListener('keydown', closeAccountMenuWithKeyboard);
    return () => {
      document.removeEventListener('mousedown', closeAccountMenu);
      document.removeEventListener('keydown', closeAccountMenuWithKeyboard);
    };
  }, [accountMenuOpen]);

  // Redirect to admin login if session is gone (expired or never set)
  useEffect(() => {
    if (!isLoading && !admin) {
      window.location.href = '/admin';
    }
  }, [isLoading, admin]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    fetch('/admin/api?section=adminpin', { credentials: 'include', cache: 'no-store' })
      .then(async response => ({ response, payload: await response.json().catch(() => ({})) as { configured?: boolean; unlocked?: boolean; expiresAt?: string; lockedUntil?: string; error?: string } }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        setPinState({ loading: false, configured: Boolean(payload.configured), unlocked: Boolean(payload.unlocked), expiresAt: payload.expiresAt, lockedUntil: payload.lockedUntil, error: response.ok ? '' : (payload.error || 'Administrator PIN verification is unavailable.') });
      })
      .catch(() => !cancelled && setPinState({ loading: false, configured: false, unlocked: false, error: 'Administrator PIN verification is unavailable.' }));
    return () => { cancelled = true; };
  }, [admin]);

  useEffect(() => {
    if (!pinState.unlocked || !pinState.expiresAt) return;
    const remaining = Date.parse(pinState.expiresAt) - Date.now();
    if (remaining <= 0) { setPinState(current => ({ ...current, unlocked: false, error: 'Your administrator PIN session expired. Enter your PIN again.' })); return; }
    const timer = window.setTimeout(() => setPinState(current => ({ ...current, unlocked: false, error: 'Your administrator PIN session expired. Enter your PIN again.' })), remaining);
    return () => window.clearTimeout(timer);
  }, [pinState.unlocked, pinState.expiresAt]);

  async function submitAdminPin() {
    if (!pinState.configured && pin !== pinConfirm) {
      setPinState(current => ({ ...current, error: 'The PIN confirmation does not match.' }));
      return;
    }
    setPinSubmitting(true);
    try {
      const response = await fetch('/admin/api?section=adminpin', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: pinState.configured ? 'verify' : 'setup', pin }) });
      const payload = await response.json().catch(() => ({})) as { configured?: boolean; unlocked?: boolean; expiresAt?: string; lockedUntil?: string; error?: string };
      if (!response.ok || !payload.unlocked) throw new Error(payload.error || 'The administrator PIN could not be verified.');
      setPin(''); setPinConfirm(''); setPinState({ loading: false, configured: true, unlocked: true, expiresAt: payload.expiresAt });
    } catch (reason) {
      setPinState(current => ({ ...current, error: reason instanceof Error ? reason.message : 'The administrator PIN could not be verified.' }));
    } finally { setPinSubmitting(false); }
  }

  // Show a neutral loading shell while the session is being resolved.
  // This prevents child pages from firing API calls (and showing 401 banners)
  // before we know whether the admin is authenticated.
  if (isLoading || !admin || pinState.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading admin portal…</span>
        </div>
      </div>
    );
  }

  if (!pinState.unlocked) {
    const locked = Boolean(pinState.lockedUntil && Date.parse(pinState.lockedUntil) > Date.now());
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Lock className="h-5 w-5 text-primary" /></div>
          <h1 className="text-xl font-semibold text-slate-950">Administrator security PIN</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{pinState.configured ? 'Enter your personal four-digit PIN to continue after Microsoft sign-in.' : 'Create your personal four-digit PIN. It will protect privileged Admin Portal and customer CRM access.'}</p>
          <label htmlFor="admin-security-pin" className="mt-5 block text-xs font-semibold text-slate-800">Four-digit PIN</label>
          <input id="admin-security-pin" type="password" inputMode="numeric" autoComplete={pinState.configured ? 'current-password' : 'new-password'} maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} disabled={locked} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-xl tracking-[0.5em] text-slate-950 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100" />
          {!pinState.configured && <><label htmlFor="admin-security-pin-confirm" className="mt-3 block text-xs font-semibold text-slate-800">Confirm PIN</label><input id="admin-security-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pinConfirm} onChange={event => setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-xl tracking-[0.5em] text-slate-950 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></>}
          {pinState.error && <p role="alert" className="mt-3 text-xs text-red-700">{pinState.error}</p>}
          {locked && <p role="alert" className="mt-3 text-xs text-amber-700">PIN access is locked until {new Date(pinState.lockedUntil!).toLocaleString('en-GB')}.</p>}
          <button type="button" onClick={() => void submitAdminPin()} disabled={locked || pinSubmitting || pin.length !== 4 || (!pinState.configured && pinConfirm.length !== 4)} className="mt-5 h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">{pinSubmitting ? 'Checking…' : pinState.configured ? 'Unlock Admin Portal' : 'Create PIN and continue'}</button>
          <button type="button" onClick={() => void handleLogout()} className="mt-3 w-full text-xs font-medium text-slate-500 underline">Sign out of Microsoft</button>
          <p className="mt-5 text-[11px] leading-relaxed text-slate-500">Your PIN is personal to you, cannot be displayed by administrators, and does not replace your Microsoft account security.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white text-slate-900 shadow-xl backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to="/admin/dashboard"
            className="flex shrink-0 items-center gap-3"
            aria-label="Planyx Admin Centre dashboard"
          >
            <img
              src={branding.platform_logo_url}
              alt="Planyx"
              className="h-9 w-auto max-w-[148px] object-contain sm:h-10 sm:max-w-[176px]"
            />
            <span className="hidden rounded-full border border-blue-300 bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 shadow-sm sm:inline dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200">
              Admin Centre
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Primary admin navigation">
            {primaryHeaderItems.map(item => {
              const active = location.pathname === item.href ||
                (item.href !== '/admin/dashboard' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <details className="group relative ml-auto lg:ml-0">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">All admin tools</span>
              <ChevronRight className="h-3.5 w-3.5 rotate-90 transition-transform group-open:-rotate-90" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,680px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Admin Centre</p>
                  <p className="text-xs text-slate-500">All authorised tools and settings</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">Secure</span>
              </div>
              <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
                {visibleGroups.map(group => (
                  <section key={group.label}>
                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map(item => {
                        const Icon = item.icon;
                        const active = location.pathname === item.href ||
                          (item.href !== '/admin/dashboard' && location.pathname.startsWith(item.href));
                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                              active ? 'bg-primary text-white' : 'text-slate-650 hover:bg-slate-100 hover:text-slate-950'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                            {item.badge && <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-black ${active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>{item.badge}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </details>

          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={resolvedTheme === 'dark' ? 'Switch Admin Centre to light mode' : 'Switch Admin Centre to dark mode'}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div ref={accountMenuRef} className="relative border-l border-slate-200 pl-3 dark:border-white/15">
            <button
              type="button"
              onClick={() => setAccountMenuOpen(open => !open)}
              className="flex min-h-10 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-300 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-500/15">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{admin.name.charAt(0)}</span>
              </div>
              <div className="hidden max-w-28 md:block">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{admin.name.split(' ')[0]}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Administrator</p>
              </div>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-500 transition-transform dark:text-slate-400 md:block ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {accountMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
              >
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold">{admin.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{admin.email}</p>
                  <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    Administrator
                  </span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/95 transition-colors dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex h-10 w-full max-w-[1600px] items-center gap-2 overflow-x-auto px-4 text-xs sm:px-6 lg:px-8">
            <Link to="/admin/dashboard" className="shrink-0 text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white focus:outline-none focus-visible:underline">
              Admin Centre
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-600" />
            {currentGroup && (
              <>
                <Link
                  to={currentGroup.label === 'Site Status & Settings' ? '/admin/site-settings' : (currentGroup.items[0]?.href || '/admin/dashboard')}
                  className="shrink-0 text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white focus:outline-none focus-visible:underline"
                >
                  {currentGroup.label}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-600" />
              </>
            )}
            {currentItem ? (
              <Link
                to={currentItem.href}
                aria-current="page"
                className="truncate font-semibold text-slate-900 transition hover:text-blue-700 dark:text-white dark:hover:text-blue-300 focus:outline-none focus-visible:underline"
              >
                {currentItem.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-slate-900 dark:text-white">{title || 'Dashboard'}</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white text-slate-700 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr_2fr]">
            <div>
              <img src={branding.platform_logo_url} alt="Planyx" className="h-10 w-auto max-w-[180px] object-contain" />
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Secure administration for the Planyx planning platform.
              </p>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Signed in as {admin.name} · {admin.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Operations</p>
                <div className="space-y-2 text-sm">
                  <Link to="/admin/dashboard" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Dashboard</Link>
                  <Link to="/admin/users" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Customer CRM</Link>
                  <Link to="/admin/enquiries" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Contact enquiries</Link>
                  <Link to="/admin/reports" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Reports</Link>
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Platform</p>
                <div className="space-y-2 text-sm">
                  <Link to="/admin/builders" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Experience builders</Link>
                  <Link to="/admin/content" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Website CMS</Link>
                  <Link to="/admin/pages" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Website pages</Link>
                  <Link to="/admin/legal" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Legal policies</Link>
                  <Link to="/admin/branding" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Branding</Link>
                  <Link to="/admin/site-settings" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Site settings</Link>
                  <Link to="/admin/age-verification" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Age verification</Link>
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Account</p>
                <div className="space-y-2 text-sm">
                  <Link to="/admin/security" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Security</Link>
                  <Link to="/admin/audit" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Audit log</Link>
                  <Link to="/dashboard" className="block text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">Customer dashboard</Link>
                  <button type="button" onClick={() => void handleLogout()} className="block text-left text-red-600 hover:text-red-700">Sign out</button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Planyx Admin Centre</span>
            <span>Restricted to authorised administrators</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  return (
    <AdminLayoutInner title={title}>
      {children}
    </AdminLayoutInner>
  );
}
