// src/components/PendingApproval.jsx
// The "Approval pending" screen. A staff member lands here straight after
// signup — or after logging in while a join code from a previous, interrupted
// signup is still stored — and sees the store code the request is waiting on.
// If the code was wrong they can enter a different one; if they were never
// joining a store at all, they can clear the request and start their own.
import { useState } from 'react';
import { Clock3, KeyRound, LogOut, RefreshCw, ShieldX, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import { isValidJoinCode } from '../lib/validate';
import logo from '/logo-smartstore.png';

export default function PendingApproval() {
  const {
    user,
    storeName,
    approvalStatus,
    membershipStatus,
    pendingJoin,
    refreshMembership,
    retryJoin,
    joinStore,
    dismissJoinRequest,
  } = useAuth();
  const [checking, setChecking] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const navigate = useNavigate();

  const rejected = approvalStatus === 'rejected';
  const hasMembership = Boolean(membershipStatus);
  const joinCode = pendingJoin?.code || '';

  const checkStatus = async () => {
    setChecking(true);
    try {
      // If the request never reached the backend (interrupted signup, an
      // offline moment), "check" re-sends it instead of only re-reading the
      // status.
      if (!hasMembership && joinCode) {
        const result = await retryJoin();
        if (result?.joined) toast.success('Join request sent to the store owner');
      }
      await refreshMembership();
      toast.success('Approval status refreshed');
    } catch (error) {
      toast.error(error.message || 'Could not refresh approval status.');
    } finally {
      setChecking(false);
    }
  };

  const submitNewCode = async (event) => {
    event.preventDefault();
    const code = newCode.trim().toUpperCase();
    if (!isValidJoinCode(code)) {
      return toast.error('Join code must be 6 characters (letters and numbers).');
    }
    setChecking(true);
    try {
      const result = await joinStore(code);
      if (result?.joined) {
        toast.success('Request sent to the store owner for approval');
        setEditingCode(false);
        setNewCode('');
      } else {
        toast.error(result?.error?.message || 'Could not join with that code.');
      }
    } catch (error) {
      toast.error(error.message || 'Could not join with that code.');
    } finally {
      setChecking(false);
    }
  };

  const startOwnStore = () => {
    dismissJoinRequest();
    toast('Join request cleared — set up your own store', { icon: '🏪' });
    navigate('/onboarding', { replace: true });
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

          {joinCode && (
            <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
              <KeyRound className="h-4 w-4 shrink-0 text-zinc-500" />
              <span>Store join code</span>
              <span className="ml-auto font-mono text-sm font-bold tracking-widest text-emerald-400">
                {joinCode}
              </span>
            </div>
          )}
        </div>

        {pendingJoin?.error && !rejected && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-xs leading-5 text-red-300">
            {pendingJoin.error}
            {pendingJoin.permanent
              ? ' Check the code with your store owner and try again below.'
              : ' We will keep trying automatically.'}
          </p>
        )}

        {!hasMembership && !rejected && (
          <div className="mt-4 text-left">
            {editingCode ? (
              <form onSubmit={submitNewCode} className="flex gap-2">
                <input
                  autoFocus
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="e.g. 8G2KQP"
                  aria-label="Store join code"
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono uppercase tracking-widest text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={checking}
                  className="shrink-0 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  Join
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingCode(true)}
                className="text-xs font-medium text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-300"
              >
                Entered the wrong code? Use a different one
              </button>
            )}
          </div>
        )}

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

        {!hasMembership && !rejected && (
          <button
            type="button"
            onClick={startOwnStore}
            className="mt-4 text-xs text-zinc-600 underline decoration-zinc-800 underline-offset-4 hover:text-zinc-400"
          >
            Not joining a store? Set up your own business
          </button>
        )}
      </div>
    </div>
  );
}
