import { lazy, Suspense } from 'react';
import {
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
import { routes, adminRoutes, resellerRoutes } from './routes';
import { AuthProvider } from './lib/auth-context';
import { AdminProvider } from './lib/admin-context';
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
const AdminAgeVerificationPage = lazy(() => import('./pages/admin/age-verification'));

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

const routeTree: RouteObject[] = [
  {
    element: rootElement,
    errorElement,
    children: customerRoutes,
  },
  adminManualsRoute,
  adminAgeVerificationRoute,
  ...adminAuthorityReportingRoutes,
  ...adminRoutes.map(withErrorPage),
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
