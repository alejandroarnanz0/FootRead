import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getMarketLeaders, getMarketOverview, getScoutingLeaders } from '../api/overview.js';
import MarketSnapshot from '../components/overview/MarketSnapshot.jsx';
import PlayerRanking from '../components/overview/PlayerRanking.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useApi } from '../hooks/useApi.js';
import './OverviewPage.css';

export default function OverviewPage() {
  const { hash, key } = useLocation();
  const market = useApi(getMarketOverview, []);

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [hash, key]);

  return (
    <div className="overview-page">
      <div className="overview-intro">
        <PageHeader title="Visión general" description="Mercado de jugadores, oportunidades de scouting y centros de partido." />
        <Link className="button button-secondary" to="/matches">Ir a partidos <span aria-hidden="true">↗</span></Link>
      </div>
      <section className="overview-market" aria-labelledby="overview-market-heading">
        <h2 id="overview-market-heading">Panorama del mercado</h2>
        <MarketSnapshot request={market} />
        <div className="overview-columns overview-rankings">
          <PlayerRanking loadPage={getMarketLeaders} />
          <PlayerRanking loadPage={getScoutingLeaders} scouting />
        </div>
      </section>
    </div>
  );
}
