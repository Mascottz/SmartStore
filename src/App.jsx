// src/App.jsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet, Navigate, useNavigationType } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Login from './components/Login';
import PendingApproval from './components/PendingApproval';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import StoreOnboardingGuard from './components/StoreOnboardingGuard';
import { MainAppGate, MonitoringGate } from './components/OwnerExperienceGates';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import SmartAssistant from './components/SmartAssistant';
import { isInstalledPwa } from './lib/pwa';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OwnerExperienceProvider, useOwnerExperience } from './context/OwnerExperienceContext';

// Lazy-load pages so the initial bundle stays small
const Landing = lazy(() => import('./pages/Landing'));
const Demo = lazy(() => import('./pages/Demo'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const POS = lazy(() => import('./pages/POS'));
const SalesHistory = lazy(() => import('./pages/SalesHistory'));
const CreditBook = lazy(() => import('./pages/CreditBook'));
const Reports = lazy(() => import('./pages/Reports'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ExpensesReport = lazy(() => import('./pages/ExpensesReport'));
const Team = lazy(() => import('./pages/Team'));
const VoidReports = lazy(() => import('./pages/VoidReports'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OwnerSettings = lazy(() => import('./pages/OwnerSettings'));
const AdminApprovals = lazy(() => import('./pages/AdminApprovals'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const PublicInfo = lazy(() => import('./pages/PublicInfo'));

// Pharmacy Mode (Phase 2): prescriptions with part-dispensing, suppliers
// and recorded deliveries.
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Purchases = lazy(() => import('./pages/Purchases'));

// The owner's monitoring app (/m): mobile-first, no POS register.
const OwnerMobileLayout = lazy(() => import('./mobile/OwnerMobileLayout'));
const MobileDashboard = lazy(() => import('./mobile/MobileDashboard'));
const MobileInventory = lazy(() => import('./mobile/MobileInventory'));
const MobileSales = lazy(() => import('./mobile/MobileSales'));
const MobileCreditBook = lazy(() => import('./mobile/MobileCreditBook'));
const MobileReports = lazy(() => import('./mobile/MobileReports'));
const MobileMore = lazy(() => import('./mobile/MobileMore'));

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
        <SmartAssistant />
      </main>
    </div>
  );
}

function RootRoute() {
  const { user, approvalStatus, store } = useAuth();
  const { experience, loading } = useOwnerExperience();
  // 'POP' is how the router reports a *fresh open* of the site (typed URL,
  // bookmark, link from another app, installed-PWA launch, page reload).
  // In-app navigations are 'PUSH' / 'REPLACE' and keep the app routing below.
  const navigationType = useNavigationType();

  // Installed app launch (home-screen icon, desktop window): never the
  // marketing page. Sign-in comes first; onboarding is only ever reached
  // after an explicit login, never as a launch destination. A signed-in
  // owner with a ready store goes straight to work.
  if (isInstalledPwa() && navigationType === 'POP') {
    if (approvalStatus === 'pending' || approvalStatus === 'rejected') {
      return <PendingApproval />;
    }
    if (user && store) {
      // Two-way owner app: a monitoring owner's "straight to work" is the
      // monitoring app, not the register app.
      return <Navigate to={experience === 'monitoring' ? '/m' : '/dashboard'} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  // Browser fresh open: the landing page, even for visitors with a saved
  // session. They reach the app through the page's "Open App" call to
  // action (an in-app navigation), so nothing is lost; the direct
  // /dashboard, /pos, ... links keep working as before too.
  if (navigationType === 'POP') {
    return (
      <Suspense fallback={<SplashScreen />}>
        <Landing />
      </Suspense>
    );
  }

  // Approval takes precedence over every other authenticated route. In
  // particular, a pending staff member must not be sent to onboarding just
  // because their membership already includes a store.
  if (approvalStatus === 'pending' || approvalStatus === 'rejected') {
    return <PendingApproval />;
  }

  if (!user) {
    return (
      <Suspense fallback={<SplashScreen />}>
        <Landing />
      </Suspense>
    );
  }

  if (!store) return <Navigate to="/onboarding" replace />;

  // Owners on the two-way plan: the resolved mode decides where home is.
  // Monitoring owners live in the /m app; everyone else keeps /dashboard.
  if (!loading && experience === 'monitoring') return <Navigate to="/m" replace />;
  return <Navigate to="/dashboard" replace />;
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
      <PwaInstallPrompt />

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/demo"
          element={
            <Suspense fallback={<SplashScreen />}>
              <Demo />
            </Suspense>
          }
        />
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<SplashScreen />}>
              <PublicInfo page="privacy" />
            </Suspense>
          }
        />
        <Route
          path="/terms"
          element={
            <Suspense fallback={<SplashScreen />}>
              <PublicInfo page="terms" />
            </Suspense>
          }
        />
        <Route
          path="/help"
          element={
            <Suspense fallback={<SplashScreen />}>
              <PublicInfo page="help" />
            </Suspense>
          }
        />
        <Route
          path="/contact"
          element={
            <Suspense fallback={<SplashScreen />}>
              <PublicInfo page="contact" />
            </Suspense>
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute>
              <Suspense fallback={<SplashScreen />}>
                <SuperAdmin />
              </Suspense>
            </ProtectedRoute>
          }
        />

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

        {/* Main app: requires auth AND a store. Owners in monitoring mode are
            redirected to the /m app; the POS and checkout stay out of reach. */}
        <Route
          element={
            <ProtectedRoute>
              <StoreOnboardingGuard>
                <MainAppGate>
                  <ShellLayout />
                </MainAppGate>
              </StoreOnboardingGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/credit" element={<CreditBook />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/voids" element={<VoidReports />} />
          <Route path="/reports/expenses" element={<ExpensesReport />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/team" element={<Team />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/owner-settings" element={<OwnerSettings />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
        </Route>

        {/* Owner monitoring app: strictly monitoring, no POS/checkout. Only
            exists for owners whose resolved mode is monitoring. */}
        <Route
          path="/m"
          element={
            <ProtectedRoute>
              <StoreOnboardingGuard>
                <MonitoringGate>
                  <Suspense fallback={<SplashScreen />}>
                    <OwnerMobileLayout />
                  </Suspense>
                </MonitoringGate>
              </StoreOnboardingGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<MobileDashboard />} />
          <Route path="inventory" element={<MobileInventory />} />
          <Route path="sales" element={<MobileSales />} />
          <Route path="credit" element={<MobileCreditBook />} />
          <Route path="reports" element={<MobileReports />} />
          <Route path="more" element={<MobileMore />} />
          {/* Deeper monitoring screens reuse the full pages inside the
              mobile shell (they are already responsive on their own). */}
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports/voids" element={<VoidReports />} />
          <Route path="reports/expenses" element={<ExpensesReport />} />
          <Route path="team" element={<Team />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="owner-settings" element={<OwnerSettings />} />
          <Route path="pricing" element={<Pricing />} />
        </Route>

        {/* Catch-all: return visitors to the marketing page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OwnerExperienceProvider>
          <AppInner />
        </OwnerExperienceProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
