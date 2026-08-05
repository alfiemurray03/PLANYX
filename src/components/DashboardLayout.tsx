/**
 * DashboardLayout — Customer portal shell.
 *
 * Sidebar structure is driven by DEFAULT_PORTAL_NAV (src/lib/portal-nav.ts),
 * merged with admin visibility overrides fetched from /api/portal-nav.
 * Sections are collapsible; active state is derived from the current route.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  // General
  FileText, LayoutDashboard, FolderOpen, BookOpen, Settings, LogOut,
  Menu, X, ChevronDown, ChevronRight, Plus, CreditCard, Users,
  MessageSquare, Shield, Lock, Pen, Star, Archive, Trash2, Clock,
  Heart, Share2,
  // Core builders
  Mail, Receipt, FileSignature, ClipboardList, BarChart2, Briefcase,
  CheckSquare, PenLine,
  // Business builders
  FileQuestion, Calculator, ShoppingCart, TrendingUp, FolderKanban,
  Target, Handshake, UserCheck, Truck,
  // Governance builders
  CalendarDays, Vote, Bell, Building, Package, Users2, UserCog, Database,
  // HR builders
  ClipboardCheck, FileCheck, BookMarked, GraduationCap, UserPlus,
  Star as StarIcon, BookOpenCheck, AlertTriangle, MessageCircle,
  // Compliance builders
  ShieldCheck, Globe, Search, AlertOctagon, Wrench, FileWarning,
  HeartHandshake, Scale,
  // Education builders
  Award, PenSquare, BookCopy, Presentation, BookType, Layers,
  // Charity builders
  ClipboardSignature, Medal, HandHeart, Building2, Gift, Flag, CalendarCheck,
  // Signing
  PenTool, Send, Hourglass, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';
import type { PlanId } from '@/lib/plan-config';
import { customerPlanLabel } from '@/lib/customer-plan';
import {
  DEFAULT_PORTAL_NAV,
  applyPortalNavOverrides,
  type PortalNavSection,
  type PortalNavOverrides,
} from '@/lib/portal-nav';

// ── Icon map — keyed by nav item id ──────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  // Dashboard
  'nav-dashboard':                      LayoutDashboard,
  // Documents
  'nav-my-documents':                   FolderOpen,
  'nav-recent-documents':               Clock,
  'nav-drafts':                         FileText,
  'nav-completed':                      CheckCircle2,
  'nav-shared':                         Share2,
  'nav-favourites':                     Heart,
  'nav-archive':                        Archive,
  'nav-trash':                          Trash2,
  // Builders hub
  'nav-builders-hub':                   BookOpen,
  // Core builders
  'nav-letter-builder':                 PenLine,
  'nav-email-builder':                  Mail,
  'nav-invoice-builder':                Receipt,
  'nav-contract-builder':               FileSignature,
  'nav-policy-builder':                 Shield,
  'nav-form-builder':                   ClipboardList,
  'nav-report-builder':                 BarChart2,
  'nav-minutes-builder':                Users,
  'nav-proposal-builder':               Briefcase,
  'nav-checklist-builder':              CheckSquare,
  // Business builders
  'nav-quote-builder':                  FileQuestion,
  'nav-estimate-builder':               Calculator,
  'nav-purchase-order-builder':         ShoppingCart,
  'nav-business-plan-builder':          TrendingUp,
  'nav-project-plan-builder':           FolderKanban,
  'nav-action-plan-builder':            Target,
  'nav-service-agreement-builder':      Handshake,
  'nav-consultancy-agreement-builder':  UserCheck,
  'nav-supplier-agreement-builder':     Truck,
  // Governance builders
  'nav-agenda-builder':                 CalendarDays,
  'nav-resolution-builder':             Vote,
  'nav-meeting-notice-builder':         Bell,
  'nav-board-minutes-builder':          Building,
  'nav-board-pack-builder':             Package,
  'nav-shareholder-resolution-builder': Users2,
  'nav-director-resolution-builder':    UserCog,
  'nav-company-record-builder':         Database,
  // HR builders
  'nav-job-description-builder':        ClipboardCheck,
  'nav-employment-contract-builder':    FileCheck,
  'nav-offer-letter-builder':           BookMarked,
  'nav-staff-handbook-builder':         BookOpenCheck,
  'nav-recruitment-pack-builder':       UserPlus,
  'nav-appraisal-builder':              StarIcon,
  'nav-training-record-builder':        GraduationCap,
  'nav-disciplinary-letter-builder':    AlertTriangle,
  'nav-grievance-letter-builder':       MessageCircle,
  // Compliance builders
  'nav-privacy-policy-builder':         ShieldCheck,
  'nav-gdpr-builder':                   Globe,
  'nav-dpia-builder':                   Search,
  'nav-risk-assessment-builder':        AlertOctagon,
  'nav-method-statement-builder':       Wrench,
  'nav-incident-report-builder':        FileWarning,
  'nav-health-safety-policy-builder':   HeartHandshake,
  'nav-complaints-procedure-builder':   MessageSquare,
  'nav-equality-policy-builder':        Scale,
  // Education builders
  'nav-certificate-builder':            Award,
  'nav-assessment-builder':             PenSquare,
  'nav-workbook-builder':               BookCopy,
  'nav-lesson-plan-builder':            Presentation,
  'nav-course-builder':                 BookType,
  'nav-course-outline-builder':         Layers,
  'nav-training-certificate-builder':   GraduationCap,
  // Charity & Membership builders
  'nav-membership-form-builder':        ClipboardSignature,
  'nav-membership-certificate-builder': Medal,
  'nav-volunteer-agreement-builder':    HandHeart,
  'nav-trustee-minutes-builder':        Building2,
  'nav-grant-application-builder':      Gift,
  'nav-charity-policy-builder':         Flag,
  'nav-event-plan-builder':             CalendarCheck,
  // Signing
  'nav-document-signing':               PenTool,
  'nav-signature-requests':             Send,
  'nav-awaiting-signatures':            Hourglass,
  'nav-completed-signatures':           CheckCircle2,
  'nav-audit-history':                  Shield,
  // Account
  'nav-organisation':                   Building2,
  'nav-team-members':                   Users,
  'nav-branding':                       Star,
  'nav-billing':                        CreditCard,
  'nav-settings':                       Settings,
  'nav-support':                        MessageSquare,
};

// Section IDs that are collapsed by default (to keep sidebar manageable)
const DEFAULT_COLLAPSED = new Set([
  'business-builders',
  'governance-builders',
  'hr-builders',
  'compliance-builders',
  'education-builders',
  'charity-builders',
]);

// ── Portal nav hook ───────────────────────────────────────────────────────────

function usePortalNav() {
  const [sections, setSections] = useState<PortalNavSection[]>(DEFAULT_PORTAL_NAV);

  useEffect(() => {
    fetch('/api/portal-nav', { credentials: 'include' })
      .then(r => r.json() as Promise<{ success: boolean; sections?: PortalNavSection[]; overrides?: PortalNavOverrides }>)
      .then(data => {
        if (data.success && data.overrides) {
          setSections(applyPortalNavOverrides(DEFAULT_PORTAL_NAV, data.overrides));
        }
      })
      .catch(() => {
        // Silently fall back to defaults
      });
  }, []);

  return sections;
}

// ── Sidebar nav section component ────────────────────────────────────────────

interface NavSectionProps {
  section: PortalNavSection;
  pathname: string;
  onNavigate: () => void;
  initiallyOpen: boolean;
}

function NavSection({ section, pathname, onNavigate, initiallyOpen }: NavSectionProps) {
  const hasActive = section.items.some(
    item => pathname === item.href || pathname.startsWith(item.href.split('?')[0] + '/'),
  );
  const [open, setOpen] = useState(initiallyOpen || hasActive);

  // Open section if a child becomes active (e.g. on navigation)
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
          hasActive
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-expanded={open}
      >
        <span>{section.label}</span>
        <ChevronRight
          className={cn('w-3 h-3 transition-transform shrink-0', open && 'rotate-90')}
          aria-hidden="true"
        />
      </button>

      {/* Items */}
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map(item => {
            const Icon = ICON_MAP[item.id] ?? FileText;
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' &&
                pathname.startsWith(item.href.split('?')[0]));
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarContentProps {
  sections: PortalNavSection[];
  pathname: string;
  onNavigate: () => void;
  user: { firstName: string; lastName: string; email: string; plan?: string; planIsLifetime?: boolean } | null;
  onLogout: () => void;
}

function SidebarContent({ sections, pathname, onNavigate, user, onLogout }: SidebarContentProps) {
  const planBadgeColor: Record<string, string> = {
    free:         'bg-muted text-muted-foreground',
    personal:     'bg-emerald-100 text-emerald-700',
    standard:     'bg-blue-100 text-blue-700',
    professional: 'bg-primary/10 text-primary',
    org_starter:  'bg-amber-100 text-amber-700',
    org_growth:   'bg-amber-100 text-amber-700',
    org_professional: 'bg-amber-100 text-amber-700',
  };
  const planBadgeClass = planBadgeColor[user?.plan ?? 'free'] ?? planBadgeColor['free'];
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U';

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">

      {/* Logo */}
      <div className="p-4 border-b border-border shrink-0">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5"
          aria-label="Sousa Murray Planeia — dashboard"
          onClick={onNavigate}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20" aria-hidden="true">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground leading-tight">Sousa Murray Planeia</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Guided Planning</div>
          </div>
        </Link>
      </div>

      {/* New Document button */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <Button asChild className="w-full gap-2" size="sm">
          <Link to="/builders" onClick={onNavigate}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Plan
          </Link>
        </Button>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-1" aria-label="Customer portal navigation">
          {sections.map(section => (
            <NavSection
              key={section.id}
              section={section}
              pathname={pathname}
              onNavigate={onNavigate}
              initiallyOpen={!DEFAULT_COLLAPSED.has(section.id)}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* User footer */}
      <div className="p-3 border-t border-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs" aria-hidden="true">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-semibold text-foreground truncate">
                  {user?.firstName} {user?.lastName}
                </div>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', planBadgeClass)}>
                  {customerPlanLabel(user?.plan, user?.planIsLifetime)}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52 mb-1">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings" onClick={onNavigate}>
                <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/support" onClick={onNavigate}>
                <MessageSquare className="w-4 h-4 mr-2" aria-hidden="true" />
                Support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/privacy-settings" onClick={onNavigate}>
                <Shield className="w-4 h-4 mr-2" aria-hidden="true" />
                Privacy & Data
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings#billing" onClick={onNavigate}>
                <CreditCard className="w-4 h-4 mr-2" aria-hidden="true" />
                Membership & Billing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface DashboardLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function DashboardLayout({ children, noPadding: _noPadding }: DashboardLayoutProps) {
  const { user, logout, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sections = usePortalNav();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !user) {
      navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [isLoading, user, navigate, location.pathname]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  const handleNavigate = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="profile-theme min-h-screen bg-background flex">
      <a href="#dashboard-main" className="skip-nav">Skip to main content</a>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex w-64 flex-col border-r border-border bg-card shrink-0 fixed inset-y-0 left-0 z-30"
        aria-label="Sidebar navigation"
      >
        <SidebarContent
          sections={sections}
          pathname={location.pathname}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative w-72 flex flex-col z-10 h-full"
            aria-label="Sidebar navigation"
          >
            <div className="absolute top-3 right-3 z-20">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent
              sections={sections}
              pathname={location.pathname}
              onNavigate={handleNavigate}
              user={user}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        {/* Mobile header */}
        <header
          className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl px-4 py-3 flex items-center gap-3"
          role="banner"
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-muted"
            aria-label="Open sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex-1 font-bold text-foreground text-sm">Sousa Murray Planeia</div>

          <NotificationBell />

          {/* Top-bar user menu (desktop) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 hover:bg-muted rounded-md px-2 py-1.5 transition-colors"
                aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
              >
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs" aria-hidden="true">
                    {`${user.firstName[0]}${user.lastName[0]}`.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:block">{user.firstName}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/support">
                  <MessageSquare className="w-4 h-4 mr-2" aria-hidden="true" />
                  Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/privacy-settings">
                  <Shield className="w-4 h-4 mr-2" aria-hidden="true" />
                  Privacy & Data
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings#billing">
                  <CreditCard className="w-4 h-4 mr-2" aria-hidden="true" />
                  Membership & Billing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main id="dashboard-main" className="flex-1 overflow-auto flex flex-col" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
