import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './app';
import { ProtectedLobbyRoute, ProtectedMatchRoute } from './authRouteBoundary';

const HomePage = lazy(async () =>
  import('../pages/homePage').then((module) => ({
    default: module.HomePage,
  })),
);

const AuthCallbackPage = lazy(async () =>
  import('../pages/authCallbackPage').then((module) => ({
    default: module.AuthCallbackPage,
  })),
);

const LobbyPage = lazy(async () =>
  import('../pages/lobbyPage').then((module) => ({
    default: module.LobbyPage,
  })),
);

const MatchPage = lazy(async () =>
  import('../pages/matchPage').then((module) => ({
    default: module.MatchPage,
  })),
);

function RouteLoadingFallback() {
  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_42%)] px-8 py-8 lg:px-10 lg:py-10">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
            Loading route
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight text-white lg:text-4xl">
            Carregando a próxima superfície do produto.
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            O frontend agora separa as páginas por rota para reduzir o peso do
            bundle inicial sem alterar a navegação nem a autoridade do backend.
          </p>
        </div>

        <div className="grid gap-4 px-8 py-8 lg:px-10 lg:py-10 md:grid-cols-3">
          <LoadingCard />
          <LoadingCard />
          <LoadingCard />
        </div>
      </div>
    </section>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
      <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
      <div className="mt-5 h-6 w-40 animate-pulse rounded-full bg-white/10" />
      <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-white/10" />
      <div className="mt-2 h-3 w-5/6 animate-pulse rounded-full bg-white/10" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
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
      {
        index: true,
        element: withRouteSuspense(<HomePage />),
      },
      {
        path: 'auth/callback',
        element: withRouteSuspense(<AuthCallbackPage />),
      },
      {
        element: <ProtectedLobbyRoute />,
        children: [
          {
            path: 'lobby',
            element: withRouteSuspense(<LobbyPage />),
          },
        ],
      },
      {
        element: <ProtectedMatchRoute />,
        children: [
          {
            path: 'match/:matchId',
            element: withRouteSuspense(<MatchPage />),
          },
        ],
      },
    ],
  },
]);
