import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function AppShell() {
  const { session, clearSession } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link to="/" className="text-lg font-black tracking-tight">
              Truco Paulista
            </Link>
            <p className="text-sm text-slate-400">
              Frontend jogável — fase 10 bootstrap
            </p>
          </div>

          <nav className="flex items-center gap-2">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-300 hover:bg-white/5'
                }`
              }
            >
              Home
            </NavLink>

            <NavLink
              to="/lobby"
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-300 hover:bg-white/5'
                }`
              }
            >
              Lobby
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <div className="text-slate-400">Session</div>
              <div className="font-mono text-xs text-slate-200">
                {session.authToken ? 'authToken loaded' : 'no authToken'}
              </div>
            </div>

            <button
              type="button"
              onClick={clearSession}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Clear session
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}