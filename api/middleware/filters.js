const Club = require('../models/Club');
const Competition = require('../models/Competition');
const httpError = require('../utils/httpError');

const POSITIONS = ['GK', 'DF', 'MF', 'FW'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Query values must be plain strings: `?position[$ne]=GK` parses to an object
// and would otherwise reach Mongo as an operator.
const readString = (query, key) => {
  const value = query[key];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw httpError(400, `Invalid ${key}`);
  return value;
};

const readNumber = (query, key, { integer = false, min = 0 } = {}) => {
  const value = readString(query, key);
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) {
    throw httpError(400, `Invalid ${key}`);
  }
  return n;
};

const readList = (query, key) => {
  const value = readString(query, key);
  return value === undefined ? undefined : value.split(',');
};

// Parses the cross-cutting filters once into req.filters. Each query router
// uses the ones that apply to its resource and ignores the rest.
const parseFilters = (req, res, next) => {
  const { query } = req;

  const position = readList(query, 'position');
  if (position && !position.every((p) => POSITIONS.includes(p))) {
    throw httpError(400, `Invalid position, expected: ${POSITIONS.join(', ')}`);
  }

  const sort = readList(query, 'sort');
  if (sort && !sort.every((s) => /^-?[A-Za-z]+$/.test(s))) {
    throw httpError(400, 'Invalid sort');
  }

  const minAge = readNumber(query, 'minAge', { integer: true });
  const maxAge = readNumber(query, 'maxAge', { integer: true });
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    throw httpError(400, 'minAge cannot be greater than maxAge');
  }

  const page = readNumber(query, 'page', { integer: true, min: 1 }) || 1;
  const limit = Math.min(readNumber(query, 'limit', { integer: true, min: 1 }) || DEFAULT_LIMIT, MAX_LIMIT);

  req.filters = {
    position,
    minAge,
    maxAge,
    competition: readString(query, 'competition'),
    maxValue: readNumber(query, 'maxValue'),
    sort,
    page,
    limit,
    skip: (page - 1) * limit,
  };
  next();
};

// Turns ['-currentValue', 'name'] into { currentValue: -1, name: 1 }, checking
// each field against the resource's whitelist. _id is the tie-breaker so
// pagination is stable.
const buildSort = (tokens, allowed, fallback) => {
  const sort = {};
  for (const token of tokens || fallback) {
    const descending = token.startsWith('-');
    const field = descending ? token.slice(1) : token;
    if (!allowed.includes(field)) {
      throw httpError(400, `Cannot sort by ${field}, expected: ${allowed.join(', ')}`);
    }
    sort[field] = descending ? -1 : 1;
  }
  sort._id = 1;
  return sort;
};

const yearsAgo = (from, years) => {
  const date = new Date(from);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
};

// Builds the Mongo match for players. `base` carries the scope given by the
// URL (e.g. { club }); when it already fixes the club, the competition filter
// has nothing left to say and is ignored. An unknown competition code matches
// no player.
const buildPlayerFilter = async (filters, base = {}) => {
  const match = { ...base };

  if (filters.position) match.position = { $in: filters.position };

  const now = new Date();
  const birthDate = {};
  if (filters.minAge !== undefined) birthDate.$lte = yearsAgo(now, filters.minAge);
  if (filters.maxAge !== undefined) birthDate.$gt = yearsAgo(now, filters.maxAge + 1);
  if (Object.keys(birthDate).length) match.birthDate = birthDate;

  if (filters.maxValue !== undefined) match.currentValue = { $lte: filters.maxValue };

  if (filters.competition && !base.club) {
    const competition = await Competition.findOne({ code: filters.competition }).select('_id').lean();
    const clubs = competition
      ? await Club.find({ competition: competition._id }).select('_id').lean()
      : [];
    match.club = { $in: clubs.map((c) => c._id) };
  }

  return match;
};

// Builds the Mongo match for clubs. Only `competition` (a code) applies to
// them; under /competitions/:competitionId the URL already fixes it, so the
// filter is ignored. An unknown code matches no club.
const buildClubFilter = async (filters, base = {}) => {
  const match = { ...base };

  if (filters.competition && !base.competition) {
    const competition = await Competition.findOne({ code: filters.competition }).select('_id').lean();
    match.competition = competition ? competition._id : { $in: [] };
  }

  return match;
};

const pageResponse = (data, total, filters) => ({
  data,
  page: filters.page,
  limit: filters.limit,
  total,
  totalPages: Math.ceil(total / filters.limit),
});

module.exports = { parseFilters, buildSort, buildPlayerFilter, buildClubFilter, pageResponse };
