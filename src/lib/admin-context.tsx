/**
 * Admin authentication context — Microsoft Entra ID only.
 *
 * Authentication is handled entirely by Microsoft. There is no username/password
 * login, no PIN verification, and no password reset in this context.
 *
 * Session flow:
 *  1. User clicks "Sign In" on /admin → redirected to /auth/admin/oidc/start
 *  2. Microsoft authenticates the user and redirects back to /auth/admin/oidc/callback
 *  3. Callback verifies the tenant, extracts identity, creates ja_admin_session cookie
 *  4. On every page load, GET /api/admin/auth/me restores the session from the cookie
 *  5. A same-origin heartbeat records the verified sign-in, linked administrator and activity
 *
 * The session cookie (ja_admin_session) is httpOnly — it cannot be read by JS.
 * localStorage is used only as a fast-read cache for the admin profile so the
 * UI can render immediately without waiting for the /me round-trip.
 *
 * Platform operator: JA Group Services Ltd
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AdminUser {
  email:                 string;
  name:                  string;
  roles:                 string[];
  tid:                   string;
  isSystemAdministrator: boolean;
  authMethod:            'oidc';
  operator:              string;
}

interface AdminContextType {
  admin:     AdminUser | null;
  isLoading: boolean;
  logout:    () => Promise<void>;
}

const CACHE_KEY = 'ja_admin_profile';
const SESSION_TIMEOUT_MS = 6000;

function getCachedAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch { return null; }
}

function setCachedAdmin(admin: AdminUser): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(admin)); } catch { /* ignore */ }
}

function clearCachedAdmin(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

async function recordAdminSession(action: 'heartbeat' | 'logout'): Promise<void> {
  try {
    await fetch('/api/session-heartbeat', {
      method: 'POST',
      credentials: 'include',
      keepalive: action === 'logout',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action }),
    });
  } catch {
    // Authentication must continue even if the audit endpoint is temporarily unavailable.
  }
}

function startAdminMicrosoftLogout(): void {
  window.setTimeout(() => {
    window.location.replace('/admin/logout');
  }, 0);
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(() => getCachedAdmin());
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const cached = getCachedAdmin();
    if (cached) setAdmin(cached);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setLoading(false);
    }, SESSION_TIMEOUT_MS);

    fetch('/api/admin/auth/me', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({ success: false })) as { success: boolean; admin?: AdminUser };
        return { response, payload };
      })
      .then(({ response, payload }) => {
        if (!active) return;
        if (response.ok && payload.success && payload.admin) {
          setCachedAdmin(payload.admin);
          setAdmin(payload.admin);
          void recordAdminSession('heartbeat');
          return;
        }

        // Only clear the cached profile when the server gave a definite authentication answer.
        // Network timeouts and temporary service errors must not lock the whole Admin Centre.
        if (response.status === 401 || response.status === 403) {
          clearCachedAdmin();
          setAdmin(null);
        }
      })
      .catch(error => {
        if (!active || error?.name === 'AbortError') return;
        // Keep the cached administrator during temporary network or service failures.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const logout = useCallback(async () => {
    await recordAdminSession('logout');
    clearCachedAdmin();
    setAdmin(null);
    startAdminMicrosoftLogout();
  }, []);

  return (
    <AdminContext.Provider value={{ admin, isLoading, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
