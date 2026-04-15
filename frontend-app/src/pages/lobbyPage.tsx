import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/authStore';
import { useLobbyRealtimeSession } from '../features/lobby/useLobbyRealtimeSession';
import type { MatchStatePayload } from '../services/socket/socketTypes';

type EntryTone = 'neutral' | 'warning' | 'success';
type HeroAction = {
  label: string;
  detail: string;
  ctaLabel: string;
  disabled: boolean;
  onClick: () => void;
};

// Avatar Component for Seats
function SeatAvatar({ isBot, isMe, ready }: { isBot: boolean; isMe: boolean; ready: boolean }) {
  return (
    <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-300 ${
      ready 
        ? 'border-amber-400 shadow-[0_0_15px_rgba(201,168,76,0.4)]' 
        : 'border-slate-700 bg-slate-800'
    }`}>
      {isMe && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
          VOCÊ
        </div>
      )}
      {isBot ? (
        <svg className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2m-3 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
        </svg>
      ) : (
        <svg className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      )}
      
      {/* Ready Indicator Ring */}
      {ready && (
        <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-20" />
      )}
    </div>
  );
}

export function LobbyPage() {
  const { session } = useAuth();
  const [matchId, setMatchId] = useState('');
  const {
    connectionStatus,
    roomState,
    playerAssigned,
    eventLog,
    derivedMatchId,
    roomPlayers,
    currentReady,
    hasLobbySnapshot,
    isSocketOnline,
    canConnect,
    canCreateMatch,
    canJoinMatch,
    canToggleReady,
    canRequestState,
    displayedMatchState,
    handleConnect,
    handleDisconnect,
    handleCreateMatch,
    handleJoinMatch,
    handleReady,
    handleGetState,
  } = useLobbyRealtimeSession(session, matchId);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const roomModeLabel = roomState?.mode === '2v2' ? '2v2' : '1v1';
  const readyCount = roomPlayers.filter((player) => player.ready).length;
  const playerCount = roomPlayers.length;
  const isLobbyReady = Boolean(isSocketOnline && derivedMatchId);
  const hasPlayersInRoom = playerCount > 0;

  const entryState = !hasMinimumSession
    ? {
        eyebrow: 'Sessão Obrigatória',
        title: 'Faça login para acessar o Lobby.',
        detail: 'O lobby depende de autenticação válida.',
        tone: 'warning' as const,
      }
    : !hasLobbySnapshot && !isSocketOnline
    ? {
        eyebrow: 'Socket Offline',
        title: 'Conecte ao servidor.',
        detail: 'Clique em conectar para começar.',
        tone: 'neutral' as const,
      }
    : !derivedMatchId
    ? {
        eyebrow: 'Aguardando Sala',
        title: 'Crie ou entre em uma sala.',
        detail: 'Gere uma nova partida para iniciar.',
        tone: 'neutral' as const,
      }
    : {
        eyebrow: 'Sala Pronta',
        title: 'A mesa está pronta para abrir.',
        detail: 'Todos os assentos estão preenchidos.',
        tone: 'success' as const,
      };

  const heroAction: HeroAction = useMemo(() => {
    if (!isSocketOnline) {
      return {
        label: 'Conectar Lobby',
        detail: 'Abra a sessão em tempo real para começar.',
        ctaLabel: 'Conectar Socket',
        disabled: !canConnect,
        onClick: handleConnect,
      };
    }
    if (!derivedMatchId) {
      return {
        label: 'Criar Partida',
        detail: 'Gere uma nova sala 1v1 ou 2v2.',
        ctaLabel: 'Criar Partida',
        disabled: !canCreateMatch,
        onClick: handleCreateMatch,
      };
    }
    if (!currentReady) {
      return {
        label: 'Confirmar Presença',
        detail: 'Marque-se como pronto para a partida.',
        ctaLabel: 'Marcar como Pronto',
        disabled: !canToggleReady,
        onClick: handleReady,
      };
    }
    return {
      label: 'Abrir Mesa',
      detail: 'Todos prontos? Entre na partida.',
      ctaLabel: 'Ir para Mesa →',
      disabled: !Boolean(derivedMatchId),
      onClick: () => {
        window.location.assign(`/match/${derivedMatchId}`);
      },
    };
  }, [canConnect, canCreateMatch, canToggleReady, currentReady, derivedMatchId, handleConnect, handleCreateMatch, handleReady, isSocketOnline]);

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-[#050810] relative">
      {/* Decorative Elements */}
      <div className="absolute top-10 right-10 opacity-20 hidden lg:block pointer-events-none">
        <div className="w-32 h-48 bg-[url('image/svg+xml;base64,...')] bg-contain bg-no-repeat rotate-12" /> 
        {/* Note: Simplified for code block, would use actual card SVG or component in full impl */}
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                {entryState.eyebrow}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Lobby de Partidas
            </h1>
          </div>
          <div className="flex items-center gap-3">
             {/* Mode Badge */}
            <span className="px-3 py-1 rounded-full bg-slate-800 border border-white/10 text-xs font-bold text-slate-300">
              {roomModeLabel.toUpperCase()}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              connectionStatus === 'online' ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'bg-red-900/20 border-red-500/30 text-red-400'
            }`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Main Lobby Container */}
        <div className="gold-frame p-6 sm:p-8 lg:p-10">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            
            {/* Left: Action & Status */}
            <div className="lg:col-span-1 space-y-8">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">{heroAction.label}</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">{heroAction.detail}</p>
                
                {/* Primary CTA */}
                <button
                  onClick={heroAction.onClick}
                  disabled={heroAction.disabled}
                  className="w-full py-4 rounded-xl font-black text-lg uppercase tracking-wider transition-all duration-300 shadow-lg flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-amber-600 to-amber-500 text-slate-900 hover:shadow-amber-500/20 hover:scale-[1.02]"
                >
                  {heroAction.ctaLabel}
                </button>

                {/* Secondary Actions */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={handleGetState}
                    disabled={!canRequestState}
                    className="py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase border border-white/10 transition-colors disabled:opacity-50"
                  >
                    Obter Estado
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={!isSocketOnline}
                    className="py-3 rounded-lg bg-slate-800 hover:bg-red-900/30 text-slate-300 hover:text-red-300 text-xs font-bold uppercase border border-white/10 hover:border-red-500/30 transition-colors disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                </div>
              </div>

              {/* Player Count Metrics */}
              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase text-slate-500">Jogadores</span>
                  <span className="text-sm font-black text-white">{playerCount} / 2</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${(playerCount / 2) * 100}%` }} 
                  />
                </div>
                <div className="flex justify-between items-center mt-3">
                   <span className="text-xs font-bold uppercase text-slate-500">Prontos</span>
                   <span className="text-sm font-black text-green-400">{readyCount} / {playerCount}</span>
                </div>
              </div>
            </div>

            {/* Right: Table Preview / Seats */}
            <div className="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-white/5 p-6 sm:p-8 relative overflow-hidden">
              {/* Felt Background */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--felt-mid),_var(--felt))] opacity-30" />
              
              <div className="relative z-10">
                <div className="text-center mb-8">
                  <h3 className="text-lg font-bold text-slate-300 uppercase tracking-widest">Mesa de Jogo</h3>
                  {derivedMatchId && <p className="text-xs font-mono text-slate-600 mt-1">{derivedMatchId}</p>}
                </div>

                {/* Seats Layout */}
                <div className="flex flex-col items-center gap-12 sm:gap-16">
                  {/* Opponent Seat (Top) */}
                  <div className="flex flex-col items-center gap-3">
                    <SeatAvatar 
                      isBot={roomPlayers.find(p => p.seatId === 'T2A')?.isBot ?? false}
                      isMe={playerAssigned?.seatId === 'T2A'}
                      ready={roomPlayers.find(p => p.seatId === 'T2A')?.ready ?? false}
                    />
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-400">Adversário</p>
                      <p className="text-xs text-slate-600">T2A</p>
                    </div>
                  </div>

                  {/* VS Divider */}
                  <div className="relative w-full max-w-xs h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent flex items-center justify-center">
                    <span className="absolute bg-slate-900 px-3 text-xs font-black text-slate-600 italic">VS</span>
                  </div>

                  {/* Your Seat (Bottom) */}
                  <div className="flex flex-col items-center gap-3">
                    <SeatAvatar 
                      isBot={roomPlayers.find(p => p.seatId === 'T1A')?.isBot ?? false}
                      isMe={playerAssigned?.seatId === 'T1A'}
                      ready={roomPlayers.find(p => p.seatId === 'T1A')?.ready ?? false}
                    />
                    <div className="text-center">
                      <p className="text-sm font-bold text-amber-400">Você</p>
                      <p className="text-xs text-slate-600">T1A</p>
                    </div>
                  </div>
                </div>

                {/* Empty State Message */}
                {!hasPlayersInRoom && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm z-20">
                    <p className="text-slate-400 text-center">
                      Aguardando jogadores...<br/>
                      <span className="text-xs text-slate-600">Crie uma partida para começar.</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Dev/Manual Join Section (Collapsible or Secondary) */}
        <div className="gold-frame p-6 bg-slate-900/50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Entrar em Sala Existente</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="Cole o Match ID aqui..."
              className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:border-amber-500 outline-none transition-colors"
            />
            <button
              onClick={() => handleJoinMatch(matchId)}
              disabled={!canJoinMatch}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold border border-white/10 disabled:opacity-50 transition-colors"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
