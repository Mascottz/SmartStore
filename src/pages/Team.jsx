// src/pages/Team.jsx
import { useState } from 'react';
import { Copy, Shield, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtDate } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const ROLES = ['cashier', 'manager', 'admin'];

const ROLE_STYLES = {
  owner: 'bg-emerald-500/10 text-emerald-500',
  admin: 'bg-sky-500/10 text-sky-500',
  manager: 'bg-violet-500/10 text-violet-500',
  cashier: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
};

export default function Team() {
  const { storeId, store, user, role } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const { data: members, loading } = useStoreData(
    () => (storeId ? api.team.list(storeId) : []),
    [storeId]
  );

  const isOwner = role === 'owner';

  const copyJoinCode = () => {
    const code = store?.joinCode || '';
    if (!code) return toast.error('No join code available.');
    navigator.clipboard.writeText(code).then(
      () => toast.success('Join code copied to clipboard'),
      () => toast.error('Could not copy. Please copy manually.')
    );
  };

  const changeRole = async (member, newRole) => {
    if (member.role === 'owner') return toast.error('Cannot change the owner role.');
    setBusyId(member.id);
    try {
      await api.team.updateRole(member.id, newRole);
      toast.success(`${member.email} is now ${newRole}`);
    } catch (e) {
      toast.error(e.message || 'Could not update role.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setBusyId(removeTarget.id);
    try {
      await api.team.remove(removeTarget.id);
      toast.success('Member removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove member.');
    } finally {
      setBusyId(null);
      setRemoveTarget(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Team</h1>
          <HelpTip
            label="Help: Team"
            iconClassName="w-7 h-7"
            text="Everyone with access to this store. Staff create their own account, sign in with your join code and wait for your approval before they can start selling."
          />
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          {members.length} member{members.length !== 1 ? 's' : ''} in your store
        </p>
      </div>

      {/* Join code card */}
      <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> Invite staff with your join code
            <HelpTip
              label="Help: Join code"
              text="Share this six-character code with staff you trust — anyone holding it can request access to your store. Tap the code to copy it. Each new member starts as a cashier and needs your approval before their first shift."
            />
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Staff sign up with &quot;I&apos;m joining a store&quot; and enter this code. They
            start as cashiers, you can promote them below.
          </p>
        </div>
        <button
          onClick={copyJoinCode}
          className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-500/40 font-mono font-bold tracking-widest text-lg hover:border-emerald-500 transition-all"
          aria-label="Copy join code"
        >
          {store?.joinCode || '------'}
          <Copy className="w-4 h-4 text-emerald-500" />
        </button>
      </div>

      {/* Members */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1">
                    Role
                    <HelpTip
                      label="Help: Roles"
                      text="Cashiers ring up sales at the POS. Managers also run inventory, expenses and voids. Admins manage the whole store, and the owner (only one per store) controls the plan, the team and billing."
                    />
                  </span>
                </th>
                <th className="px-5 py-3">Joined</th>
                {isOwner && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-zinc-500">
                    No team members yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium">{m.email}</p>
                      {m.userId === user?.id && (
                        <p className="text-[11px] text-emerald-500">You</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                          ROLE_STYLES[m.role] || ROLE_STYLES.cashier
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {m.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{fmtDate(m.createdAt)}</td>
                    {isOwner && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end items-center gap-2">
                          {m.role !== 'owner' && (
                            <>
                              <select
                                value={m.role}
                                disabled={busyId === m.id}
                                onChange={(e) => changeRole(m, e.target.value)}
                                aria-label={`Change role for ${m.email}`}
                                className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs capitalize focus:outline-none"
                              >
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => setRemoveTarget(m)}
                                disabled={busyId === m.id}
                                className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                aria-label={`Remove ${m.email} from team`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remove confirmation */}
      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove team member?"
        message={removeTarget ? `${removeTarget.email} will lose access to this store.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
