import { lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import PlayerPage from './pages/PlayerPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { Loading } from './components/Status.jsx';
import Button from './components/Button.jsx';

const ExplorerPage = lazy(() => import('./pages/ExplorerPage.jsx'));
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const LiveMatchPage = lazy(() => import('./pages/LiveMatchPage.jsx'));
const MatchesPage = lazy(() => import('./pages/MatchesPage.jsx'));
const ComparePage = lazy(() => import('./pages/ComparePage.jsx'));
const LineupBuilderPage = lazy(() => import('./pages/LineupBuilderPage.jsx'));
const IdentityCreditsPage = lazy(() => import('./pages/IdentityCreditsPage.jsx'));

// Every view needs a session (the API rejects anonymous reads too). Without one,
// go to login and come back here afterwards.
function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Suspense fallback={<Loading>Cargando vista…</Loading>}>{children}</Suspense>;
}

// The header shows who is logged in, or a link to log in.
function SessionArea() {
  const { user, checking, logout } = useAuth();
  const location = useLocation();
  if (checking) return null;
  if (!user) {
    if (location.pathname === '/login') {
      return <a className="session" href="#auth-form">Acceso</a>;
    }
    return (
      <Link className="session" to="/login" state={{ from: location.pathname }}>
        Iniciar sesión
      </Link>
    );
  }
  return (
    <span className="session">
      <span className="muted-inline">{user.name || user.email}</span>
      <Button variant="quiet" onClick={logout}>
        Salir
      </Button>
    </span>
  );
}

export default function App() {
  const { user, checking } = useAuth();
  const location = useLocation();
  const showNavigation = !checking && Boolean(user);
  const atMatches = location.pathname === '/matches';
  const inMatch = location.pathname.startsWith('/live/');

  return (
    <div className="app">
      <header className="app-header">
        <div className={showNavigation ? 'app-header-inner' : 'app-header-inner app-header-public'}>
          {showNavigation ? (
            <>
              <Link className="brand" to="/">Footboard</Link>
              <nav aria-label="Navegación principal">
                <NavLink to="/" end>Explorador</NavLink>
                <NavLink to="/overview">Visión general</NavLink>
                <Link to="/matches" className={atMatches || inMatch ? 'active' : undefined}
                  aria-current={atMatches ? 'page' : undefined}>Partidos</Link>
                <NavLink to="/compare">Comparador</NavLink>
                <NavLink to="/lineup-builder">Footboard XI</NavLink>
              </nav>
            </>
          ) : (
            <span className="brand">Footboard</span>
          )}
          <SessionArea />
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RequireAuth><ExplorerPage /></RequireAuth>} />
          <Route path="/players/:playerId" element={<RequireAuth><PlayerPage /></RequireAuth>} />
          <Route path="/compare" element={<RequireAuth><ComparePage /></RequireAuth>} />
          <Route path="/lineup-builder" element={<RequireAuth><LineupBuilderPage /></RequireAuth>} />
          <Route path="/overview" element={<RequireAuth><OverviewPage /></RequireAuth>} />
          <Route path="/matches" element={<RequireAuth><MatchesPage /></RequireAuth>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/credits" element={<Suspense fallback={<Loading />}><IdentityCreditsPage /></Suspense>} />
          <Route path="/live/:matchId" element={<RequireAuth><LiveMatchPage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      {showNavigation && <footer className="app-footer"><Link to="/credits">Créditos de imágenes</Link></footer>}
    </div>
  );
}
