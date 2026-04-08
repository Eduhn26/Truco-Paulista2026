import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function AppShell() {
  const { session, clearSession } = useAuth();

  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Convidado';
  const isAuthenticated = Boolean(session?.authToken);

  return (
    <div className="min-h-screen text-slate-100">
      <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.12),transparent_55%)]" />

      <header className="sticky top-0 z-20 border-b border-amber-400/15 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-3 text-xl font-black tracking-tight text-white transition hover:text-amber-300"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-sm font-black text-amber-300 shadow-[0_0_18px_rgba(201,168,76,0.18)]">
              TP
            </span>
            <span className="hidden sm:inline">Truco Paulista</span>
          </Link>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                Home
              </NavLink>

              <NavLink
                to="/lobby"
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                Lobby
              </NavLink>
            </nav>

            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:flex">
              <span
                className={`h-2 w-2 rounded-full ${isAuthenticated ? 'bg-green-400' : 'bg-amber-400'}`}
              />
              <span className="max-w-[120px] truncate text-xs font-semibold text-slate-200">
                {displayName}
              </span>
            </div>

            <button
              type="button"
              onClick={clearSession}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-400/20 hover:bg-amber-500/10 hover:text-amber-200"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
