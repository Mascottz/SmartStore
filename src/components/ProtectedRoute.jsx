// src/components/ProtectedRoute.jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ requiredRole }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">
          Checking your access…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    // simple role hierarchy: admin > manager > cashier
   const rank = { owner: 3, admin: 3, manager: 2, cashier: 1 };
    const userRank = rank[role] || 1;
    const requiredRank = rank[requiredRole] || 1;

    if (userRank < requiredRank) {
      // Not enough permission
      return <Navigate to="/" replace />;
    }
  }

  return <Outlet />;
}