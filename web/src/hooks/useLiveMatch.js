import { useEffect, useMemo, useState } from 'react';
import { subscribeToMatch } from '../api/liveSocket.js';
import { getMatch, getMatchEvents } from '../api/matches.js';

const FALLBACK_MS = 5000;
const REVALIDATE_MS = 30000;
const LIVE_WINDOW_MS = 15000;
const EMPTY = { match: null, events: [], eventsLoaded: false, error: null, activity: null, resetVersion: 0 };

const eventKey = (event) => event._id ?? event.sequence;
function receiptAge(event, now) {
  const received = Date.parse(event?.receivedAt);
  return Number.isFinite(received) && received <= now ? now - received : null;
}

export function useLiveMatch(matchId) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [connection, setConnection] = useState('connecting');
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
    let reading = false;
    let readAgain = false;
    let resetPending = false;
    let terminal = false;
    let canReadEvents = false;
    let status = 'connecting';
    let unsubscribe;

    function connectionChanged(next) {
      if (signal.aborted || terminal || status === next) return;
      status = next;
      setConnection(next);
      canReadEvents = true;
      refresh();
    }

    function matchChanged(reason) {
      if (reason === 'reset') resetPending = true;
      if (canReadEvents) refresh();
    }

    function onFocus() {
      if (canReadEvents) refresh();
    }

    async function refresh() {
      if (signal.aborted || terminal) return;
      if (reading) {
        readAgain = true;
        return;
      }
      clearTimeout(timer);
      reading = true;
      const includeEvents = canReadEvents;
      const reset = includeEvents && resetPending;
      if (includeEvents) resetPending = false;
      try {
        if (!match) {
          match = await getMatch(matchId, signal);
          if (signal.aborted) return;
          // Show the match details while its first event request is still pending.
          setSnapshot((current) => ({ ...current, match, error: null }));
        }
        if (!includeEvents) return;
        const events = await getMatchEvents(matchId, signal);
        // A reset notified during this read supersedes the in-flight snapshot.
        if (signal.aborted || resetPending) return;

        const known = new Set(previous?.map(eventKey));
        const currentKeys = new Set(events.map(eventKey));
        const replaced = reset || previous?.some((event) => !currentKeys.has(eventKey(event)));
        const time = Date.now();
        const added = previous && !replaced ? events.filter((event) => {
          const age = receiptAge(event, time);
          return !known.has(eventKey(event)) && age !== null && age < LIVE_WINDOW_MS;
        }) : [];
        previous = events;
        setNow(time);
        setSnapshot((current) => ({
          match,
          events,
          eventsLoaded: true,
          error: null,
          activity: replaced ? null : added.length ? { events: added, at: time } : current.activity,
          resetVersion: current.resetVersion + (replaced ? 1 : 0),
        }));
      } catch (error) {
        if (reset) resetPending = true;
        terminal = [401, 404].includes(error.response?.status);
        if (terminal) unsubscribe?.();
        if (!signal.aborted) setSnapshot((current) => ({ ...current, error }));
      } finally {
        reading = false;
        if (!signal.aborted && !terminal) {
          if (readAgain) {
            readAgain = false;
            refresh();
          } else {
            timer = setTimeout(() => {
              if (!canReadEvents) connectionChanged('fallback');
              else refresh();
            }, status === 'connected' ? REVALIDATE_MS : FALLBACK_MS);
          }
        }
      }
    }

    setConnection('connecting');
    refresh();
    try {
      unsubscribe = subscribeToMatch(matchId, { onStatus: connectionChanged, onChange: matchChanged });
    } catch {
      connectionChanged('error');
    }
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [matchId, attempt]);

  const newestReceipt = useMemo(() => snapshot.events.reduce((latest, event) => {
    const received = Date.parse(event.receivedAt);
    return Number.isFinite(received) && (!latest || received > Date.parse(latest.receivedAt)) ? event : latest;
  }, null), [snapshot.events]);
  const elapsed = receiptAge(newestReceipt, now);
  const activityAge = snapshot.activity ? Math.max(0, now - snapshot.activity.at) : Infinity;
  const live = !snapshot.error && elapsed !== null && elapsed < LIVE_WINDOW_MS;

  return { ...snapshot, connection, elapsed, activityAge, live, retry: () => setAttempt((value) => value + 1) };
}
