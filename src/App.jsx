// src/App.jsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import StoreOnboardingGuard from './components/StoreOnboardingGuard';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import { AuthProvider, useAuth } from './context/AuthContext';

// Lazy-load pages so the initial bundle stays small
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const POS = lazy(() => import('./pages/POS'));
const SalesHistory = lazy(() => import('./pages/SalesHistory'));
const Reports = lazy(() => import('./pages/Reports'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ExpensesReport = lazy(() => import('./pages/ExpensesReport'));
const Team = lazy(() => import('./pages/Team'));
const VoidReports = lazy(() => import('./pages/VoidReports'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OwnerSettings = lazy(() => import('./pages/OwnerSettings'));

// Mobile-friendly shell layout
function ShellLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white flex flex-col md:flex-row">
      <div className="w-full md:w-72 flex-shrink-0">
        <Sidebar />
      </div>
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <Suspense fallback={<SplashScreen />}>
          <Outlet />
        </Suspense>
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
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '16px',
            background: 'var(--toast-bg, #18181b)',
            color: 'var(--toast-color, #fff)',
            fontSize: '14px',
          },
        }}
      />
      <OfflineBanner />

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Onboarding flow (no store required yet) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Suspense fallback={<SplashScreen />}>
                <Onboarding />
              </Suspense>
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

        {/* Catch-all: redirect to dashboard */}
        <Route path="*" element={<Login />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
