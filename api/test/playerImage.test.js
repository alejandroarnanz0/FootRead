// Player portraits (imageUrl) through the API, against footboard_test.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { wipe } = require('./helpers/testDb');
const Player = require('../models/Player');

const PHOTO = 'https://img.a.transfermarkt.technology/portrait/header/28003-1694590254.jpg?lm=1';

describe('player portraits', () => {
  let srv;
  let withPhoto;

  before(async () => {
    srv = await startApi();
    await wipe(Player);
    [withPhoto] = await Player.create([
      { name: 'Photo Player', position: 'FW', currentValue: 5e6, imageUrl: PHOTO, externalIds: { transfermarkt: '28003' } },
      { name: 'No Photo Player', position: 'DF', currentValue: 1e6, externalIds: { transfermarkt: '99999' } },
    ]);
  });

  after(async () => {
    await wipe(Player);
    await srv.close();
  });

  it('lists and shows the portrait URL, and leaves it out when there is none', async () => {
    const list = await srv.api('GET', '/api/players?sort=-currentValue');
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].imageUrl, PHOTO);
    assert.equal(list.body.data[1].imageUrl, undefined);
    const one = await srv.api('GET', `/api/players/${withPhoto._id}`);
    assert.equal(one.body.imageUrl, PHOTO);
  });

  it('rejects portraits from any other host at the schema', async () => {
    const bad = new Player({ name: 'X', position: 'MF', imageUrl: 'https://evil.example/a.jpg' });
    assert.ok(bad.validateSync()?.errors.imageUrl);
  });

  it('cannot be set through the API: only the ETL writes it', async () => {
    const res = await srv.api('PUT', `/api/players/${withPhoto._id}`, { imageUrl: 'https://img.a.transfermarkt.technology/portrait/header/1.jpg' });
    assert.ok([200, 400].includes(res.status));
    assert.equal((await Player.findById(withPhoto._id).lean()).imageUrl, PHOTO);
  });
});
