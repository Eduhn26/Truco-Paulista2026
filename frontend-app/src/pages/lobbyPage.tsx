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
        eyebrow: 'Sessão obrigatória',
        title: 'Sua sessão ainda não está pronta para abrir o pré-jogo.',
        detail:
          'O lobby depende de authToken e backendUrl válidos antes de montar a conexão em tempo real.',
        tone: 'warning' as const,
      }
    : !hasLobbySnapshot && !isSocketOnline
      ? {
        eyebrow: 'Socket offline',
        title: 'Conecte o socket para começar a formar a sala.',
        detail:
          'Sem conexão e sem snapshot salvo, o lobby ainda não recebeu room-state nem match-state.',
        tone: 'neutral' as const,
      }
      : !derivedMatchId
        ? {
          eyebrow: 'Aguardando sala',
          title: 'Crie uma partida ou entre em uma sala para seguir para a mesa.',
          detail:
            'A sessão já existe, mas ainda falta contexto suficiente para transformar o lobby em pré-jogo.',
          tone: 'neutral' as const,
        }
        : {
          eyebrow: 'Sala pronta',
          title: 'A sala já tem contexto suficiente para abrir a partida.',
          detail:
            'Agora o foco deixa de ser configuração e vira preparação para a mesa dedicada.',
          tone: 'success' as const,
        };

  const heroAction: HeroAction = useMemo(() => {
    if (!isSocketOnline) {
      return {
        label: 'Conectar lobby',
        detail:
          'Abra a sessão em tempo real para começar a hidratar a sala e receber estado autoritativo.',
        ctaLabel: 'Conectar socket',
        disabled: !canConnect,
        onClick: handleConnect,
      };
    }

    if (!derivedMatchId) {
      return {
        label: 'Criar a partida',
        detail:
          'Ainda não existe uma sala ativa. Gere uma nova partida para começar o pré-jogo.',
        ctaLabel: 'Criar partida',
        disabled: !canCreateMatch,
        onClick: handleCreateMatch,
      };
    }

    if (!currentReady) {
      return {
        label: 'Confirmar presença',
        detail:
          'A sala já existe. Marque seu estado como pronto para empurrar a partida em direção à mesa.',
        ctaLabel: 'Marcar como pronto',
        disabled: !canToggleReady,
        onClick: handleReady,
      };
    }

    return {
      label: 'Ir para a mesa',
      detail:
        'O pré-jogo já tem contexto de sala. Abra a MatchPage dedicada para entrar no palco principal.',
      ctaLabel: 'Abrir mesa',
      disabled: !Boolean(derivedMatchId),
      onClick: () => {
        window.location.assign(`/match/${derivedMatchId}`);
      },
    };
  }, [
    canConnect,
    canCreateMatch,
    canToggleReady,
    currentReady,
    derivedMatchId,
    handleConnect,
    handleCreateMatch,
    handleReady,
    isSocketOnline,
  ]);

  return (
    <section className="grid gap-8">
      <div className="overflow-hidden rounded-[36px] border border-white/10 bg-slate-900/88 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.12),transparent_55%)] px-8 py-8 lg:px-10 lg:py-10">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_360px] xl:items-center">
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={connectionStatus === 'online' ? 'Lobby online' : 'Lobby offline'}
                  tone={connectionStatus === 'online' ? 'success' : 'warning'}
                />
                <StatusPill label={roomModeLabel} tone="neutral" />
                <StatusPill
                  label={currentReady ? 'Pronto' : 'Aguardando'}
                  tone={currentReady ? 'success' : 'neutral'}
                />
                {derivedMatchId ? <StatusPill label="Sala vinculada" tone="success" /> : null}
              </div>

              <div className="grid gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
                  Pré-jogo autenticado
                </div>

                <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white lg:text-5xl">
                  Entre na sala e prepare a partida antes de abrir a mesa.
                </h1>

                <p className="max-w-3xl text-base leading-8 text-slate-300">
                  O lobby agora precisa comunicar pré-jogo, formação de sala e próximo passo claro.
                  Menos console operacional. Mais área de preparação para a partida real.
                </p>
              </div>

              <div className={`rounded-[28px] border p-5 ${getEntryToneClass(entryState.tone)}`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  {entryState.eyebrow}
                </div>
                <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                  {entryState.title}
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  {entryState.detail}
                </p>
              </div>
            </div>

            <section className="rounded-[30px] border border-amber-400/15 bg-slate-950/65 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.3)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
                    Próximo passo
                  </div>
                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                    {heroAction.label}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{heroAction.detail}</p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  pré-jogo
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <HeroMetricCard label="Jogadores" value={String(playerCount)} />
                <HeroMetricCard label="Prontos" value={`${readyCount}/${Math.max(playerCount, 1)}`} />
                <HeroMetricCard label="Partida" value={derivedMatchId ? 'Ativa' : 'Pendente'} />
              </div>

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={heroAction.onClick}
                  disabled={heroAction.disabled}
                  className="rounded-[22px] bg-amber-600 px-5 py-4 text-base font-black text-slate-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {heroAction.ctaLabel}
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleGetState}
                    disabled={!canRequestState}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Obter estado
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={!isSocketOnline}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                </div>

                {derivedMatchId ? (
                  <Link
                    to={`/match/${derivedMatchId}`}
                    className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-center text-sm font-black text-amber-300 transition hover:bg-amber-500/15"
                  >
                    Abrir mesa
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <div className="grid gap-8 px-8 py-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <section className="rounded-[32px] border border-white/10 bg-slate-950/58 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">
                    Sala da partida
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">
                    O centro do lobby agora precisa ser a formação da mesa, não a telemetria.
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  palco da sala
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-[28px] border border-amber-400/12 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.08),transparent_48%),linear-gradient(180deg,rgba(5,16,25,0.95),rgba(3,8,18,0.98))] p-5">
                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <LobbyStageMetric label="Modo" value={roomModeLabel} />
                      <LobbyStageMetric label="Estado da sala" value={isLobbyReady ? 'Hidratada' : 'Pendente'} />
                      <LobbyStageMetric label="ID da partida" value={derivedMatchId || '-'} mono />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <SeatStageCard
                        title="Assento T1A"
                        player={roomPlayers.find((player) => player.seatId === 'T1A') ?? null}
                        isAssigned={playerAssigned?.seatId === 'T1A'}
                      />
                      <SeatStageCard
                        title="Assento T2A"
                        player={roomPlayers.find((player) => player.seatId === 'T2A') ?? null}
                        isAssigned={playerAssigned?.seatId === 'T2A'}
                      />
                    </div>

                    {roomState?.mode === '2v2' ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SeatStageCard
                          title="Assento T1B"
                          player={roomPlayers.find((player) => player.seatId === 'T1B') ?? null}
                          isAssigned={playerAssigned?.seatId === 'T1B'}
                        />
                        <SeatStageCard
                          title="Assento T2B"
                          player={roomPlayers.find((player) => player.seatId === 'T2B') ?? null}
                          isAssigned={playerAssigned?.seatId === 'T2B'}
                        />
                      </div>
                    ) : null}

                    {!hasPlayersInRoom ? (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-7 text-slate-400">
                        Nenhum jogador entrou na sala ainda. Conecte o socket e crie ou entre em
                        uma partida para começar a formar a mesa.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Sala privada
                    </div>

                    <label className="mt-4 grid gap-2 text-sm">
                      <span className="text-slate-400">ID da partida</span>
                      <input
                        value={matchId}
                        onChange={(event) => setMatchId(event.target.value)}
                        className="rounded-[18px] border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-400/40"
                        placeholder="Cole um matchId para entrar em uma sala existente"
                      />
                    </label>

                    <div className="mt-4 grid gap-3">
                      <button
                        type="button"
                        onClick={() => handleJoinMatch(matchId)}
                        disabled={!canJoinMatch}
                        className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Entrar na sala privada
                      </button>

                      <button
                        type="button"
                        onClick={handleCreateMatch}
                        disabled={!canCreateMatch}
                        className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Criar partida
                      </button>

                      <button
                        type="button"
                        onClick={handleReady}
                        disabled={!canToggleReady}
                        className={`rounded-[18px] border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          currentReady
                            ? 'border-amber-400/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                            : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                        }`}
                      >
                        {currentReady ? 'Marcar como não pronto' : 'Marcar como pronto'}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Prévia da partida
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <CompactMetricCard
                        label="Placar"
                        value={`T1 ${displayedMatchState?.score.playerOne ?? 0} × T2 ${displayedMatchState?.score.playerTwo ?? 0}`}
                        mono
                      />
                      <CompactMetricCard
                        label="Estado"
                        value={displayedMatchState?.state || '-'}
                        mono
                      />
                      <CompactMetricCard
                        label="Valor atual"
                        value={String(displayedMatchState?.currentHand?.currentValue ?? '-')}
                        mono
                      />
                      <CompactMetricCard
                        label="Estado da aposta"
                        value={displayedMatchState?.currentHand?.betState ?? '-'}
                        mono
                      />
                    </div>
                  </section>
                </div>
              </div>
            </section>

            <div className="grid gap-6 self-start">
              <section className="rounded-[30px] border border-white/10 bg-slate-950/60 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-black tracking-tight text-slate-100">
                      Sessão do jogador
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      Informação de sessão mantida, mas agora em papel claramente secundário.
                    </p>
                  </div>

                  <div
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
                      session?.authToken
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {session?.authToken ? 'Sessão pronta' : 'Sem sessão'}
                  </div>
                </div>

                <div className="mt-6 grid gap-3 text-sm">
                  <CompactInfoCard
                    label="Usuário"
                    value={session?.user?.displayName ?? session?.user?.email ?? 'Usuário desconhecido'}
                  />
                  <CompactInfoCard label="Provedor" value={session?.user?.provider ?? '-'} />
                  <CompactInfoCard label="Assento" value={playerAssigned?.seatId ?? '-'} />
                  <CompactInfoCard label="URL do backend" value={session?.backendUrl || '-'} mono />
                </div>
              </section>

              <section className="rounded-[30px] border border-white/10 bg-slate-950/60 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-black tracking-tight text-slate-100">
                      Registro de eventos
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      Telemetria local continua disponível, mas sem roubar o centro da composição.
                    </p>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    cliente
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-7 text-slate-300">
                    {eventLog.length > 0 ? eventLog.join('\n') : 'Nenhum evento ainda.'}
                  </pre>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warning';
}) {
  const className =
    tone === 'success'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-300'
      : tone === 'warning'
        ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
        : 'border-white/10 bg-white/[0.03] text-slate-300';

  return (
    <div
      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${className}`}
    >
      {label}
    </div>
  );
}

function HeroMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-slate-100">{value}</div>
    </div>
  );
}

function LobbyStageMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-sm font-black text-slate-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function SeatStageCard({
  title,
  player,
  isAssigned,
}: {
  title: string;
  player:
    | {
      seatId: string;
      ready: boolean;
      isBot?: boolean;
      teamId?: string | null;
    }
    | null;
  isAssigned: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border px-4 py-4 ${
        isAssigned
          ? 'border-amber-400/20 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-100">{title}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {player?.seatId ?? 'Assento vazio'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAssigned ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
              Você
            </span>
          ) : null}

          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
              player?.ready
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-white/5 text-slate-400'
            }`}
          >
            {player?.ready ? 'Pronto' : 'Aguardando'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <CompactMetricCard label="Tipo" value={player?.isBot ? 'Bot' : player ? 'Humano' : '-'} />
        <CompactMetricCard label="Time" value={player?.teamId ?? '-'} />
      </div>
    </div>
  );
}

function CompactMetricCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-black/10 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1.5 break-all text-sm font-semibold text-slate-100 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function CompactInfoCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1.5 break-all text-sm font-semibold text-slate-100 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function getEntryToneClass(tone: EntryTone): string {
  if (tone === 'success') {
    return 'border-amber-400/20 bg-amber-500/10';
  }

  if (tone === 'warning') {
    return 'border-rose-500/20 bg-rose-500/10';
  }

  return 'border-white/10 bg-white/[0.03]';
}
