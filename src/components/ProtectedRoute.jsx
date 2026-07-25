// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Let AppInner show the main splash; we just block render here
    return null;
  }

  if (!user) {
    // Not signed in → go to login, remember intent
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (requiredRole) {
    // simple role hierarchy: admin > manager > cashier
    const rank = { owner: 3, admin: 3, manager: 2, cashier: 1 };
    const userRank = rank[role] || 1;
    const requiredRank = rank[requiredRole] || 1;

    if (userRank < requiredRank) {
      return <Navigate to="/" replace />;
    }
  }

  // We are authenticated (and role is OK), render the wrapped content
  return children;
}