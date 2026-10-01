// src/pages/Suppliers.jsx
// Pharmacy Mode Phase 2: who the medicines come from. Suppliers feed the
// purchase records (deliveries) and ride along on the batches they bring in.
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { sanitize } from '../lib/validate';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export default function Suppliers() {
  const { storeId } = useAuth();

  const { data: suppliers, loading } = useStoreData(
    () => (storeId ? api.suppliers.list(storeId) : []),
    [storeId]
  );
  const { data: purchases } = useStoreData(
    () => (storeId ? api.purchases.list(storeId) : []),
    [storeId]
  );

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const purchaseCountBySupplier = useMemo(() => {
    const map = new Map();
    (purchases || []).forEach((p) => {
      if (!p.supplierId) return;
      map.set(p.supplierId, (map.get(p.supplierId) || 0) + 1);
    });
    return map;
  }, [purchases]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!sanitize(form.name)) return toast.error('Supplier name is required.');
    setSaving(true);
    try {
      if (editingId) {
        await api.suppliers.update(editingId, form);
        toast.success('Supplier updated');
      } else {
        await api.suppliers.create(storeId, form);
        toast.success('Supplier added');
      }
      setShowModal(false);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.suppliers.remove(deleteTarget.id);
      toast.success('Supplier removed');
    } catch (e) {
      toast.error(e.message || 'Could not delete.');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            Suppliers
            <HelpTip
              label="Help: Suppliers"
              text="Who you buy medicines from. Recording a delivery against a supplier (Purchases) creates its batches in one go, so stock arrives traced to source."
            />
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {(suppliers || []).length} supplier{(suppliers || []).length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
        >
          <Plus className="w-4 h-4" /> Add supplier
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3 text-right">Deliveries</th>
                <th className="px-5 py-3">Notes</th>
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
              ) : (suppliers || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                    No suppliers yet. Add your first distributor or wholesaler!
                  </td>
                </tr>
              ) : (
                (suppliers || []).map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-emerald-500 shrink-0" />
                        {s.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{s.phone || '—'}</td>
                    <td className="px-5 py-3 text-zinc-500">{s.email || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {purchaseCountBySupplier.get(s.id) || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 max-w-xs truncate">
                      {s.notes || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Edit ${s.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Delete ${s.name}`}
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

      {/* Add/Edit modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? 'Edit supplier' : 'Add supplier'}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editingId ? 'Edit supplier' : 'Add supplier'}
              </h2>
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
                  Name *
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Emzor Pharmaceuticals"
                  aria-label="Supplier name"
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Phone
                  </label>
                  <input
                    className={inputCls}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Optional"
                    aria-label="Supplier phone"
                    maxLength={40}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Email
                  </label>
                  <input
                    className={inputCls}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Optional"
                    aria-label="Supplier email"
                    maxLength={120}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Address
                </label>
                <input
                  className={inputCls}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Optional"
                  aria-label="Supplier address"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Notes
                </label>
                <input
                  className={inputCls}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Delivers Tuesdays, 14-day credit"
                  aria-label="Supplier notes"
                  maxLength={500}
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add supplier'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name}?`}
        message={
          deleteTarget
            ? 'The supplier will be removed. Delivery records keep their quantities and batches; only the supplier link is lost.'
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
