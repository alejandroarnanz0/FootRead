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

export function getPlayerPortrait(player) {
  const asset = playerAssets.get(externalId(player));
  return asset && player.birthDate?.slice(0, 10) === asset.birthDate ? asset : null;
}

export const getClubCrest = (club) => clubAssets.get(externalId(club)) ?? null;
export const getNationalCrest = (id) => nationalAssets.get(String(id)) ?? null;

export function getMatchTeam(match, side) {
  const pair = Object.hasOwn(matchTeams, match.matchId) ? matchTeams[match.matchId] : null;
  const name = side === 'home' ? match.homeTeam : match.awayTeam;
  const contextMatches = pair?.competition === match.competition && pair?.season === match.season;
  const link = contextMatches ? pair?.[side] : null;
  return link?.name === name ? link : null;
}
