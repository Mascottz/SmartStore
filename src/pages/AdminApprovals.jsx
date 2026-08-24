// src/pages/AdminApprovals.jsx
import { useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtDate } from '../lib/format';

const STATUS_STYLES = {
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function AdminApprovals() {
  const { storeId, storeName, role } = useAuth();
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  const { data: members, loading } = useStoreData(
    () => (storeId ? api.team.list(storeId) : []),
    [storeId]
  );

  const requests = useMemo(
    () =>
      members
        .filter((member) => member.role !== 'owner')
        .sort((a, b) => {
          if (a.approvalStatus === b.approvalStatus) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          }
          return a.approvalStatus === 'pending' ? -1 : 1;
        }),
    [members]
  );

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((m) => m.approvalStatus === 'pending').length,
      approved: requests.filter((m) => m.approvalStatus === 'approved').length,
      rejected: requests.filter((m) => m.approvalStatus === 'rejected').length,
    }),
    [requests]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return requests.filter((member) => {
      const matchesStatus = filter === 'all' || member.approvalStatus === filter;
      const matchesQuery = !term || member.email.toLowerCase().includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [requests, filter, query]);

  const updateStatus = async (member, status) => {
    setBusyId(member.id);
    try {
      await api.team.updateApproval(member.id, status);
      toast.success(
        status === 'approved'
          ? `${member.email} can now access the store`
          : `${member.email}'s access request was declined`
      );
    } catch (error) {
      toast.error(error.message || 'Could not update this request.');
    } finally {
      setBusyId(null);
    }
  };

  if (role !== 'owner') {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto mt-16 max-w-lg rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-xl font-bold">Owner access required</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Only the store owner can approve or reject new users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
            <UserCheck className="h-7 w-7 text-emerald-500" />
            User Approvals
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review access requests for {storeName || 'your store'}
          </p>
        </div>
        {counts.pending > 0 && (
          <span className="w-fit rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {counts.pending} awaiting review
          </span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Pending', counts.pending, Clock3, 'text-amber-500'],
          ['Approved', counts.approved, Check, 'text-emerald-500'],
          ['Rejected', counts.rejected, X, 'text-red-500'],
          ['All requests', counts.all, UserCheck, 'text-sky-500'],
        ].map(([label, value, Icon, colour]) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Icon className={`h-5 w-5 ${colour}`} />
            <p className="mt-3 text-2xl font-bold">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {['pending', 'approved', 'rejected', 'all'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === status
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900 dark:bg-zinc-800 dark:hover:text-white'
                }`}
              >
                {status} ({counts[status]})
              </button>
            ))}
          </div>
          <label className="relative block lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <span className="sr-only">Search users</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by email..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Requested</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                    Loading approval requests...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                    {filter === 'pending' && !query
                      ? 'No pending requests. You are all caught up.'
                      : 'No users match this filter.'}
                  </td>
                </tr>
              ) : (
                visible.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/70"
                  >
                    <td className="px-5 py-4 font-medium">{member.email}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-500">
                      {fmtDate(member.createdAt)}
                    </td>
                    <td className="px-5 py-4 capitalize text-zinc-500">{member.role}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                          STATUS_STYLES[member.approvalStatus] || STATUS_STYLES.pending
                        }`}
                      >
                        {member.approvalStatus}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {member.approvalStatus !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => updateStatus(member, 'approved')}
                            disabled={busyId === member.id}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        {member.approvalStatus !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => updateStatus(member, 'rejected')}
                            disabled={busyId === member.id}
                            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <UserX className="h-3.5 w-3.5" /> Reject
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
      </div>
    </div>
  );
}
