import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { startGame, readGame, gameAction, cancelGame } from '../api/games.js';
import Button from '../components/Button.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { Loading } from '../components/Status.jsx';
import Round from '../components/games/Round.jsx';
import { difficulties, games, points } from '../components/games/content.js';
import { useAuth } from '../hooks/useAuth.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import './GamesPage.css';

const failure = 'No se pudo conectar con la partida. Puedes volver a intentarlo.';

function ConfirmationDialog({ action, busy, error, onCancel, onConfirm }) {
  const dialog = useRef(null);
  const cancelButton = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    cancelButton.current.focus();
    return () => { if (element.open) element.close(); };
  }, []);
  const restarting = action === 'restart';
  return <dialog ref={dialog} className="games-confirm" aria-labelledby="games-confirm-title"
    aria-describedby="games-confirm-description" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onCancel();
    }}>
    <span className="games-confirm-label">PARTIDA EN CURSO</span>
    <h2 id="games-confirm-title">{restarting ? 'Reiniciar partida' : 'Abandonar partida'}</h2>
    <p id="games-confirm-description">{restarting
      ? '¿Quieres reiniciar la partida? Perderás el progreso actual y comenzarás desde la primera pregunta.'
      : '¿Quieres abandonar la partida? El progreso actual no se guardará en tu historial.'}</p>
    {error && <p role="alert" className="notice">{error}</p>}
    <div className="games-confirm-actions">
      <Button ref={cancelButton} onClick={onCancel} disabled={busy}>Seguir jugando</Button>
      <Button variant="primary" onClick={onConfirm} disabled={busy}>
        {busy ? 'Procesando…' : restarting ? 'Reiniciar' : 'Salir de la partida'}
      </Button>
    </div>
  </dialog>;
}

