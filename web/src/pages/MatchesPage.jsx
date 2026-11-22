import { useEffect } from 'react';
import MatchesSection from '../components/matches/MatchesSection.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function MatchesPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="matches-page">
      <PageHeader title="Partidos" description="Consulta las fichas de los encuentros y el análisis de los replays registrados." />
      <MatchesSection />
    </div>
  );
}
