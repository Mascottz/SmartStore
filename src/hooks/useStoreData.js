// src/hooks/useStoreData.js
// Fetch data scoped to the current store and automatically refetch
// whenever any mutation happens (replacement for Firestore onSnapshot).
import { useCallback, useEffect, useState } from 'react';
import { subscribe } from '../lib/backend';

export function useStoreData(fetcher, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result || []);
    } catch (e) {
      console.error('useStoreData load failed', e);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  }, [load]);

  return { data, loading, reload: load };
}
