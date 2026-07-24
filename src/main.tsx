import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { installChunkRecovery } from './lib/chunk-recovery';
import { installBrowserBranding } from './lib/browser-branding';
import { installPwaSupport } from './lib/pwa';
import './styles/globals.css';
import './styles/accessibility-controls.css';
import './styles/admin-polish.css';
import './styles/admin-dark.css';
import './styles/admin-mobile.css';
import './styles/admin-pin-gate.css';
import './styles/chatbot-admin-fixes.css';
import './styles/pdf-document.css';

installChunkRecovery();
installBrowserBranding();
installPwaSupport();

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

const tree = (
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}
