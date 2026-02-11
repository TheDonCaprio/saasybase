import { useState, useEffect } from 'react';

// Returns a debounced version of `value` that updates after `delay` ms of inactivity.
export function useDebouncedValue<T>(value: T, delay: number = 500): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
