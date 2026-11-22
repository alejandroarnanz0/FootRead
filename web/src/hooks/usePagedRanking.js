import { useEffect, useState } from 'react';

export function usePagedRanking(loadPage) {
  const [request, setRequest] = useState({ page: 1 });
  const [result, setResult] = useState({ request: null, players: [], hasMore: false, error: null });
  const pending = result.request !== request;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    loadPage(request.page, signal).then(({ players, hasMore }) => {
      if (signal.aborted) return;
      setResult((previous) => {
        // Keep the original order if consecutive pages overlap.
        const rows = new Map(previous.players.map((player) => [player._id, player]));
        for (const player of players) {
          if (!rows.has(player._id)) rows.set(player._id, player);
        }
        return { request, players: [...rows.values()], hasMore, error: null };
      });
    }).catch((error) => {
      if (!signal.aborted) setResult((previous) => ({ ...previous, request, error }));
    });
    return () => controller.abort();
  }, [loadPage, request]);

  return {
    players: result.players,
    hasMore: result.hasMore,
    error: pending ? null : result.error,
    pending,
    retry: () => {
      if (!pending && result.error) {
        setRequest((current) => current === request ? { page: current.page } : current);
      }
    },
    loadMore: () => {
      if (!pending && !result.error && result.hasMore) {
        // Wheel, scroll and focus can fire before the pending state is rendered.
        setRequest((current) => current === request ? { page: current.page + 1 } : current);
      }
    },
  };
}
