// src/context/OwnerExperienceContext.jsx
// Exposes which experience the signed-in owner should get (monitoring vs
// transactional vs the untouched standard app) and lets a subscribed owner
// switch between the two modes. Everyone else always resolves to 'standard'.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  OWNER_MODES,
  clearStoredMode,
  hasOwnerModePlan,
  isMobileViewport,
  readStoredMode,
  resolveOwnerExperience,
  writeStoredMode,
} from '../lib/ownerExperience';

const OwnerExperienceContext = createContext(null);

/** Live device detection: re-renders when the viewport crosses the phone line. */
function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileViewport);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setMobile(e.matches);
    setMobile(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return mobile;
}

export function OwnerExperienceProvider({ children }) {
  const { user, role, plan, storeIsDemo, loading } = useAuth();
  const isMobile = useIsMobile();

  // The owner's stored choice, re-read whenever the signed-in account changes
  // (a shared shop tablet must not inherit the previous user's mode).
  const [storedMode, setStoredMode] = useState(() => readStoredMode(user?.id));
  useEffect(() => {
    setStoredMode(readStoredMode(user?.id));
  }, [user?.id]);

  const experience = useMemo(
    () =>
      resolveOwnerExperience({
        role,
        plan,
        storeIsDemo,
        storedMode,
        isMobile,
      }),
    [role, plan, storeIsDemo, storedMode, isMobile]
  );

  // True for owners on the Owner Mode plan: they get the mode toggle no
  // matter which experience is currently active.
  const ownerHasModes =
    role === 'owner' && hasOwnerModePlan({ plan, storeIsDemo });

  const setMode = useCallback(
    (mode) => {
      if (!OWNER_MODES.includes(mode)) return;
      writeStoredMode(user?.id, mode);
      setStoredMode(mode);
    },
    [user?.id]
  );

  /** Back to device detection: forget the manual choice. */
  const resetMode = useCallback(() => {
    clearStoredMode(user?.id);
    setStoredMode(null);
  }, [user?.id]);

  const value = useMemo(
    () => ({
      // 'standard' | 'monitoring' | 'transactional'
      experience,
      // the active mode, only meaningful when ownerHasModes is true
      mode: experience === 'standard' ? null : experience,
      ownerHasModes,
      deviceDefault: isMobile ? 'monitoring' : 'transactional',
      isMobileDevice: isMobile,
      storedMode,
      setMode,
      resetMode,
      // auth is still resolving; gates show a splash instead of flashing
      loading,
    }),
    [
      experience,
      ownerHasModes,
      isMobile,
      storedMode,
      setMode,
      resetMode,
      loading,
    ]
  );

  return (
    <OwnerExperienceContext.Provider value={value}>
      {children}
    </OwnerExperienceContext.Provider>
  );
}

export function useOwnerExperience() {
  const ctx = useContext(OwnerExperienceContext);
  if (!ctx) {
    throw new Error('useOwnerExperience must be inside OwnerExperienceProvider');
  }
  return ctx;
}
