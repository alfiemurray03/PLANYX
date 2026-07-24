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

function recordCustomerSession(action: 'heartbeat' | 'logout'): void {
  void fetch('/api/session-heartbeat', {
    method: 'POST',
    credentials: 'include',
    keepalive: action === 'logout',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action }),
  }).catch(() => {
    // Customer access must continue if security-audit storage is temporarily unavailable.
  });
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
    refreshCurrentUser().then((serverUser) => {
      setUser(serverUser);
      if (serverUser) recordCustomerSession('heartbeat');
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser(email, password);
    if (result.success && result.user) {
      setUser(result.user);
      recordCustomerSession('heartbeat');
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
      setUser(result.user);
      recordCustomerSession('heartbeat');
    }
    return { success: result.success, error: result.error };
  }, []);

  const logout = useCallback(() => {
    recordCustomerSession('logout');
    setUser(null);

    // /account/logout revokes only the customer OIDC and legacy customer
    // sessions, clears only customer cookies and redirects to the JA Group
    // Services ID end_session_endpoint. The Admin session remains untouched.
    startCustomerMicrosoftLogout();
  }, []);

  const refreshUser = useCallback(() => {
    void refreshCurrentUser().then(serverUser => {
      setUser(serverUser);
      if (serverUser) recordCustomerSession('heartbeat');
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
