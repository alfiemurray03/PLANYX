import React, { lazy, Suspense } from 'react';
import { RouteObject, Navigate } from 'react-router-dom';
import HomePage from './pages/index';
import ProdNotFoundPage from './pages/_404';
import Spinner from './components/Spinner';
import { useAuth } from './lib/auth-context';
import { useAdmin } from './lib/admin-context';
import { useResellerAuth } from './lib/reseller-auth-context';

const NotFoundPage = ProdNotFoundPage;

// Lazy-loaded customer pages
const LoginPage = lazy(() => import('./pages/login'));
const RegisterPage = lazy(() => import('./pages/register'));
const AuthCallbackPage = lazy(() => import('./pages/auth-callback'));
const AuthLogoutPage = lazy(() => import('./pages/auth-logout'));
const AuthOidcStartPage = lazy(() => import('./pages/auth-oidc-start'));
const DashboardPage = lazy(() => import('./pages/dashboard'));
const BuildersHubPage = lazy(() => import('./pages/builders-hub'));
const ExperienceBuilderPage = lazy(() => import('./pages/experience-builder'));
const PricingPage = lazy(() => import('./pages/pricing'));
const SettingsPage = lazy(() => import('./pages/settings'));
const SupportPage = lazy(() => import('./pages/support'));
const PublicHelpCentrePage = lazy(() => import('./pages/help-centre'));
const PrivacySettingsPage = lazy(() => import('./pages/privacy-settings'));
const TermsPage = lazy(() => import('./pages/terms'));
const PrivacyPage = lazy(() => import('./pages/privacy'));
const CookiesPage = lazy(() => import('./pages/cookies'));
const ComplaintsPage = lazy(() => import('./pages/complaints'));
const AcceptableUsePage = lazy(() => import('./pages/acceptable-use'));
const RefundPolicyPage = lazy(() => import('./pages/refund-policy'));
const ContactPage = lazy(() => import('./pages/contact'));
const DiscoveryPage = lazy(() => import('./pages/discovery'));
const DestinationsPage = lazy(() => import('./pages/destinations'));
const HeadoutPage = lazy(() => import('./pages/partner-discovery').then((module) => ({ default: () => <module.PartnerDiscoveryPage provider="headout" /> })));
const GetYourGuidePage = lazy(() => import('./pages/partner-discovery').then((module) => ({ default: () => <module.PartnerDiscoveryPage provider="getyourguide" /> })));

// Org pages
const OrgMembersPage = lazy(() => import('./pages/org/members'));

// Affiliate pages
const AffiliatePage = lazy(() => import('./pages/affiliate'));
const AffiliateDashboardPage = lazy(() => import('./pages/affiliate/dashboard'));

