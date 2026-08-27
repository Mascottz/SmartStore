// src/context/AuthContext.jsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, subscribe } from '../lib/backend';
import { getNiche } from '../config/niches';
import {
  canAutoJoin,
  clearJoinRequest,
  isJoinRequestFor,
  isPermanentJoinError,
  readJoinRequest,
  saveJoinRequest,
  updateJoinRequest,
} from '../lib/joinRequest';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [store, setStore] = useState(null);
  // Approval state reported by the backend, if this account has a membership
  // row at all.
  const [membershipStatus, setMembershipStatus] = useState(null);
  // A join code typed at signup that has not become a membership yet.
  const [pendingJoin, setPendingJoin] = useState(() => readJoinRequest());
  const [loading, setLoading] = useState(true);

  // Membership lookups overlap by design: sign-in emits an auth event while
  // the login form is still refreshing, and the pub/sub fires again once the
  // join request lands. Without a sequence tag, a stale "no membership"
  // answer that resolves last could wipe the real one.
  const refreshSeq = useRef(0);
  // Prevents two overlapping auto-join attempts from racing.
  const joiningRef = useRef(false);

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

  /**
   * Reload store + role + approval state. Resolves with the membership (or
   * null) so callers can decide what to do next; stale responses are dropped
   * instead of overwriting fresher state.
   */
  const refreshMembership = useCallback(async (target) => {
    const seq = ++refreshSeq.current;
    const u = target ?? (await api.auth.getUser());
    if (!u) {
      if (seq !== refreshSeq.current) return null;
      setRole(null);
      setStore(null);
      setMembershipStatus(null);
      return null;
    }

    try {
      const membership = await api.stores.getMyMembership(u.id);
      if (seq !== refreshSeq.current) return membership || null;
      if (membership) {
        setStore(membership.store);
        setRole(membership.role);
        setMembershipStatus(membership.approvalStatus || 'approved');
        const status = membership.approvalStatus || 'approved';
        // In and approved — the stored code has nothing left to do. Reconcile
        // here (not only at sign-in) so approval while the waiting screen is
        // open clears the request too.
        if (status === 'approved' && isJoinRequestFor(readJoinRequest(), u)) {
          clearJoinRequest();
          setPendingJoin(null);
        }
      } else {
        setStore(null);
        setRole(null);
        setMembershipStatus(null);
      }
      return membership || null;
    } catch (e) {
      if (seq !== refreshSeq.current) return null;
      setStore(null);
      setRole(null);
      setMembershipStatus(null);
      console.error('membership load failed', e);
      return null;
    }
  }, []);

  /** Send (or re-send) a join request for a code. */
  const attemptJoin = useCallback(
    async (target, code) => {
      const cleanCode = String(code || '').trim().toUpperCase();
      if (!target || !cleanCode) {
        return { joined: false, error: new Error('Sign in to join a store.') };
      }
      if (joiningRef.current) return { joined: false, skipped: true };
      joiningRef.current = true;
      try {
        const membership = await api.stores.joinWithCode(
          target.id,
          target.email,
          cleanCode
        );
        // Keep the code around until the owner decides: the waiting screen
        // shows it, and the record's joinedAt stamp stops us from silently
        // re-joining a store that later removed this member.
        const updated = updateJoinRequest({
          joinedAt: new Date().toISOString(),
          attempts: 0,
          error: null,
          permanent: false,
        });
        setPendingJoin(updated);
        await refreshMembership(target);
        return { joined: true, membership };
      } catch (error) {
        const current = readJoinRequest();
        const next = updateJoinRequest({
          attempts: (current?.attempts || 0) + 1,
          error: error?.message || 'Could not send the join request.',
          permanent: isPermanentJoinError(error),
        });
        setPendingJoin(next);
        return { joined: false, error, permanent: isPermanentJoinError(error) };
      } finally {
        joiningRef.current = false;
      }
    },
    [refreshMembership]
  );

  /**
   * Join a store with a code, remembering it first so a failure, a reload or
   * an email confirmation round-trip cannot lose the request.
   */
  const joinStore = useCallback(
    async (code, target) => {
      const who = target ?? user;
      const request = saveJoinRequest({ code, email: who?.email });
      if (!request) {
        return { joined: false, error: new Error('That join code is not valid.') };
      }
      setPendingJoin(request);
      return attemptJoin(who, request.code);
    },
    [attemptJoin, user]
  );

  /** Retry the stored join code by hand from the waiting screen. */
  const retryJoin = useCallback(
    () => attemptJoin(user, readJoinRequest()?.code),
    [attemptJoin, user]
  );

  /** Forget the stored code (used by "start my own store instead"). */
  const dismissJoinRequest = useCallback(() => {
    clearJoinRequest();
    setPendingJoin(null);
  }, []);

  /**
   * If this account has a stored join code but no membership yet, send the
   * request now. This is what turns a login (or a signup that was interrupted
   * by email confirmation, a closed tab, an offline moment) into a pending
   * request without asking the staff member for the code a second time.
   */
  const autoJoinFromStorage = useCallback(
    async (u) => {
      const request = readJoinRequest();
      if (!isJoinRequestFor(request, u) || !canAutoJoin(request)) return null;
      return attemptJoin(u, request.code);
    },
    [attemptJoin]
  );

  useEffect(() => {
    let mounted = true;

    const loadSession = async (u) => {
      if (!mounted) return;
      setUser(u);
      const membership = await refreshMembership(u);
      if (!mounted) return;
      if (u && !membership) {
        // No membership yet: a stored join code belonging to this account is
        // sent automatically (the "join on login" path).
        await autoJoinFromStorage(u);
      }
    };

    (async () => {
      const u = await api.auth.getUser();
      if (!mounted) return;
      await loadSession(u);
      if (mounted) setLoading(false);
    })();

    const unsubAuth = api.auth.onChange(async (u) => {
      await loadSession(u);
      if (mounted) setLoading(false);
    });

    // Refetch membership when store details, roles, or approvals change.
    const unsubData = subscribe(async (topic) => {
      if (['stores', 'team', 'admin'].includes(topic)) {
        const u = await api.auth.getUser();
        await refreshMembership(u);
      }
    });

    return () => {
      mounted = false;
      unsubAuth();
      unsubData();
    };
  }, [refreshMembership, autoJoinFromStorage]);

  const upgradeToOwner = useCallback(async () => {
    if (!store) return;
    await api.stores.update(store.id, { plan: 'owner' });
  }, [store]);

  // A stored code only counts for the account that typed it — shops share
  // tablets, and someone else's queued request must not lock this user out of
  // their own store.
  const myPendingJoin = useMemo(
    () => (isJoinRequestFor(pendingJoin, user) ? pendingJoin : null),
    [pendingJoin, user]
  );

  // An account that asked to join a store but has no membership row yet is
  // still waiting on that store — it must not be treated as a new owner.
  const approvalStatus = membershipStatus ?? (myPendingJoin ? 'pending' : null);

  const value = useMemo(() => {
    const niche = store ? getNiche(store.type) : getNiche('other');
    return {
      user,
      role,
      approvalStatus,
      membershipStatus,
      pendingJoin: myPendingJoin,
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
      joinStore,
      retryJoin,
      dismissJoinRequest,
      refreshMembership: async () => {
        const currentUser = await api.auth.getUser();
        return refreshMembership(currentUser);
      },
    };
  }, [
    user,
    role,
    approvalStatus,
    membershipStatus,
    myPendingJoin,
    store,
    loading,
    theme,
    upgradeToOwner,
    joinStore,
    retryJoin,
    dismissJoinRequest,
    refreshMembership,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
