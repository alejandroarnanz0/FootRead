import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading, Notice } from '../components/Status.jsx';
import EventFeed from '../components/live/EventFeed.jsx';
import MatchBreadcrumbs from '../components/matches/MatchBreadcrumbs.jsx';
import LiveScoreboard from '../components/live/LiveScoreboard.jsx';
import MatchReport from '../components/live/MatchReport.jsx';
import ModelPanel from '../components/live/ModelPanel.jsx';
import ReplayControls from '../components/live/ReplayControls.jsx';
import ShotMap from '../components/live/ShotMap.jsx';
import {
  clock, formatPct, gameSeconds, isGoal, modelReport, SHOOTOUT, summarizeMatch, teamSide,
} from '../components/live/matchData.js';
import { VerdictChip } from '../components/live/XgMeter.jsx';
import { sendReplayCommand } from '../api/liveSocket.js';
import { useLiveMatch } from '../hooks/useLiveMatch.js';
import { teamLabel } from '../matchLabels.js';
import './LiveMatchPage.css';

const hasCoordinates = ({ x, y }) =>
  Number.isFinite(x) && x >= 0 && x <= 120 && Number.isFinite(y) && y >= 0 && y <= 80;

const COMMAND_ERRORS = {
  REPLAYER_OFFLINE: 'El reproductor no está conectado. Arráncalo con npm run replay:agent.',
  REPLAYER_TIMEOUT: 'El reproductor no ha respondido. Revisa su terminal.',
  NO_EVENTS_FILE: 'El reproductor no tiene el fichero de eventos de este partido (ver data/README.md).',
  DISCONNECTED: 'Sin conexión en tiempo real con la API.',
  MATCH_NOT_FOUND: 'Este partido no existe en la base de datos.',
};

function MatchView({ matchId }) {
  const {
    match, events, eventsLoaded, error, activity, activityAge, elapsed, live, connection, resetVersion, retry,
    replay, finished,
  } = useLiveMatch(matchId);
  const [selectedKey, setSelectedKey] = useState(null);
  const [viewTime, setViewTime] = useState(null); // null = live; otherwise game seconds shown
  const [command, setCommand] = useState({ busy: false, error: null });
  const [reportOpen, setReportOpen] = useState(false);
  const wasFinished = useRef(finished);

  useEffect(() => {
    setSelectedKey(null);
    setViewTime(null);
  }, [resetVersion]);

  // The end screen opens by itself when the match ends while you watch it.
  useEffect(() => {
    if (finished && !wasFinished.current) setReportOpen(true);
    if (!finished) setReportOpen(false);
    wasFinished.current = finished;
  }, [finished]);

  const visible = useMemo(
    () => (viewTime === null ? events : events.filter((event) => gameSeconds(event) <= viewTime)),
    [events, viewTime]
  );
  const summary = useMemo(() => match && summarizeMatch(match, visible), [match, visible]);
  const report = useMemo(() => match && modelReport(match, visible), [match, visible]);
  const fullSummary = useMemo(() => match && summarizeMatch(match, events), [match, events]);
  const fullReport = useMemo(() => match && modelReport(match, events), [match, events]);

  if (!match) {
    return (
      <div className="live-page">
        <MatchBreadcrumbs />
        <PageHeader title={error ? 'Ficha del partido' : 'Centro de partido'} />
        {error ? <ErrorMessage error={error} onRetry={retry} /> : <Loading>Cargando partido…</Loading>}
      </div>
    );
  }

  async function sendCommand(action, speed) {
    setCommand({ busy: true, error: null });
    if (action === 'restart' || (action === 'play' && (finished || replay?.status === 'idle'))) setViewTime(null);
    const answer = await sendReplayCommand(matchId, action, speed);
    setCommand({ busy: false, error: answer.ok ? null : COMMAND_ERRORS[answer.code] ?? 'No se pudo enviar la orden al reproductor.' });
  }

  // Animations only make sense while watching live.
  const watchingLive = viewTime === null && !error;
  const activeEvents = watchingLive && activityAge < 4500 ? activity.events : [];
  const newest = activeEvents.at(-1);
  const last = visible.at(-1);
  const goal = activeEvents.findLast(isGoal);
  const bannerGoal = activityAge < 3200 ? goal : null;
  const shots = visible.filter((event) =>
    event.type === 'Shot' && event.period !== SHOOTOUT && teamSide(event, match) && hasCoordinates(event));
  const selectable = new Set(shots.map((event) => event.sequence));
  const selected = shots.find((event) => (event._id ?? event.sequence) === selectedKey);
  const selectShot = (event) => {
    const next = event._id ?? event.sequence;
    setSelectedKey((current) => (current === next ? null : next));
  };
  const newestShot = activeEvents.findLast((event) => selectable.has(event.sequence));

  return (
    <div className="live-page">
      <MatchBreadcrumbs match={match} />
      <PageHeader title="Centro de partido" />
      <LiveScoreboard match={match} summary={summary} last={last} elapsed={elapsed} live={live && watchingLive} error={error}
        goal={goal} goalSide={goal && teamSide(goal, match)} eventsLoaded={eventsLoaded} connection={connection} />
      <ReplayControls match={match} events={events} replay={replay} finished={finished} busy={command.busy}
        error={command.error} onCommand={sendCommand} viewTime={viewTime} onSeek={setViewTime}
        onReport={() => setReportOpen(true)} />
      {error && <ErrorMessage error={error} onRetry={retry} title="No se pudieron actualizar los eventos" />}
      <div className="live-goal-slot" role="status">
        {bannerGoal && (
          <div className={`live-goal-banner live-${teamSide(bannerGoal, match)}`} key={bannerGoal._id ?? bannerGoal.sequence}>
            <strong>{bannerGoal.period === SHOOTOUT ? 'Penalti convertido' : '¡Gol!'} · {teamLabel(bannerGoal.team)}</strong>
            <span>{clock(bannerGoal)}{bannerGoal.playerName && ` · ${bannerGoal.playerName}`}</span>
            {bannerGoal.type === 'Shot' && bannerGoal.period !== SHOOTOUT && (
              <span className="live-banner-model">
                <b>{formatPct(bannerGoal.xg)}</b>
                <VerdictChip event={bannerGoal} />
              </span>
            )}
          </div>
        )}
      </div>
      {events.length ? (
        <>
          <div className="live-match-grid">
            <ShotMap match={match} shots={shots} selected={selected} newestShot={newestShot} activityAge={activityAge}
              onSelect={selectShot} />
            <EventFeed match={match} events={visible} animated={new Set(activeEvents.map((event) => event.sequence))}
              newest={newest} selected={selected} onSelect={selectShot} selectable={selectable} />
          </div>
          <ModelPanel match={match} events={visible} report={report} selected={selected} onSelect={selectShot} viewTime={viewTime} />
        </>
      ) : !error && (eventsLoaded
        ? <Notice>Este partido aún no tiene eventos. Pulsa «Reproducir» para lanzar el replay desde aquí.</Notice>
        : <Loading>Cargando eventos…</Loading>)}
      <p className="live-note">Datos de <a href="https://github.com/statsbomb/open-data">StatsBomb Open Data</a>.</p>
      {finished && fullReport && (
        <MatchReport open={reportOpen} onClose={() => setReportOpen(false)} match={match} summary={fullSummary}
          report={fullReport} onReplay={() => { setReportOpen(false); sendCommand('restart'); }} />
      )}
    </div>
  );
}

export default function LiveMatchPage() {
  const { matchId } = useParams();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [matchId]);
  return <MatchView key={matchId} matchId={matchId} />;
}