// Lazy-loaded admin pages
const AdminLoginPage = lazy(() => import('./pages/admin/login'));
const AdminPasswordResetsPage = lazy(() => import('./pages/admin/password-resets'));
const AdminForgotPasswordPage = lazy(() => import('./pages/admin/forgot-password'));
const AdminDashboardPage = lazy(() => import('./pages/admin/dashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/users'));
const AdminCustomerCrmPage = lazy(() => import('./pages/admin/customer-crm'));
const AdminContentPage = lazy(() => import('./pages/admin/content'));
const AdminLegalPage = lazy(() => import('./pages/admin/legal'));
const AdminPagesPage = lazy(() => import('./pages/admin/pages'));
const AdminBuildersPage = lazy(() => import('./pages/admin/builders'));
const AdminSiteSettingsPage = lazy(() => import('./pages/admin/site-settings'));
const AdminAIChatbotPage = lazy(() => import('./pages/admin/ai-chatbot'));
const AdminAtlassianSupportPage = lazy(() => import('./pages/admin/atlassian-support'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/analytics'));
const AdminSupportPage = lazy(() => import('./pages/admin/support'));
const AdminAuditPage = lazy(() => import('./pages/admin/audit'));
const AdminSecurityPage = lazy(() => import('./pages/admin/security'));
const AdminGdprPage = lazy(() => import('./pages/admin/gdpr'));
const AdminSystemPage = lazy(() => import('./pages/admin/system'));
const AdminStripeDiagnosticsPage = lazy(() => import('./pages/admin/stripe-diagnostics'));
const AdminTestToolsPage = lazy(() => import('./pages/admin/test-tools'));
const AdminAffiliatePage = lazy(() => import('./pages/admin/affiliate'));
const AdminSigningPage = lazy(() => import('./pages/admin/signing'));
const AdminResellersPage = lazy(() => import('./pages/admin/resellers'));
const AdminOperationalSectionPage = lazy(() => import('./pages/admin/operational-section'));
const AdminPortalNavPage = lazy(() => import('./pages/admin/portal-nav'));

// Partners + Reseller pages
const PartnersPage = lazy(() => import('./pages/partners/index'));
const ResellerApplyPage = lazy(() => import('./pages/reseller/apply'));
const ResellerLoginPage = lazy(() => import('./pages/reseller/login'));
const ResellerDashboardPage = lazy(() => import('./pages/reseller/index'));
const ResellerCustomersPage = lazy(() => import('./pages/reseller/customers'));
const ResellerReferralsPage = lazy(() => import('./pages/reseller/referrals'));
const ResellerCommissionsPage = lazy(() => import('./pages/reseller/commissions'));
const ResellerResourcesPage = lazy(() => import('./pages/reseller/resources'));
const ResellerSupportPage = lazy(() => import('./pages/reseller/support'));
const ResellerSettingsPage = lazy(() => import('./pages/reseller/settings'));

const SigningDashboardPage = lazy(() => import('./pages/signing/index'));
const SigningNewPage = lazy(() => import('./pages/signing/new'));
const SigningDetailPage = lazy(() => import('./pages/signing/[id]'));
const PublicSignerPage = lazy(() => import('./pages/sign/[token]'));

const SpinnerFallback = () => (
  <div className="flex justify-center items-center h-screen bg-slate-950"><Spinner /></div>
);

function wrap(el: React.ReactElement) {
  return <Suspense fallback={<SpinnerFallback />}>{el}</Suspense>;
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, isLoading } = useAuth();
  if (typeof window === 'undefined') return children;
  if (isLoading) return <SpinnerFallback />;
  if (!user) return <Navigate to="/sign-in" replace />;
  return children;
}

function RedirectIfAuth({ children }: { children: React.ReactElement }) {
  const { user, isLoading } = useAuth();
  if (typeof window === 'undefined') return children;
  if (isLoading) return <SpinnerFallback />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  if (typeof window === 'undefined') return children;
  const { admin, isLoading } = useAdmin();
  if (isLoading) return <SpinnerFallback />;
  if (!admin) return <Navigate to="/admin" replace />;
  return children;
}

function RedirectIfAdmin({ children }: { children: React.ReactElement }) {
  if (typeof window === 'undefined') return children;
  const { admin, isLoading } = useAdmin();
  if (isLoading) return <SpinnerFallback />;
  if (admin) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

function RequireReseller({ children }: { children: React.ReactElement }) {
  const { reseller, isLoading } = useResellerAuth();
  if (typeof window === 'undefined') return children;
  if (isLoading) return <SpinnerFallback />;
  if (!reseller) return <Navigate to="/reseller/login" replace />;
  return children;
}

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/destinations', element: wrap(<DestinationsPage />) },
  { path: '/headout', element: wrap(<HeadoutPage />) },
  { path: '/getyourguide', element: wrap(<GetYourGuidePage />) },
  ...[
    '/destinations/:slug', '/activities', '/experiences', '/booking-partners', '/how-it-works',
    '/plan-your-trip', '/planning-services', '/accommodation', '/transfers', '/local-transport',
    '/travel-documentation-support', '/accessibility-support', '/selected-partner-hotels',
    '/budget-experiences', '/family-experiences', '/couples-experiences', '/about', '/faqs',
  ].map((path) => ({ path, element: wrap(<DiscoveryPage />) })),
  { path: '/login', element: <Navigate to="/" replace /> },
  { path: '/sign-in', element: wrap(<RedirectIfAuth><LoginPage /></RedirectIfAuth>) },
  { path: '/register', element: <Navigate to="/sign-in" replace /> },
  { path: '/auth/oidc/start', element: wrap(<AuthOidcStartPage />) },
  { path: '/auth/callback', element: wrap(<AuthCallbackPage />) },
  { path: '/auth/logout', element: wrap(<AuthLogoutPage />) },
  { path: '/dashboard', element: wrap(<RequireAuth><DashboardPage /></RequireAuth>) },
  { path: '/documents', element: <Navigate to="/builders" replace /> },
  { path: '/documents/audit', element: <Navigate to="/builders" replace /> },
  { path: '/documents/:docId', element: <Navigate to="/builders" replace /> },
  { path: '/builders', element: wrap(<RequireAuth><BuildersHubPage /></RequireAuth>) },
  { path: '/templates', element: <Navigate to="/builders" replace /> },
  { path: '/letter-builder', element: <Navigate to="/builders" replace /> },
  { path: '/email-builder', element: <Navigate to="/builders" replace /> },
  { path: '/email-templates', element: <Navigate to="/builders" replace /> },
  { path: '/invoice-builder', element: <Navigate to="/builders" replace /> },
  { path: '/contract-builder', element: <Navigate to="/builders" replace /> },
  { path: '/policy-builder', element: <Navigate to="/builders" replace /> },
  { path: '/form-builder', element: <Navigate to="/builders" replace /> },
  { path: '/report-builder', element: <Navigate to="/builders" replace /> },
  { path: '/minutes-builder', element: <Navigate to="/builders" replace /> },
  { path: '/proposal-builder', element: <Navigate to="/builders" replace /> },
  { path: '/checklist-builder', element: <Navigate to="/builders" replace /> },
  { path: '/builders/:builderId', element: wrap(<RequireAuth><ExperienceBuilderPage /></RequireAuth>) },
  { path: '/pricing', element: wrap(<PricingPage />) },
  { path: '/plans/free', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/personal', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/standard', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/professional', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/organisation', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/org-starter', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/org-growth', element: <Navigate to="/pricing" replace /> },
  { path: '/plans/org-professional', element: <Navigate to="/pricing" replace /> },
  { path: '/settings', element: wrap(<RequireAuth><SettingsPage /></RequireAuth>) },
  { path: '/help-centre', element: wrap(<PublicHelpCentrePage />) },
  { path: '/support', element: wrap(<RequireAuth><SupportPage /></RequireAuth>) },
  { path: '/privacy-settings', element: wrap(<RequireAuth><PrivacySettingsPage /></RequireAuth>) },
  { path: '/org/members', element: wrap(<RequireAuth><OrgMembersPage /></RequireAuth>) },
  { path: '/forgot-password', element: <Navigate to="/sign-in" replace /> },
  { path: '/reset-password', element: <Navigate to="/sign-in" replace /> },
  { path: '/terms', element: wrap(<TermsPage />) },
  { path: '/privacy', element: wrap(<PrivacyPage />) },
  { path: '/cookies', element: wrap(<CookiesPage />) },
  { path: '/complaints', element: wrap(<ComplaintsPage />) },
  { path: '/acceptable-use', element: wrap(<AcceptableUsePage />) },
  { path: '/refund-policy', element: wrap(<RefundPolicyPage />) },
  { path: '/contact', element: wrap(<ContactPage />) },
  { path: '/affiliate', element: wrap(<AffiliatePage />) },
  { path: '/affiliate/dashboard', element: wrap(<AffiliateDashboardPage />) },
  { path: '/partners', element: wrap(<PartnersPage />) },
  { path: '/reseller/apply', element: wrap(<ResellerApplyPage />) },
  { path: '/signing', element: wrap(<SigningDashboardPage />) },
  { path: '/signing/new', element: wrap(<SigningNewPage />) },
  { path: '/signing/:id', element: wrap(<SigningDetailPage />) },
  { path: '/sign/:token', element: wrap(<PublicSignerPage />) },
  { path: '*', element: <NotFoundPage /> },
];

// Admin routes rendered outside RootLayout (no customer header/footer)
export const adminRoutes: RouteObject[] = [
  { path: '/admin', element: wrap(<RedirectIfAdmin><AdminLoginPage /></RedirectIfAdmin>) },
  { path: '/admin/forgot-password', element: wrap(<AdminForgotPasswordPage />) },
  { path: '/admin/setup', element: <Navigate to="/admin" replace /> },
  { path: '/admin/dashboard', element: wrap(<RequireAdmin><AdminDashboardPage /></RequireAdmin>) },
  { path: '/admin/users', element: wrap(<RequireAdmin><AdminUsersPage /></RequireAdmin>) },
  { path: '/admin/users/:email', element: wrap(<RequireAdmin><AdminCustomerCrmPage /></RequireAdmin>) },
  { path: '/admin/subscriptions', element: <Navigate to="/admin/users" replace /> },
  { path: '/admin/templates', element: <Navigate to="/admin/builders" replace /> },
  { path: '/admin/content', element: wrap(<RequireAdmin><AdminContentPage /></RequireAdmin>) },
  { path: '/admin/legal', element: wrap(<RequireAdmin><AdminLegalPage /></RequireAdmin>) },
  { path: '/admin/pages', element: wrap(<RequireAdmin><AdminPagesPage /></RequireAdmin>) },
  { path: '/admin/builders', element: wrap(<RequireAdmin><AdminBuildersPage /></RequireAdmin>) },
  { path: '/admin/site-settings', element: wrap(<RequireAdmin><AdminSiteSettingsPage /></RequireAdmin>) },
  { path: '/admin/ai-chatbot', element: wrap(<RequireAdmin><AdminAIChatbotPage /></RequireAdmin>) },
  { path: '/admin/atlassian-support', element: wrap(<RequireAdmin><AdminAtlassianSupportPage /></RequireAdmin>) },
  { path: '/admin/analytics', element: wrap(<RequireAdmin><AdminAnalyticsPage /></RequireAdmin>) },
  { path: '/admin/support', element: wrap(<RequireAdmin><AdminSupportPage /></RequireAdmin>) },
  { path: '/admin/audit', element: wrap(<RequireAdmin><AdminAuditPage /></RequireAdmin>) },
  { path: '/admin/security', element: wrap(<RequireAdmin><AdminSecurityPage /></RequireAdmin>) },
  { path: '/admin/gdpr', element: wrap(<RequireAdmin><AdminGdprPage /></RequireAdmin>) },
  { path: '/admin/system', element: wrap(<RequireAdmin><AdminSystemPage /></RequireAdmin>) },
  { path: '/admin/stripe-diagnostics', element: wrap(<RequireAdmin><AdminStripeDiagnosticsPage /></RequireAdmin>) },
  { path: '/admin/password-resets', element: wrap(<RequireAdmin><AdminPasswordResetsPage /></RequireAdmin>) },
  { path: '/admin/test-tools', element: wrap(<RequireAdmin><AdminTestToolsPage /></RequireAdmin>) },
  { path: '/admin/affiliate', element: wrap(<RequireAdmin><AdminAffiliatePage /></RequireAdmin>) },
  { path: '/admin/signing', element: wrap(<RequireAdmin><AdminSigningPage /></RequireAdmin>) },
  { path: '/admin/resellers', element: wrap(<RequireAdmin><AdminResellersPage /></RequireAdmin>) },
  { path: '/admin/portal-nav', element: wrap(<RequireAdmin><AdminPortalNavPage /></RequireAdmin>) },
  ...[
    '/admin/health', '/admin/operations', '/admin/reports', '/admin/status',
    '/admin/notifications', '/admin/system-reports', '/admin/closure-requests',
    '/admin/enquiries', '/admin/admin-users', '/admin/roles', '/admin/sessions',
    '/admin/credits', '/admin/usage', '/admin/addons', '/admin/plans',
    '/admin/branding', '/admin/affiliate-content',
  ].map(path => ({ path, element: wrap(<RequireAdmin><AdminOperationalSectionPage /></RequireAdmin>) })),
];

export const resellerRoutes: RouteObject[] = [
  { path: '/reseller/login', element: wrap(<ResellerLoginPage />) },
  { path: '/reseller', element: wrap(<RequireReseller><ResellerDashboardPage /></RequireReseller>) },
  { path: '/reseller/customers', element: wrap(<RequireReseller><ResellerCustomersPage /></RequireReseller>) },
  { path: '/reseller/referrals', element: wrap(<RequireReseller><ResellerReferralsPage /></RequireReseller>) },
  { path: '/reseller/commissions', element: wrap(<RequireReseller><ResellerCommissionsPage /></RequireReseller>) },
  { path: '/reseller/resources', element: wrap(<RequireReseller><ResellerResourcesPage /></RequireReseller>) },
  { path: '/reseller/support', element: wrap(<RequireReseller><ResellerSupportPage /></RequireReseller>) },
  { path: '/reseller/settings', element: wrap(<RequireReseller><ResellerSettingsPage /></RequireReseller>) },
];

export type Path =
  | '/'
  | '/login'
  | '/sign-in'
  | '/register'
  | '/dashboard'
  | '/documents'
  | '/builders'
  | '/pricing'
  | '/settings'
  | '/admin'
  | '/admin/dashboard';

export type Params = Record<string, string | undefined>;
