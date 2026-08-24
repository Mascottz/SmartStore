// src/components/PendingApproval.jsx
import { useState } from 'react';
import { Clock3, LogOut, RefreshCw, ShieldX, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import logo from '/logo-smartstore.png';

export default function PendingApproval() {
  const {
    user,
    storeName,
    approvalStatus,
    refreshMembership,
  } = useAuth();
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();
  const rejected = approvalStatus === 'rejected';

  const checkStatus = async () => {
    setChecking(true);
    try {
      await refreshMembership();
      toast.success('Approval status refreshed');
    } catch (error) {
      toast.error(error.message || 'Could not refresh approval status.');
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await api.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-900 p-7 md:p-10 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-zinc-800">
          <img src={logo} alt="SmartStore NG" className="h-full w-full object-contain" />
        </div>

        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${
            rejected
              ? 'bg-red-500/10 text-red-400'
              : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          {rejected ? (
            <ShieldX className="h-7 w-7" />
          ) : (
            <Clock3 className="h-7 w-7" />
          )}
        </div>

        <h1 className="text-2xl font-bold">
          {rejected ? 'Access request declined' : 'Approval pending'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {rejected
            ? 'The store owner declined this account request. Contact the owner if you believe this was a mistake.'
            : 'Your account is ready, but the store owner needs to approve your request before you can access store data.'}
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-left">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {storeName || 'Your SmartStore'}
              </p>
              <p className="truncate text-xs text-zinc-500">{user?.email}</p>
            </div>
            <span
              className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                rejected
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              {approvalStatus}
            </span>
          </div>
        </div>

        {!rejected && (
          <p className="mt-5 text-xs text-zinc-500">
            You can leave this page open and check again after the owner approves you.
          </p>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={checkStatus}
            disabled={checking}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check status'}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
