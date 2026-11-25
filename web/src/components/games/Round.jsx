import { useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import { formatEuros } from '../../format.js';
import { dateText, games } from './content.js';

const roundMs = 30000;
const remaining = (state) => state.feedback?.remainingMs ?? Math.min(roundMs, Math.max(0,
  state.deadline - state.serverAtAnchor - (performance.now() - state.clockAnchor)));

function fact(game, value, reference) {
  if (game === 'value') return formatEuros(value);
  if (game === 'goals') return value + ' goles';
  const age = Number(reference.slice(0, 4)) - Number(value.slice(0, 4))
    - (reference.slice(5) < value.slice(5) ? 1 : 0);
  return dateText(value) + ' · ' + age + ' años';
}

export default function Round({ state, busy, error, act }) {
  const { question, feedback, game } = state;
  const [time, setTime] = useState(() => remaining(state));
  const heading = useRef(null);
  const result = useRef(null);
  const timeoutRequested = useRef(false);
  const locked = time === 0 || Boolean(feedback);
  useEffect(() => {
    heading.current.focus();
  }, []);
  useEffect(() => {
    if (feedback) result.current.focus();
  }, [feedback?.status]);
  useEffect(() => {
    const tick = () => setTime(remaining(state));
    tick();
    if (feedback) return;
    const interval = setInterval(tick, 50);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [state, feedback]);
  useEffect(() => {
    if (time === 0 && !busy && !feedback && !timeoutRequested.current) {
      timeoutRequested.current = true;
      act('timeout');
    }
    if (time > 0) timeoutRequested.current = false;
  }, [time, busy, feedback, act]);
  const seconds = Math.ceil(time / 1000);
  const timerState = seconds <= 5 ? 'critical' : seconds <= 10 ? 'warning' : 'normal';
  const clueList = feedback?.clues ?? question.clues;
  const outcome = feedback && { correct: '✓ Acierto', incorrect: '× Respuesta incorrecta', timeout: 'Tiempo agotado' }[feedback.status];
  const prompt = game === 'goals' ? '¿Quién marcó más goles?' : games[game].title;
  return (
    <section className="card games-round games-enter" aria-labelledby="games-question">
      <header className="games-scoreboard">
        <div><span>Pregunta</span><strong>{String(state.index + 1).padStart(2, '0')}/{state.total}</strong></div>
        <div className={feedback?.points ? 'games-score-pop' : undefined}><span>Puntos</span><strong>{state.score}</strong></div>
        <div className={'games-clock ' + timerState} data-running={!locked}>
          <span>Tiempo</span><strong role="timer">00:{String(seconds).padStart(2, '0')}</strong>
        </div>
      </header>
      <div className={'games-clock-track ' + timerState} aria-hidden="true">
        <i style={{ transform: 'scaleX(' + time / roundMs + ')' }} />
      </div>
      <div className="games-round-body">
        <h1 ref={heading} tabIndex={-1} id="games-question">{prompt}</h1>
        {game === 'goals' && <p className="muted">{question.context.league} · {question.context.season}</p>}
        {game === 'value' && <p className="muted">Valoración del {dateText(question.context.date)}</p>}
        {clueList.length > 0 && <ul className="games-clues">
          {clueList.map(({ type, value }) => <li key={type}>
            {{ position: 'Posición', league: 'Liga del club registrado', birthYear: 'Año de nacimiento', birthDate: 'Fecha de nacimiento' }[type]}{' · '}
            <strong>{type === 'birthDate' ? dateText(value) : value}</strong>
          </li>)}
        </ul>}
        <div className="games-options">
          {question.options.map(({ id, name }) => {
            const correct = feedback?.correctId === id;
            const wrong = feedback?.selectedId === id && !correct;
            const option = feedback?.options.find((item) => item.id === id);
            return (
              <button key={id} type="button" className="games-option" data-result={correct ? 'correct' : wrong ? 'incorrect' : undefined}
                disabled={locked || busy} onClick={() => act('answer', id)}>
                <strong>{name}</strong>
                {option?.fact !== undefined && <span>{fact(game, option.fact, question.context.date)}</span>}
                {correct && <span>✓ Respuesta correcta</span>}
                {wrong && <span>× Tu respuesta</span>}
              </button>
            );
          })}
        </div>
        <div className="games-actions">
          {feedback ? <>
            <div ref={result} tabIndex={-1} className="games-feedback">
              <strong>{outcome}{feedback.points > 0 ? ' · +' + feedback.points + ' puntos' : ''}</strong>
              {feedback.difference !== null && <span>Diferencia: {game === 'value' ? formatEuros(feedback.difference)
                : feedback.difference + (game === 'age' ? ' días' : ' goles')}</span>}
            </div>
            <Button variant="primary" disabled={busy} onClick={() => act('next')}>
              {state.index + 1 === state.total ? 'Ver resultados' : 'Siguiente pregunta'}
            </Button>
          </> : time === 0 ? <><strong>Tiempo agotado</strong>
            <Button disabled={busy} onClick={() => act('timeout')}>Confirmar fin de ronda</Button></>
            : question.hasHint && <Button disabled={busy} onClick={() => act('hint')}>Revelar pista · −15 puntos</Button>}
        </div>
        {error && <p role="alert" className="notice">{error}</p>}
      </div>
    </section>
  );
}
