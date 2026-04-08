import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function AppShell() {
  const { session, clearSession } = useAuth();

  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Guest player';
  const isAuthenticated = Boolean(session?.authToken);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_58%)]" />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-1">
              <div>
                <Link
                  to="/"
                  className="inline-flex items-center gap-3 text-xl font-black tracking-tight text-white transition hover:text-emerald-300"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 text-sm font-black text-emerald-300">
                    TP
                  </span>
                  <span>Truco Paulista</span>
                </Link>

                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Multiplayer autenticado, lobby em tempo real e mesa jogável com foco em clareza,
                  presença de produto e evolução visual incremental.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isAuthenticated ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  Session
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-100">{displayName}</div>

                <div className="mt-1 text-xs text-slate-400">
                  {isAuthenticated
                    ? `Signed in via ${session?.user?.provider ?? 'session'}`
                    : 'Authentication required for real-time play'}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
              <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  Home
                </NavLink>

                <NavLink
                  to="/lobby"
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  Lobby
                </NavLink>
              </nav>

              <button
                type="button"
                onClick={clearSession}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Clear session
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
