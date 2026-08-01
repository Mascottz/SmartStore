// src/pages/Team.jsx
import { useEffect, useState } from 'react';
import {
  UserPlus,
  Users,
  Shield,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Mail,
} from 'lucide-react';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate'; // ✅ NEW

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
];

export default function Team() {
  const { storeId } = useAuth();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'cashier',
  });

  useEffect(() => {
    if (!storeId) return;

    const q = query(
      collection(db, 'team'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setMembers(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (!form.email.trim()) {
      toast.error('Email or username is required.');
      return;
    }
    if (!storeId) {
      toast.error('Store not ready yet. Please wait a second and try again.');
      return;
    }

    try {
      await addDoc(collection(db, 'team'), {
        storeId,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: true,
        createdAt: new Date(),
      });

      setForm({
        name: '',
        email: '',
        role: 'cashier',
      });

      toast.success('Team member added');
    } catch (err) {
      console.error(err);
      toast.error('Could not add team member');
    }
  };

  const handleToggleActive = async (member) => {
    try {
      await updateDoc(doc(db, 'team', member.id), {
        active: !member.active,
      });
      toast.success(
        `Marked ${member.name} as ${
          member.active ? 'inactive' : 'active'
        }`
      );
    } catch (err) {
      console.error(err);
      toast.error('Could not update member status');
    }
  };

  const handleDelete = async (member) => {
    if (
      !window.confirm(
        `Remove ${member.name} from your SmartStore team?`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'team', member.id));
      toast.success('Team member removed');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete team member');
    }
  };

  const roleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40';
      case 'manager':
        return 'bg-sky-500/10 text-sky-300 border-sky-500/40';
      case 'cashier':
      default:
        return 'bg-zinc-700/40 text-zinc-200 border-zinc-600/60';
    }
  };

  return (
    <OwnerFeatureGate>
      <div className="p-8 bg-zinc-950 min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Team</h1>
            <p className="text-zinc-400">
              Manage your SmartStore staff, roles, and access.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total members</p>
            <p className="text-xl font-semibold text-emerald-400">
              {members.length}
            </p>
          </div>
        </div>

        {/* Add member card */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-emerald-500/10 rounded-xl p-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white">
              Add team member
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-white"
            />
            <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm gap-2">
              <Mail className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Email or username"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                className="bg-transparent outline-none flex-1 text-sm text-white placeholder:text-zinc-500"
              />
            </div>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value })
              }
              className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-100"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleAdd}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-5 py-3 rounded-2xl text-sm font-semibold"
              >
                <UserPlus className="w-4 h-4" />
                Add member
              </button>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 mt-3">
            Roles help control what each person can do in SmartStore
            (e.g. cashiers vs managers vs admins). 
          </p>
        </div>

        {/* Team list */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-zinc-800 rounded-xl p-2">
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white">
                Team members
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Shield className="w-3 h-3" />
              <span>Admins and managers see more inside Reports & POS.</span>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No team members yet. Add your first cashier or manager
              above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 text-left">NAME</th>
                    <th className="py-2 text-left">EMAIL / USERNAME</th>
                    <th className="py-2 text-left">ROLE</th>
                    <th className="py-2 text-center">STATUS</th>
                    <th className="py-2 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-zinc-800 last:border-0"
                    >
                      <td className="py-3 text-zinc-100">
                        {m.name}
                      </td>
                      <td className="py-3 text-zinc-400">
                        {m.email}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium ${roleBadge(
                            m.role
                          )}`}
                        >
                          <Shield className="w-3 h-3" />
                          {m.role
                            ? m.role.charAt(0).toUpperCase() +
                              m.role.slice(1)
                            : 'Cashier'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                            m.active
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {m.active ? (
                            <ToggleRight className="w-4 h-4" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                          {m.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(m)}
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                          >
                            {m.active ? 'Set inactive' : 'Set active'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
                            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </OwnerFeatureGate>
  );
}
