/**
 * Admin Portal Theme Context
 * Separate from the customer-facing ThemeProvider.
 * The selected mode is cached locally and persisted to Admin site settings.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';

export type AdminTheme = 'light' | 'dark' | 'system';

interface AdminThemeContextType {
  theme: AdminTheme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: AdminTheme) => void;
}

const AdminThemeContext = createContext<AdminThemeContextType | null>(null);
const STORAGE_KEY = 'ja_admin_theme';

function validTheme(value: unknown): value is AdminTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

async function loadSavedTheme(): Promise<AdminTheme | null> {
  for (const endpoint of ['/api/site-settings/public', '/site-settings']) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const data = await response.json() as {
        settings?: Record<string, string>;
        browser?: { admin_theme_mode?: string };
      };
      const saved = data.settings?.admin_theme_mode ?? data.browser?.admin_theme_mode;
      if (validTheme(saved)) return saved;
    } catch {
      // Try the next runtime endpoint.
    }
  }
  return null;
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AdminTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(STORAGE_KEY);
    return validTheme(stored) ? stored : 'light';
  });
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith('/admin')) return;

    // A choice made in this browser must win immediately. In particular, the
    // public Admin landing page cannot persist to the protected settings API
    // until Microsoft sign-in has completed.
    const localTheme = localStorage.getItem(STORAGE_KEY);
    if (validTheme(localTheme)) return;

    void loadSavedTheme().then(saved => {
      if (!saved) return;
      setThemeState(saved);
      localStorage.setItem(STORAGE_KEY, saved);
    });
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  function setTheme(next: AdminTheme) {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (!window.location.pathname.startsWith('/admin')) return;
    void fetch('/api/admin/site-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ settings: { admin_theme_mode: next } }),
    }).catch(() => { /* the local preference still remains effective */ });
  }

  useEffect(() => {
    const root = document.getElementById('admin-theme-root');
    if (!root) return;

    const syncTheme = () => {
      const adminRouteActive = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
      const darkActive = adminRouteActive && resolvedTheme === 'dark';
      const lightActive = adminRouteActive && resolvedTheme === 'light';

      root.classList.toggle('dark', darkActive);
      root.classList.toggle('light', lightActive);
      root.dataset.adminTheme = adminRouteActive ? resolvedTheme : 'inactive';

      // Portal content from dialogs, dropdowns, date pickers and command menus
      // is often mounted directly beneath <body>, outside #admin-theme-root.
      // Keep a body marker in sync so those surfaces follow the Admin mode too.
      document.body.classList.toggle('planyx-admin-theme-dark', darkActive);
      document.body.classList.toggle('planyx-admin-theme-light', lightActive);
      document.body.dataset.adminTheme = adminRouteActive ? resolvedTheme : 'inactive';

      // Tailwind's class strategy and the shared header tokens both resolve
      // against the document root. Keep it in step with the Admin wrapper so
      // every Admin surface visibly changes, including the public login page.
      if (adminRouteActive) {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolvedTheme);
        document.documentElement.setAttribute('data-theme', resolvedTheme);
      }
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('popstate', syncTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', syncTheme);
      root.classList.remove('light', 'dark');
      delete root.dataset.adminTheme;
      document.body.classList.remove('planyx-admin-theme-dark', 'planyx-admin-theme-light');
      delete document.body.dataset.adminTheme;
    };
  }, [resolvedTheme]);

  return (
    <AdminThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) throw new Error('useAdminTheme must be used within AdminThemeProvider');
  return context;
}
