// src/App.jsx
import { Routes, Route } from 'react-router-dom';
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

function ShellLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1">
        <Routes>
          {/* All logged-in users (cashier+) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/sales" element={<SalesHistory />} />
            <Route path="/pricing" element={<Pricing />} />
          </Route>

          {/* Manager+ */}
          <Route element={<ProtectedRoute requiredRole="manager" />}>
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/expenses" element={<ExpensesReport />} />
            <Route path="/reports/voids" element={<VoidReports />} />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route path="/team" element={<Team />} />
          </Route>
        </Routes>
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
      {/* Toasts for entire app */}
      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 9999 }}
        toastOptions={{
          duration: 3000,
        }}
      />

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ShellLayout />} />
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