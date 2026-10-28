import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

// Runs `request(signal)` whenever `deps` change and exposes explicit loading
// and error states. A newer request aborts the previous one. While reloading,
// the previous data is kept so views can hold their frame instead of flashing.
export function useApi(request, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, error: null, loading: true }));
    request(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (axios.isCancel(error)) return;
        console.error(error);
        setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
