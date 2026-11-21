// Translates a raw StatsBomb event (as in open-data events/<match>.json) into
// what the API stores and what the xG service expects. No xG maths here: the
// features are built in Python (ml/BaselineModel/features.py).
const httpError = require('./httpError');

const name = (obj) => (obj && typeof obj.name === 'string' ? obj.name : undefined);

function toMatchEvent(raw, matchId) {
  if (!raw || typeof raw !== 'object') throw httpError(400, 'The body must be a StatsBomb event');
  const missing = ['index', 'period', 'minute'].filter((k) => typeof raw[k] !== 'number');
  if (!name(raw.type)) missing.push('type.name');
  if (!name(raw.team)) missing.push('team.name');
  if (missing.length) throw httpError(400, `Event without ${missing.join(', ')}`);

  const [x, y] = Array.isArray(raw.location) ? raw.location : [];
  const event = {
    matchId,
    sequence: raw.index,
    period: raw.period,
    minute: raw.minute,
    second: raw.second,
    type: name(raw.type),
    team: name(raw.team),
    playerName: name(raw.player),
    x,
    y,
    raw,
  };
  const card = name(raw.bad_behaviour?.card) || name(raw.foul_committed?.card);
  if (card) event.card = card;
  if (event.type === 'Substitution') event.replacement = name(raw.substitution?.replacement);
  if (event.type === 'Shot' && raw.shot) {
    event.shotOutcome = name(raw.shot.outcome);
    event.shotType = name(raw.shot.type);
    event.isGoal = event.shotOutcome === 'Goal';
    event.xgStatsbomb = raw.shot.statsbomb_xg;
  }
  return event;
}

// The raw shot fields the xG service takes (ml/serve.py RawShot).
function toRawShot(raw) {
  const [x, y] = raw.location || [];
  return {
    x,
    y,
    under_pressure: Boolean(raw.under_pressure),
    body_part: name(raw.shot?.body_part),
    technique: name(raw.shot?.technique),
    shot_type: name(raw.shot?.type),
    play_pattern: name(raw.play_pattern),
  };
}

module.exports = { toMatchEvent, toRawShot };
