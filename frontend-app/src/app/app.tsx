import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';

export function AppShell() {
  const { session, clearSession } = useAuth();
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Convidado';
  const isAuthenticated = Boolean(session?.authToken);

  return (
    <div className="relative min-h-screen bg-[#050810] text-slate-100 selection:bg-amber-500/30 selection:text-white">
      {/* Atmospheric Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,168,76,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjAxLCAxNjgsIDc2LCAwLjA0KSIvPjwvc3ZnPg==')] opacity-40" />
      </div>

      {/* Premium Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050810]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <Link
            to="/"
            className="group inline-flex items-center gap-3 transition"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/10 text-xs font-black text-amber-400 transition group-hover:border-amber-400/60 group-hover:bg-amber-500/20 group-hover:shadow-[0_0_12px_rgba(201,168,76,0.2)]">
              TP
            </div>
            <span className="hidden text-sm font-bold tracking-tight text-slate-200 sm:inline group-hover:text-white">
              Truco Paulista
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/lobby"
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`
                }
              >
                Lobby
              </NavLink>
            </nav>

            <div className="hidden items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 sm:flex">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-amber-500/60'}`}
              />
              <span className="max-w-[100px] truncate text-[10px] font-semibold text-slate-300">
                {displayName}
              </span>
            </div>

            <button
              type="button"
              onClick={clearSession}
              className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
