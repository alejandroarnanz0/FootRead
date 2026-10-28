// Loads plausible sample data. Usage: npm run seed   (or npm run seed -- --force to wipe first)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Club = require('../models/Club');
const Player = require('../models/Player');
const Valuation = require('../models/Valuation');
const SeasonStat = require('../models/SeasonStat');

const MODELS = [Competition, Club, Player, Valuation, SeasonStat];

// Fixed seed and reference date: every run produces exactly the same data.
const SEED = 20262027;
const REFERENCE_DATE = new Date(Date.UTC(2026, 6, 1)); // start of the 2026-27 season
const SEASONS = [2022, 2023, 2024, 2025]; // start year: 2022 -> "2022-23"
const PLAYERS_PER_CLUB = 10;

const COMPETITIONS = [
  {
    code: 'ES1', name: 'LaLiga', country: 'Spain', tier: 1, factor: 1.0,
    clubs: [['Real Madrid', 1.6], ['FC Barcelona', 1.5], ['Real Sociedad', 0.9], ['Getafe CF', 0.6]],
  },
  {
    code: 'GB1', name: 'Premier League', country: 'England', tier: 1, factor: 1.4,
    clubs: [['Manchester City', 1.6], ['Arsenal FC', 1.4], ['Brighton & Hove Albion', 0.9], ['Brentford FC', 0.7]],
  },
  {
    code: 'IT1', name: 'Serie A', country: 'Italy', tier: 1, factor: 0.8,
    clubs: [['Inter', 1.4], ['Juventus', 1.3], ['Atalanta', 1.0], ['Udinese', 0.6]],
  },
];

// Fictional names: sample data must not pass for real players.
const FIRST_NAMES = [
  'Adrián', 'Marco', 'Lucas', 'Hugo', 'Daniel', 'Oliver', 'Jack', 'Mateo', 'Luca', 'Pablo',
  'Samuel', 'Thomas', 'Diego', 'Leo', 'Nicolás', 'Ethan', 'Gabriel', 'Iker', 'Álvaro', 'Federico',
  'Kai', 'Noah', 'Rúben', 'Youssef', 'Kevin', 'Andrea', 'Tomás', 'Bruno', 'Elias', 'Rafael',
];
const LAST_NAMES = [
  'García', 'Rossi', 'Smith', 'Fernández', 'Bianchi', 'Walker', 'Moreno', 'Ricci', 'Turner', 'Navarro',
  'Costa', 'Hughes', 'Romero', 'Greco', 'Bennett', 'Ortega', 'Mancini', 'Ward', 'Delgado', 'Conti',
  'Palmer', 'Iglesias', 'Marino', 'Cooper', 'Rubio', 'Ferri', 'Foster', 'Castillo', 'Lombardi', 'Hayes',
];

// Per-position profile: value multiplier, height and per-90 rates.
const POSITIONS = {
  GK: { value: 0.6, height: 190, goals: 0, assists: 0.005, shots: 0, passes: 22, tackles: 0.05 },
  DF: { value: 0.9, height: 185, goals: 0.05, assists: 0.07, shots: 0.6, passes: 45, tackles: 1.8 },
  MF: { value: 1.05, height: 178, goals: 0.15, assists: 0.17, shots: 1.4, passes: 52, tackles: 1.6 },
  FW: { value: 1.2, height: 181, goals: 0.42, assists: 0.18, shots: 2.8, passes: 24, tackles: 0.5 },
};

// --- Seeded random helpers (mulberry32 + Box-Muller) ---

let state = SEED;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const choice = (items) => items[Math.floor(random() * items.length)];
const normal = (mean = 0, sd = 1) =>
  mean + sd * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const clamp = (x, min, max) => Math.min(Math.max(x, min), max);

// --- Domain helpers ---

const DAY = 864e5;
const YEAR = 365.25 * DAY;
const ageAt = (birthDate, date) => (date - birthDate) / YEAR;

// Market value peaks at 25-26 and falls off on both sides.
const ageFactor = (age) => Math.exp(-((age - 25.5) ** 2) / (2 * 5 ** 2));

// Rounds like Transfermarkt does: coarser steps for bigger values. Integer euros.
const roundValue = (value) => {
  const v = clamp(value, 50e3, 200e6);
  const step = v < 1e6 ? 25e3 : v < 10e6 ? 100e3 : 500e3;
  return Math.round(v / step) * step;
};

// Most players are priced close to their fundamental value; some are clearly
// under- or overpriced by the market, which is what the residuals should reveal.
const marketNoise = () => {
  const r = random();
  if (r < 0.1) return normal(-0.9, 0.25); // undervalued
  if (r < 0.16) return normal(0.7, 0.2); // overvalued
  return normal(0, 0.3);
};

const uniqueName = (used) => {
  let name;
  do name = `${choice(FIRST_NAMES)} ${choice(LAST_NAMES)}`;
  while (used.has(name));
  used.add(name);
  return name;
};

// Half-yearly dates (1 Dec, 1 Jun) up to the last one before the reference date.
const valuationDates = () => {
  const dates = [];
  for (let year = 2021; year <= 2026; year++) {
    for (const month of [5, 11]) {
      const date = new Date(Date.UTC(year, month, 1));
      if (date >= new Date(Date.UTC(2021, 11, 1)) && date < REFERENCE_DATE) dates.push(date);
    }
  }
  return dates;
};

