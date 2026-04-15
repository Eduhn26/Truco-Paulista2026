import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './app';
import { ProtectedLobbyRoute, ProtectedMatchRoute } from './authRouteBoundary';

const HomePage = lazy(async () =>
  import('../pages/homePage').then((module) => ({ default: module.HomePage }))
);
const AuthCallbackPage = lazy(async () =>
  import('../pages/authCallbackPage').then((module) => ({ default: module.AuthCallbackPage }))
);
const LobbyPage = lazy(async () =>
  import('../pages/lobbyPage').then((module) => ({ default: module.LobbyPage }))
);
const MatchPage = lazy(async () =>
  import('../pages/matchPage').then((module) => ({ default: module.MatchPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      {/* Cinematic Spinner */}
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black text-gradient-gold" style={{ fontFamily: 'Georgia, serif' }}>TP</span>
        </div>
      </div>
      
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-300">Preparando a mesa...</p>
        <p className="mt-1 text-[11px] text-slate-500">Carregando componentes do jogo</p>
      </div>
    </div>
  );
}

function withRouteSuspense(element: React.ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: withRouteSuspense(<HomePage />) },
      { path: 'auth/callback', element: withRouteSuspense(<AuthCallbackPage />) },
      {
        element: <ProtectedLobbyRoute />,
        children: [{ path: 'lobby', element: withRouteSuspense(<LobbyPage />) }],
      },
      {
        element: <ProtectedMatchRoute />,
        children: [{ path: 'match/:matchId', element: withRouteSuspense(<MatchPage />) }],
      },
    ],
  },
]);
