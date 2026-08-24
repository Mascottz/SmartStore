// src/components/StoreOnboardingGuard.jsx
// Redirects authenticated users without a store into the onboarding flow.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SplashScreen from './SplashScreen';

export default function StoreOnboardingGuard({ children }) {
  const { loading, store } = useAuth();

  if (loading) return <SplashScreen />;
  if (!store) return <Navigate to="/onboarding" replace />;

  return children;
}
