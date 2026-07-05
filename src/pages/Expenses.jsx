// src/pages/Expenses.jsx
import { useEffect, useState } from 'react';
import { Plus, Trash2, Calendar, DollarSign, FileText } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  where,           // ✅ NEW
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext'; // ✅ NEW

const EXPENSE_CATEGORIES = [
  'Utilities',
  'Salary',
  'Rent',
  'Fuel',
  'Maintenance',
  'Supplies',
  'Other',
];

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts.toMillis());
  return d.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function Expenses() {
  const { storeId } = useAuth();          // ✅ current store
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    category: '',
    date: '',
    otherCategory: '',
  });

  useEffect(() => {
    if (!storeId) return;                // ✅ wait for auth

    const q = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),   // ✅ scope to store
      orderBy('date', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setExpenses(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const handleAdd = async () => {
    if (!form.description || !form.amount || !form.date) {
      toast.error('Description, amount, and date are required.');
      return;
    }

    if (!storeId) {
      toast.error('Store not ready yet. Please wait a second and try again.');
      return;
    }

    const amountNumber = Number(form.amount);
    if (Number.isNaN(amountNumber) || amountNumber <= 0) {
      toast.error('Amount must be a positive number.');
      return;
    }

    // Decide final category
    let finalCategory = form.category || 'Other';
    if (form.category === 'Other') {
      if (!form.otherCategory.trim()) {
        toast.error('Please type a category name for "Other".');
        return;
      }
      finalCategory = form.otherCategory.trim();
    }

    try {
      const expenseDate = new Date(form.date);
      await addDoc(collection(db, 'expenses'), {
        storeId,                // ✅ tenant id
        description: form.description,
        amount: amountNumber,
        category: finalCategory,
        date: expenseDate,
        createdAt: new Date(),
      });

      setForm({
        description: '',
        amount: '',
        category: '',
        date: '',
        otherCategory: '',
      });

      toast.success('Expense added');
    } catch (err) {
      console.error(err);
      toast.error('Could not add expense');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;

    try {
      await deleteDoc(doc(db, 'expenses', id));
      toast.success('Expense deleted');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete expense');
    }
  };

  return (
    <div className="p-8 bg-zinc-950 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Expenses</h1>
          <p className="text-zinc-400">
            Track fuel, staff, bills, and other costs eating your profit.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Total recorded</p>
          <p className="text-xl font-semibold text-amber-400">
            ₦{totalExpenses.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Add expense form */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-zinc-800 rounded-xl p-2">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-white">Add New Expense</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Description (e.g. Fuel, Staff, NEPA)"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm"
          />

          <input
            type="number"
            placeholder="Amount (₦)"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm"
          />

          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value })
            }
            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-100"
          >
            <option value="" className="bg-zinc-900 text-zinc-300">
              Select category
            </option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option
                key={cat}
                value={cat}
                className="bg-zinc-900 text-zinc-300"
              >
                {cat}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={form.date}
            onChange={(e) =>
              setForm({ ...form, date: e.target.value })
            }
            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm"
          />
        </div>

        {form.category === 'Other' && (
          <div className="mt-3">
            <input
              type="text"
              placeholder="Type custom category (e.g. Generator repair)"
              value={form.otherCategory}
              onChange={(e) =>
                setForm({ ...form, otherCategory: e.target.value })
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm"
            />
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-5 py-3 rounded-2xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Expense list */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-zinc-800 rounded-xl p-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-white">Recent Expenses</h3>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No expenses recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="py-3 text-left">DATE</th>
                <th className="py-3 text-left">DESCRIPTION</th>
                <th className="py-3 text-left">CATEGORY</th>
                <th className="py-3 text-right">AMOUNT</th>
                <th className="py-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr
                  key={exp.id}
                  className="border-b border-zinc-800 last:border-0"
                >
                  <td className="py-3 text-zinc-300">
                    {formatDate(exp.date)}
                  </td>
                  <td className="py-3 text-white">
                    {exp.description}
                  </td>
                  <td className="py-3 text-zinc-400">
                    {exp.category || 'Other'}
                  </td>
                  <td className="py-3 text-right font-semibold text-amber-400">
                    ₦{(exp.amount || 0).toLocaleString()}
                  </td>
                  <td className="py-3 text-center">
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}