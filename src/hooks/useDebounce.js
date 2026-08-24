// src/hooks/useDebounce.js
// Delays updating a value until the user stops typing for `ms` milliseconds.
import { useEffect, useState } from 'react';

export function useDebounce(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
