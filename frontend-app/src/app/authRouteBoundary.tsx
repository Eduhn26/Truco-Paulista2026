import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';

function hasMinimumSession(session: ReturnType<typeof useAuth>['session']): boolean {
  return Boolean(session?.authToken && session?.backendUrl);
}

export function ProtectedLobbyRoute() {
  const { session } = useAuth();
  const location = useLocation();

  if (!hasMinimumSession(session)) {
    // NOTE: Lobby depends on an authenticated browser session with a resolved backend boundary.
    // Redirecting at the route edge keeps the UI from discovering this only after socket actions.
    return <Navigate to="/" replace state={{ redirectReason: 'missing_session', from: location.pathname }} />;
  }

  return <Outlet />;
}

export function ProtectedMatchRoute() {
  const { session } = useAuth();
  const location = useLocation();
  const params = useParams<{ matchId: string }>();

  if (!hasMinimumSession(session)) {
    // NOTE: Match runtime is not a public screen. It requires the same minimum
    // session boundary as the lobby before any socket hydration starts.
    return <Navigate to="/" replace state={{ redirectReason: 'missing_session', from: location.pathname }} />;
  }

  const routeMatchId = params.matchId?.trim() ?? '';
  const fallbackMatchId = getLastActiveMatchId()?.trim() ?? '';
  const hasMatchContext = Boolean(routeMatchId || fallbackMatchId);

  if (!hasMatchContext) {
    // NOTE: Opening the match screen without a route param and without a last known
    // active match leaves the page in a recoverable but semantically weak state.
    // Redirecting to the lobby preserves the intended flow: lobby first, then table.
    return <Navigate to="/lobby" replace state={{ redirectReason: 'missing_match_context' }} />;
  }

  return <Outlet />;
}