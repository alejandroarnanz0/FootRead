import { Link } from 'react-router-dom';
import { ageFrom, formatEuros, POSITION_LABELS } from '../../format.js';
import { getPlayerPortrait } from '../../media/identityCatalog.js';
import MediaCredit from '../visual/MediaCredit.jsx';
import PlayerAvatar from '../visual/PlayerAvatar.jsx';
import { ClubCrest } from '../visual/TeamBadge.jsx';

const missing = 'No disponible';

export default function PlayerIdentity({ player, directory, side }) {
  const club = directory?.clubs.get(player.club);
  const competition = directory?.competitions.get(club?.competition);
  const age = ageFrom(player.birthDate);

  return (
    <article className="card compare-identity">
      <p className="compare-eyebrow">Jugador {side}</p>
      <div className="compare-identity-main">
        <PlayerAvatar player={player} className="compare-portrait" eager />
        <div className="compare-identity-copy">
          <h2>{player.name}</h2>
          {club ? (
            <div className="compare-club">
              <ClubCrest club={club} />
              <div><strong>{club.name}</strong><span>{competition?.name ?? 'Competición no disponible'}</span></div>
            </div>
          ) : <p className="muted">Club no disponible</p>}
          <dl className="compare-profile-facts">
            <div><dt>Posición</dt><dd>{POSITION_LABELS[player.position] ?? missing}</dd></div>
            <div><dt>Edad</dt><dd>{Number.isFinite(age) ? `${age} años` : missing}</dd></div>
          </dl>
        </div>
      </div>
      <div className="compare-identity-footer">
        <dl className="compare-profile-value">
          <div><dt>Valor de mercado</dt><dd>{Number.isFinite(player.currentValue) ? formatEuros(player.currentValue) : missing}</dd></div>
        </dl>
        <Link to={`/players/${player._id}`} aria-label={`Ver ficha de ${player.name}`}>Ver ficha <span aria-hidden="true">→</span></Link>
      </div>
      <MediaCredit asset={getPlayerPortrait(player)} className="identity-photo-credit" />
    </article>
  );
}
