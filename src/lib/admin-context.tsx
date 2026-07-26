/**
 * Admin authentication context — Microsoft Entra ID only.
 *
 * The Admin document now includes a server-verified bootstrap profile whenever
 * the Microsoft session is valid. React can therefore render the Admin Centre
 * immediately while /api/admin/auth/me verifies the session in the background.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

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
const SESSION_TIMEOUT_MS = 4500;

function isAdminUser(value: unknown): value is AdminUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AdminUser>;
  return typeof candidate.email === 'string'
    && candidate.email.includes('@')
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.roles)
    && candidate.authMethod === 'oidc';
}

function getBootstrappedAdmin(): AdminUser | null {
  if (typeof document === 'undefined') return null;
  try {
    const value = document.querySelector<HTMLMetaElement>('meta[name="planyx-admin-bootstrap"]')?.content;
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    return isAdminUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getCachedAdmin(): AdminUser | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAdminUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getInitialAdmin(): AdminUser | null {
  return getBootstrappedAdmin() || getCachedAdmin();
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
    // Authentication must continue even if audit recording is unavailable.
  }
}

function startAdminMicrosoftLogout(): void {
  window.setTimeout(() => {
    window.location.replace('/admin/logout');
  }, 0);
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const initialAdminRef = useRef<AdminUser | null>(getInitialAdmin());
  const [admin, setAdmin] = useState<AdminUser | null>(initialAdminRef.current);
  const [isLoading, setLoading] = useState<boolean>(!initialAdminRef.current);

  useEffect(() => {
    let active = true;
    const immediateAdmin = getBootstrappedAdmin() || getCachedAdmin();
    if (immediateAdmin) {
      setAdmin(immediateAdmin);
      setLoading(false);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setLoading(false);
    }, SESSION_TIMEOUT_MS);

    fetch('/api/admin/auth/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({ success: false })) as { success: boolean; admin?: AdminUser };
        return { response, payload };
      })
      .then(({ response, payload }) => {
        if (!active) return;
        if (response.ok && payload.success && payload.admin && isAdminUser(payload.admin)) {
          setCachedAdmin(payload.admin);
          setAdmin(payload.admin);
          void recordAdminSession('heartbeat');
          return;
        }

        // Clear the profile only after an authoritative denial. Temporary
        // network, Worker or D1 failures must not freeze the whole portal.
        if (response.status === 401 || response.status === 403) {
          clearCachedAdmin();
          setAdmin(null);
        }
      })
      .catch(error => {
        if (!active || error?.name === 'AbortError') return;
        // Keep a server-bootstrapped or cached administrator during a temporary failure.
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
