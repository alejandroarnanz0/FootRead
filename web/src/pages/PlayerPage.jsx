import { Link, useParams } from 'react-router-dom';

import { getPlayer } from '../api/players.js';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Loading, Notice } from '../components/Status.jsx';
import { useApi } from '../hooks/useApi.js';
import { ageFrom, formatEuros, formatResidual, POSITION_LABELS } from '../format.js';

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
          <PageHeader
            title={player.name}
            description={`${POSITION_LABELS[player.position]} · ${ageFrom(player.birthDate) ?? '—'} años`}
          />
          <dl className="facts card">
            <div>
              <dt>Valor real</dt>
              <dd>{formatEuros(player.currentValue)}</dd>
            </div>
            <div>
              <dt>Referencia por comparables</dt>
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
          <Notice>Ficha en construcción. Próximamente incluirá el historial de valor, las estadísticas y los jugadores comparables.</Notice>
        </>
      )}
    </div>
  );
}
