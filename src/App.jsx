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

import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import Pricing from './pages/Pricing';
import SplashScreen from './components/SplashScreen';
import StoreOnboardingGuard from './components/StoreOnboardingGuard';
import OnboardingDashboard from './pages/OnboardingDashboard';
import Onboarding from './pages/Onboarding';
import OwnerSettings from './pages/OwnerSettings';

// Mobile‑friendly shell layout
function ShellLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white flex flex-col md:flex-row">
      <div className="w-full md:w-64 flex-shrink-0">
        <Sidebar />
      </div>
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

// Inner app that can use useAuth()
function AppInner() {
  const { loading } = useAuth();

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <>
      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 9999 }}
        toastOptions={{ duration: 3000 }}
      />

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Onboarding flow, NO StoreOnboardingGuard here */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingDashboard />
            </ProtectedRoute>
          }
        />

        {/* Optional: route for the business setup step if you want /onboarding/business */}
        <Route
          path="/onboarding/business"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>

            }
        />

            <Route
  path="/onboarding/inventory"
  element={
    <ProtectedRoute>
      <Inventory />
    </ProtectedRoute>
  }
/>
<Route
  path="/onboarding/pos"
  element={
    <ProtectedRoute>
      <POS />
    </ProtectedRoute>
  }
/>

        {/* Real app shell, guarded by StoreOnboardingGuard */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <StoreOnboardingGuard>
                <ShellLayout />
              </StoreOnboardingGuard>
            </ProtectedRoute>
          }
        >
          <Route path="" element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<SalesHistory />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/expenses" element={<ExpensesReport />} />
          <Route path="reports/voids" element={<VoidReports />} />
          <Route path="team" element={<Team />} />
          <Route path="owner-settings" element={<OwnerSettings />} />
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