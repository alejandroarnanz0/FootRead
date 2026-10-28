import { useEffect, useState } from 'react';

// Returns `value` once it has stopped changing for `delay` ms, so typing in a
// filter does not fire one request per keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
