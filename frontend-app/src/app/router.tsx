import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './app';
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
        path: 'lobby',
        element: <LobbyPage />,
      },
      {
        path: 'match/:matchId',
        element: <MatchPage />,
      },
    ],
  },
]);