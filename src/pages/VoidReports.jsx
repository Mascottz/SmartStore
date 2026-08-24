// src/pages/VoidReports.jsx
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, fmtDateTime } from '../lib/format';
import OwnerFeatureGate from '../components/OwnerFeatureGate';

export default function VoidReports() {
  const { storeId } = useAuth();

  const { data: voidLogs, loading } = useStoreData(
    () => (storeId ? api.voidLogs.list(storeId) : []),
    [storeId]
  );

  const totalVoided = useMemo(
    () => voidLogs.reduce((sum, v) => sum + Number(v.total || 0), 0),
    [voidLogs]
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Void Report</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Audit trail of every voided sale
        </p>
      </div>

      <OwnerFeatureGate label="Void audit trail is an Owner Mode feature">
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6 max-w-lg">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-zinc-500 uppercase">Voided sales</p>
              </div>
              <p className="text-2xl font-bold">{voidLogs.length}</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 uppercase mb-2">Voided value</p>
              <p className="text-2xl font-bold text-red-500">{fmtMoney(totalVoided)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-5 py-3">Voided at</th>
                    <th className="px-5 py-3">By</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : voidLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-zinc-500">
                        No voided sales. Great discipline!
                      </td>
                    </tr>
                  ) : (
                    voidLogs.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b border-zinc-100 dark:border-zinc-800/60"
                      >
                        <td className="px-5 py-3 font-medium">{v.receiptNo}</td>
                        <td className="px-5 py-3 text-zinc-500">{fmtDateTime(v.createdAt)}</td>
                        <td className="px-5 py-3 text-zinc-500">{v.voidedBy || '—'}</td>
                        <td className="px-5 py-3">{v.reason}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-500">
                          {fmtMoney(v.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </OwnerFeatureGate>
    </div>
  );
}
