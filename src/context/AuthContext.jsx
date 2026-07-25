// src/context/AuthContext.jsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [storeId, setStoreId] = useState(null);

  const [plan, setPlan] = useState('free');
  const [planExpiresAt, setPlanExpiresAt] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('');
  const [storeIsDemo, setStoreIsDemo] = useState(false);

  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  // THEME: light | dark
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('theme') || 'dark';
  });

  // Sync theme with <html> class and localStorage
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    let storeUnsub = null;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log(
        'onAuthStateChanged fired',
        firebaseUser ? `uid=${firebaseUser.uid}` : 'user=null'
      );

      setUser(firebaseUser);

      if (!firebaseUser) {
        setRole(null);
        setStoreId(null);
        setPlan('free');
        setPlanExpiresAt(null);
        setStoreName('');
        setStoreType('');
        setStoreIsDemo(false);
        setStore(null);

        if (storeUnsub) {
          storeUnsub();
          storeUnsub = null;
        }

        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);

        let resolvedRole = 'owner';
        let resolvedStoreId = null;

        if (snap.exists()) {
          const data = snap.data();
          resolvedRole = data.role || 'owner';
          resolvedStoreId = data.storeId || null;
        }

        setRole(resolvedRole);
        setStoreId(resolvedStoreId);

        if (storeUnsub) {
          storeUnsub();
          storeUnsub = null;
        }

        if (resolvedStoreId) {
          const storeRef = doc(db, 'stores', resolvedStoreId);

          storeUnsub = onSnapshot(
            storeRef,
            (storeSnap) => {
              if (storeSnap.exists()) {
                const storeData = storeSnap.data();

                setStore(storeData);
                setStoreName(storeData.name || '');
                setStoreType(storeData.type || '');
                setStoreIsDemo(!!storeData.isDemo);

                const storePlan = storeData.plan || 'free';
                setPlan(storePlan);

                const expiresTs = storeData.planExpiresAt;
                if (expiresTs?.toDate) {
                  setPlanExpiresAt(expiresTs.toDate());
                } else {
                  setPlanExpiresAt(null);
                }
              } else {
                setStore(null);
                setStoreName('');
                setStoreType('');
                setStoreIsDemo(false);
                setPlan('free');
                setPlanExpiresAt(null);
              }

              setLoading(false);
            },
            (err) => {
              console.error('Store onSnapshot error', err);
              setStore(null);
              setStoreName('');
              setStoreType('');
              setStoreIsDemo(false);
              setPlan('free');
              setPlanExpiresAt(null);
              setLoading(false);
            }
          );
        } else {
          setStore(null);
          setStoreName('');
          setStoreType('');
          setStoreIsDemo(false);
          setPlan('free');
          setPlanExpiresAt(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading user/store', err);
        setRole('owner');
        setPlan('free');
        setPlanExpiresAt(null);
        setStoreName('');
        setStoreType('');
        setStoreIsDemo(false);
        setStore(null);
        setLoading(false);
      }
    });

    return () => {
      unsub();
      if (storeUnsub) {
        storeUnsub();
      }
    };
  }, []);

  const isOwnerActive = useMemo(() => {
    if (plan !== 'owner') return false;
    if (!planExpiresAt) return true;
    return planExpiresAt.getTime() > Date.now();
  }, [plan, planExpiresAt]);

  const formattedPlanExpiry = useMemo(() => {
    if (!planExpiresAt) return null;
    return planExpiresAt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [planExpiresAt]);

  // Onboarding derived flags
  const onboarding = store?.onboarding || {};
  const storeProfileDone = onboarding.storeProfileDone === true;
  const categoriesDone = onboarding.categoriesDone === true;
  const firstProductAdded = onboarding.firstProductAdded === true;
  const firstSaleCompleted = onboarding.firstSaleCompleted === true;

  const onboardingCompleted =
    storeProfileDone &&
    categoriesDone &&
    firstProductAdded;

  const upgradeToOwner = async () => {
    if (!storeId) return;
    try {
      const res = await fetch(
        'https://smartstore-bill.onrender.com/create-checkout',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storeId }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error('Create checkout failed:', data);
        alert('Could not start payment. Please try again.');
        return;
      }

      if (!data.checkoutUrl) {
        alert('Payment link not available. Please contact support.');
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error('upgradeToOwner error:', err);
      alert('Could not start payment. Please try again.');
    }
  };

  const value = {
    user,
    role,
    storeId,
    store,
    plan,
    planExpiresAt,
    isOwnerActive,
    formattedPlanExpiry,
    storeName,
    storeType,
    storeIsDemo,
    loading,
    upgradeToOwner,
    // onboarding flags
    storeProfileDone,
    categoriesDone,
    firstProductAdded,
    firstSaleCompleted,
    onboardingCompleted,
    // theme
    theme,
    toggleTheme,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}