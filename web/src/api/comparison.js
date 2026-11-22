import client from './client.js';

async function readPages(path, signal) {
  const read = (page) => client.get(path, { params: { limit: 200, page }, signal }).then(({ data }) => data);
  const first = await read(1);
  const items = [...first.data];
  for (let page = 2; page <= first.totalPages; page++) {
    items.push(...(await read(page)).data);
  }
  return items;
}

export async function getComparisonDirectory(signal) {
  const [clubs, competitions] = await Promise.all([
    readPages('/clubs', signal),
    readPages('/competitions', signal),
  ]);
  return {
    clubs: new Map(clubs.map((item) => [item._id, item])),
    competitions: new Map(competitions.map((item) => [item._id, item])),
  };
}

export const getComparisonStats = (leftId, rightId, signal) =>
  Promise.all([leftId, rightId].map((id) => readPages(`/players/${id}/stats`, signal)));
