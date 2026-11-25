const httpError = require('../../utils/httpError');

const ROUND_MS = 30000;
const SESSION_MS = 60 * 60 * 1000;
const bases = { easy: 100, medium: 150, hard: 200 };

function createState(game, difficulty, questions, now) {
  return { game, difficulty, questions, index: 0, deadline: now + ROUND_MS, clues: 1,
    score: 0, answers: [], startedAt: now, finishedAt: null };
}

function applyAction(state, action, input, now) {
  if (state.finishedAt) return false;
  const question = state.questions[state.index];
  if (input.questionId !== question.id) return false;
  const feedback = state.answers[state.index];
  if (action === 'next') {
    if (!feedback) throw httpError(409, 'Round is still open');
    if (state.index === state.questions.length - 1) state.finishedAt = now;
    else {
      state.index++;
      state.deadline = now + ROUND_MS;
      state.clues = 1;
    }
    return true;
  }
  if (feedback) return false;
  if (now < state.deadline && action === 'timeout') return false;
  if (now < state.deadline && action === 'hint') {
    if (state.clues >= question.clues.length) return false;
    state.clues++;
    return true;
  }
  const expired = now >= state.deadline;
  if (!expired && !question.options.some((option) => option.id === input.optionId))
    throw httpError(400, 'Invalid option');
  const correct = !expired && input.optionId === question.correct;
  const remainingMs = Math.max(0, state.deadline - now);
  const penalty = question.clues.length ? 15 * (state.clues - 1) : 0;
  const points = correct ? bases[state.difficulty] + Math.floor(remainingMs / 1000) - penalty : 0;
  state.score += points;
  state.answers.push({ status: expired ? 'timeout' : correct ? 'correct' : 'incorrect',
    selectedId: expired ? null : input.optionId, points, remainingMs });
  return true;
}

function summary(state) {
  return {
    game: state.game, difficulty: state.difficulty, score: state.score,
    correct: state.answers.filter((answer) => answer.status === 'correct').length,
    incorrect: state.answers.filter((answer) => answer.status === 'incorrect').length,
    timeout: state.answers.filter((answer) => answer.status === 'timeout').length,
    elapsedMs: state.answers.reduce((total, answer) => total + ROUND_MS - answer.remainingMs, 0),
    finishedAt: state.finishedAt,
  };
}

function publicState(session, now) {
  const { state } = session;
  const { game, difficulty, index, deadline, score } = state;
  const common = { id: String(session._id), revision: session.revision, game, difficulty, index, deadline, score,
    serverNow: now, total: state.questions.length };
  if (state.finishedAt) return { ...common, summary: summary(state) };
  const { id, options, context, clues, correct, difference } = state.questions[index];
  const feedback = state.answers[index];
  return {
    ...common,
    question: {
      id, options: options.map(({ id, name }) => ({ id, name })),
      context, clues: clues.slice(0, state.clues),
      hasHint: !feedback && state.clues < clues.length,
    },
    feedback: feedback ? { ...feedback, correctId: correct, options, difference, clues } : null,
  };
}

module.exports = { ROUND_MS, SESSION_MS, createState, applyAction, summary, publicState };
