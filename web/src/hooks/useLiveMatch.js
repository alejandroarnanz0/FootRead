import { useEffect, useState } from 'react';
import { getMatch, getMatchEvents } from '../api/matches.js';

const POLL_MS = 2000;
const LIVE_WINDOW_MS = 15000;
const EMPTY = { match: null, events: [], error: null, activity: null };

const eventKey = (event) => event._id ?? event.sequence;

export function useLiveMatch(matchId) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const hasEvents = snapshot.events.length > 0;

  useEffect(() => {
    if (!hasEvents) return;
    const ticker = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(ticker);
  }, [hasEvents]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let match;
    let timer;
    let previous;

    async function refresh() {
      let retryable = true;
      try {
        match ??= await getMatch(matchId, signal);
        const events = await getMatchEvents(matchId, signal);
        if (signal.aborted) return;

        // The full list also detects a replay reset, even when sequences repeat.
        const known = new Set(previous?.map(eventKey));
        const added = previous ? events.filter((event) => !known.has(eventKey(event))) : [];
        const currentKeys = new Set(events.map(eventKey));
        const reset = previous?.some((event) => !currentKeys.has(eventKey(event)));
        const time = Date.now();
        previous = events;
        setNow(time);
        setSnapshot((current) => ({
          match,
          events,
          error: null,
          activity: added.length ? { events: added, at: time } : reset ? null : current.activity,
        }));
      } catch (error) {
        retryable = error.response?.status !== 404;
        if (!signal.aborted) setSnapshot((current) => ({ ...current, error }));
      } finally {
        if (!signal.aborted && retryable) timer = setTimeout(refresh, POLL_MS);
      }
    }

    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [matchId, attempt]);

  const last = snapshot.events.at(-1);
  const received = Date.parse(last?.receivedAt);
  const elapsed = Number.isFinite(received) ? Math.max(0, now - received) : null;
  const activityAge = snapshot.activity ? Math.max(0, now - snapshot.activity.at) : Infinity;
  const live = !snapshot.error && Boolean(last) &&
    (activityAge < LIVE_WINDOW_MS || (elapsed !== null && elapsed < LIVE_WINDOW_MS));

  return { ...snapshot, elapsed, activityAge, live, retry: () => setAttempt((value) => value + 1) };
}
