// src/App.jsx
import { Routes, Route, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import SalesHistory from './pages/SalesHistory';
import Reports from './pages/Reports';
import Expenses from './pages/Expenses';
import ExpensesReport from './pages/ExpensesReport';
import Team from './pages/Team';
import VoidReports from './pages/VoidReports';
import Pricing from './pages/Pricing';
import Onboarding from './pages/Onboarding';
import OwnerSettings from './pages/OwnerSettings';

import ProtectedRoute from './components/ProtectedRoute';
import StoreOnboardingGuard from './components/StoreOnboardingGuard';
import SplashScreen from './components/SplashScreen';
import { AuthProvider, useAuth } from './context/AuthContext';

// Mobile-friendly shell layout
function ShellLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white flex flex-col md:flex-row">
      <div className="w-full md:w-72 flex-shrink-0">
        <Sidebar />
      </div>
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function AppInner() {
  const { loading } = useAuth();

  if (loading) return <SplashScreen />;

  return (
    <>
      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 9999 }}
        toastOptions={{ duration: 3000 }}
      />

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Onboarding flow (no store required yet) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Main app: requires auth AND a store */}
        <Route
          element={
            <ProtectedRoute>
              <StoreOnboardingGuard>
                <ShellLayout />
              </StoreOnboardingGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/voids" element={<VoidReports />} />
          <Route path="/reports/expenses" element={<ExpensesReport />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/team" element={<Team />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/owner-settings" element={<OwnerSettings />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
