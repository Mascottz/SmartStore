// src/pages/ControlledRegister.jsx
// Pharmacy Mode Phase 3: the controlled-medicines register.
//
// Every dispensing of a controlled medicine, on one page: what left the
// shelf, which batch it came from, who it went to, who verified the
// prescription check and on which receipt. The register needs no table of
// its own - it is a view over the sales ledger (items carry isControlled and
// the FEFO batch allocation) joined to the prescription dispensing trail.
//
// This is a record book for inspection and recall, not a compliance
// guarantee: the pharmacy is responsible for what it writes in it.
import { useMemo, useState } from 'react';
import { Download, Printer, Search, ScrollText } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtDate, fmtMoney } from '../lib/format';
import HelpTip from '../components/HelpTip';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

export default function ControlledRegister() {
  const { storeId, storeName } = useAuth();

  const { data: sales, loading } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: prescriptions } = useStoreData(
    () => (storeId ? api.prescriptions.list(storeId) : []),
    [storeId]
  );
  const { data: dispensings } = useStoreData(
    () => (storeId ? api.prescriptions.dispensings.list(storeId) : []),
    [storeId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);

  // receipt → prescription context (patient, prescriber), when the sale was
  // a prescription dispensing rather than a till sale.
  const rxByReceipt = useMemo(() => {
    const bySale = new Map();
    (dispensings || []).forEach((d) => bySale.set(d.receiptNo, d.prescriptionId));
    const rxById = new Map((prescriptions || []).map((r) => [r.id, r]));
    const map = new Map();
    bySale.forEach((rxId, receiptNo) => map.set(receiptNo, rxById.get(rxId)));
    return map;
  }, [dispensings, prescriptions]);

  const entries = useMemo(() => {
    return (sales || [])
      .filter((sale) =>
        (sale.items || []).some((i) => i.isControlled || i.is_controlled)
      )
      .map((sale) => {
        const rx = rxByReceipt.get(sale.receiptNo);
        const lines = (sale.items || []).filter(
          (i) => i.isControlled || i.is_controlled
        );
        return {
          id: sale.id,
          createdAt: sale.createdAt,
          receiptNo: sale.receiptNo,
          status: sale.status,
          lines,
          total: lines.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0),
          patient: rx?.patientName || sale.customerName || 'Walk-in',
          prescriber: rx?.prescriber || '',
          rxCode: rx?.code || '',
          verifiedBy: sale.verifiedBy || '',
          cashier: sale.cashierEmail || '',
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [sales, rxByReceipt]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase().trim();
    if (!term) return entries;
    return entries.filter((e) =>
      [
        e.receiptNo,
        e.patient,
        e.prescriber,
        e.rxCode,
        e.verifiedBy,
        e.cashier,
        ...e.lines.map((l) => l.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [entries, debouncedSearch]);

  const exportCsv = () => {
    if (filtered.length === 0) return toast.error('Nothing to export yet.');
    const header = [
      'Date',
      'Receipt',
      'Medicine',
      'Qty',
      'Batch numbers',
      'Patient',
      'Prescriber',
      'Prescription',
      'Verified by',
      'Cashier',
      'Status',
    ];
    const rows = filtered.flatMap((e) =>
      e.lines.map((line) => [
        new Date(e.createdAt).toISOString().slice(0, 10),
        e.receiptNo,
        line.name,
        line.qty,
        (Array.isArray(line.batches) ? line.batches : [])
          .map((b) => `${b.batchNo || ''} x${b.qty || 0}`)
          .join('; '),
        e.patient,
        e.prescriber,
        e.rxCode,
        e.verifiedBy,
        e.cashier,
        e.status,
      ])
    );
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `controlled-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} register ${rows.length === 1 ? 'line' : 'lines'}`);
  };

  const printRegister = () => {
    if (filtered.length === 0) return toast.error('Nothing to print yet.');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return toast.error('Pop-up blocked. Please allow pop-ups.');
    const body = filtered
      .flatMap((e) =>
        e.lines.map(
          (line) => `<tr>
            <td>${escapeHtml(new Date(e.createdAt).toISOString().slice(0, 10))}</td>
            <td>${escapeHtml(e.receiptNo)}</td>
            <td>${escapeHtml(line.name)}</td>
            <td class="amt">${Number(line.qty) || 0}</td>
            <td>${escapeHtml(
              (Array.isArray(line.batches) ? line.batches : [])
                .map((b) => `${b.batchNo || ''} ×${b.qty || 0}`)
                .join(', ')
            )}</td>
            <td>${escapeHtml(e.patient)}</td>
            <td>${escapeHtml(e.prescriber || '-')}</td>
            <td>${escapeHtml(e.verifiedBy || '-')}</td>
            <td>${escapeHtml(e.cashier || '-')}</td>
          </tr>`
        )
      )
      .join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Controlled medicines register</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #18181b; }
        h1 { font-size: 18px; margin: 0 0 2px; }
        .sub { color: #71717a; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #d4d4d8; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #f4f4f5; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
        .amt { text-align: right; }
        @media print { body { margin: 8mm; } }
      </style></head><body>
      <h1>Controlled medicines register</h1>
      <p class="sub">${escapeHtml(storeName || '')} - printed ${escapeHtml(
        new Date().toLocaleString('en-NG')
      )} · ${filtered.length} dispensing${filtered.length === 1 ? '' : 's'}</p>
      <table><thead><tr>
        <th>Date</th><th>Receipt</th><th>Medicine</th><th>Qty</th><th>Batches</th>
        <th>Patient</th><th>Prescriber</th><th>Verified by</th><th>Cashier</th>
      </tr></thead><tbody>${body}</tbody></table>
      <script>window.onafterprint = function () { window.close(); }; window.print();
      setTimeout(function () { window.close(); }, 10000);</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            Controlled Register
            <HelpTip
              label="Help: Controlled Register"
              text="Every dispensing of a controlled medicine: what left the shelf, from which batch, for which patient, and which pharmacist verified it. Built from your sales and prescription records - export it as CSV or print it for inspection."
            />
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {entries.length} controlled dispensing{entries.length === 1 ? '' : 's'} on record
            {entries.some((e) => !e.verifiedBy) && (
              <span className="text-amber-500">
                {' '}
                · {entries.filter((e) => !e.verifiedBy).length} without a named verifier
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={printRegister}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 font-semibold text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by patient, medicine, receipt, prescriber or verifier..."
            aria-label="Search controlled register"
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Receipt</th>
                <th className="px-5 py-3">Medicine</th>
                <th className="px-5 py-3">Patient</th>
                <th className="px-5 py-3">Prescriber</th>
                <th className="px-5 py-3">Verified by</th>
                <th className="px-5 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                    <span className="inline-flex flex-col items-center gap-2">
                      <ScrollText className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                      {debouncedSearch
                        ? `No dispensings match "${debouncedSearch}".`
                        : 'No controlled medicines have been dispensed yet. Mark medicines as controlled when adding them, and every dispensing lands here automatically.'}
                    </span>
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                      e.status === 'voided' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-5 py-3 text-zinc-500 text-xs whitespace-nowrap">
                      {fmtDate(e.createdAt)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {e.receiptNo}
                      {e.status === 'voided' && (
                        <span className="ml-1.5 text-[10px] font-sans font-semibold text-red-500">
                          VOIDED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {e.lines.map((line, i) => (
                        <p key={i} className="text-sm font-medium">
                          {line.name} <span className="text-zinc-500">× {line.qty}</span>
                          {(Array.isArray(line.batches) ? line.batches : []).length > 0 && (
                            <span className="block text-[11px] text-zinc-500 font-mono">
                              {(Array.isArray(line.batches) ? line.batches : [])
                                .map((b) => `${b.batchNo || '-'} ×${b.qty}`)
                                .join(' · ')}
                            </span>
                          )}
                        </p>
                      ))}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{e.patient}</p>
                      {e.rxCode && (
                        <p className="text-[11px] text-zinc-500 font-mono">{e.rxCode}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{e.prescriber || '-'}</td>
                    <td className="px-5 py-3">
                      {e.verifiedBy ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {e.verifiedBy}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          not recorded
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">
                      {fmtMoney(e.total)}
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
