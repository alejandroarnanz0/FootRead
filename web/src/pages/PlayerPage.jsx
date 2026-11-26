import { Link, useParams } from 'react-router-dom';

import { getClub } from '../api/clubs.js';
import { getCompetition } from '../api/competitions.js';
import { getPlayer } from '../api/players.js';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading, Notice } from '../components/Status.jsx';
import MediaCredit from '../components/visual/MediaCredit.jsx';
import PlayerAvatar from '../components/visual/PlayerAvatar.jsx';
import { ClubCrest } from '../components/visual/TeamBadge.jsx';
import { useApi } from '../hooks/useApi.js';
import { ageFrom, formatEuros, formatResidual, POSITION_LABELS } from '../format.js';
import { getPlayerPortrait } from '../media/identityCatalog.js';

function PlayerHeader({ player }) {
  const { data: club, loading: clubLoading } = useApi(
    (signal) => player.club ? getClub(player.club, signal) : Promise.resolve(null),
    [player.club]
  );
  const competitionId = club?.competition;
  const { data: competition } = useApi(
    (signal) => competitionId ? getCompetition(competitionId, signal) : Promise.resolve(null),
    [competitionId]
  );
  const age = ageFrom(player.birthDate);
  const position = POSITION_LABELS[player.position] ?? 'Posición no disponible';
  return (
    <div className="card player-profile">
      <PlayerAvatar player={player} className="player-profile-portrait" eager />
      <div className="player-profile-copy">
        <PageHeader title={player.name} description={age === null ? position : `${position} · ${age} años`} />
        <div className="identity-inline player-profile-club">
          {club ? <><ClubCrest club={club} /><div><strong>{club.name}</strong><span className="muted">{competition?.name ?? 'Competición no disponible'}</span></div></>
            : <span className="muted">{player.club && clubLoading ? 'Cargando club…' : 'Club no disponible'}</span>}
        </div>
        <dl className="player-profile-market">
          <dt>Valor de mercado</dt>
          <dd>{formatEuros(player.currentValue)}</dd>
        </dl>
        <MediaCredit asset={getPlayerPortrait(player)} className="identity-photo-credit" />
      </div>
    </div>
  );
}

const WIKIPEDIA_ARTICLE = /^https:\/\/(?:es|en)\.wikipedia\.org\/wiki\/[^\s?#]+$/;

// Lead paragraph of the player's Wikipedia article (CC BY-SA), loaded by the
// 06-bios ETL. Players without an article simply show nothing.
function PlayerBio({ bio }) {
  if (typeof bio?.text !== 'string' || !bio.text || !WIKIPEDIA_ARTICLE.test(bio.url ?? '')) return null;
  return (
    <section className="card player-bio" aria-labelledby="player-bio-title">
      <h2 id="player-bio-title">Sobre el jugador</h2>
      <p lang={bio.lang}>{bio.text}</p>
      <p className="identity-photo-credit">
        Texto de <a href={bio.url} target="_blank" rel="noopener noreferrer">Wikipedia</a>
        {' · '}<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
      </p>
    </section>
  );
}

export default function PlayerPage() {
  const { playerId } = useParams();
  return <PlayerDetails key={playerId} playerId={playerId} />;
}

function PlayerDetails({ playerId }) {
  const { data: player, error, retry } = useApi((signal) => getPlayer(playerId, signal), [playerId]);

  return (
    <div className="page">
      <Link to="/" className="back">
        ← Volver al Explorador
      </Link>

      {error ? (
        <ErrorMessage
          title={error.response && error.response.status === 404 ? 'Jugador no encontrado' : 'No se ha podido cargar el jugador'}
          error={error}
          onRetry={error.response && error.response.status === 404 ? undefined : retry}
        />
      ) : !player ? (
        <Loading>Cargando jugador…</Loading>
      ) : (
        <>
          <PlayerHeader player={player} />
          <PlayerBio bio={player.bio} />
          <dl className="facts card">
            <div>
              <dt>Referencia por comparables</dt>
              <dd>{formatEuros(player.predictedValue)}</dd>
            </div>
            <div>
              <dt>Residuo</dt>
              <dd>
                {player.predictedValue != null && player.currentValue != null
                  ? formatResidual(player.predictedValue - player.currentValue)
                  : '—'}
              </dd>
            </div>
          </dl>
          <Notice>Ficha en construcción. Próximamente incluirá el historial de valor, las estadísticas y los jugadores comparables.</Notice>
        </>
      )}
    </div>
  );
}
