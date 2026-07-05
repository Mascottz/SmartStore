// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // Firebase Auth user
  const [role, setRole] = useState(null);        // 'owner' | 'admin' | 'manager' | 'cashier' | null
  const [storeId, setStoreId] = useState(null);  // current store / tenant

  // Store / plan info
  const [plan, setPlan] = useState('free');      // 'free' | 'owner'
  const [planExpiresAt, setPlanExpiresAt] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('');
  const [storeIsDemo, setStoreIsDemo] = useState(false);

  // Full store doc (includes onboarding, plan, etc.)
  const [store, setStore] = useState(null);

  const [loading, setLoading] = useState(true);  // true while we check

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
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

        if (resolvedStoreId) {
          const storeRef = doc(db, 'stores', resolvedStoreId);
          const storeSnap = await getDoc(storeRef);

          if (storeSnap.exists()) {
            const storeData = storeSnap.data();

            setStore(storeData); // keep the full store doc in state

            setStoreName(storeData.name || '');
            setStoreType(storeData.type || '');
            setStoreIsDemo(!!storeData.isDemo);

            const storePlan = storeData.plan || 'free';
            setPlan(storePlan);

            const expiresTs = storeData.planExpiresAt;
            if (expiresTs?.toDate) {
              // Firestore Timestamp -> JS Date
              setPlanExpiresAt(expiresTs.toDate());
            } else {
              setPlanExpiresAt(null);
            }
          } else {
            // No store doc yet
            setStore(null);
            setStoreName('');
            setStoreType('');
            setStoreIsDemo(false);
            setPlan('free');
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
      } catch (err) {
        console.error('Error loading user/store', err);
        setRole('owner');
        setPlan('free');
        setPlanExpiresAt(null);
        setStoreName('');
        setStoreType('');
        setStoreIsDemo(false);
        setStore(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Derived flags from plan + expiry
  const isOwnerActive = useMemo(() => {
    if (plan !== 'owner') return false;
    if (!planExpiresAt) return true; // owner with no expiry set
    return planExpiresAt.getTime() > Date.now();
  }, [plan, planExpiresAt]); // [web:862][web:863]

  const formattedPlanExpiry = useMemo(() => {
    if (!planExpiresAt) return null;
    return planExpiresAt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [planExpiresAt]); // [web:852][web:856][web:858]

  // Call your Render server to create a Monnify checkout
  const upgradeToOwner = async () => {
    if (!storeId) return;

    try {
      const res = await fetch('https://smartstore-bill.onrender.com/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storeId }),
      });

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
    store,          // full store doc
    plan,
    planExpiresAt,
    isOwnerActive,
    formattedPlanExpiry,
    storeName,
    storeType,
    storeIsDemo,
    loading,
    upgradeToOwner,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}