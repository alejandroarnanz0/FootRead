import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading } from '../components/Status.jsx';
import EventFeed from '../components/live/EventFeed.jsx';
import LiveScoreboard from '../components/live/LiveScoreboard.jsx';
import ShotMap from '../components/live/ShotMap.jsx';
import XgTimeline from '../components/live/XgTimeline.jsx';
import { clock, formatXg, isGoal, SHOOTOUT, summarizeMatch, teamSide } from '../components/live/matchData.js';
import { useLiveMatch } from '../hooks/useLiveMatch.js';
import './LiveMatchPage.css';

const hasCoordinates = ({ x, y }) =>
  Number.isFinite(x) && x >= 0 && x <= 120 && Number.isFinite(y) && y >= 0 && y <= 80;

function MatchView({ matchId }) {
  const { match, events, error, activity, activityAge, elapsed, live, retry } = useLiveMatch(matchId);
  const [selectedKey, setSelectedKey] = useState(null);
  const summary = useMemo(() => match && summarizeMatch(match, events), [match, events]);
  if (!match) {
    return (
      <div className="live-page">
        <PageHeader title="Partido en vivo" />
        {error ? <ErrorMessage error={error} onRetry={retry} /> : <Loading>Cargando partido…</Loading>}
      </div>
    );
  }

  const activeEvents = !error && activityAge < 3500 ? activity.events : [];
  const newest = activeEvents.at(-1);
  const last = events.at(-1);
  const goal = activeEvents.findLast(isGoal);
  const bannerGoal = activityAge < 2800 ? goal : null;
  const shots = events.filter((event) =>
    event.type === 'Shot' && event.period !== SHOOTOUT && teamSide(event, match) && hasCoordinates(event));
  const selectable = new Set(shots.map((event) => event.sequence));
  const selected = shots.find((event) => (event._id ?? event.sequence) === selectedKey);
  const selectShot = (event) => {
    const next = event._id ?? event.sequence;
    setSelectedKey((current) => current === next ? null : next);
  };
  const newestShot = activeEvents.findLast((event) => selectable.has(event.sequence));
  const latestXg = activeEvents.findLast((event) => Number.isFinite(event.xg) && summary.shotPoints.has(event.sequence));
  const latestPoint = latestXg && { ...summary.shotPoints.get(latestXg.sequence), sequence: latestXg.sequence };

  return (
    <div className="live-page">
      <PageHeader title="Partido en vivo" />
      <LiveScoreboard match={match} summary={summary} last={last} elapsed={elapsed} live={live} error={error}
        goal={goal} goalSide={goal && teamSide(goal, match)} />
      {error && <ErrorMessage error={error} onRetry={retry} title="No se pudieron actualizar los eventos" />}
      <div className="live-goal-slot" role="status">
        {bannerGoal && (
          <div className={`live-goal-banner live-${teamSide(bannerGoal, match)}`} key={bannerGoal._id ?? bannerGoal.sequence}>
            <strong>{bannerGoal.period === SHOOTOUT ? 'Penalti convertido' : 'Gol'} · {bannerGoal.team}</strong>
            <span>{clock(bannerGoal)}{bannerGoal.playerName && ` · ${bannerGoal.playerName}`}</span>
            {Number.isFinite(bannerGoal.xg) && <b className="live-banner-xg">xG {formatXg(bannerGoal.xg)}</b>}
          </div>
        )}
      </div>
      <div className="live-match-grid">
        <ShotMap match={match} shots={shots} selected={selected} newestShot={newestShot} onSelect={selectShot} />
        <EventFeed events={events} animated={new Set(activeEvents.map((event) => event.sequence))}
          newest={newest} selected={selected} onSelect={selectShot} selectable={selectable} />
      </div>
      <XgTimeline match={match} summary={summary} selection={summary.shotPoints.get(selected?.sequence)} latest={latestPoint} />
      <p className="live-note">Datos de <a href="https://github.com/statsbomb/open-data">StatsBomb Open Data</a>. La tanda de penaltis se muestra en el marcador y en el feed.</p>
    </div>
  );
}

export default function LiveMatchPage() {
  const { matchId } = useParams();
  return <MatchView key={matchId} matchId={matchId} />;
}
