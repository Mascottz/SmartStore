// src/pages/Expenses.jsx
import { useState } from 'react';
import { Plus, Trash2, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize, isValidItemName } from '../lib/validate';
import { downloadCsv } from '../lib/exportCsv';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Restock / Supplies',
  'Transport',
  'Equipment',
  'Marketing',
  'Other',
];

const emptyForm = {
  title: '',
  amount: '',
  category: 'Other',
  note: '',
  date: new Date().toISOString().slice(0, 10),
};

export default function Expenses() {
  const { storeId, store } = useAuth();

  const { data: expenses, loading } = useStoreData(
    () => (storeId ? api.expenses.list(storeId) : []),
    [storeId]
  );

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const handleSave = async () => {
    const cleanTitle = sanitize(form.title);
    if (!isValidItemName(cleanTitle)) {
      return toast.error('Give the expense a title (1 to 200 characters).');
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      return toast.error('Enter a valid amount.');
    }
    if (amount > 999_999_999) {
      return toast.error('Amount is too large.');
    }
    if (!form.date) {
      return toast.error('Please select a date.');
    }

    setSaving(true);
    try {
      await api.expenses.create(storeId, {
        title: cleanTitle,
        amount,
        category: sanitize(form.category) || 'Other',
        note: sanitize(form.note),
        date: form.date,
      });
      toast.success('Expense recorded');
      setForm(emptyForm);
      setShowModal(false);
    } catch (e) {
      toast.error(e.message || 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.expenses.remove(deleteTarget.id);
      toast.success('Deleted');
    } catch (err) {
      toast.error(err.message || 'Could not delete.');
    }
    setDeleteTarget(null);
  };

  const handleExport = () => {
    const headers = ['Title', 'Category', 'Date', 'Note', 'Amount'];
    const rows = expenses.map((e) => [
      e.title,
      e.category,
      e.date,
      e.note,
      e.amount,
    ]);
    downloadCsv(`${store?.name || 'expenses'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold">Expenses</h1>
            <HelpTip
              label="Help: Expenses"
              iconClassName="w-7 h-7"
              text="The shop's running costs — rent, fuel, salaries, restocking and the like. Recorded expenses feed the Net Profit figure on the Reports page, so log them as you go."
            />
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {expenses.length} recorded &middot; Total {fmtMoney(total)}
            <HelpTip
              className="ml-1"
              label="Help: Expenses total"
              text="The sum of every expense ever recorded, not just this month. Reports breaks the same costs down per period."
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {expenses.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:border-emerald-500 transition-all"
              aria-label="Export expenses to CSV"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
          >
            <Plus className="w-4 h-4" /> Record Expense
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Expense</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Note</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3 font-medium">{e.title}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{fmtDate(e.date)}</td>
                    <td className="px-5 py-3 text-zinc-500 max-w-[200px] truncate">
                      {e.note || '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                      {fmtMoney(e.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => setDeleteTarget(e)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Delete expense: ${e.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Record Expense"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Record Expense</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Title *
                </label>
                <input
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Generator fuel"
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Amount (₦) *
                  </label>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Date *
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <label className="block text-xs font-medium text-zinc-500">
                    Category
                  </label>
                  <HelpTip
                    label="Help: Expense category"
                    text="Used to group spending in the expense analytics (which categories cost the most, month by month), so pick the closest fit."
                  />
                </div>
                <select
                  className={inputCls}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Note (optional)
                </label>
                <input
                  className={inputCls}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Any extra detail..."
                  maxLength={500}
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Record Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete expense?"
        message={deleteTarget ? `"${deleteTarget.title}" (${fmtMoney(deleteTarget.amount)}) will be permanently removed.` : ''}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';
