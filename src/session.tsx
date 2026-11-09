import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setSessionEndedHandler, tokenStore, type Admin, type Session } from './api';
import { navigate } from './router';

/** Who is signed in. `admin` is undefined while the stored token is being checked. */
interface SessionState {
  admin: Admin | null | undefined;
  /** Why the last session ended, shown on the sign-in page. */
  notice: string | null;
  start: (s: Session) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearNotice: () => void;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null | undefined>(tokenStore.get() ? undefined : null);
  const [notice, setNotice] = useState<string | null>(null);

  const end = useCallback((message: string | null) => {
    tokenStore.clear();
    setAdmin(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    setSessionEndedHandler(() => end('Your session ended. Sign in again.'));
  }, [end]);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return setAdmin(null);
    try {
      setAdmin((await api.me()).admin);
    } catch {
      end(null);
    }
  }, [end]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = useCallback((s: Session) => {
    tokenStore.set(s.token);
    setNotice(null);
    setAdmin(s.admin);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    end(null);
    navigate('/login', { replace: true });
  }, [end]);

  return (
    <Ctx.Provider value={{ admin, notice, start, signOut, refresh, clearNotice: () => setNotice(null) }}>{children}</Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** The signed-in admin (only inside signed-in pages). */
export function useAdmin(): Admin {
  const { admin } = useSession();
  if (!admin) throw new Error('useAdmin without a signed-in admin');
  return admin;
}