function Results({ result, restart }) {
  const title = useRef(null);
  useEffect(() => { title.current.focus(); }, []);
  const accuracy = result.correct * 10;
  return <section className={'card games-results games-enter' + (accuracy >= 80 ? ' games-celebrate' : '')}>
    <h1 ref={title} tabIndex={-1}>Partida completada</h1>
    <p>{games[result.game].title} · {difficulties[result.difficulty]}</p>
    <strong className="games-total">{result.score}</strong>
    <span>Puntos</span>
    <p>{accuracy >= 80 ? 'Gran actuación.' : 'Prueba otra ronda y mejora tu marca.'}</p>
    <dl>
      {Object.entries({ Aciertos: result.correct, Errores: result.incorrect, 'Fuera de tiempo': result.timeout,
        Precisión: accuracy + ' %', 'Tiempo de respuesta': Math.round(result.elapsedMs / 1000) + ' s' })
        .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="games-actions"><Button variant="primary" onClick={restart}>Volver a jugar</Button>
      <Link className="button button-secondary" to="/games">Volver al catálogo</Link></div>
  </section>;
}

function Game({ game, owner }) {
  const navigate = useNavigate();
  const storageKey = 'footboard.games.' + owner + '.' + game;
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)); } catch { return null; }
  });
  const [state, setState] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const epoch = useRef(0);
  const activeRequest = useRef(null);
  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be blocked. */ }
    setSession(null);
    setState(null);
    setError('');
  }, [storageKey]);

  useEffect(() => {
    if (!session || state?.id === session.id) return;
    const controller = new AbortController();
    readGame(session, controller.signal).then(setState).catch((err) => {
      if (controller.signal.aborted) return;
      if (err.response?.status === 404) {
        clear();
        setError('La partida anterior ha caducado.');
      } else setError(failure);
    });
    return () => controller.abort();
  }, [session, state?.id, clear, retry]);

  async function run(operation) {
    if (pending.current) return;
    const current = epoch.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await operation(controller.signal, () => epoch.current === current); }
    catch (err) {
      if (epoch.current !== current) return;
      if (err.response?.status === 404) {
        clear();
        setError('La partida anterior ha caducado.');
      } else if (err.response?.status === 503) setError('No hay suficientes preguntas para esta dificultad.');
      else if (err.response?.status === 429) setError('Demasiados intentos. Espera un minuto antes de volver a jugar.');
      else setError(failure);
    } finally {
      if (epoch.current === current) {
        activeRequest.current = null;
        pending.current = false;
        setBusy(false);
      }
    }
  }

  function start(event) {
    event.preventDefault();
    run(async (_signal, isCurrent) => {
      const { guestToken, ...data } = await startGame(game, difficulty);
      if (!isCurrent()) return;
      const access = { id: data.id, token: guestToken };
      try { sessionStorage.setItem(storageKey, JSON.stringify(access)); } catch { /* Continue in this tab. */ }
      setState(data);
      setSession(access);
    });
  }
  const act = (action, optionId) => run(async (signal, isCurrent) => {
    const data = await gameAction(session, state, action, optionId, signal);
    if (isCurrent()) setState(data);
  });

  async function confirmLeave() {
    if (confirmBusy || !session || !state) return;
    const action = confirmation;
    const previousDifficulty = state.difficulty;
    setConfirmBusy(true);
    setConfirmError('');
    epoch.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    pending.current = false;
    setBusy(false);
    let cancelled = false;
    try {
      try { await cancelGame(session); }
      catch (err) { if (err.response?.status !== 404) throw err; }
      cancelled = true;
      clear();
      setDifficulty(previousDifficulty);
      if (action === 'exit') {
        navigate('/games');
        return;
      }
      const { guestToken, ...data } = await startGame(game, previousDifficulty);
      const access = { id: data.id, token: guestToken };
      try { sessionStorage.setItem(storageKey, JSON.stringify(access)); } catch { /* Continue in this tab. */ }
      setState(data);
      setSession(access);
      setConfirmation(null);
    } catch (err) {
      if (cancelled) {
        setConfirmation(null);
        setError(err.response?.status === 429 ? 'Demasiados intentos. Espera un minuto antes de volver a jugar.'
          : err.response?.status === 503 ? 'No hay suficientes preguntas para esta dificultad.' : failure);
      } else {
        try { setState(await readGame(session)); }
        catch (readError) {
          if (readError.response?.status === 404) {
            clear();
            setConfirmation(null);
          }
        }
        setConfirmError('No se pudo cancelar la partida. Vuelve a intentarlo.');
      }
    } finally { setConfirmBusy(false); }
  }

  const active = Boolean(state && !state.summary);
  const requestConfirmation = (action) => { setConfirmError(''); setConfirmation(action); };
  return <div className="page games-page games-play">
    <div className="games-play-nav">
      {active ? <button type="button" className="back games-back-button" onClick={() => requestConfirmation('exit')}
        disabled={confirmBusy}>← Footboard Games</button>
        : <Link className="back" to="/games">← Footboard Games</Link>}
      {active && <div className="games-session-tools" aria-label="Controles de partida">
        <button type="button" className="button games-control" onClick={() => requestConfirmation('restart')}
          disabled={confirmBusy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /></svg>
          Reiniciar
        </button>
        <button type="button" className="button games-control" onClick={() => requestConfirmation('exit')}
          disabled={confirmBusy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m4-4 4-4-4-4m4 4H9" /></svg>
          Salir
        </button>
      </div>}
    </div>
    {state?.summary ? <Results result={state.summary} restart={clear} />
      : state ? <Round key={state.question.id} state={state} busy={busy} error={error} act={act} />
        : session ? (error ? <div role="alert"><p>{error}</p>
          <Button onClick={() => { setError(''); setRetry((value) => value + 1); }}>Reintentar</Button></div> : <Loading>Cargando partida…</Loading>)
          : <form className="card games-setup games-enter" onSubmit={start}>
            <PageHeader title={games[game].title} description={games[game].description} />
            <p>10 preguntas · 30 segundos por pregunta</p>
            <fieldset>
              <legend>Dificultad</legend>
              {Object.entries(difficulties).map(([value, label]) => <label key={value}>
                <input type="radio" name="difficulty" value={value} checked={difficulty === value}
                  onChange={() => setDifficulty(value)} disabled={busy} /> {label}
              </label>)}
            </fieldset>
            <p className="muted">Cada acierto suma {points[difficulty]} puntos más un punto por segundo restante.
              {game === 'guess' && ' Cada pista adicional resta 15 puntos del acierto.'}</p>
            <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Preparando partida…' : 'Empezar partida'}</Button>
            {error && <p role="alert" className="notice">{error}</p>}
          </form>}
    {confirmation && active && <ConfirmationDialog action={confirmation} busy={confirmBusy}
      error={confirmError} onCancel={() => setConfirmation(null)} onConfirm={confirmLeave} />}
  </div>;
}

export default function GamePage() {
  const { game } = useParams();
  const { user, checking } = useAuth();
  if (!Object.hasOwn(games, game)) return <NotFoundPage />;
  const owner = user?._id ?? 'guest';
  return checking ? <Loading /> : <Game key={owner + ':' + game} game={game} owner={owner} />;
}
