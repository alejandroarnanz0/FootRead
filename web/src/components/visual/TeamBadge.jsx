import { teamLabel } from '../../matchLabels.js';
import { getClubCrest, getMatchTeam, getNationalCrest } from '../../media/identityCatalog.js';
import IdentityImage from './IdentityImage.jsx';

function Crest({ asset, name, className = '', decorative = false }) {
  return (
    <IdentityImage asset={asset} className={`identity-crest ${className}`} name={name}
      alt={`Escudo de ${name}`} fallbackLabel={`Escudo no disponible de ${name}`} decorative={decorative} />
  );
}

export function ClubCrest({ club, name = club?.name ?? 'Club', ...props }) {
  return <Crest asset={getClubCrest(club)} name={name} {...props} />;
}

export function NationalTeamBadge({ teamId, name, ...props }) {
  return <Crest asset={getNationalCrest(teamId)} name={name} {...props} />;
}

export function MatchTeamBadge({ match, side, ...props }) {
  const team = getMatchTeam(match, side);
  const name = teamLabel(side === 'home' ? match.homeTeam : match.awayTeam);
  if (team?.type === 'national') return <NationalTeamBadge teamId={team.id} name={name} {...props} />;
  if (team?.type === 'club') return <ClubCrest club={{ externalIds: { transfermarkt: team.id } }} name={name} {...props} />;
  return <Crest name={name} {...props} />;
}
