import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart2,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  FileEdit,
  FileText,
  Globe,
  HeadphonesIcon,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  PackagePlus,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import { useAdmin } from '@/lib/admin-context';
import { hasPermission } from '@/lib/admin-types';
import { useAdminTheme } from '@/lib/admin-theme-context';
import { useBranding } from '@/lib/branding';

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
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, section: 'dashboard' },
      { label: 'Production Health', href: '/admin/health', icon: HeartPulse, section: 'health' },
      { label: 'Operations', href: '/admin/operations', icon: Activity, section: 'operations' },
      { label: 'Analytics', href: '/admin/analytics', icon: BarChart2, section: 'analytics' },
      { label: 'Reports', href: '/admin/reports', icon: FileText, section: 'reports' },
      { label: 'Gate Control Centre', href: '/admin/status', icon: HeartPulse, section: 'status' },
      { label: 'Audit Log', href: '/admin/audit', icon: ClipboardList, section: 'audit' },
    ],
  },
  {
    label: 'Customer Operations',
    items: [
      { label: 'Customer CRM', href: '/admin/users', icon: Users, section: 'customers' },
      { label: 'Security', href: '/admin/security', icon: ShieldCheck, section: 'security' },
      { label: 'Notifications', href: '/admin/notifications', icon: Mail, section: 'notifications' },
      { label: 'Data Protection Requests', href: '/admin/gdpr', icon: Shield, section: 'datarequests' },
      { label: 'System Reports', href: '/admin/system-reports', icon: AlertTriangle, section: 'systemreports' },
      { label: 'Closure Requests', href: '/admin/closure-requests', icon: Shield, section: 'closures' },
      { label: 'Contact Enquiries', href: '/admin/enquiries', icon: Mail, section: 'enquiries' },
      { label: 'Support', href: '/admin/support', icon: HeadphonesIcon, section: 'support' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Admin Users', href: '/admin/admin-users', icon: UserCog, section: 'admins' },
      { label: 'Roles', href: '/admin/roles', icon: Users, section: 'roles' },
      { label: 'Sessions', href: '/admin/sessions', icon: Clock, section: 'sessions' },
      { label: 'Experience Builders', href: '/admin/builders', icon: Wrench, section: 'builders' },
      { label: 'Subscription Plans', href: '/admin/plans', icon: CreditCard, section: 'plans' },
      { label: 'Builder Usage Tokens', href: '/admin/credits', icon: CircleDollarSign, section: 'credits' },
      { label: 'Customer Usage', href: '/admin/usage', icon: BarChart2, section: 'usage' },
      { label: 'Paid Add-Ons', href: '/admin/addons', icon: PackagePlus, section: 'addons' },
      { label: 'System', href: '/admin/system', icon: AlertTriangle, section: 'system' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Branding', href: '/admin/branding', icon: Palette, section: 'branding' },
      { label: 'Website CMS', href: '/admin/content', icon: FileEdit, section: 'cms' },
      { label: 'Website Studio', href: '/admin/pages', icon: Globe, section: 'cms' },
      { label: 'Legal Policies', href: '/admin/legal', icon: FileText, section: 'cms' },
      { label: 'Partner Galleries', href: '/admin/affiliate-content', icon: Globe, section: 'affiliate' },
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

function normalisePath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isActivePath(pathname: string, href: string) {
  const current = normalisePath(pathname);
  const target = normalisePath(href);
  return current === target || (target !== '/admin/dashboard' && current.startsWith(`${target}/`));
}

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AdminLayoutStable({ children, title }: AdminLayoutProps) {
  const { admin, isLoading, logout } = useAdmin();
  const location = useLocation();
  const { resolvedTheme, setTheme } = useAdminTheme();
  const branding = useBranding();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sessionWaitExpired, setSessionWaitExpired] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSessionWaitExpired(true), 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeWithKeyboard);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeWithKeyboard);
    };
  }, [accountMenuOpen]);

  const visibleGroups = useMemo(() => NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => admin && hasPermission(admin, item.section)),
  })).filter(group => group.items.length > 0), [admin]);

  const visibleItems = useMemo(() => visibleGroups.flatMap(group => group.items), [visibleGroups]);
  const primaryHeaderItems = ['/admin/dashboard', '/admin/users', '/admin/enquiries', '/admin/analytics', '/admin/site-settings']
    .map(path => visibleItems.find(item => item.href === path))
    .filter((item): item is NavItem => Boolean(item));
  const currentItem = visibleItems.find(item => isActivePath(location.pathname, item.href));
  const currentGroup = visibleGroups.find(group => group.items.some(item => item.href === currentItem?.href));

  async function handleLogout() {
    setAccountMenuOpen(false);
    await logout();
  }

  if (!admin && isLoading && !sessionWaitExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm">Checking Microsoft administrator session…</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
            <ShieldCheck className="h-6 w-6 text-blue-700" />
          </div>
          <h1 className="text-2xl font-bold text-slate-950">Administrator session required</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            The Admin Centre could not confirm the Microsoft session. The portal has remained securely closed rather than loading indefinitely.
          </p>
          <a href="/admin" className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
            Return to Microsoft sign-in
          </a>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 h-10 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Retry session check
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white text-slate-900 shadow-xl backdrop-blur-xl transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/admin/dashboard" className="flex shrink-0 items-center gap-3" aria-label="Planyx Admin Centre dashboard">
            <img src={branding.platform_logo_url} alt="Planyx" className="h-9 w-auto max-w-[148px] object-contain sm:h-10 sm:max-w-[176px]" />
            <span className="hidden rounded-full border border-blue-300 bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 sm:inline dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200">Admin Centre</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Primary admin navigation">
            {primaryHeaderItems.map(item => {
              const active = isActivePath(location.pathname, item.href);
              return <Link key={item.href} to={item.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'}`} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
            })}
          </nav>

          <details className="group relative ml-auto lg:ml-0">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
              <Menu className="h-4 w-4" /><span className="hidden sm:inline">All admin tools</span><ChevronRight className="h-3.5 w-3.5 rotate-90 transition-transform group-open:-rotate-90" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,680px)] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <div className="mb-3 border-b border-slate-100 pb-3 dark:border-slate-800"><p className="text-sm font-bold">Admin Centre</p><p className="text-xs text-slate-500 dark:text-slate-400">All authorised tools and settings</p></div>
              <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
                {visibleGroups.map(group => <section key={group.label}><p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</p><div className="space-y-0.5">{group.items.map(item => {
                  const Icon = item.icon;
                  const active = isActivePath(location.pathname, item.href);
                  return <Link key={item.href} to={item.href} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${active ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'}`}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span>{item.badge && <span className="ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-700">{item.badge}</span>}</Link>;
                })}</div></section>)}
              </div>
            </div>
          </details>

          <button type="button" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10" aria-label={resolvedTheme === 'dark' ? 'Switch Admin Centre to light mode' : 'Switch Admin Centre to dark mode'}>
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div ref={accountMenuRef} className="relative border-l border-slate-200 pl-3 dark:border-white/15">
            <button type="button" onClick={() => setAccountMenuOpen(open => !open)} className="flex min-h-10 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-white/10" aria-haspopup="menu" aria-expanded={accountMenuOpen}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-300 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-500/15"><span className="text-xs font-bold text-blue-700 dark:text-blue-300">{admin.name.charAt(0)}</span></div>
              <div className="hidden max-w-28 md:block"><p className="truncate text-xs font-semibold">{admin.name.split(' ')[0]}</p><p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Administrator</p></div>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-500 transition-transform md:block ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {accountMenuOpen && <div role="menu" className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl"><div className="border-b border-slate-100 px-4 py-3"><p className="truncate text-sm font-semibold">{admin.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{admin.email}</p></div><button type="button" role="menuitem" onClick={() => void handleLogout()} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sign out</button></div>}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/95 transition-colors dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex h-10 w-full max-w-[1600px] items-center gap-2 overflow-x-auto px-4 text-xs sm:px-6 lg:px-8">
            <Link to="/admin/dashboard" className="shrink-0 text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white">Admin Centre</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {currentGroup && <><span className="shrink-0 text-slate-500 dark:text-slate-400">{currentGroup.label}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" /></>}
            <span className="truncate font-semibold text-slate-900 dark:text-white">{currentItem?.label || title || 'Dashboard'}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>

      <footer className="mt-auto border-t border-slate-200 bg-white text-slate-700 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div><img src={branding.platform_logo_url} alt="Planyx" className="h-8 w-auto max-w-[150px] object-contain" /><p className="mt-2 text-slate-500 dark:text-slate-400">Secure administration for the Planyx planning platform.</p></div>
          <div className="text-slate-500 dark:text-slate-400"><p>Signed in as {admin.name}</p><p>{admin.email}</p></div>
        </div>
      </footer>
    </div>
  );
}
