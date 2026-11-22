import { getPlayerPortrait } from '../../media/identityCatalog.js';
import IdentityImage from './IdentityImage.jsx';

export default function PlayerAvatar({ player, className = '', decorative = false, eager = false }) {
  return (
    <IdentityImage
      asset={getPlayerPortrait(player)}
      className={`identity-avatar ${className}`}
      name={player.name}
      alt={`Retrato de ${player.name}`}
      fallbackLabel={`Retrato no disponible de ${player.name}`}
      decorative={decorative}
      eager={eager}
    />
  );
}
