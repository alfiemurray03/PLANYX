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
  access?: 'allowed' | 'denied' | 'review';
  reason?: string;
  logoutUrl?: string;
};

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
    if (action === 'heartbeat' && (!response.ok || payload.access === 'denied' || payload.access === 'review')) {
      const destination = new URL(payload.logoutUrl || '/account/access-restricted/', window.location.origin);
      if (payload.reason) destination.searchParams.set('reason', payload.reason.slice(0, 500));
      destination.searchParams.set('decision', payload.access || (response.status === 503 ? 'review' : 'deny'));
      window.location.replace(`${destination.pathname}${destination.search}`);
      return false;
    }
    return response.ok;
  } catch {
    if (action === 'heartbeat') {
      const destination = new URL('/account/access-restricted/', window.location.origin);
      destination.searchParams.set('decision', 'review');
      destination.searchParams.set('reason', 'Head Office customer protection could not confirm access.');
      window.location.replace(`${destination.pathname}${destination.search}`);
    }
    return false;
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
