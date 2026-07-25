import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SplashScreen from './SplashScreen';

export default function StoreOnboardingGuard({ children }) {
  const { store, loading, onboardingCompleted } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SplashScreen />;
  }

  if (location.pathname.startsWith('/onboarding')) {
    return children;
  }

  if (!store) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}