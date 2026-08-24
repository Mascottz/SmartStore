// src/pages/SuperAdmin.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { fmtDate } from '../lib/format';
import logo from '/logo-smartstore.png';

const EMPTY_DASHBOARD = { stats: {}, users: [], stores: [] };
const STATUS_STYLES = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-300 border-red-500/20',
  unassigned: 'bg-zinc-500/10 text-zinc-400 border-zinc-700',
};

export default function SuperAdmin() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.getDashboard();
      setDashboard({
        stats: result?.stats || {},
        users: result?.users || [],
        stores: result?.stores || [],
      });
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message || 'Could not load system data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unlocked =
      sessionStorage.getItem('smartstore-super-admin-unlocked') === 'true';
    if (!unlocked) {
      navigate('/login', { replace: true });
      return;
    }
    loadDashboard();
  }, [loadDashboard, navigate]);

  const visibleUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return dashboard.users.filter((user) => {
      const matchesStatus =
        statusFilter === 'all' || user.approvalStatus === statusFilter;
      const matchesQuery =
        !term ||
        user.email?.toLowerCase().includes(term) ||
        user.storeName?.toLowerCase().includes(term) ||
        user.role?.toLowerCase().includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [dashboard.users, query, statusFilter]);

  const visibleStores = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return dashboard.stores;
    return dashboard.stores.filter(
      (store) =>
        store.name?.toLowerCase().includes(term) ||
        store.type?.toLowerCase().includes(term) ||
        store.plan?.toLowerCase().includes(term)
    );
  }, [dashboard.stores, query]);

  const updateApproval = async (user, status) => {
    if (!user.membershipId) return;
    setBusyId(user.membershipId);
    try {
      await api.admin.updateApproval(user.membershipId, status);
      toast.success(
        status === 'approved'
          ? `${user.email} approved`
          : `${user.email} rejected`
      );
      await loadDashboard();
    } catch (updateError) {
      toast.error(updateError.message || 'Could not update approval status.');
    } finally {
      setBusyId(null);
    }
  };

  const exitAdmin = () => {
    sessionStorage.removeItem('smartstore-super-admin-unlocked');
    navigate('/login', { replace: true });
  };

  const stats = dashboard.stats;
  const statCards = [
    ['Total users', stats.totalUsers || 0, Users, 'text-sky-400', 'bg-sky-500/10'],
    ['Stores', stats.totalStores || 0, Building2, 'text-violet-400', 'bg-violet-500/10'],
    ['Pending', stats.pendingUsers || 0, Clock3, 'text-amber-400', 'bg-amber-500/10'],
    ['Approved', stats.approvedUsers || 0, CheckCircle2, 'text-emerald-400', 'bg-emerald-500/10'],
    ['Rejected', stats.rejectedUsers || 0, XCircle, 'text-red-400', 'bg-red-500/10'],
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 md:px-8">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
            <img src={logo} alt="SmartStore NG" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">SmartStore Control Centre</p>
            <p className="flex items-center gap-1 text-[11px] font-medium text-violet-400">
              <ShieldCheck className="h-3 w-3" /> Super Admin
            </p>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={exitAdmin}
            className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 md:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            System administration
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Platform overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Monitor stores and accounts across SmartStore, and resolve pending access requests.
          </p>
        </div>

        {error ? (
          <div className="mb-7 rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="font-semibold text-red-300">Admin data unavailable</p>
                <p className="mt-1 text-sm text-red-200/70">{error}</p>
                {api.kind === 'supabase' && (
                  <p className="mt-2 text-xs text-zinc-400">
                    The signed-in Supabase account must have app_metadata.role set to super_admin.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={loadDashboard}
                className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {statCards.map(([label, value, Icon, colour, background]) => (
            <div
              key={label}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${background}`}>
                <Icon className={`h-4.5 w-4.5 ${colour}`} />
              </div>
              <p className="mt-4 text-2xl font-bold">{loading ? '—' : value}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex rounded-xl bg-zinc-900 p-1">
            {[
              ['overview', 'Overview'],
              ['users', 'Users'],
              ['stores', 'Stores'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setQuery('');
                }}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  tab === value
                    ? 'bg-violet-500 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'overview' && (
            <label className="relative block md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <span className="sr-only">Search system records</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === 'users' ? 'Search users or stores...' : 'Search stores...'}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500"
              />
            </label>
          )}
        </div>

        {tab === 'overview' && (
          <OverviewPanel dashboard={dashboard} loading={loading} setTab={setTab} />
        )}
        {tab === 'users' && (
          <UsersPanel
            users={visibleUsers}
            loading={loading}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            busyId={busyId}
            updateApproval={updateApproval}
          />
        )}
        {tab === 'stores' && <StoresPanel stores={visibleStores} loading={loading} />}
      </main>
    </div>
  );
}

function OverviewPanel({ dashboard, loading, setTab }) {
  const pending = dashboard.users.filter((user) => user.approvalStatus === 'pending');
  const newestStores = dashboard.stores.slice(0, 5);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 lg:col-span-3">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="font-semibold">Pending access requests</h2>
            <p className="text-xs text-zinc-500">Accounts requiring review</p>
          </div>
          <button
            type="button"
            onClick={() => setTab('users')}
            className="text-xs font-semibold text-violet-400 hover:text-violet-300"
          >
            View all users
          </button>
        </div>
        <div className="divide-y divide-zinc-800">
          {loading ? (
            <LoadingRows count={3} />
          ) : pending.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-3 text-sm font-semibold">Approval queue is clear</p>
              <p className="mt-1 text-xs text-zinc-500">There are no pending users.</p>
            </div>
          ) : (
            pending.slice(0, 6).map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.email}</p>
                  <p className="truncate text-xs text-zinc-500">{user.storeName || 'No store'}</p>
                </div>
                <span className="text-xs text-zinc-500">{fmtDate(user.joinedAt)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 lg:col-span-2">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="font-semibold">Newest stores</h2>
          <p className="text-xs text-zinc-500">Recent platform registrations</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {loading ? (
            <LoadingRows count={3} />
          ) : newestStores.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">No stores yet.</p>
          ) : (
            newestStores.map((store) => (
              <div key={store.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                  <Store className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{store.name}</p>
                  <p className="text-xs capitalize text-zinc-500">{store.type} · {store.plan}</p>
                </div>
                <span className="text-xs text-zinc-500">{store.memberCount || 0} users</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 lg:col-span-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">System operational</h2>
            <p className="text-xs text-zinc-500">
              {dashboard.stats.totalMembers || 0} store memberships are currently registered.
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Healthy
          </span>
        </div>
      </section>
    </div>
  );
}

function UsersPanel({
  users,
  loading,
  statusFilter,
  setStatusFilter,
  busyId,
  updateApproval,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 p-4">
        {['all', 'pending', 'approved', 'rejected', 'unassigned'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              statusFilter === status
                ? 'bg-violet-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {status}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Store</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><LoadingRows count={5} /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">No users match this filter.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-5 py-4 font-medium">{user.email}</td>
                  <td className="px-5 py-4 text-zinc-400">{user.storeName || '—'}</td>
                  <td className="px-5 py-4 capitalize text-zinc-400">{user.role || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[user.approvalStatus] || STATUS_STYLES.unassigned}`}>
                      {user.approvalStatus}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-zinc-500">{fmtDate(user.joinedAt || user.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {user.membershipId && user.role !== 'owner' && user.approvalStatus !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => updateApproval(user, 'approved')}
                          disabled={busyId === user.membershipId}
                          className="rounded-lg bg-emerald-500 p-2 text-black hover:bg-emerald-400 disabled:opacity-50"
                          title="Approve user"
                          aria-label={`Approve ${user.email}`}
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                      )}
                      {user.membershipId && user.role !== 'owner' && user.approvalStatus !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => updateApproval(user, 'rejected')}
                          disabled={busyId === user.membershipId}
                          className="rounded-lg border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          title="Reject user"
                          aria-label={`Reject ${user.email}`}
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StoresPanel({ stores, loading }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
              <th className="px-5 py-3">Store</th>
              <th className="px-5 py-3">Business type</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Members</th>
              <th className="px-5 py-3">Pending</th>
              <th className="px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><LoadingRows count={5} /></td></tr>
            ) : stores.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">No stores match your search.</td></tr>
            ) : (
              stores.map((store) => (
                <tr key={store.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                        <Store className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{store.name}</p>
                        {store.isDemo && <p className="text-[11px] text-amber-400">Demo store</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 capitalize text-zinc-400">{store.type}</td>
                  <td className="px-5 py-4 capitalize text-zinc-400">{store.plan}</td>
                  <td className="px-5 py-4 text-zinc-400">{store.memberCount || 0}</td>
                  <td className="px-5 py-4">
                    <span className={store.pendingCount ? 'text-amber-400' : 'text-zinc-500'}>
                      {store.pendingCount || 0}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-zinc-500">{fmtDate(store.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoadingRows({ count }) {
  return Array.from({ length: count }).map((_, index) => (
    <div key={index} className="flex animate-pulse gap-3 px-5 py-4">
      <div className="h-9 w-9 rounded-xl bg-zinc-800" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-1/3 rounded bg-zinc-800" />
        <div className="h-2.5 w-1/5 rounded bg-zinc-800" />
      </div>
    </div>
  ));
}
