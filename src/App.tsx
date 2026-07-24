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
const AdminManualsPage = lazy(() => import('./pages/admin/manuals'));

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

const retainedCustomerRoutes = routes.filter(route => !['/', '/pricing', '/support', '/help-centre'].includes(String(route.path || '')));
const customerRoutes: RouteObject[] = [
  { path: '/', element: <StandardBusinessHomePage /> },
  { path: '/home', element: <StandardBusinessHomePage /> },
  { path: '/plans', element: <StandardBusinessPlansPage /> },
  { path: '/pricing', element: <StandardBusinessPlansPage /> },
  { path: '/support', element: <PublicHelpCentrePage /> },
  { path: '/help-centre', element: <PublicHelpCentrePage /> },
  ...retainedCustomerRoutes,
];

const errorElement = <RouteErrorPage />;
const withErrorPage = (route: RouteObject): RouteObject => ({
  ...route,
  errorElement: route.errorElement ?? errorElement,
});

const routeTree: RouteObject[] = [
  {
    element: rootElement,
    errorElement,
    children: customerRoutes,
  },
  ...adminRoutes.map(withErrorPage),
  ...resellerRoutes.map(withErrorPage),
];

const router = createBrowserRouter(routeTree);

function isDirectAdminManualsPage() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/+$/, '') === '/admin/manuals';
}

export default function App() {
  const directAdminManuals = isDirectAdminManualsPage();

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
                      <Suspense fallback={<SpinnerFallback />}>
                        {directAdminManuals ? <AdminManualsPage /> : <RouterProvider router={router} />}
                      </Suspense>
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
