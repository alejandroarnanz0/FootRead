import { NavLink, Route, Routes } from 'react-router-dom';

import ExplorerPage from './pages/ExplorerPage.jsx';
import PlayerPage from './pages/PlayerPage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">Footboard</span>
        <nav>
          <NavLink to="/" end>Explorador</NavLink>
          <NavLink to="/overview">Visión general</NavLink>
          <NavLink to="/compare">Comparador</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ExplorerPage />} />
          <Route path="/players/:playerId" element={<PlayerPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
