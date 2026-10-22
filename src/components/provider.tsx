'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onIdTokenChanged, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
const Context = createContext<{
  user: User | null;
  ready: boolean;
  facilitator: boolean;
  offset: number;
  error: string;
}>({ user: null, ready: false, facilitator: false, offset: 0, error: '' });
export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    user: null as User | null,
    ready: false,
    facilitator: false,
    offset: 0,
    error: '',
  });
  useEffect(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('wow-draft-')) {
          const draft = JSON.parse(localStorage.getItem(key) || '{}');
          if (!draft.expiresAt || draft.expiresAt <= Date.now()) localStorage.removeItem(key);
        }
      }
    } catch {}
  }, []);
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        try {
          if (!user) {
            await fetch('/api/auth', { method: 'DELETE' });
            setState({ user: null, ready: true, facilitator: false, offset: 0, error: '' });
            return;
          }
          const token = await user.getIdTokenResult();
          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (response.status === 401) {
            await signOut(auth);
            return;
          }
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setState({
            user,
            ready: true,
            facilitator: token.claims.facilitator === true,
            offset: result.serverNow - Date.now(),
            error: '',
          });
        } catch {
          setState({
            user: null,
            ready: true,
            facilitator: false,
            offset: 0,
            error: 'Tidak dapat bersambung ke bengkel. Semak internet dan muat semula.',
          });
        }
      }),
    [],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useIdentity() {
  return useContext(Context);
}
