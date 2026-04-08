import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './app';
import { ProtectedLobbyRoute, ProtectedMatchRoute } from './authRouteBoundary';
import { AuthCallbackPage } from '../pages/authCallbackPage';
import { HomePage } from '../pages/homePage';
import { LobbyPage } from '../pages/lobbyPage';
import { MatchPage } from '../pages/matchPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'auth/callback',
        element: <AuthCallbackPage />,
      },
      {
        element: <ProtectedLobbyRoute />,
        children: [
          {
            path: 'lobby',
            element: <LobbyPage />,
          },
        ],
      },
      {
        element: <ProtectedMatchRoute />,
        children: [
          {
            path: 'match/:matchId',
            element: <MatchPage />,
          },
        ],
      },
    ],
  },
]);
