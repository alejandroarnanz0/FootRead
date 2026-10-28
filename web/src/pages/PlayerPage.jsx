import { Link, useParams } from 'react-router-dom';

import { getPlayer } from '../api/players.js';
import { ErrorMessage, Loading } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';
import { ageFrom, formatEuros, formatResidual, POSITION_LABELS } from '../format.js';

// Placeholder: basic data only. Valuation series, season stats and the SHAP
// breakdown come in a later batch.
export default function PlayerPage() {
  const { playerId } = useParams();
  const { data: player, error, retry } = useApi((signal) => getPlayer(playerId, signal), [playerId]);

  return (
    <div className="page">
      <Link to="/" className="back">
        ← Volver al Explorador
      </Link>

      {error ? (
        <ErrorMessage
          title={error.response && error.response.status === 404 ? 'Jugador no encontrado' : 'No se ha podido cargar el jugador'}
          error={error}
          onRetry={error.response && error.response.status === 404 ? undefined : retry}
        />
      ) : !player ? (
        <Loading>Cargando jugador…</Loading>
      ) : (
        <>
          <header className="page-head">
            <h1>{player.name}</h1>
            <p className="muted">
              {POSITION_LABELS[player.position]} · {ageFrom(player.birthDate) ?? '—'} años
            </p>
          </header>
          <dl className="facts card">
            <div>
              <dt>Valor real</dt>
              <dd>{formatEuros(player.currentValue)}</dd>
            </div>
            <div>
              <dt>Valor predicho</dt>
              <dd>{formatEuros(player.predictedValue)}</dd>
            </div>
            <div>
              <dt>Residuo</dt>
              <dd>
                {player.predictedValue != null && player.currentValue != null
                  ? formatResidual(player.predictedValue - player.currentValue)
                  : '—'}
              </dd>
            </div>
          </dl>
          <p className="notice">
            Ficha en construcción: aquí irán la serie temporal de su valoración, sus estadísticas por temporada y el
            desglose SHAP del modelo.
          </p>
        </>
      )}
    </div>
  );
}
