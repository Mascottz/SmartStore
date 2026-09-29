// src/components/OwnerExperienceGates.jsx
// Route-level enforcement of the two-way owner app.
//
// MainAppGate    wraps the standard (transactional) app shell. An owner who is
//                in monitoring mode can never open it — even by typing /pos —
//                and is redirected to the matching monitoring screen instead.
//                Staff and free-plan owners pass straight through, untouched.
// MonitoringGate wraps the /m monitoring app. It only exists for owners in
//                monitoring mode; anyone else is sent to the standard app.
import { Navigate, useLocation } from 'react-router-dom';
import { useOwnerExperience } from '../context/OwnerExperienceContext';
import { mobilePathFor } from '../lib/ownerExperience';
import SplashScreen from './SplashScreen';

export function MainAppGate({ children }) {
  const { experience, loading } = useOwnerExperience();
  const location = useLocation();

  if (loading) return <SplashScreen />;
  if (experience === 'monitoring') {
    return <Navigate to={mobilePathFor(location.pathname)} replace />;
  }
  return children;
}

export function MonitoringGate({ children }) {
  const { experience, loading } = useOwnerExperience();

  if (loading) return <SplashScreen />;
  if (experience !== 'monitoring') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
