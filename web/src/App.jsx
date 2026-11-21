import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ExplorerPage from './pages/ExplorerPage.jsx';
import PlayerPage from './pages/PlayerPage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { Loading } from './components/Status.jsx';

// Every view needs a session (the API rejects anonymous reads too). Without one,
// go to login and come back here afterwards.
function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

// The header shows who is logged in, or a link to log in.
function SessionArea() {
  const { user, checking, logout } = useAuth();
  const location = useLocation();
  if (checking) return null;
  if (!user) {
    return (
      <Link className="session" to="/login" state={{ from: location.pathname }}>
        Iniciar sesión
      </Link>
    );
  }
  return (
    <span className="session">
      <span className="muted-inline">{user.name || user.email}</span>
      <button type="button" className="link-button" onClick={logout}>
        Salir
      </button>
    </span>
  );
}

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
        <SessionArea />
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RequireAuth><ExplorerPage /></RequireAuth>} />
          <Route path="/players/:playerId" element={<RequireAuth><PlayerPage /></RequireAuth>} />
          <Route path="/compare" element={<RequireAuth><ComparePage /></RequireAuth>} />
          <Route path="/overview" element={<RequireAuth><OverviewPage /></RequireAuth>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
