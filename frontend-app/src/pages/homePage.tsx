import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAppEnvironment,
  getDefaultBackendUrl,
  getFrontendOrigin,
  isLocalFrontendOrigin,
  normalizeBackendUrl,
  shouldAllowManualBackendOverride,
} from '../config/appConfig';
import {
  savePendingAuthBackendUrl,
  type FrontendSession,
} from '../features/auth/authStorage';
import { useAuth } from '../features/auth/authStore';

function buildNextSession(
  session: FrontendSession | null,
  backendUrl: string,
  authToken: string,
): FrontendSession {
  return {
    backendUrl,
    authToken,
    expiresIn: session?.expiresIn ?? null,
    user: session?.user ?? null,
  };
}

// Decorative Playing Card Component
function DecorativeCard({ rank, suitChar, isRed, rotation, className }: { 
  rank: string; 
  suitChar: string; 
  isRed: boolean; 
  rotation: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute pointer-events-none opacity-30 hover:opacity-60 transition-opacity duration-500 ${className}`}
      style={{ transform: `rotate(${rotation})` }}
    >
      <div
        className="flex flex-col items-center justify-between w-12 h-16 sm:w-16 sm:h-24 rounded-lg shadow-xl border border-white/10"
        style={{
          background: 'linear-gradient(135deg, #fdfbf7, #e8e4d9)',
        }}
      >
        <span className={`text-xs sm:text-sm font-bold ${isRed ? 'text-red-800' : 'text-slate-900'} ml-1 mt-1`}>{rank}</span>
        <span className={`text-2xl sm:text-4xl ${isRed ? 'text-red-800' : 'text-slate-900'}`}>{suitChar}</span>
        <span className={`text-xs sm:text-sm font-bold rotate-180 ${isRed ? 'text-red-800' : 'text-slate-900'} mr-1 mb-1`}>{rank}</span>
      </div>
    </div>
  );
}

// Decorative Poker Chip Component
function PokerChip({ color, rotation, className }: { color: string; rotation: string; className?: string }) {
  const colors: Record<string, string> = {
    gold: 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700',
    red: 'bg-gradient-to-br from-red-500 via-red-700 to-red-900',
    black: 'bg-gradient-to-br from-slate-700 via-slate-800 to-black',
  };
  
  return (
    <div
      className={`absolute pointer-events-none w-10 h-10 sm:w-12 sm:h-12 rounded-full shadow-lg border-4 border-dashed border-white/20 ${colors[color] || colors.gold} ${className}`}
      style={{ transform: `rotate(${rotation})` }}
    />
  );
}

export function HomePage() {
  const { session, setSession } = useAuth();
  const [backendUrl, setBackendUrl] = useState(() =>
    normalizeBackendUrl(session?.backendUrl ?? getDefaultBackendUrl()),
  );
  const [manualAuthToken, setManualAuthToken] = useState('');
  const [showDevTools, setShowDevTools] = useState(false);

  const normalizedBackendUrl = useMemo(
    () => normalizeBackendUrl(backendUrl),
    [backendUrl],
  );
  const frontendUrl = getFrontendOrigin();
  const safeBackendOrigin = useMemo(() => {
    try {
      const parsed = new URL(normalizedBackendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Not a valid URL
    }
    return '';
  }, [normalizedBackendUrl]);

  const googleLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/google?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';
  const githubLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/github?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';

  const allowManualBackendOverride = shouldAllowManualBackendOverride();

  function handleSaveBackendUrl(): void {
    setSession(buildNextSession(session, normalizedBackendUrl, session?.authToken ?? ''));
  }

  function handleSaveManualToken(): void {
    const normalizedToken = manualAuthToken.trim();
    if (!normalizedToken) return;
    setSession(buildNextSession(session, normalizedBackendUrl, normalizedToken));
  }

  function handleOAuthStart(): void {
    savePendingAuthBackendUrl(normalizedBackendUrl);
  }

  const isAuthenticated = Boolean(session?.authToken);
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Jogador';

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjAxLCAxNjgsIDc2LCAwLjAzKSIvPjwvc3ZnPg==')] opacity-30 z-0" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-4xl mx-auto gold-frame p-8 sm:p-12 lg:p-16 text-center">
        
        {/* Decorative Cards (Corners) */}
        <DecorativeCard rank="A" suitChar="♠" isRed={false} rotation="-20deg" className="top-6 left-6 -translate-x-1/2 -translate-y-1/2 hidden sm:block" />
        <DecorativeCard rank="A" suitChar="♣" isRed={false} rotation="15deg" className="top-6 right-6 translate-x-1/2 -translate-y-1/2 hidden sm:block" />
        <DecorativeCard rank="3" suitChar="♦" isRed rotation="12deg" className="bottom-6 left-12 -translate-x-1/2 translate-y-1/2 hidden sm:block" />
        <DecorativeCard rank="7" suitChar="♥" isRed rotation="-18deg" className="bottom-8 right-12 translate-x-1/2 translate-y-1/2 hidden sm:block" />

        {/* Decorative Chips */}
        <PokerChip color="gold" rotation="15deg" className="top-20 -right-4 sm:-right-8 hidden sm:block" />
        <PokerChip color="red" rotation="-30deg" className="bottom-10 -left-4 sm:-left-8 hidden sm:block" />
        <PokerChip color="black" rotation="45deg" className="bottom-32 -right-4 sm:-right-6 hidden sm:block" />

        {/* Brand Logo Area */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl animate-pulse" />
            <div className="relative w-full h-full rounded-full border-2 border-amber-400/50 bg-slate-900 flex items-center justify-center shadow-[0_0_30px_rgba(201,168,76,0.3)]">
              <span className="text-3xl sm:text-4xl font-black text-gradient-gold" style={{ fontFamily: 'Georgia, serif' }}>TP</span>
            </div>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight mb-3" style={{ fontFamily: 'Georgia, serif' }}>
            Truco Paulista
          </h1>
          <p className="text-base sm:text-lg text-amber-200/60 font-medium tracking-wide">
            O Duelo Paulista no seu Navegador
          </p>
        </div>

        {/* Auth Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <a
            href={googleLoginUrl || undefined}
            onClick={googleLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold transition-all duration-300 shadow-lg ${
              googleLoginUrl 
                ? 'bg-gradient-to-r from-amber-500 to-amber-700 text-slate-900 hover:scale-105 hover:shadow-amber-500/30' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Entrar com Google
          </a>
          
          <a
            href={githubLoginUrl || undefined}
            onClick={githubLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold transition-all duration-300 shadow-lg border border-white/10 ${
              githubLoginUrl 
                ? 'bg-slate-800 text-white hover:bg-slate-700 hover:scale-105' 
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Entrar com GitHub
          </a>
        </div>

        {/* Authenticated State / Lobby Link */}
        {isAuthenticated && (
          <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full bg-green-900/20 border border-green-500/20 mb-6">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-green-200 font-medium">Autenticado como <span className="text-white font-bold">{displayName}</span></span>
          </div>
        )}

        {isAuthenticated && (
          <Link 
            to="/lobby"
            className="inline-block px-8 py-4 rounded-xl bg-transparent border-2 border-amber-400/50 text-amber-400 font-black uppercase tracking-widest hover:bg-amber-400/10 hover:border-amber-400 hover:text-amber-300 transition-all duration-300 mb-12 shadow-[0_0_20px_rgba(201,168,76,0.1)]"
          >
            Ir para o Lobby →
          </Link>
        )}

        {/* Feature Badges */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {['1v1', '2v2', 'Matchmaking', 'Ranking ELO', 'Truco Paulista'].map((badge) => (
            <span
              key={badge}
              className="px-4 py-2 rounded-lg bg-slate-800/50 border border-white/5 text-xs font-bold uppercase tracking-wider text-slate-400"
            >
              {badge}
            </span>
          ))}
        </div>

        {/* Dev Tools Toggle */}
        <button 
          onClick={() => setShowDevTools(!showDevTools)}
          className="text-xs text-slate-600 hover:text-slate-400 underline decoration-slate-700 transition-colors"
        >
          {showDevTools ? 'Esconder Ferramentas de Dev' : 'Ferramentas de Dev'}
        </button>

        {showDevTools && (
          <div className="mt-8 pt-8 border-t border-white/5 grid gap-6 lg:grid-cols-2 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Backend URL
              </label>
              <div className="flex gap-2">
                <input
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  disabled={!allowManualBackendOverride}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none disabled:opacity-50"
                  placeholder="http://localhost:3000"
                />
                <button
                  onClick={handleSaveBackendUrl}
                  disabled={!allowManualBackendOverride}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold border border-white/10 disabled:opacity-50 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Token Manual (JWT)
              </label>
              <div className="flex gap-2">
                <input
                  value={manualAuthToken}
                  onChange={(e) => setManualAuthToken(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                  placeholder="Cole o token aqui..."
                />
                <button
                  onClick={handleSaveManualToken}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold border border-white/10 transition-colors"
                >
                  Usar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
