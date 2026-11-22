import { Link } from 'react-router-dom';
import { teamLabel } from '../../matchLabels.js';

export default function MatchBreadcrumbs({ match }) {
  return (
    <nav className="match-breadcrumbs" aria-label="Ruta del partido">
      <ol>
        <li><Link to="/overview">Visión general</Link></li>
        <li><Link to="/matches">Partidos</Link></li>
        <li aria-current="page">{match ? `${teamLabel(match.homeTeam)} – ${teamLabel(match.awayTeam)}` : 'Centro de partido'}</li>
      </ol>
    </nav>
  );
}
