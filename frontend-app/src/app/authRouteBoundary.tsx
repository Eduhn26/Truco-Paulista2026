import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';

// Socket-driven screens need both identity and a backend boundary before hydration.
function hasMinimumSession(session: ReturnType<typeof useAuth>['session']): boolean {
  return Boolean(session?.authToken && session?.backendUrl);
}

export function ProtectedLobbyRoute() {
  const { session } = useAuth();
  const location = useLocation();

  if (!hasMinimumSession(session)) {
    return (
      <Navigate
        to="/"
        replace
        state={{ redirectReason: 'missing_session', from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

export function ProtectedMatchRoute() {
  const { session } = useAuth();
  const location = useLocation();
  const params = useParams<{ matchId: string }>();

  if (!hasMinimumSession(session)) {
    return (
      <Navigate
        to="/"
        replace
        state={{ redirectReason: 'missing_session', from: location.pathname }}
      />
    );
  }

  const routeMatchId = params.matchId?.trim() ?? '';
  const fallbackMatchId = getLastActiveMatchId()?.trim() ?? '';
  const hasMatchContext = Boolean(routeMatchId || fallbackMatchId);

  if (!hasMatchContext) {
    // A match screen without route context or a remembered match cannot hydrate safely.
    return <Navigate to="/lobby" replace state={{ redirectReason: 'missing_match_context' }} />;
  }

  return <Outlet />;
}
