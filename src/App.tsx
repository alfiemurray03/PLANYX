import { lazy, Suspense } from 'react';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';

import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import RouteErrorPage from '@/components/RouteErrorPage';
import AccessibilityRuntime from '@/components/AccessibilityRuntime';
import AdminKeyboardShortcuts from '@/components/AdminKeyboardShortcuts';
import AdminSupportLauncher from '@/components/AdminSupportLauncher';
import RootLayout from './layouts/RootLayout';
import Spinner from './components/Spinner';
import AdminDashboardPage from './pages/admin/dashboard';
import { routes, adminRoutes, resellerRoutes } from './routes';
import { AuthProvider } from './lib/auth-context';
import { AdminProvider, useAdmin } from './lib/admin-context';
import { ThemeProvider } from './lib/theme-context';
import { AdminThemeProvider } from './lib/admin-theme-context';
import { FeatureConfigProvider } from './lib/feature-config-context';
import { SiteSettingsProvider } from './lib/site-settings-context';
import { ResellerAuthProvider } from './lib/reseller-auth-context';
import AIHelpChatbot from '@/components/AIHelpChatbot';
import './styles/accessibility-global.css';

const StandardBusinessHomePage = lazy(() => import('./pages/home'));
const StandardBusinessPlansPage = lazy(() => import('./pages/plans'));
const PublicHelpCentrePage = lazy(() => import('./pages/help-centre'));
const YoungPersonSafetyPage = lazy(() => import('./pages/young-person-safety'));
const AdminManualsPage = lazy(() => import('./pages/admin/manuals'));
const AdminAuthorityReportingRoutePage = lazy(() => import('./pages/admin/authority-reporting-route'));
const AdminAgeVerificationPage = lazy(() => import('./pages/admin/age-verification-route'));

const CookieBanner = lazy(() =>
  import('@/components/CookieBanner').catch((error) => {
    console.warn('Failed to load CookieBanner:', error);
    return { default: () => null };
  })
);

const SpinnerFallback = () => (
  <div className="flex justify-center py-8 h-screen items-center" role="status" aria-live="polite" aria-label="Loading Planyx">
    <Spinner />
    <span className="sr-only">Loading Planyx…</span>
  </div>
);

function AdminDashboardEntry() {
  const { admin, isLoading } = useAdmin();

  // A server-bootstrapped or cached Microsoft administrator must be allowed to
  // render immediately. Background verification must never cover the dashboard
  // with the legacy full-screen spinner.
  if (admin) return <AdminDashboardPage />;

  if (!isLoading) return <Navigate to="/admin" replace />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-xl font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">P</div>
        <h1 className="text-2xl font-bold">Confirming Microsoft administrator session</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Planyx is checking the secure Microsoft session. This page will not remain on an unexplained loading spinner.
        </p>
        <a
          href="/admin/login?return_to=%2Fadmin%2Fdashboard%2F"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Continue with Microsoft
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 h-10 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Retry session check
        </button>
      </section>
    </main>
  );
}

const rootElement = (
  <Suspense fallback={<SpinnerFallback />}>
    <RootLayout>
      <Outlet />
    </RootLayout>
  </Suspense>
);

const retainedCustomerRoutes = routes.filter(route => !['/', '/pricing', '/support', '/help-centre', '/safety'].includes(String(route.path || '')));
const customerRoutes: RouteObject[] = [
  { path: '/', element: <StandardBusinessHomePage /> },
  { path: '/home', element: <StandardBusinessHomePage /> },
  { path: '/plans', element: <StandardBusinessPlansPage /> },
  { path: '/pricing', element: <StandardBusinessPlansPage /> },
  { path: '/support', element: <PublicHelpCentrePage /> },
  { path: '/help-centre', element: <PublicHelpCentrePage /> },
  { path: '/safety', element: <YoungPersonSafetyPage /> },
  { path: '/young-person-safety', element: <YoungPersonSafetyPage /> },
  ...retainedCustomerRoutes,
];

const errorElement = <RouteErrorPage />;
const withErrorPage = (route: RouteObject): RouteObject => ({
  ...route,
  errorElement: route.errorElement ?? errorElement,
});

const adminManualsRoute: RouteObject = {
  path: '/admin/manuals',
  element: (
    <Suspense fallback={<SpinnerFallback />}>
      <AdminManualsPage />
    </Suspense>
  ),
  errorElement,
};

const adminAgeVerificationRoute: RouteObject = {
  path: '/admin/age-verification',
  element: (
    <Suspense fallback={<SpinnerFallback />}>
      <AdminAgeVerificationPage />
    </Suspense>
  ),
  errorElement,
};

const adminAuthorityReportingRoutes: RouteObject[] = ['/admin/authority-reporting', '/admin/reports'].map(path => ({
  path,
  element: (
    <Suspense fallback={<SpinnerFallback />}>
      <AdminAuthorityReportingRoutePage />
    </Suspense>
  ),
  errorElement,
}));

const directAdminDashboardRoute: RouteObject = {
  path: '/admin/dashboard',
  element: <AdminDashboardEntry />,
  errorElement,
};

const remainingAdminRoutes = adminRoutes
  .filter(route => String(route.path || '') !== '/admin/dashboard')
  .map(withErrorPage);

const routeTree: RouteObject[] = [
  {
    element: rootElement,
    errorElement,
    children: customerRoutes,
  },
  directAdminDashboardRoute,
  adminManualsRoute,
  adminAgeVerificationRoute,
  ...adminAuthorityReportingRoutes,
  ...remainingAdminRoutes,
  ...resellerRoutes.map(withErrorPage),
];

const router = createBrowserRouter(routeTree);

export default function App() {
  return (
    <SiteSettingsProvider>
      <ThemeProvider>
        <AuthProvider>
          <AdminProvider>
            <AdminThemeProvider>
              <div id="admin-theme-root">
                <FeatureConfigProvider>
                  <ResellerAuthProvider>
                    <>
                      <AccessibilityRuntime />
                      <RouterProvider router={router} />
                      <AdminKeyboardShortcuts />
                      <AdminSupportLauncher />
                      <CookieBannerErrorBoundary>
                        <Suspense fallback={null}>
                          <CookieBanner />
                        </Suspense>
                      </CookieBannerErrorBoundary>
                      <AIHelpChatbot />
                    </>
                  </ResellerAuthProvider>
                </FeatureConfigProvider>
              </div>
            </AdminThemeProvider>
          </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </SiteSettingsProvider>
  );
}
