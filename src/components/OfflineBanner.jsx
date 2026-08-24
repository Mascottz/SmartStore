// src/components/OfflineBanner.jsx
// Shows a subtle banner when the browser goes offline.
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const go = () => setOffline(false);
    const stop = () => setOffline(true);
    window.addEventListener('online', go);
    window.addEventListener('offline', stop);
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('offline', stop);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 shadow-xl text-sm text-zinc-300">
      <WifiOff className="w-4 h-4 text-amber-500" />
      <span>You are offline. Changes are saved locally.</span>
    </div>
  );
}
