// src/components/ConfirmDialog.jsx
// Accessible modal confirmation dialog. Replaces window.confirm().
import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'default'
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (open) {
      // Focus the cancel button on open for safety
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    variant === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-600'
      : variant === 'warning'
      ? 'bg-amber-500 text-black hover:bg-amber-400'
      : 'bg-emerald-500 text-black hover:bg-emerald-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          {variant !== 'default' && (
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                variant === 'danger'
                  ? 'bg-red-500/10'
                  : 'bg-amber-500/10'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  variant === 'danger' ? 'text-red-500' : 'text-amber-500'
                }`}
              />
            </div>
          )}
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            {message && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-2xl text-sm font-semibold ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
