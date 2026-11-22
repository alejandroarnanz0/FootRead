import { useState } from 'react';
import { getComparisonDirectory } from '../api/comparison.js';
import Button from '../components/Button.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorMessage, Notice } from '../components/Status.jsx';
import ComparisonResults from '../components/compare/ComparisonResults.jsx';
import PlayerPicker from '../components/compare/PlayerPicker.jsx';
import { useApi } from '../hooks/useApi.js';
import './ComparePage.css';

export default function ComparePage() {
  const [players, setPlayers] = useState([null, null]);
  const directory = useApi(getComparisonDirectory, []);
  const complete = players.every(Boolean);

  function select(index, player) {
    setPlayers((current) => current[1 - index]?._id === player._id
      ? current : current.map((item, i) => i === index ? player : item));
  }

  return (
    <div className="compare-page">
      <PageHeader title="Comparador de jugadores" description="Contrasta el valor de mercado, la referencia por comparables y las estadísticas de liga de dos jugadores." />
      <section className="card compare-controls" aria-label="Selección de jugadores">
        <PlayerPicker label="Jugador 1" clubs={directory.data?.clubs} selected={players[0]} excludedId={players[1]?._id} onSelect={(player) => select(0, player)} />
        <PlayerPicker label="Jugador 2" clubs={directory.data?.clubs} selected={players[1]} excludedId={players[0]?._id} onSelect={(player) => select(1, player)} />
        <Button disabled={!complete} onClick={() => setPlayers(([left, right]) => [right, left])}>Intercambiar <span aria-hidden="true">⇄</span></Button>
      </section>
      {directory.error && <ErrorMessage error={directory.error} onRetry={directory.retry} title="No se pudieron cargar los clubes y las competiciones" />}
      {complete
        ? <ComparisonResults key={players.map(({ _id }) => _id).join(':')} players={players} directory={directory.data} />
        : <Notice>Selecciona dos jugadores para ver la comparación.</Notice>}
    </div>
  );
}
