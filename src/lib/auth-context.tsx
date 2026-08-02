import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loginUser, registerUser,
  refreshCurrentUser, type AuthUser,
} from './document-store';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    company?: string,
    usageType?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

type SessionHeartbeatResponse = {
  success?: boolean;
  access?: 'allowed' | 'denied' | 'review' | 'step_up' | 'unavailable';
  logoutUrl?: string;
  protectionStatus?: 'confirmed' | 'temporarily_unavailable';
};

function protectedDestination(payload: SessionHeartbeatResponse): string {
  const access = payload.access || 'denied';
  const fallback = access === 'step_up'
    ? '/account/verification-required/'
    : '/account/access-restricted/';
  try {
    const candidate = new URL(payload.logoutUrl || fallback, window.location.origin);
    if (candidate.origin !== window.location.origin) return fallback;
    if (!['/account/access-restricted/', '/account/verification-required/'].includes(candidate.pathname)) return fallback;
    return candidate.pathname;
  } catch {
    return fallback;
  }
}

async function recordCustomerSession(action: 'heartbeat' | 'logout'): Promise<boolean> {
  try {
    const response = await fetch('/api/session-heartbeat', {
      method: 'POST',
      credentials: 'include',
      keepalive: action === 'logout',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action }),
    });
    const payload = await response.json().catch(() => ({})) as SessionHeartbeatResponse;

    if (action === 'heartbeat' && payload.access && payload.access !== 'allowed') {
      window.location.replace(protectedDestination(payload));
      return false;
    }

    if (action === 'heartbeat' && response.status === 401) {
      window.location.replace('/sign-in');
      return false;
    }

    // A temporary service or network failure without an explicit Head Office
    // decision is not treated as a restriction. Preserve the current local session
    // and retry on the next focus or scheduled heartbeat.
    if (action === 'heartbeat' && response.status >= 500) return true;

    return response.ok;
  } catch {
    return action === 'heartbeat';
  }
}

function startCustomerMicrosoftLogout(): void {
  // Dashboard layout handlers may still perform a client-side navigation after
  // invoking logout(). Defer the terminal navigation until the click handler has
  // completed so that React cannot cancel the External ID end-session request.
  window.setTimeout(() => {
    window.location.replace('/account/logout');
  }, 0);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshCurrentUser().then(async (serverUser) => {
      if (serverUser) {
        const allowed = await recordCustomerSession('heartbeat');
        if (!allowed) return;
      }
      setUser(serverUser);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const interval = window.setInterval(() => {
      void recordCustomerSession('heartbeat');
    }, 60_000);
    const onFocus = () => { void recordCustomerSession('heartbeat'); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser(email, password);
    if (result.success && result.user) {
      const allowed = await recordCustomerSession('heartbeat');
      if (allowed) setUser(result.user);
    }
    return { success: result.success, error: result.error };
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    company?: string,
    usageType?: string,
  ) => {
    const result = await registerUser(email, password, firstName, lastName, company, usageType);
    if (result.success && result.user) {
      const allowed = await recordCustomerSession('heartbeat');
      if (allowed) setUser(result.user);
    }
    return { success: result.success, error: result.error };
  }, []);

  const logout = useCallback(() => {
    void recordCustomerSession('logout');
    setUser(null);

    // /account/logout revokes only the customer OIDC and legacy customer
    // sessions, clears only customer cookies and redirects to the JA Group
    // Services ID end_session_endpoint. The Admin session remains untouched.
    startCustomerMicrosoftLogout();
  }, []);

  const refreshUser = useCallback(() => {
    void refreshCurrentUser().then(async serverUser => {
      if (serverUser) {
        const allowed = await recordCustomerSession('heartbeat');
        if (!allowed) return;
      }
      setUser(serverUser);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
