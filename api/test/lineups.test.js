const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { startApi } = require('./helpers/apiServer');
const { mongoose } = require('./helpers/testDb');
const Lineup = require('../models/Lineup');
const Player = require('../models/Player');
const Club = require('../models/Club');
const Competition = require('../models/Competition');
const User = require('../models/User');

const route = '/api/lineups';
const bogus = '000000000000000000000001';
const ref = (slotId, player) => ({ slotId, playerId: String(player._id) });

describe('private lineups and catalog filters', () => {
  let srv, player, otherPlayer, removed, otherUser, otherToken, created, club, competition;
  const email = `lineup-${randomUUID()}@example.test`;

  before(async () => {
    srv = await startApi();
    assert.ok(mongoose.connection.name.endsWith('_test'));
    competition = await Competition.create({ code: `XI-${randomUUID()}`, name: 'Lineup test competition' });
    club = await Club.create({ name: 'Lineup test club', competition: competition._id });
    [player, otherPlayer, removed] = await Player.create([
      { name: 'Líneup Fixture Alpha', position: 'GK', subPosition: 'Goalkeeper', currentValue: 25, club: club._id },
      { name: 'Lineup Fixture Beta', position: 'FW', subPosition: 'Centre-Forward', currentValue: 12, club: club._id },
      { name: 'Lineup Fixture Gamma', position: 'FW', subPosition: 'Left Winger', club: club._id },
    ]);
    const registration = await srv.api('POST', '/api/auth/register', { email, password: randomUUID() });
    assert.equal(registration.status, 201);
    otherToken = registration.body.token;
    otherUser = registration.body.user._id;
  });

  after(async () => {
    if (!srv || !mongoose.connection.name.endsWith('_test')) return;
    const owner = await User.findOne({ email: 'helper@example.com' });
    await Lineup.deleteMany({ owner: { $in: [owner?._id, otherUser].filter(Boolean) } });
    await Player.deleteMany({ _id: { $in: [player, otherPlayer, removed].filter(Boolean).map((row) => row._id) } });
    if (club) await Club.deleteOne({ _id: club._id });
    if (competition) await Competition.deleteOne({ _id: competition._id });
    await User.deleteOne({ email });
    await srv.close();
  });

  const input = (extra = {}) => ({
    name: 'Mi XI', formation: '4-3-3', budgetEuros: 31, slots: [ref('GK', player)], ...extra,
  });
  const alternate = (method, url, body, token = otherToken) => fetch(srv.base + url, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  it('protects every operation and derives ownership from the authenticated user', async () => {
    assert.equal((await srv.api('GET', route, undefined, { auth: false })).status, 401);
    assert.equal((await alternate('GET', route, undefined, 'not-a-jwt')).status, 401);
    const result = await srv.api('POST', route, input({ owner: otherUser }));
    assert.equal(result.status, 201);
    created = result.body;
    assert.equal(created.revision, 1);
    assert.equal(created.slots[0].player.currentValue, 25);
    assert.equal(created.owner, undefined);
    assert.equal((await srv.api('GET', route)).body.data.some((item) => item._id === created._id), true);
    assert.deepEqual((await (await alternate('GET', route)).json()).data, []);
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      assert.equal((await alternate(method, `${route}/${created._id}`, method === 'GET' ? undefined : input())).status, 404);
    }
    assert.equal((await srv.api('GET', `${route}/${bogus}`)).status, 404);
    assert.equal((await srv.api('GET', `${route}/malformed`)).status, 400);
  });

  it('rejects invalid writes and supports empty or incomplete lineups', async () => {
    for (const data of [
      input({ name: ' ' }), input({ name: 'x'.repeat(81) }), input({ formation: '0-0-0' }),
      input({ slots: [ref('LWB', player)] }), input({ slots: [ref('GK', player), ref('GK', otherPlayer)] }),
      input({ slots: [ref('GK', player), { ...ref('RW', player), playerId: String(player._id).toUpperCase() }] }),
      input({ slots: [{ slotId: 'GK', playerId: bogus }] }), input({ slots: [{ slotId: 'GK', playerId: null }] }),
      input({ budgetEuros: 0 }), input({ budgetEuros: '5' }), input({ budgetEuros: 0.3 }),
      input({ slots: Array.from({ length: 12 }, () => ref('GK', player)) }),
    ]) {
      assert.equal((await srv.api('POST', route, data)).status, 400);
    }
    const empty = await srv.api('POST', route, input({ slots: [], budgetEuros: null }));
    assert.equal(empty.status, 201);
    assert.deepEqual(empty.body.slots, []);
  });

  it('reads, edits, duplicates and deletes with revision guards', async () => {
    const url = `${route}/${created._id}`;
    assert.equal((await srv.api('GET', url)).body.name, 'Mi XI');
    const results = await Promise.all(['A', 'B'].map((name) =>
      srv.api('PATCH', url, input({ name, revision: 1, slots: [ref('ST', otherPlayer)] }))));
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
    const current = results.find(({ status }) => status === 200).body;
    assert.equal(current.revision, 2);
    const copy = await srv.api('POST', route, input({ name: `Copia de ${current.name}`, slots: current.slots }));
    assert.equal(copy.status, 201);
    assert.notEqual(copy.body._id, created._id);
    assert.equal((await srv.api('DELETE', url, { revision: 1 })).status, 409);
    assert.equal((await srv.api('DELETE', url, { revision: 2 })).status, 204);
    assert.equal((await srv.api('GET', url)).status, 404);
  });

  it('keeps deleted player IDs visible and lets the owner repair the lineup', async () => {
    const record = (await srv.api('POST', route, input({ slots: [ref('LW', removed)] }))).body;
    await Player.deleteOne({ _id: removed._id });
    const url = `${route}/${record._id}`;
    assert.deepEqual((await srv.api('GET', url)).body.slots, [{ ...ref('LW', removed), player: null }]);
    assert.equal((await srv.api('PATCH', url, input({ slots: [ref('LW', removed)], revision: 1 }))).status, 200);
    assert.equal((await srv.api('PATCH', url, input({ slots: [], revision: 2 }))).status, 200);
  });

  it('combines club, competition, accent-insensitive search, subposition and value before paging', async () => {
    const query = new URLSearchParams({
      q: 'lineup fixture', clubId: club._id, competition: competition.code, subPosition: 'Goalkeeper,Centre-Forward',
      minValue: 11, maxValue: 25, limit: 1, sort: '-currentValue',
    });
    const first = (await srv.api('GET', `/api/players?${query}`)).body;
    assert.equal(first.total, 2);
    assert.equal(first.data[0]._id, String(player._id));
    assert.equal((await srv.api('GET', `/api/players?${query}&page=2`)).body.data[0]._id, String(otherPlayer._id));
    assert.equal((await srv.api('GET', '/api/players?minValue=26&maxValue=25')).status, 400);
    assert.equal((await srv.api('GET', '/api/players?clubId=invalid')).status, 400);
    assert.equal((await srv.api('GET', '/api/players?subPosition%5B%24ne%5D=Goalkeeper')).status, 400);
  });

  it('serves the shared catalog and can save and restore each of its 29 formations', async () => {
    assert.equal((await srv.api('GET', `${route}/formations`, undefined, { auth: false })).status, 401);
    const catalog = await srv.api('GET', `${route}/formations`);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.data.length, 29);
    for (const { key, slots } of catalog.body.data) {
      assert.equal(slots.length, 11, key);
      const assignments = [ref('GK', player), ref(slots.at(-1).id, otherPlayer)];
      const written = await srv.api('POST', route, input({ name: `XI ${key}`, formation: key, slots: assignments }));
      assert.equal(written.status, 201, key);
      const url = `${route}/${written.body._id}`;
      const read = await srv.api('GET', url);
      assert.equal(read.status, 200, key);
      assert.equal(read.body.formation, key);
      assert.deepEqual(read.body.slots.map(({ slotId, playerId }) => ({ slotId, playerId })), assignments);
      assert.equal((await srv.api('DELETE', url, { revision: written.body.revision })).status, 204, key);
    }
  });

  it('excludes selected IDs before counting and paging, without hiding players with identical names', async (t) => {
    const namesake = await Player.create({
      name: otherPlayer.name, position: 'FW', subPosition: 'Centre-Forward', currentValue: 19, club: club._id,
    });
    t.after(() => Player.deleteOne({ _id: namesake._id }));
    const search = '/api/players?q=lineup+fixture&limit=1&sort=-currentValue';
    const legacy = await srv.api('GET', search);
    assert.equal(legacy.body.total, 3);
    assert.equal(legacy.body.data[0]._id, String(player._id));

    const filtered = `${search}&excludeIds=${player._id}`;
    const first = (await srv.api('GET', filtered)).body;
    const second = (await srv.api('GET', `${filtered}&page=2`)).body;
    assert.equal(first.total, 2);
    assert.equal(first.totalPages, 2);
    assert.equal(first.data[0]._id, String(namesake._id));
    assert.equal(second.data[0]._id, String(otherPlayer._id));
    assert.equal(first.data[0].name, second.data[0].name);
    const oneLeft = (await srv.api('GET', `${search}&excludeIds=${player._id},${namesake._id}`)).body;
    assert.equal(oneLeft.totalPages, 1);
    assert.equal(oneLeft.data[0]._id, String(otherPlayer._id));
    assert.equal((await srv.api('GET', `${search}&excludeIds=invalid`)).status, 400);
    assert.equal((await srv.api('GET', `${search}&excludeIds%5B%24ne%5D=${player._id}`)).status, 400);
    assert.equal((await srv.api('GET', `${search}&excludeIds=${Array(12).fill(player._id).join(',')}`)).status, 400);
  });
});