// --- Builders ---

const buildPlayer = (club, competition, position, usedNames) => {
  const profile = POSITIONS[position];
  const age = clamp(Math.round(normal(26, 4.5)), 17, 36);
  const birthDate = new Date(REFERENCE_DATE - age * YEAR - between(1, 364) * DAY);
  const talent = normal(0, 1) + 0.8 * (club.strength - 1);

  const fundamental =
    4e6 * Math.exp(0.9 * talent) * ageFactor(age) * profile.value * competition.factor * club.strength;

  return {
    doc: {
      name: uniqueName(usedNames),
      birthDate,
      position,
      foot: random() < 0.7 ? 'right' : random() < 0.85 ? 'left' : 'both',
      heightCm: Math.round(clamp(normal(profile.height, 5), 160, 205)),
      club: club._id,
      currentValue: roundValue(fundamental * Math.exp(marketNoise())),
      predictedValue: roundValue(fundamental * Math.exp(normal(0, 0.15))),
      contractUntil: new Date(Date.UTC(age > 32 ? intBetween(2027, 2028) : intBetween(2027, 2031), 5, 30)),
    },
    age,
    talent,
  };
};

// Walks back from the current value: follows the age curve plus a random walk,
// so the last valuation is exactly currentValue.
const buildValuations = (player, age) => {
  const dates = valuationDates().filter((d) => ageAt(player.birthDate, d) >= 16);
  let drift = 0;
  const valuations = [];
  for (let i = dates.length - 1; i >= 0; i--) {
    const trend = ageFactor(ageAt(player.birthDate, dates[i])) / ageFactor(age);
    const value = i === dates.length - 1 ? player.currentValue : roundValue(player.currentValue * trend * Math.exp(drift));
    valuations.push({ player: player._id, date: dates[i], value });
    drift += normal(0, 0.15);
  }
  return valuations;
};

const buildStats = (player, competitionId, talent) => {
  const profile = POSITIONS[player.position];
  const stats = [];
  for (const startYear of SEASONS) {
    const seasonAge = ageAt(player.birthDate, new Date(Date.UTC(startYear, 6, 1)));
    if (seasonAge < 16) continue;

    let share = 0.45 + 0.2 * talent + normal(0, 0.15);
    if (seasonAge < 20) share -= 0.25;
    if (seasonAge > 33) share -= 0.15;
    const minutes = Math.round(clamp(share, 0.03, 0.97) * 38 * 90);
    const per90 = minutes / 90;
    const form = Math.exp(0.35 * talent) * between(0.7, 1.3);

    stats.push({
      player: player._id,
      season: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
      competition: competitionId,
      minutes,
      goals: Math.round(profile.goals * form * per90),
      assists: Math.round(profile.assists * form * per90),
      shots: Math.round(profile.shots * form * per90),
      passesCompleted: Math.round(profile.passes * (1 + 0.1 * talent) * between(0.85, 1.15) * per90),
      tackles: Math.round(profile.tackles * between(0.7, 1.3) * per90),
    });
  }
  return stats;
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing from .env');
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(MODELS.map((m) => m.init())); // make sure the unique indexes exist

  const counts = await Promise.all(MODELS.map((m) => m.countDocuments()));
  if (counts.some((n) => n > 0)) {
    if (!process.argv.includes('--force')) {
      console.log(
        `Database "${mongoose.connection.name}" already has data. ` +
          'Use "npm run seed -- --force" to wipe it and reload.'
      );
      return;
    }
    await Promise.all(MODELS.map((m) => m.deleteMany({})));
  }

  const competitions = await Competition.insertMany(
    COMPETITIONS.map(({ code, name, country, tier }) => ({ code, name, country, tier }))
  );

  const clubs = [];
  for (const [i, competition] of COMPETITIONS.entries()) {
    const created = await Club.insertMany(
      competition.clubs.map(([name]) => ({ name, country: competition.country, competition: competitions[i]._id }))
    );
    created.forEach((club, j) =>
      clubs.push({ _id: club._id, strength: competition.clubs[j][1], competition, competitionId: competitions[i]._id })
    );
  }

  const usedNames = new Set();
  const built = [];
  for (const club of clubs) {
    // Every position is covered; the last slot is random.
    const positions = ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', choice(['GK', 'DF', 'MF', 'FW'])];
    for (const position of positions.slice(0, PLAYERS_PER_CLUB)) {
      built.push({ ...buildPlayer(club, club.competition, position, usedNames), competitionId: club.competitionId });
    }
  }
  const players = await Player.insertMany(built.map((b) => b.doc));

  const valuations = players.flatMap((p, i) => buildValuations(p, built[i].age));
  const stats = players.flatMap((p, i) => buildStats(p, built[i].competitionId, built[i].talent));
  await Valuation.insertMany(valuations);
  await SeasonStat.insertMany(stats);

  console.log(
    `Sample data loaded into "${mongoose.connection.name}": ${competitions.length} competitions, ` +
      `${clubs.length} clubs, ${players.length} players, ${valuations.length} valuations ` +
      `and ${stats.length} season stats.`
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
