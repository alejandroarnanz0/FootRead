import client from './client.js';
import { getClub } from './clubs.js';

const get = (path, signal, params) =>
  client.get(path, { params, signal }).then(({ data }) => data);

export async function getMarketOverview(signal) {
  const [summary, competitions] = await Promise.all([
    get('/aggregates/summary', signal),
    get('/competitions', signal, { limit: 1 }),
  ]);
  return { ...summary, competitions: competitions.total };
}

const RANKING_PAGE_SIZE = 6;
const rankingPage = (response, players, page) => ({
  players,
  // Both rankings are descending, so invalid rows at the end cannot be
  // followed by eligible rows on subsequent pages.
  hasMore: page < response.totalPages && players.length === response.data.length,
});

export async function getMarketLeaders(page, signal) {
  const response = await get('/players', signal, { sort: '-currentValue', page, limit: RANKING_PAGE_SIZE });
  const { data } = response;
  const players = data.filter((player) => Number.isFinite(player.currentValue));
  const clubIds = [...new Set(players.map((player) => player.club).filter(Boolean))];
  const clubs = await Promise.all(clubIds.map(async (id) => {
    try {
      return [id, await getClub(id, signal)];
    } catch (error) {
      if (signal.aborted || error.response?.status !== 404) throw error;
      return [id, null];
    }
  }));
  const clubDetails = new Map(clubs);
  return rankingPage(response, players.map((player) => ({ ...player, club: clubDetails.get(player.club) })), page);
}

export async function getScoutingLeaders(page, signal) {
  const response = await get('/aggregates/undervalued', signal, { sort: '-residual', page, limit: RANKING_PAGE_SIZE });
  return rankingPage(response, response.data.filter((player) => player.residual > 0), page);
}
