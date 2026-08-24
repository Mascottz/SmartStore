// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SplashScreen from './SplashScreen';
import PendingApproval from './PendingApproval';

export default function ProtectedRoute({ children }) {
  const { user, loading, approvalStatus } = useAuth();

  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (approvalStatus === 'pending' || approvalStatus === 'rejected') {
    return <PendingApproval />;
  }

  return children;
}
