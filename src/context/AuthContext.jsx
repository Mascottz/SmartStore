// src/context/AuthContext.jsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, subscribe } from '../lib/backend';
import { getNiche } from '../config/niches';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  // THEME: light | dark
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const refreshMembership = useCallback(async (u) => {
    if (!u) {
      setRole(null);
      setStore(null);
      return;
    }
    try {
      const membership = await api.stores.getMyMembership(u.id);
      if (membership) {
        setStore(membership.store);
        setRole(membership.role);
      } else {
        setStore(null);
        setRole(null);
      }
    } catch (e) {
      console.error('membership load failed', e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const u = await api.auth.getUser();
      if (!mounted) return;
      setUser(u);
      await refreshMembership(u);
      if (mounted) setLoading(false);
    })();

    const unsubAuth = api.auth.onChange(async (u) => {
      setUser(u);
      await refreshMembership(u);
      setLoading(false);
    });

    // refetch store doc when stores change (plan upgrades, onboarding flags)
    const unsubData = subscribe(async (topic) => {
      if (topic === 'stores') {
        const u = await api.auth.getUser();
        await refreshMembership(u);
      }
    });

    return () => {
      mounted = false;
      unsubAuth();
      unsubData();
    };
  }, [refreshMembership]);

  const upgradeToOwner = useCallback(async () => {
    if (!store) return;
    await api.stores.update(store.id, { plan: 'owner' });
  }, [store]);

  const value = useMemo(() => {
    const niche = store ? getNiche(store.type) : getNiche('other');
    return {
      user,
      role,
      store,
      storeId: store?.id || null,
      storeName: store?.name || '',
      storeType: store?.type || '',
      storeIsDemo: Boolean(store?.isDemo),
      plan: store?.plan || 'free',
      niche,
      onboardingCompleted: Boolean(store?.onboarding?.completed),
      firstSaleCompleted: Boolean(store?.onboarding?.firstSaleCompleted),
      loading,
      theme,
      toggleTheme,
      upgradeToOwner,
      refreshMembership: () => refreshMembership(user),
    };
  }, [user, role, store, loading, theme, upgradeToOwner, refreshMembership]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
