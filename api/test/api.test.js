const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Integration tests run against a disposable database, never the real one.
const testUri = process.env.MONGODB_URI_TEST;
const dbName = testUri && new URL(testUri).pathname.slice(1);
if (!dbName || !dbName.endsWith('_test')) {
  throw new Error('MONGODB_URI_TEST must point to a database whose name ends in _test');
}
process.env.MONGODB_URI = testUri;
process.env.NODE_ENV = 'test';

const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const Player = require('../models/Player');
const Valuation = require('../models/Valuation');
const SeasonStat = require('../models/SeasonStat');

let server;
let base;

const api = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

// Empties every collection. deleteMany (unlike dropDatabase) needs no extra
// privileges on Atlas.
const wipe = async () => {
  assert.ok(mongoose.connection.name.endsWith('_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
};

const bornYearsAgo = (years) => new Date(Date.now() - (years * 365.25 + 30) * 864e5).toISOString();

describe('API', () => {
  const ids = {};

  before(async () => {
    await mongoose.connection.asPromise();
    await wipe();
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
    server = http.createServer(app).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections(); // fetch keeps connections alive
    await new Promise((resolve) => server.close(resolve));
    await wipe();
    await mongoose.disconnect();
  });

  describe('competitions', () => {
    it('creates (201), ignores unknown fields and rejects duplicates (409)', async () => {
      const res = await api('POST', '/api/competitions', { code: 'ES1', name: 'LaLiga', tier: 1, junk: 'x' });
      assert.equal(res.status, 201);
      assert.equal(res.body.junk, undefined);
      ids.es = res.body._id;
      assert.equal((await api('POST', '/api/competitions', { code: 'ES1', name: 'Dup' })).status, 409);
      const en = await api('POST', '/api/competitions', { code: 'EN1', name: 'Premier League', tier: 1 });
      ids.en = en.body._id;
    });

    it('answers 400 on validation and on a malformed id, 404 on a missing one', async () => {
      assert.equal((await api('POST', '/api/competitions', { code: 'XX1' })).status, 400);
      assert.equal((await api('GET', '/api/competitions/not-an-id')).status, 400);
      assert.equal((await api('GET', '/api/competitions/aaaaaaaaaaaaaaaaaaaaaaaa')).status, 404);
    });

    it('lists with pagination, updates and rejects an empty update', async () => {
      const list = await api('GET', '/api/competitions?sort=-code&limit=1');
      assert.equal(list.body.data.length, 1);
      assert.equal(list.body.data[0].code, 'ES1');
      assert.equal(list.body.total, 2);
      assert.equal(list.body.totalPages, 2);
      const put = await api('PUT', `/api/competitions/${ids.es}`, { name: 'La Liga' });
      assert.equal(put.body.name, 'La Liga');
      assert.equal((await api('PUT', `/api/competitions/${ids.es}`, { junk: 1 })).status, 400);
    });
  });

  describe('clubs', () => {
    it('takes the competition from the URL, never from the body', async () => {
      const res = await api('POST', `/api/competitions/${ids.es}/clubs`, { name: 'Madrid', competition: ids.en });
      assert.equal(res.status, 201);
      assert.equal(res.body.competition, ids.es);
      ids.madrid = res.body._id;
      ids.getafe = (await api('POST', `/api/competitions/${ids.es}/clubs`, { name: 'Getafe' })).body._id;
      ids.arsenal = (await api('POST', `/api/competitions/${ids.en}/clubs`, { name: 'Arsenal' })).body._id;
      assert.equal((await api('POST', `/api/competitions/${ids.es}/clubs`, {})).status, 400);
    });

    it('404s when the club does not belong to the competition in the URL', async () => {
      assert.equal((await api('GET', `/api/competitions/${ids.es}/clubs/${ids.arsenal}`)).status, 404);
      assert.equal((await api('GET', `/api/competitions/${ids.en}/clubs/${ids.arsenal}`)).status, 200);
      assert.equal((await api('GET', `/api/clubs/${ids.arsenal}`)).status, 200);
    });

    it('lists only the clubs of the competition under the nested route', async () => {
      const list = await api('GET', `/api/competitions/${ids.es}/clubs?sort=name`);
      assert.deepEqual(list.body.data.map((c) => c.name), ['Getafe', 'Madrid']);
      // The URL already fixes the competition, so the filter is ignored.
      const ignored = await api('GET', `/api/competitions/${ids.es}/clubs?sort=name&competition=EN1`);
      assert.deepEqual(ignored.body.data.map((c) => c.name), ['Getafe', 'Madrid']);
    });

    it('lists clubs of every competition globally and filters by competition code', async () => {
      const names = (q) => api('GET', `/api/clubs${q}`).then((r) => r.body.data.map((c) => c.name));
      assert.deepEqual(await names('?sort=name'), ['Arsenal', 'Getafe', 'Madrid']);
      assert.deepEqual(await names('?competition=EN1'), ['Arsenal']);
      assert.deepEqual(await names('?competition=NOPE'), []);
      const page = await api('GET', '/api/clubs?sort=name&page=2&limit=2');
      assert.deepEqual(page.body.data.map((c) => c.name), ['Madrid']);
      assert.equal(page.body.total, 3);
      assert.equal((await api('GET', '/api/clubs?sort=password')).status, 400);
    });

    it('does not create clubs outside a competition', async () => {
      assert.equal((await api('POST', '/api/clubs', { name: 'X' })).status, 404);
    });
  });

  describe('players', () => {
    const create = (club, body) => api('POST', `/api/clubs/${club}/players`, body);

    it('creates under the club in the URL and validates the schema', async () => {
      const a = await create(ids.madrid, {
        name: 'Alpha', position: 'FW', birthDate: bornYearsAgo(20), currentValue: 2e6, club: ids.arsenal, predictedValue: 1,
      });
      assert.equal(a.status, 201);
      assert.equal(a.body.club, ids.madrid);
      assert.equal(a.body.predictedValue, undefined);
      ids.alpha = a.body._id;
      ids.beta = (await create(ids.getafe, { name: 'Beta', position: 'FW', birthDate: bornYearsAgo(30), currentValue: 10e6 })).body._id;
      ids.gamma = (await create(ids.arsenal, { name: 'Gamma', position: 'DF', birthDate: bornYearsAgo(22), currentValue: 1e6 })).body._id;
      ids.delta = (await create(ids.madrid, { name: 'Delta', position: 'GK', birthDate: bornYearsAgo(35), currentValue: 5e5 })).body._id;
      assert.equal((await create(ids.madrid, { name: 'Bad', position: 'XX' })).status, 400);
      assert.equal((await create(ids.madrid, { name: 'Tall', position: 'GK', heightCm: 300 })).status, 400);
    });

    it('also resolves through the full nested path and 404s on the wrong parent', async () => {
      const ok = await api('GET', `/api/competitions/${ids.es}/clubs/${ids.madrid}/players/${ids.alpha}`);
      assert.equal(ok.status, 200);
      assert.equal((await api('GET', `/api/clubs/${ids.getafe}/players/${ids.alpha}`)).status, 404);
      assert.equal((await api('GET', `/api/competitions/${ids.en}/clubs/${ids.madrid}/players`)).status, 404);
      assert.equal((await api('POST', '/api/players', { name: 'X', position: 'FW' })).status, 404);
    });

    it('lists players of every club globally with all the filters', async () => {
      const q = (query) => api('GET', `/api/players${query}`).then((r) => r.body);
      const names = async (query) => (await q(query)).data.map((p) => p.name);
      assert.deepEqual(await names('?sort=name'), ['Alpha', 'Beta', 'Delta', 'Gamma']);
      assert.deepEqual(await names('?position=FW&sort=-currentValue'), ['Beta', 'Alpha']);
      assert.deepEqual(await names('?position=FW,DF&sort=name'), ['Alpha', 'Beta', 'Gamma']);
      assert.deepEqual(await names('?competition=ES1&sort=name'), ['Alpha', 'Beta', 'Delta']);
      assert.deepEqual(await names('?competition=EN1'), ['Gamma']);
      assert.deepEqual(await names('?minAge=18&maxAge=25&sort=name'), ['Alpha', 'Gamma']);
      assert.deepEqual(await names('?maxValue=1000000&sort=name'), ['Delta', 'Gamma']);
      assert.deepEqual(await names('?competition=ES1&position=FW&maxValue=5000000'), ['Alpha']);
      assert.deepEqual(await names('?competition=NOPE'), []);
      const page = await q('?sort=name&page=2&limit=3');
      assert.deepEqual(page.data.map((p) => p.name), ['Gamma']);
      assert.equal(page.total, 4);
      assert.equal(page.totalPages, 2);
      assert.equal((await q('?limit=9999')).limit, 200);
    });

    it('rejects bad filters on the global list too', async () => {
      const status = (query) => api('GET', `/api/players${query}`).then((r) => r.status);
      assert.equal(await status('?position[$ne]=GK'), 400);
      assert.equal(await status('?competition[$ne]=ES1'), 400);
      assert.equal(await status('?sort=password'), 400);
    });

    it('ignores the competition filter under a club, whose URL already fixes it', async () => {
      const res = await api('GET', `/api/clubs/${ids.madrid}/players?competition=EN1&sort=name`);
      assert.deepEqual(res.body.data.map((p) => p.name), ['Alpha', 'Delta']);
    });

    it('applies the query-string filters, sort and pagination', async () => {
      const list = (q) => api('GET', `/api/clubs/${ids.madrid}/players${q}`).then((r) => r.body);
      assert.deepEqual((await list('?position=FW')).data.map((p) => p.name), ['Alpha']);
      assert.deepEqual((await list('?minAge=18&maxAge=23')).data.map((p) => p.name), ['Alpha']);
      assert.deepEqual((await list('?maxValue=1000000')).data.map((p) => p.name), ['Delta']);
      assert.deepEqual((await list('?sort=-currentValue')).data.map((p) => p.name), ['Alpha', 'Delta']);
      const page = await list('?sort=name&page=2&limit=1');
      assert.deepEqual(page.data.map((p) => p.name), ['Delta']);
      assert.equal(page.total, 2);
      assert.equal((await list('?limit=9999')).limit, 200);
    });

    it('answers 400 on bad filters, including operator injection', async () => {
      const get = (q) => api('GET', `/api/clubs/${ids.madrid}/players${q}`).then((r) => r.status);
      assert.equal(await get('?position=XX'), 400);
      assert.equal(await get('?position[$ne]=GK'), 400);
      assert.equal(await get('?minAge=30&maxAge=20'), 400);
      assert.equal(await get('?page=0'), 400);
      assert.equal(await get('?sort=password'), 400);
    });

    it('updates (200) and 409s on a duplicate external id', async () => {
      const put = await api('PUT', `/api/players/${ids.alpha}`, { currentValue: 3e6, club: ids.arsenal });
      assert.equal(put.body.currentValue, 3e6);
      assert.equal(put.body.club, ids.madrid);
      assert.equal((await api('PUT', `/api/players/${ids.alpha}`, { position: 'ZZ' })).status, 400);
      await api('PUT', `/api/players/${ids.alpha}`, { externalIds: { transfermarkt: '1' } });
      const dup = await api('PUT', `/api/players/${ids.beta}`, { externalIds: { transfermarkt: '1' } });
      assert.equal(dup.status, 409);
    });
  });

  describe('valuations and stats', () => {
    it('lists the player history, 404 for an unknown player', async () => {
      await Valuation.create([
        { player: ids.alpha, date: new Date('2024-01-01'), value: 1e6 },
        { player: ids.alpha, date: new Date('2023-01-01'), value: 5e5 },
      ]);
      const v = await api('GET', `/api/players/${ids.alpha}/valuations`);
      assert.deepEqual(v.body.data.map((x) => x.value), [5e5, 1e6]);
      assert.equal(v.body.data[0]._id, undefined);
      assert.equal((await api('GET', '/api/players/aaaaaaaaaaaaaaaaaaaaaaaa/valuations')).status, 404);

      await SeasonStat.create({ player: ids.alpha, season: '2023-24', competition: ids.es, minutes: 900, goals: 5 });
      const s = await api('GET', `/api/players/${ids.alpha}/stats`);
      assert.equal(s.body.data[0].goals, 5);
      assert.equal(s.body.data[0].competition.code, 'ES1');
    });
  });

  describe('aggregates and predictions', () => {
    before(async () => {
      await Player.updateOne({ _id: ids.alpha }, { predictedValue: 9e6 }); // value 3M -> residual +6M
      await Player.updateOne({ _id: ids.beta }, { predictedValue: 9e6 }); //  value 10M -> residual -1M
      await Player.updateOne({ _id: ids.gamma }, { predictedValue: 1.5e6 }); // value 1M -> residual +0.5M
    });

    it('ranks undervalued players by residual and honours the filters', async () => {
      const rank = (q) => api('GET', `/api/aggregates/undervalued${q}`).then((r) => r.body);
      const all = await rank('');
      assert.deepEqual(all.data.map((p) => p.name), ['Alpha', 'Gamma', 'Beta']);
      assert.equal(all.data[0].residual, 6e6);
      assert.equal(all.data[0].club.name, 'Madrid');
      assert.equal(all.total, 3);
      assert.deepEqual((await rank('?competition=ES1')).data.map((p) => p.name), ['Alpha', 'Beta']);
      assert.deepEqual((await rank('?position=DF')).data.map((p) => p.name), ['Gamma']);
      assert.deepEqual((await rank('?sort=residual&limit=1')).data.map((p) => p.name), ['Beta']);
      assert.equal((await rank('?competition=NOPE')).total, 0);
    });

    it('computes the summary KPIs', async () => {
      const s = (await api('GET', '/api/aggregates/summary')).body;
      assert.equal(s.players, 4);
      assert.equal(s.scoredPlayers, 3);
      assert.equal(s.maeEuros, 7.5e6 / 3);
      assert.equal(s.meanResidual, 5.5e6 / 3);
      const empty = (await api('GET', '/api/aggregates/summary?competition=NOPE')).body;
      assert.equal(empty.players, 0);
      assert.equal(empty.maeEuros, null);
    });

    it('serves the prediction stub', async () => {
      const res = await api('POST', '/api/predictions/value', { age: 21 });
      assert.equal(res.status, 200);
      assert.equal(res.body.predictedValue, 10000000);
    });
  });

  describe('deletes', () => {
    it('refuses to delete parents that still have children (409)', async () => {
      assert.equal((await api('DELETE', `/api/clubs/${ids.madrid}`)).status, 409);
      assert.equal((await api('DELETE', `/api/competitions/${ids.es}`)).status, 409);
    });

    it('cascades a player delete to valuations and stats, then frees the parents', async () => {
      assert.equal((await api('DELETE', `/api/players/${ids.alpha}`)).status, 204);
      assert.equal(await Valuation.countDocuments({ player: ids.alpha }), 0);
      assert.equal(await SeasonStat.countDocuments({ player: ids.alpha }), 0);
      assert.equal((await api('GET', `/api/players/${ids.alpha}`)).status, 404);
      await api('DELETE', `/api/players/${ids.delta}`);
      assert.equal((await api('DELETE', `/api/clubs/${ids.madrid}`)).status, 204);
    });
  });
});
