import players from './catalog/players.json';
import clubs from './catalog/clubs.json';
import nationalTeams from './catalog/nationalTeams.json';
import matchTeams from './catalog/matchTeams.json';

const currentAssets = (records) => new Map(records.filter((entry) => entry.status === 'verified').map((entry) => [
  entry.id,
  { ...entry, url: `${import.meta.env.BASE_URL}media/${entry.file}` },
]));

const playerAssets = currentAssets(players);
const clubAssets = currentAssets(clubs);
const nationalAssets = currentAssets(nationalTeams);
const externalId = (entity) => String(entity?.externalIds?.transfermarkt ?? '');

export const identityAssets = [...playerAssets.values(), ...clubAssets.values(), ...nationalAssets.values()];

// Only Transfermarkt's image host is trusted (the API validates it too).
const TRANSFERMARKT_IMAGE = /^https:\/\/img\.a\.transfermarkt\.technology\/portrait\//;

// A verified local portrait first; otherwise the Transfermarkt photo from the
// player record; otherwise null (the component shows initials).
export function getPlayerPortrait(player) {
  const asset = playerAssets.get(externalId(player));
  if (asset && player.birthDate?.slice(0, 10) === asset.birthDate) return asset;
  if (typeof player?.imageUrl === 'string' && TRANSFERMARKT_IMAGE.test(player.imageUrl)) {
    return { url: player.imageUrl, external: true, credit: 'Foto: Transfermarkt', position: 'center 20%' };
  }
  return null;
}

// Transfermarkt serves every crest (clubs and national teams) at a fixed URL
// built from its numeric id. A missing one 404s and the badge shows initials.
export function transfermarktCrest(id) {
  const tmId = String(id ?? '');
  if (!/^\d{1,7}$/.test(tmId)) return null;
  return { url: `https://tmssl.akamaized.net/images/wappen/head/${tmId}.png`, external: true, credit: 'Escudo: Transfermarkt' };
}

// A verified local crest first; otherwise Transfermarkt's.
export const getClubCrest = (club) => clubAssets.get(externalId(club)) ?? transfermarktCrest(externalId(club));
export const getNationalCrest = (id) => nationalAssets.get(String(id)) ?? transfermarktCrest(id);

export function getMatchTeam(match, side) {
  const pair = Object.hasOwn(matchTeams, match.matchId) ? matchTeams[match.matchId] : null;
  const name = side === 'home' ? match.homeTeam : match.awayTeam;
  const contextMatches = pair?.competition === match.competition && pair?.season === match.season;
  const link = contextMatches ? pair?.[side] : null;
  return link?.name === name ? link : null;
}
