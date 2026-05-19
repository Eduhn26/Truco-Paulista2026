import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../features/auth/authStore";
import {
  useLobbyRealtimeSession,
  type MatchHistoryListItemPayload,
} from "../features/lobby/useLobbyRealtimeSession";

type HeroAction = {
  ctaLabel: string;
  disabled: boolean;
  onClick: () => void;
};

type QuickMatchMode = "1v1" | "2v2";

type ContinuationState =
  | "reconnect"
  | "active-room-waiting-ready"
  | "active-room-ready"
  | "recent-session"
  | "first-session";

type ContinuationDescriptor = {
  state: ContinuationState;
  badge: string;
  badgeTone: "gold" | "green" | "neutral";
  title: string;
  summary: string;
  action: HeroAction;
};

type RankingEntryLike = {
  profileId?: string;
  userId?: string;
  displayName?: string;
  publicName?: string;
  publicSlug?: string;
  rating?: number;
  wins?: number;
  losses?: number;
  matchesPlayed?: number;
};

type ProgressSnapshot = {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRateLabel: string;
  rankingPosition: number | null;
  ratingLabel: string | null;
  momentumLabel: string;
  momentumTone: string;
  summary: string;
};

type HistoryProgressStats = {
  matchesPlayed: number;
  wins: number;
  losses: number;
};

type RecentMatchViewModel = {
  resultLabel: string;
  resultTone: string;
  opponentLabel: string;
  scoreLabel: string;
  finishedAtLabel: string;
  didCurrentUserWin: boolean | null;
};

type LobbySeatId = "T1A" | "T2A" | "T1B" | "T2B";

type LobbyRoomPlayer = {
  seatId: string;
  ready: boolean;
  userId?: string | null;
  playerToken?: string | null;
  displayName?: string | null;
  publicName?: string | null;
  publicSlug?: string | null;
  isBot?: boolean;
  botIdentity?: {
    displayName?: string;
  } | null;
};

function resolveLobbySeatDisplayName(
  player: LobbyRoomPlayer | undefined,
  fallbackName: string,
): string {
  const rawName = player?.isBot
    ? player.botIdentity?.displayName
    : (player?.publicName ?? player?.displayName);

  const normalizedName = rawName?.trim();

  if (normalizedName) {
    return normalizedName;
  }

  return fallbackName;
}

function LobbySeatPreviewCard({
  seatId,
  player,
  currentSeatId,
  viewerDisplayName,
  roleLabel,
  teamLabel,
  tone,
  canSelect = false,
  selectHint = null,
  onSelect,
}: {
  seatId: LobbySeatId;
  player: LobbyRoomPlayer | undefined;
  currentSeatId: string | undefined;
  viewerDisplayName: string;
  roleLabel: string;
  teamLabel: string;
  tone: "ally" | "opponent";
  canSelect?: boolean;
  selectHint?: string | null;
  onSelect?: () => void;
}) {
  const isMe = currentSeatId === seatId;
  const isBot = player?.isBot === true;
  const isOccupied = Boolean(player);
  const ready = player?.ready ?? false;
  const displayRole = isMe ? "Você" : isOccupied ? roleLabel : "Aguardando";
  const displayName = isBot
    ? (player?.botIdentity?.displayName ?? "Bot")
    : isOccupied
      ? resolveLobbySeatDisplayName(
          player,
          isMe ? viewerDisplayName : roleLabel,
        )
      : "Assento livre";
  const occupantKind = isBot ? "Bot" : isOccupied ? "Humano" : "Livre";
  const initialName = isOccupied ? displayName : roleLabel;
  const initial =
    isBot || !isOccupied
      ? undefined
      : initialName.charAt(0).toUpperCase() || "H";
  const toneStyle =
    tone === "ally"
      ? {
          shell: isMe
            ? "linear-gradient(180deg, rgba(201,168,76,0.22), rgba(8,14,18,0.92))"
            : "linear-gradient(180deg, rgba(34,197,94,0.14), rgba(8,14,18,0.90))",
          border: isMe
            ? "1px solid rgba(201,168,76,0.42)"
            : "1px solid rgba(74,222,128,0.26)",
          glow: isMe
            ? "0 0 32px rgba(201,168,76,0.18)"
            : "0 0 24px rgba(34,197,94,0.10)",
          accent: isMe ? "#e8c76a" : "#4ade80",
          accentSoft: isMe ? "rgba(201,168,76,0.14)" : "rgba(74,222,128,0.12)",
          rail: isMe ? "rgba(201,168,76,0.44)" : "rgba(74,222,128,0.26)",
        }
      : {
          shell:
            "linear-gradient(180deg, rgba(22,28,44,0.92), rgba(8,13,20,0.94))",
          border: "1px solid rgba(248,113,113,0.22)",
          glow: "0 0 24px rgba(239,68,68,0.08)",
          accent: "#fca5a5",
          accentSoft: "rgba(248,113,113,0.10)",
          rail: "rgba(248,113,113,0.24)",
        };

  return (
    <button
      type="button"
      onClick={canSelect ? onSelect : undefined}
      disabled={!canSelect}
      className={`group relative min-h-[96px] w-full overflow-hidden rounded-[24px] px-3.5 py-3 text-left transition ${
        canSelect ? "cursor-pointer hover:scale-[1.015]" : "cursor-default"
      }`}
      style={{
        background: toneStyle.shell,
        border: toneStyle.border,
        boxShadow: `${toneStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        opacity: isOccupied ? 1 : 0.78,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-1"
        style={{
          background: `linear-gradient(180deg, ${toneStyle.rail}, transparent 82%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl"
        style={{ background: toneStyle.accentSoft }}
      />

      <div className="relative z-10 flex items-start gap-3">
        <SeatAvatar isBot={isBot} isMe={isMe} ready={ready} initial={initial} />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: toneStyle.accentSoft,
                  border: `1px solid ${toneStyle.rail}`,
                  color: toneStyle.accent,
                  fontSize: 8,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                {displayRole}
              </span>
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(0,0,0,0.22)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(240,230,211,0.56)",
                  fontSize: 8,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {seatId}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: ready
                    ? toneStyle.accent
                    : "rgba(255,255,255,0.16)",
                  boxShadow: ready ? `0 0 10px ${toneStyle.accent}` : "none",
                }}
              />
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: ready ? toneStyle.accent : "rgba(240,230,211,0.42)",
                }}
              >
                {ready ? "Pronto" : isOccupied ? "Na mesa" : "Esperando"}
              </span>
            </div>
          </div>

          <p
            className="truncate"
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 15,
              fontWeight: 900,
              color: isOccupied ? "#f0e6d3" : "rgba(240,230,211,0.36)",
              lineHeight: 1.1,
            }}
          >
            {displayName}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p
              className="truncate"
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: isOccupied ? toneStyle.accent : "rgba(255,255,255,0.24)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {teamLabel}
            </p>

            <span
              className="rounded-full px-2 py-0.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(240,230,211,0.52)",
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {occupantKind}
            </span>
          </div>

          {selectHint ? (
            <p
              className="mt-2 truncate"
              style={{
                color: canSelect ? toneStyle.accent : "rgba(240,230,211,0.30)",
                fontSize: 8.5,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {selectHint}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

const GOLD_GRAD = "linear-gradient(135deg, #d9b85f, #9c7429)";
const CARD_BG =
  "linear-gradient(180deg, rgba(11,20,21,0.92), rgba(7,12,18,0.82))";
const CARD_BORDER = "1px solid rgba(201,168,76,0.18)";

function readInitialInviteMatchId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return (
      new URLSearchParams(window.location.search).get("matchId")?.trim() ?? ""
    );
  } catch {
    return "";
  }
}

function buildInviteShareValue(matchId: string): string {
  if (typeof window === "undefined") {
    return matchId;
  }

  try {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.pathname = "/lobby";
    inviteUrl.searchParams.set("matchId", matchId);

    return inviteUrl.toString();
  } catch {
    return matchId;
  }
}

function SeatAvatar({
  isBot,
  isMe,
  ready,
  initial,
}: {
  isBot: boolean;
  isMe: boolean;
  ready: boolean;
  initial?: string | undefined;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className="relative flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          background: ready
            ? "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08))"
            : "rgba(255,255,255,0.04)",
          border: ready
            ? "2px solid rgba(201,168,76,0.6)"
            : "2px solid rgba(255,255,255,0.1)",
          boxShadow: ready ? "0 0 22px rgba(201,168,76,0.25)" : "none",
          transition: "all 0.3s ease",
        }}
      >
        {isMe ? (
          <div
            className="absolute -top-2 -right-2 rounded-full px-1.5 py-0.5 text-[8px] font-black text-black shadow"
            style={{ background: GOLD_GRAD, letterSpacing: "0.08em" }}
          >
            VOCÊ
          </div>
        ) : null}

        {isBot ? (
          <svg
            className="h-5 w-5"
            fill="rgba(255,255,255,0.35)"
            viewBox="0 0 24 24"
          >
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2m-3 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
          </svg>
        ) : initial ? (
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 15,
              fontWeight: 900,
              color: ready ? "#e8c76a" : "rgba(255,255,255,0.5)",
            }}
          >
            {initial}
          </span>
        ) : (
          <svg
            className="h-5 w-5"
            fill="rgba(255,255,255,0.3)"
            viewBox="0 0 24 24"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )}

        {ready ? (
          <div
            className="pointer-events-none absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ border: "2px solid rgba(201,168,76,0.6)" }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.07)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: GOLD_GRAD }}
      />
    </div>
  );
}

function GoldButton({
  children,
  onClick,
  disabled,
  variant = "solid",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const paddingMap = { sm: "6px 14px", md: "8px 18px", lg: "9px 20px" };
  const fontSizeMap = { sm: 8.5, md: 9.5, lg: 10 };

  const solidStyle = {
    background: disabled
      ? "rgba(255,255,255,0.05)"
      : "linear-gradient(135deg, #f2d488 0%, #d9b85f 48%, #9c7429 100%)",
    border: `1.5px solid ${disabled ? "rgba(255,255,255,0.06)" : "rgba(255,223,128,0.58)"}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "#1a0800",
    boxShadow: disabled
      ? "none"
      : "0 0 28px rgba(201,168,76,0.34), 0 10px 24px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.34)",
  };

  const outlineStyle = {
    background: disabled
      ? "transparent"
      : "linear-gradient(180deg, rgba(201,168,76,0.08), rgba(5,9,14,0.20))",
    border: `1.5px solid ${disabled ? "rgba(255,255,255,0.08)" : "rgba(201,168,76,0.42)"}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(232,199,106,0.95)",
    boxShadow: disabled ? "none" : "inset 0 1px 0 rgba(255,255,255,0.05)",
  };

  const ghostStyle = {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.08)",
    color: disabled ? "rgba(255,255,255,0.15)" : "rgba(240,230,211,0.68)",
    boxShadow: "none",
  };

  const styleMap = {
    solid: solidStyle,
    outline: outlineStyle,
    ghost: ghostStyle,
  };

  const chosen = styleMap[variant];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-wider transition-all duration-200 ${
        !disabled ? "hover:scale-[1.02]" : "cursor-not-allowed"
      } ${className}`}
      style={{
        ...chosen,
        padding: paddingMap[size],
        fontSize: fontSizeMap[size],
        letterSpacing: "0.12em",
      }}
    >
      {children}
    </button>
  );
}

type ModeActionTone = "gold" | "green" | "blue" | "red" | "neutral";

function ModeActionCard({
  eyebrow,
  title,
  description,
  meta,
  icon,
  disabled,
  onClick,
  tone = "neutral",
  featured = false,
  ctaLabel = "Abrir",
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta: string;
  icon: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: ModeActionTone;
  featured?: boolean;
  ctaLabel?: string;
}) {
  const toneStyles: Record<
    ModeActionTone,
    {
      accent: string;
      background: string;
      border: string;
      glow: string;
    }
  > = {
    gold: {
      accent: "#e8c76a",
      background:
        "linear-gradient(145deg, rgba(20,28,22,0.96), rgba(8,12,18,0.90))",
      border: "1px solid rgba(201,168,76,0.32)",
      glow: "0 18px 42px rgba(201,168,76,0.14)",
    },
    green: {
      accent: "#4ade80",
      background:
        "linear-gradient(145deg, rgba(14,29,23,0.96), rgba(8,12,18,0.90))",
      border: "1px solid rgba(74,222,128,0.22)",
      glow: "0 18px 42px rgba(34,197,94,0.10)",
    },
    blue: {
      accent: "#93c5fd",
      background:
        "linear-gradient(145deg, rgba(13,23,36,0.96), rgba(8,12,18,0.90))",
      border: "1px solid rgba(147,197,253,0.20)",
      glow: "0 18px 42px rgba(59,130,246,0.10)",
    },
    red: {
      accent: "#f87171",
      background:
        "linear-gradient(145deg, rgba(36,18,18,0.96), rgba(8,12,18,0.90))",
      border: "1px solid rgba(248,113,113,0.22)",
      glow: "0 18px 42px rgba(185,28,28,0.12)",
    },
    neutral: {
      accent: "rgba(240,230,211,0.72)",
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.055), rgba(8,13,18,0.84))",
      border: "1px solid rgba(255,255,255,0.09)",
      glow: "0 18px 42px rgba(0,0,0,0.16)",
    },
  };

  const style = toneStyles[tone];
  const className =
    "group relative min-h-[74px] overflow-hidden rounded-2xl p-2.5 text-left transition-all duration-200 " +
    (disabled
      ? "cursor-not-allowed opacity-45"
      : "hover:-translate-y-0.5 hover:scale-[1.01]");

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className}
      style={{
        background: style.background,
        border: style.border,
        boxShadow:
          featured && !disabled ? style.glow : "0 12px 30px rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          width: 78,
          height: 78,
          background: style.accent,
          filter: "blur(56px)",
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              style={{
                fontSize: 8.5,
                fontWeight: 900,
                letterSpacing: "0.20em",
                color: style.accent,
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {eyebrow}
            </p>

            <h3
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 13.5,
                lineHeight: 1.05,
                fontWeight: 900,
                color: "#f0e6d3",
              }}
            >
              {title}
            </h3>
          </div>

          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: style.accent,
              fontSize: 15,
            }}
          >
            {icon}
          </span>
        </div>

        <p
          style={{
            fontSize: 9.4,
            lineHeight: 1.25,
            color: "rgba(240,230,211,0.50)",
          }}
        >
          {description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <span
            className="rounded-full px-2.5 py-1"
            style={{
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(240,230,211,0.42)",
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {meta}
          </span>

          <span
            className="rounded-full px-2.5 py-1"
            style={{
              background: disabled
                ? "rgba(255,255,255,0.035)"
                : "rgba(0,0,0,0.22)",
              border: `1px solid ${disabled ? "rgba(255,255,255,0.05)" : (style.border.split(" solid ")[1] ?? "rgba(255,255,255,0.08)")}`,
              color: disabled ? "rgba(255,255,255,0.22)" : style.accent,
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {disabled ? "Bloqueado" : ctaLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

function SidebarStat({
  label,
  value,
  tone = "#f0e6d3",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl px-2.5 py-1.5"
      style={{
        background: "rgba(0,0,0,0.18)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: "rgba(255,255,255,0.36)",
          marginBottom: 3,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: tone,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function resolveRecentMatchViewModel(
  historyItem: MatchHistoryListItemPayload,
  currentUserId: string | undefined,
): RecentMatchViewModel {
  const myParticipant =
    historyItem.participants.find(
      (participant) => participant.userId === currentUserId,
    ) ?? null;

  const didCurrentUserWin =
    (historyItem.winnerPlayerId === "P1" &&
      myParticipant?.seatId.startsWith("T1")) ||
    (historyItem.winnerPlayerId === "P2" &&
      myParticipant?.seatId.startsWith("T2"));

  const opponentParticipant =
    historyItem.participants.find((participant) => {
      if (!myParticipant) {
        return participant.userId !== currentUserId;
      }

      return participant.seatId !== myParticipant.seatId;
    }) ?? null;

  const finishedAtLabel = historyItem.finishedAt
    ? new Date(historyItem.finishedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Agora";

  return {
    resultLabel:
      historyItem.status !== "completed"
        ? "Encerrada"
        : didCurrentUserWin
          ? "Vitória"
          : "Derrota",
    resultTone:
      historyItem.status !== "completed"
        ? "rgba(255,255,255,0.65)"
        : didCurrentUserWin
          ? "#4ade80"
          : "#f87171",
    opponentLabel:
      opponentParticipant?.displayName ??
      (opponentParticipant?.isBot ? "Bot" : "—"),
    scoreLabel: `${historyItem.finalScore.playerOne} × ${historyItem.finalScore.playerTwo}`,
    finishedAtLabel,
    didCurrentUserWin:
      historyItem.status === "completed" ? (didCurrentUserWin ?? null) : null,
  };
}

function resolveContinuationDescriptor(params: {
  isSocketOnline: boolean;
  canConnect: boolean;
  canCreateMatch: boolean;
  canToggleReady: boolean;
  derivedMatchId: string;
  currentReady: boolean;
  latestHistoryItem: MatchHistoryListItemPayload | null;
  handleConnect: () => void;
  handleCreateMatch: (mode?: QuickMatchMode) => void;
  handleReady: () => void;
}): ContinuationDescriptor {
  const {
    isSocketOnline,
    canConnect,
    canCreateMatch,
    canToggleReady,
    derivedMatchId,
    currentReady,
    latestHistoryItem,
    handleConnect,
    handleCreateMatch,
    handleReady,
  } = params;

  if (!isSocketOnline) {
    return {
      state: "reconnect",
      badge: "Reconexão",
      badgeTone: "neutral",
      title: "Reconecte para retomar sua sessão",
      summary:
        "Abra a sessão em tempo real para recuperar sala ativa, histórico recente e ranking semanal.",
      action: {
        ctaLabel: "Conectar Socket",
        disabled: !canConnect,
        onClick: handleConnect,
      },
    };
  }

  if (derivedMatchId) {
    if (!currentReady) {
      return {
        state: "active-room-waiting-ready",
        badge: "Sala Atual",
        badgeTone: "gold",
        title: "Sua sala atual ainda está aberta",
        summary:
          "Você já tem uma mesa em andamento. O próximo passo é confirmar presença para destravar a continuidade da sessão.",
        action: {
          ctaLabel: "Marcar como Pronto",
          disabled: !canToggleReady,
          onClick: handleReady,
        },
      };
    }

    return {
      state: "active-room-ready",
      badge: "Mesa Pronta",
      badgeTone: "green",
      title: "Tudo pronto para voltar ao jogo",
      summary:
        "Sua sala já está preparada. O caminho principal agora é retornar direto para a mesa e continuar a partida.",
      action: {
        ctaLabel: "Ir para Mesa →",
        disabled: false,
        onClick: () => {
          window.location.assign(`/match/${derivedMatchId}`);
        },
      },
    };
  }

  if (latestHistoryItem) {
    return {
      state: "recent-session",
      badge: "Sessão Recente",
      badgeTone: "gold",
      title: "Sua última partida já está registrada",
      summary:
        "O lobby já reconhece sua sessão anterior. Entre rápido em uma nova mesa e mantenha o ritmo da progressão.",
      action: {
        ctaLabel: "Jogar Novamente",
        disabled: !canCreateMatch,
        onClick: handleCreateMatch,
      },
    };
  }

  return {
    state: "first-session",
    badge: "Primeira Partida",
    badgeTone: "gold",
    title: "Tudo pronto para abrir sua próxima mesa",
    summary:
      "Você já está autenticado e conectado. O próximo passo natural é criar uma nova partida e entrar no fluxo principal do jogo.",
    action: {
      ctaLabel: "Criar Partida",
      disabled: !canCreateMatch,
      onClick: handleCreateMatch,
    },
  };
}

function toneToStyles(tone: ContinuationDescriptor["badgeTone"]) {
  if (tone === "green") {
    return {
      background: "rgba(34,197,94,0.1)",
      border: "1px solid rgba(34,197,94,0.24)",
      color: "#4ade80",
    };
  }

  if (tone === "neutral") {
    return {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      color: "rgba(255,255,255,0.62)",
    };
  }

  return {
    background: "rgba(201,168,76,0.08)",
    border: "1px solid rgba(201,168,76,0.14)",
    color: "rgba(201,168,76,0.85)",
  };
}

function resolveHistoryProgressStats(
  matchHistory: MatchHistoryListItemPayload[],
  currentUserId: string | undefined,
): HistoryProgressStats {
  if (!currentUserId) {
    return { matchesPlayed: 0, wins: 0, losses: 0 };
  }

  return matchHistory.reduce<HistoryProgressStats>(
    (accumulator, historyItem) => {
      if (historyItem.status !== "completed") {
        return accumulator;
      }

      const myParticipant = historyItem.participants.find(
        (participant) => participant.userId === currentUserId,
      );

      if (!myParticipant) {
        return accumulator;
      }

      const myTeamPlayerId = myParticipant.seatId.startsWith("T1")
        ? "P1"
        : myParticipant.seatId.startsWith("T2")
          ? "P2"
          : null;

      if (!myTeamPlayerId || !historyItem.winnerPlayerId) {
        return accumulator;
      }

      const didWin = historyItem.winnerPlayerId === myTeamPlayerId;

      return {
        matchesPlayed: accumulator.matchesPlayed + 1,
        wins: accumulator.wins + (didWin ? 1 : 0),
        losses: accumulator.losses + (didWin ? 0 : 1),
      };
    },
    { matchesPlayed: 0, wins: 0, losses: 0 },
  );
}

function resolveProgressSnapshot(params: {
  ranking: RankingEntryLike[];
  currentUserId: string | undefined;
  matchHistory: MatchHistoryListItemPayload[];
  latestHistoryItem: MatchHistoryListItemPayload | null;
  recentMatchViewModel: RecentMatchViewModel | null;
}): ProgressSnapshot {
  const currentUserRankingEntry =
    params.ranking.find((entry) => entry.userId === params.currentUserId) ??
    null;

  const rankingPosition = currentUserRankingEntry
    ? params.ranking.findIndex(
        (entry) => entry.userId === params.currentUserId,
      ) + 1
    : null;

  const rankingMatchesPlayed = currentUserRankingEntry?.matchesPlayed ?? 0;
  const rankingWins = currentUserRankingEntry?.wins ?? 0;
  const rankingLosses = currentUserRankingEntry?.losses ?? 0;
  const rating = currentUserRankingEntry?.rating ?? null;
  const historyProgressStats = resolveHistoryProgressStats(
    params.matchHistory,
    params.currentUserId,
  );

  const hasRecentMatch = params.latestHistoryItem !== null;

  const matchesPlayed = Math.max(
    rankingMatchesPlayed,
    historyProgressStats.matchesPlayed,
    hasRecentMatch ? 1 : 0,
  );
  const wins = Math.max(rankingWins, historyProgressStats.wins);
  const losses = Math.max(rankingLosses, historyProgressStats.losses);
  const winRate =
    matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

  let momentumLabel = "Começo de jornada";
  let momentumTone = "rgba(201,168,76,0.85)";
  let summary =
    "Conecte-se e jogue suas primeiras partidas para montar seu momento competitivo.";

  if (hasRecentMatch && params.recentMatchViewModel) {
    if (params.recentMatchViewModel.didCurrentUserWin === true) {
      momentumLabel = "Vitória recente";
      momentumTone = "#4ade80";
      summary = `Vitória recente contra ${params.recentMatchViewModel.opponentLabel}.`;
    } else if (params.recentMatchViewModel.didCurrentUserWin === false) {
      momentumLabel = "Derrota recente";
      momentumTone = "#f87171";
      summary = `Derrota recente contra ${params.recentMatchViewModel.opponentLabel}.`;
    } else {
      momentumLabel = "Sessão recente";
      momentumTone = "#93c5fd";
      summary =
        "Seu histórico recente já começou a preencher a camada de progresso.";
    }
  } else if (matchesPlayed >= 10 && winRate >= 60) {
    momentumLabel = "Boa fase";
    momentumTone = "#4ade80";
    summary = `Você já jogou ${matchesPlayed} partidas e mantém um ritmo forte.`;
  } else if (matchesPlayed >= 5 && winRate < 40) {
    momentumLabel = "Hora da reação";
    momentumTone = "#f87171";
    summary = `Você já acumulou ${matchesPlayed} partidas. Vale buscar recuperação.`;
  } else if (matchesPlayed > 0) {
    momentumLabel = "Em evolução";
    momentumTone = "#93c5fd";
    summary = `Você já jogou ${matchesPlayed} partida${matchesPlayed > 1 ? "s" : ""}.`;
  }

  return {
    matchesPlayed,
    wins,
    losses,
    winRateLabel: `${winRate}%`,
    rankingPosition,
    ratingLabel: rating !== null ? rating.toLocaleString("pt-BR") : null,
    momentumLabel,
    momentumTone,
    summary,
  };
}

export function LobbyPage() {
  const { session } = useAuth();
  const [matchId, setMatchId] = useState(() => readInitialInviteMatchId());
  const [showCreateRoomPanel, setShowCreateRoomPanel] = useState(false);
  const [copyRoomCodeLabel, setCopyRoomCodeLabel] = useState("Copiar link");

  const {
    connectionStatus,
    roomState,
    playerAssigned,
    ranking,
    matchHistory,
    latestHistoryItem,
    derivedMatchId,
    roomPlayers,
    publicQueueSnapshot,
    activeQueueMode,
    currentReady,
    isSocketOnline,
    isInPublicQueue,
    canConnect,
    canCreateMatch,
    canCreatePrivateMatch,
    canJoinMatch,
    canJoinPublicQueue,
    canToggleReady,
    canLeavePublicQueue,
    displayedMatchState,
    handleConnect,
    handleCreateMatch,
    handleCreateFlexibleRoom,
    handleCreatePrivateMatch,
    handleCreateHumanOneVsOneRoom,
    handleJoinMatch,
    handleJoinPublicQueue,
    handleSwitchToPublicQueue,
    handleLeavePublicQueue,
    handleReady,
    handleSelectSeat,
    handleRefreshHistory,
  } = useLobbyRealtimeSession(session, matchId);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const roomModeLabel = roomState?.mode === "2v2" ? "2v2" : "1v1";
  const roomCapacity = roomState?.mode === "2v2" ? 4 : 2;
  const readyCount = roomPlayers.filter((player) => player.ready).length;
  const playerCount = roomPlayers.length;
  const isOnline = connectionStatus === "online";
  const isPublicQueueWaiting = isInPublicQueue && !derivedMatchId;
  const canSwitchActiveRoomToQueue = Boolean(
    hasMinimumSession &&
    isSocketOnline &&
    derivedMatchId &&
    !isPublicQueueWaiting,
  );
  const queueWaitingCount =
    publicQueueSnapshot?.size ?? (isPublicQueueWaiting ? 1 : 0);
  const activeQueueLabel =
    activeQueueMode === "2v2"
      ? "Fila pública 2v2"
      : activeQueueMode === "1v1"
        ? "Pareamento 1v1"
        : "Fila pública";
  const displayName =
    session?.user?.displayName?.trim() ||
    session?.user?.email?.trim() ||
    "Jogador";
  const currentUserId = session?.user?.id;
  const isHumanOneVsOneRoomWaiting = Boolean(
    derivedMatchId &&
    roomState?.mode === "1v1" &&
    playerCount === 1 &&
    !roomState.canStart &&
    playerAssigned?.seatId === "T1A",
  );
  const isPrivateFriendRoomWaiting = Boolean(
    derivedMatchId &&
    roomState?.mode === "2v2" &&
    playerCount === 1 &&
    !roomState.canStart &&
    playerAssigned?.seatId === "T1A",
  );
  const isInviteRoomWaiting =
    isHumanOneVsOneRoomWaiting || isPrivateFriendRoomWaiting;
  const roomStageLabel = isPublicQueueWaiting
    ? "Na fila pública"
    : isHumanOneVsOneRoomWaiting
      ? "Aguardando adversário"
      : isPrivateFriendRoomWaiting
        ? "Aguardando amigo"
        : derivedMatchId
          ? "Sala pronta"
          : "Aguardando sala";

  const rankingEntries = useMemo(() => {
    return ranking.slice(0, 5).map((entry, index) => {
      const entryPublicName = entry.publicName?.trim();
      const entryDisplayName = entry.displayName?.trim();
      const normalizedName =
        currentUserId !== undefined && entry.userId === currentUserId
          ? entryPublicName || displayName
          : entryPublicName || entryDisplayName || "Jogador";
      const ratingValue = typeof entry.rating === "number" ? entry.rating : 0;
      const isCurrentUser =
        currentUserId !== undefined && entry.userId === currentUserId;

      return {
        position: index + 1,
        name: normalizedName,
        ratingLabel: ratingValue.toLocaleString("pt-BR"),
        isCurrentUser,
      };
    });
  }, [currentUserId, displayName, ranking]);

  const recentMatchViewModel = useMemo(() => {
    if (!latestHistoryItem) {
      return null;
    }

    return resolveRecentMatchViewModel(latestHistoryItem, currentUserId);
  }, [currentUserId, latestHistoryItem]);

  const continuation = useMemo(() => {
    return resolveContinuationDescriptor({
      isSocketOnline,
      canConnect,
      canCreateMatch,
      canToggleReady,
      derivedMatchId,
      currentReady,
      latestHistoryItem,
      handleConnect,
      handleCreateMatch: () => handleCreateMatch("1v1"),
      handleReady,
    });
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
    latestHistoryItem,
  ]);

  const badgeStyles = useMemo(
    () => toneToStyles(continuation.badgeTone),
    [continuation.badgeTone],
  );
  const displayedBadgeStyles = isInviteRoomWaiting
    ? {
        background: "rgba(201,168,76,0.08)",
        border: "1px solid rgba(201,168,76,0.22)",
        color: "rgba(201,168,76,0.92)",
      }
    : badgeStyles;
  const heroBadgeLabel = isPublicQueueWaiting
    ? "Fila pública"
    : isHumanOneVsOneRoomWaiting
      ? "Duelo privado"
      : isPrivateFriendRoomWaiting
        ? "Mesa privada"
        : continuation.badge;
  const heroTitle = isPublicQueueWaiting
    ? "Desafiando outro jogador"
    : isHumanOneVsOneRoomWaiting
      ? "Duelo com amigo ativo"
      : isPrivateFriendRoomWaiting
        ? "Mesa com amigo ativa"
        : continuation.title;
  const heroSummary = isPublicQueueWaiting
    ? activeQueueMode === "1v1"
      ? "Você está aguardando outro jogador real. Quando ele entrar, os dois caem em uma sala 1v1 humana e podem marcar pronto para iniciar."
      : "Você está aguardando outro jogador real. Quando ele entrar, a mesa 2v2 abre com dois humanos em lados opostos e bots completando as duplas."
    : isHumanOneVsOneRoomWaiting
      ? "Envie o convite para seu adversário entrar. Esta sala não completa bot automaticamente; ela fica aguardando o segundo humano."
      : isPrivateFriendRoomWaiting
        ? "Envie o convite para seu amigo entrar. Quando ele conectar, os bots completam os assentos restantes e a mesa libera o ready."
        : continuation.summary;

  const handleCopyRoomCode = useCallback((): void => {
    if (!derivedMatchId) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyRoomCodeLabel("Copie manualmente");
      return;
    }

    void navigator.clipboard
      .writeText(buildInviteShareValue(derivedMatchId))
      .then(() => setCopyRoomCodeLabel("Link copiado"))
      .catch(() => setCopyRoomCodeLabel("Copie manualmente"));
  }, [derivedMatchId]);

  const heroAction = continuation.action;

  const progressSnapshot = useMemo(() => {
    return resolveProgressSnapshot({
      ranking,
      currentUserId,
      matchHistory,
      latestHistoryItem,
      recentMatchViewModel,
    });
  }, [
    currentUserId,
    latestHistoryItem,
    matchHistory,
    ranking,
    recentMatchViewModel,
  ]);
  const canReturnToModeSelection = Boolean(
    derivedMatchId && !displayedMatchState?.currentHand,
  );
  const isTwoVersusTwoPreview = roomState?.mode === "2v2";
  const getRoomPlayer = useCallback(
    (seatId: LobbySeatId): LobbyRoomPlayer | undefined => {
      const player = roomPlayers.find(
        (candidate) => candidate.seatId === seatId,
      );

      if (!player || player.seatId !== playerAssigned?.seatId) {
        return player;
      }

      return {
        ...player,
        userId: player.userId ?? currentUserId ?? null,
        displayName: player.displayName ?? displayName,
        publicName: player.publicName ?? displayName,
        publicSlug: player.publicSlug ?? null,
      };
    },
    [currentUserId, displayName, playerAssigned?.seatId, roomPlayers],
  );
  const isFlexibleRoom = roomState?.fillBotsOnStart === true;
  const canChangeFlexibleSeat = Boolean(
    isFlexibleRoom &&
      derivedMatchId &&
      roomState &&
      !displayedMatchState?.currentHand &&
      canToggleReady,
  );

  function resolveSeatSelectionProps(seatId: LobbySeatId): {
    canSelect: boolean;
    selectHint: string | null;
    onSelect: () => void;
  } {
    const player = getRoomPlayer(seatId);
    const isCurrentSeat = playerAssigned?.seatId === seatId;
    const isOccupiedByOtherHuman = Boolean(player && !player.isBot && !isCurrentSeat);
    const canSelect =
      canChangeFlexibleSeat && !isCurrentSeat && !isOccupiedByOtherHuman;

    return {
      canSelect,
      selectHint: isCurrentSeat
        ? "Seu assento"
        : isOccupiedByOtherHuman
          ? "Ocupado"
          : canSelect
            ? "Sentar aqui"
            : isFlexibleRoom
              ? "Bloqueado"
              : null,
      onSelect: () => handleSelectSeat(seatId),
    };
  }

  const hasActiveLobbyFocus = Boolean(derivedMatchId || isPublicQueueWaiting);
  const priorityTitle = isPublicQueueWaiting
    ? "Desafio em andamento"
    : isInviteRoomWaiting
      ? "Convite pronto para enviar"
      : derivedMatchId
        ? "Mesa atual aberta"
        : "Escolha sua mesa";
  const prioritySubtitle = isPublicQueueWaiting
    ? `${activeQueueLabel} · ${queueWaitingCount} jogador${queueWaitingCount === 1 ? "" : "es"} aguardando`
    : isInviteRoomWaiting
      ? `${roomModeLabel.toUpperCase()} · ${playerCount}/${roomCapacity} jogadores · copie o link e chame seu amigo`
      : derivedMatchId
        ? `${roomModeLabel.toUpperCase()} · ${playerCount}/${roomCapacity} jogadores · ${readyCount}/${Math.max(playerCount, 1)} prontos`
        : "Sem mesa ativa";
  const inviteCodeLabel = derivedMatchId
    ? derivedMatchId.slice(-8).toUpperCase()
    : "SEM MESA";
  const inviteLinkPreview = derivedMatchId
    ? buildInviteShareValue(derivedMatchId)
    : "Crie ou entre em uma mesa para liberar o link.";

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(55,89,52,0.52) 0%, rgba(10,19,20,0.94) 34%, #04070d 78%), linear-gradient(180deg, #071017 0%, #03060b 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-[-260px] h-[520px] w-[920px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(201,168,76,0.20) 0%, rgba(201,168,76,0.05) 44%, transparent 72%)",
            filter: "blur(24px)",
          }}
        />
        <div
          className="absolute left-[-180px] top-[22%] h-[520px] w-[520px] rounded-full"
          style={{ background: "rgba(45,106,79,0.20)", filter: "blur(90px)" }}
        />
        <div
          className="absolute bottom-[-220px] right-[-140px] h-[560px] w-[560px] rounded-full"
          style={{ background: "rgba(201,168,76,0.10)", filter: "blur(96px)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.55'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <main className="relative z-10 mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-6">
        <section
          className="relative mb-3 overflow-hidden rounded-[30px] p-3 sm:p-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(18,25,22,0.96), rgba(5,9,14,0.94) 54%, rgba(21,17,10,0.95))",
            border: "1px solid rgba(201,168,76,0.28)",
            boxShadow:
              "0 34px 90px rgba(0,0,0,0.50), 0 0 42px rgba(201,168,76,0.08), inset 0 1px 0 rgba(255,255,255,0.045), inset 0 0 0 1px rgba(255,255,255,0.025)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-5 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(232,199,106,0.72), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full"
            style={{
              background: "rgba(201,168,76,0.12)",
              filter: "blur(58px)",
            }}
          />

          <div className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: "rgba(201,168,76,0.08)",
                  border: "1px solid rgba(201,168,76,0.26)",
                  color: "rgba(232,199,106,0.92)",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "#e8c76a",
                    boxShadow: "0 0 14px rgba(232,199,106,0.85)",
                  }}
                />
                Salão de mesas
              </span>

              <span
                className="rounded-full px-3 py-1.5"
                style={{
                  ...displayedBadgeStyles,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                {heroBadgeLabel}
              </span>

              <span
                className="rounded-full px-3 py-1.5"
                style={{
                  background: isOnline
                    ? "rgba(34,197,94,0.11)"
                    : "rgba(239,68,68,0.11)",
                  border: isOnline
                    ? "1px solid rgba(34,197,94,0.24)"
                    : "1px solid rgba(239,68,68,0.24)",
                  color: isOnline ? "#4ade80" : "#f87171",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                {connectionStatus}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {derivedMatchId ? (
                <GoldButton
                  size="md"
                  onClick={() => {
                    window.location.assign(`/match/${derivedMatchId}`);
                  }}
                >
                  Entrar na mesa
                </GoldButton>
              ) : (
                <GoldButton
                  size="md"
                  onClick={heroAction.onClick}
                  disabled={heroAction.disabled}
                >
                  {heroAction.ctaLabel}
                </GoldButton>
              )}

              {isInviteRoomWaiting ? (
                <GoldButton
                  size="md"
                  variant="outline"
                  onClick={handleCopyRoomCode}
                >
                  {copyRoomCodeLabel}
                </GoldButton>
              ) : null}

              {isPublicQueueWaiting ? (
                <GoldButton
                  size="md"
                  variant="ghost"
                  onClick={handleLeavePublicQueue}
                  disabled={!canLeavePublicQueue}
                >
                  Sair da fila
                </GoldButton>
              ) : null}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(560px,1.08fr)]">
            <div className="flex min-h-[250px] flex-col justify-between gap-4 py-1">
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: "rgba(201,168,76,0.78)",
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  {priorityTitle}
                </p>

                <h1
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "clamp(30px, 3.4vw, 52px)",
                    fontWeight: 900,
                    color: "#f0e6d3",
                    lineHeight: 0.94,
                    letterSpacing: "-0.045em",
                    maxWidth: 640,
                  }}
                >
                  {derivedMatchId
                    ? "Sua mesa está servida."
                    : isPublicQueueWaiting
                      ? "Procurando mesa humana."
                      : "Escolha onde vai sentar."}
                </h1>

                <p
                  className="mt-4 max-w-[540px]"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "rgba(240,230,211,0.60)",
                  }}
                >
                  {derivedMatchId || isPublicQueueWaiting
                    ? prioritySubtitle
                    : "O lobby agora funciona como um salão: abra uma mesa adaptável, escolha um assento e deixe os lugares vazios virarem bots ao iniciar."}
                </p>

                <div className="mt-5 grid max-w-[560px] gap-2.5 sm:grid-cols-2">
                  <div
                    className="rounded-2xl px-3.5 py-3"
                    style={{
                      background: "rgba(0,0,0,0.24)",
                      border: "1px solid rgba(201,168,76,0.12)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 9,
                        color: "rgba(240,230,211,0.38)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      Momento
                    </p>
                    <p
                      className="mt-1 truncate"
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: progressSnapshot.momentumTone,
                      }}
                    >
                      {progressSnapshot.momentumLabel}
                    </p>
                    <p
                      className="mt-1 truncate"
                      style={{
                        fontSize: 10.5,
                        color: "rgba(240,230,211,0.42)",
                      }}
                    >
                      {progressSnapshot.summary}
                    </p>
                  </div>

                  <div
                    className="rounded-2xl px-3.5 py-3"
                    style={{
                      background: "rgba(0,0,0,0.24)",
                      border: "1px solid rgba(201,168,76,0.12)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 9,
                        color: "rgba(240,230,211,0.38)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      Última partida
                    </p>
                    {latestHistoryItem && recentMatchViewModel ? (
                      <>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span
                            className="truncate"
                            style={{
                              fontSize: 15,
                              fontWeight: 900,
                              color: recentMatchViewModel.resultTone,
                            }}
                          >
                            {recentMatchViewModel.resultLabel}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 900,
                              color: "#e8c76a",
                            }}
                          >
                            {recentMatchViewModel.scoreLabel}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate"
                          style={{
                            fontSize: 10.5,
                            color: "rgba(240,230,211,0.42)",
                          }}
                        >
                          Contra {recentMatchViewModel.opponentLabel} ·{" "}
                          {recentMatchViewModel.finishedAtLabel}
                        </p>
                      </>
                    ) : (
                      <p
                        className="mt-1 truncate"
                        style={{
                          fontSize: 10.5,
                          color: "rgba(240,230,211,0.42)",
                        }}
                      >
                        Jogue uma partida para registrar o histórico.
                      </p>
                    )}
                  </div>

                  <div
                    className="rounded-2xl px-3.5 py-3"
                    style={{
                      background: "rgba(0,0,0,0.24)",
                      border: "1px solid rgba(201,168,76,0.12)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        style={{
                          fontSize: 9,
                          color: "rgba(240,230,211,0.38)",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                        }}
                      >
                        Aproveitamento
                      </p>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color: "#f0e6d3",
                        }}
                      >
                        {progressSnapshot.winRateLabel}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={progressSnapshot.wins}
                        max={Math.max(progressSnapshot.matchesPlayed, 1)}
                      />
                    </div>
                    <p
                      className="mt-2 truncate"
                      style={{
                        fontSize: 10.5,
                        color: "rgba(240,230,211,0.42)",
                      }}
                    >
                      {progressSnapshot.wins}V · {progressSnapshot.losses}D ·{" "}
                      {progressSnapshot.matchesPlayed} jogos
                    </p>
                  </div>

                  <div
                    className="rounded-2xl px-3.5 py-3"
                    style={{
                      background: "rgba(0,0,0,0.24)",
                      border: "1px solid rgba(201,168,76,0.12)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 9,
                        color: "rgba(240,230,211,0.38)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      Rating
                    </p>
                    <p
                      className="mt-1"
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: "#e8c76a",
                      }}
                    >
                      {progressSnapshot.ratingLabel ?? "—"}
                    </p>
                    <p
                      className="mt-1 truncate"
                      style={{
                        fontSize: 10.5,
                        color: "rgba(240,230,211,0.42)",
                      }}
                    >
                      {progressSnapshot.rankingPosition
                        ? `#${progressSnapshot.rankingPosition} no ranking`
                        : "Ainda fora do Top 5"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {derivedMatchId ? (
                  <>
                    <GoldButton
                      size="lg"
                      onClick={() => {
                        window.location.assign(`/match/${derivedMatchId}`);
                      }}
                    >
                      Abrir mesa
                    </GoldButton>
                    <GoldButton
                      size="lg"
                      variant="outline"
                      onClick={handleCopyRoomCode}
                      disabled={!derivedMatchId}
                    >
                      Copiar convite
                    </GoldButton>
                    <GoldButton
                      size="lg"
                      variant={currentReady ? "outline" : "ghost"}
                      onClick={handleReady}
                      disabled={!canToggleReady}
                    >
                      {currentReady ? "Desmarcar pronto" : "Marcar pronto"}
                    </GoldButton>
                  </>
                ) : (
                  <>
                    <GoldButton
                      size="lg"
                      onClick={() => handleCreateMatch("1v1")}
                      disabled={!canCreateMatch}
                    >
                      Jogar agora
                    </GoldButton>
                    <GoldButton
                      size="lg"
                      variant="outline"
                      onClick={() => setShowCreateRoomPanel((value) => !value)}
                      disabled={!canCreatePrivateMatch}
                    >
                      Criar mesa privada
                    </GoldButton>
                    <GoldButton
                      size="lg"
                      variant="ghost"
                      onClick={() => handleJoinMatch(matchId)}
                      disabled={!canJoinMatch}
                    >
                      Entrar com convite
                    </GoldButton>
                  </>
                )}
              </div>
            </div>

            <div
              className="relative min-h-[310px] overflow-hidden rounded-[28px] p-3"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 48%, rgba(43,106,79,0.72) 0%, rgba(16,50,35,0.82) 38%, rgba(4,11,13,0.96) 76%), linear-gradient(135deg, rgba(201,168,76,0.11), transparent 42%)",
                border: "1px solid rgba(201,168,76,0.34)",
                boxShadow:
                  "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 0 110px rgba(0,0,0,0.58), 0 26px 70px rgba(0,0,0,0.42)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-4 rounded-[46%]"
                style={{
                  border: "1.5px solid rgba(232,199,106,0.28)",
                  boxShadow:
                    "inset 0 0 72px rgba(0,0,0,0.42), 0 0 40px rgba(201,168,76,0.08)",
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.65'/%3E%3C/svg%3E\")",
                }}
              />

              <div className="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      color: "rgba(201,168,76,0.82)",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                    }}
                  >
                    {derivedMatchId ? roomStageLabel : "Mesa em destaque"}
                  </p>
                  <h2
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 24,
                      fontWeight: 900,
                      color: "#f0e6d3",
                      lineHeight: 1.05,
                    }}
                  >
                    {derivedMatchId ? "Mesa atual" : "Mesa pronta para abrir"}
                  </h2>
                </div>

                <span
                  className="rounded-full px-3 py-1 font-mono text-[10px]"
                  style={{
                    background: "rgba(0,0,0,0.34)",
                    border: "1px solid rgba(201,168,76,0.18)",
                    color: "rgba(232,199,106,0.72)",
                  }}
                >
                  {derivedMatchId ? `#${derivedMatchId.slice(-8)}` : "SEM MESA"}
                </span>
              </div>

              {derivedMatchId ? (
                <div className="relative z-10 mx-auto max-w-[820px] px-2 py-2">
                  {isTwoVersusTwoPreview ? (
                    <>
                      <div className="hidden md:block">
                        <div className="relative min-h-[292px]">
                          <div
                            className="pointer-events-none absolute left-1/2 top-1/2 h-[214px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[46%]"
                            style={{
                              background:
                                "radial-gradient(circle at 50% 48%, rgba(78,149,113,0.22) 0%, rgba(18,46,34,0.18) 56%, rgba(0,0,0,0) 76%)",
                              border: "1.5px solid rgba(232,199,106,0.24)",
                              boxShadow:
                                "inset 0 0 80px rgba(0,0,0,0.42), 0 0 24px rgba(201,168,76,0.08)",
                            }}
                          />
                          <div
                            className="pointer-events-none absolute left-1/2 top-1/2 h-[154px] w-[408px] -translate-x-1/2 -translate-y-1/2 rounded-[46%]"
                            style={{
                              border: "1px solid rgba(232,199,106,0.14)",
                            }}
                          />
                          <div
                            className="pointer-events-none absolute left-1/2 top-[46px] -translate-x-1/2 rounded-full px-4 py-1"
                            style={{
                              background: "rgba(12,16,20,0.72)",
                              border: "1px solid rgba(201,168,76,0.22)",
                              color: "rgba(240,230,211,0.72)",
                              fontSize: 10,
                              fontWeight: 900,
                              letterSpacing: "0.24em",
                              textTransform: "uppercase",
                            }}
                          >
                            Eles
                          </div>
                          <div
                            className="pointer-events-none absolute left-1/2 bottom-[42px] -translate-x-1/2 rounded-full px-4 py-1"
                            style={{
                              background: "rgba(12,16,20,0.72)",
                              border: "1px solid rgba(201,168,76,0.22)",
                              color: "rgba(240,230,211,0.72)",
                              fontSize: 10,
                              fontWeight: 900,
                              letterSpacing: "0.24em",
                              textTransform: "uppercase",
                            }}
                          >
                            Nós
                          </div>
                          <div
                            className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-px -translate-x-1/2 -translate-y-1/2"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(201,168,76,0.32), transparent)",
                            }}
                          />
                          <div
                            className="pointer-events-none absolute left-1/2 top-1/2 h-px w-24 -translate-x-1/2 -translate-y-1/2"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent, rgba(201,168,76,0.32), transparent)",
                            }}
                          />
                          <div
                            className="pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                            style={{
                              background:
                                "radial-gradient(circle at 30% 30%, rgba(232,199,106,0.16), rgba(8,13,18,0.96))",
                              border: "1.5px solid rgba(201,168,76,0.32)",
                              boxShadow:
                                "0 0 24px rgba(201,168,76,0.12), inset 0 0 28px rgba(0,0,0,0.42)",
                            }}
                          >
                            <div className="text-center">
                              <p
                                style={{
                                  fontFamily: "Georgia, serif",
                                  fontSize: 24,
                                  fontWeight: 900,
                                  color: "#f0e6d3",
                                  lineHeight: 1,
                                }}
                              >
                                {isFlexibleRoom ? "Flex" : "2v2"}
                              </p>
                              <p
                                style={{
                                  marginTop: 4,
                                  fontSize: 9,
                                  fontWeight: 900,
                                  color: "rgba(201,168,76,0.72)",
                                  letterSpacing: "0.18em",
                                  textTransform: "uppercase",
                                }}
                              >
                                {isFlexibleRoom ? "Adaptável" : "Mesa ativa"}
                              </p>
                            </div>
                          </div>

                          <div className="absolute left-0 top-0 w-[calc(50%-54px)]">
                            <LobbySeatPreviewCard
                              seatId="T2A"
                              player={getRoomPlayer("T2A")}
                              currentSeatId={playerAssigned?.seatId}
                              viewerDisplayName={displayName}
                              roleLabel="Rival"
                              teamLabel="Eles"
                              tone="opponent"
                              {...resolveSeatSelectionProps("T2A")}
                            />
                          </div>
                          <div className="absolute right-0 top-0 w-[calc(50%-54px)]">
                            <LobbySeatPreviewCard
                              seatId="T2B"
                              player={getRoomPlayer("T2B")}
                              currentSeatId={playerAssigned?.seatId}
                              viewerDisplayName={displayName}
                              roleLabel="Rival"
                              teamLabel="Eles"
                              tone="opponent"
                              {...resolveSeatSelectionProps("T2B")}
                            />
                          </div>
                          <div className="absolute bottom-0 left-0 w-[calc(50%-54px)]">
                            <LobbySeatPreviewCard
                              seatId="T1A"
                              player={getRoomPlayer("T1A")}
                              currentSeatId={playerAssigned?.seatId}
                              viewerDisplayName={displayName}
                              roleLabel="Você"
                              teamLabel="Nós"
                              tone="ally"
                              {...resolveSeatSelectionProps("T1A")}
                            />
                          </div>
                          <div className="absolute bottom-0 right-0 w-[calc(50%-54px)]">
                            <LobbySeatPreviewCard
                              seatId="T1B"
                              player={getRoomPlayer("T1B")}
                              currentSeatId={playerAssigned?.seatId}
                              viewerDisplayName={displayName}
                              roleLabel="Parceiro"
                              teamLabel="Nós"
                              tone="ally"
                              {...resolveSeatSelectionProps("T1B")}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:hidden">
                        <LobbySeatPreviewCard
                          seatId="T2A"
                          player={getRoomPlayer("T2A")}
                          currentSeatId={playerAssigned?.seatId}
                          viewerDisplayName={displayName}
                          roleLabel="Rival"
                          teamLabel="Eles"
                          tone="opponent"
                          {...resolveSeatSelectionProps("T2A")}
                        />
                        <LobbySeatPreviewCard
                          seatId="T2B"
                          player={getRoomPlayer("T2B")}
                          currentSeatId={playerAssigned?.seatId}
                          viewerDisplayName={displayName}
                          roleLabel="Rival"
                          teamLabel="Eles"
                          tone="opponent"
                          {...resolveSeatSelectionProps("T2B")}
                        />
                        <div className="flex items-center gap-3">
                          <div
                            className="h-px flex-1"
                            style={{ background: "rgba(201,168,76,0.18)" }}
                          />
                          <span
                            className="rounded-full px-4 py-1 text-[11px] font-black italic"
                            style={{
                              background: "rgba(0,0,0,0.28)",
                              border: "1px solid rgba(201,168,76,0.18)",
                              color: "rgba(240,230,211,0.42)",
                              letterSpacing: "0.18em",
                            }}
                          >
                            MESA 2V2
                          </span>
                          <div
                            className="h-px flex-1"
                            style={{ background: "rgba(201,168,76,0.18)" }}
                          />
                        </div>
                        <LobbySeatPreviewCard
                          seatId="T1A"
                          player={getRoomPlayer("T1A")}
                          currentSeatId={playerAssigned?.seatId}
                          viewerDisplayName={displayName}
                          roleLabel="Você"
                          teamLabel="Nós"
                          tone="ally"
                          {...resolveSeatSelectionProps("T1A")}
                        />
                        <LobbySeatPreviewCard
                          seatId="T1B"
                          player={getRoomPlayer("T1B")}
                          currentSeatId={playerAssigned?.seatId}
                          viewerDisplayName={displayName}
                          roleLabel="Parceiro"
                          teamLabel="Nós"
                          tone="ally"
                          {...resolveSeatSelectionProps("T1B")}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mx-auto flex min-h-[250px] max-w-[740px] items-center justify-center px-2 py-3">
                      <div className="relative w-full">
                        <div
                          className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[172px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[46%] md:block"
                          style={{
                            background:
                              "radial-gradient(circle at 50% 50%, rgba(78,149,113,0.22), rgba(18,46,34,0.14) 58%, transparent 76%)",
                            border: "1.5px solid rgba(232,199,106,0.22)",
                            boxShadow:
                              "inset 0 0 70px rgba(0,0,0,0.44), 0 0 24px rgba(201,168,76,0.08)",
                          }}
                        />

                        <div className="relative grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)]">
                          <LobbySeatPreviewCard
                            seatId="T1A"
                            player={getRoomPlayer("T1A")}
                            currentSeatId={playerAssigned?.seatId}
                            viewerDisplayName={displayName}
                            roleLabel="Você"
                            teamLabel="Nós"
                            tone="ally"
                            {...resolveSeatSelectionProps("T1A")}
                          />

                          <div className="relative flex items-center justify-center py-1 md:py-0">
                            <div
                              className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 md:left-[-28px] md:right-[-28px]"
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent, rgba(201,168,76,0.34), transparent)",
                              }}
                            />
                            <div
                              className="relative flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full"
                              style={{
                                background:
                                  "radial-gradient(circle at 30% 25%, rgba(232,199,106,0.20), rgba(8,13,18,0.96))",
                                border: "1.5px solid rgba(201,168,76,0.34)",
                                boxShadow:
                                  "0 0 24px rgba(201,168,76,0.13), inset 0 0 28px rgba(0,0,0,0.44)",
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "Georgia, serif",
                                  fontSize: 22,
                                  fontWeight: 900,
                                  color: "#f0e6d3",
                                  lineHeight: 1,
                                }}
                              >
                                VS
                              </span>
                              <span
                                className="mt-1 text-[8px] font-black uppercase tracking-[0.18em]"
                                style={{ color: "rgba(201,168,76,0.70)" }}
                              >
                                1v1
                              </span>
                            </div>
                          </div>

                          <LobbySeatPreviewCard
                            seatId="T2A"
                            player={getRoomPlayer("T2A")}
                            currentSeatId={playerAssigned?.seatId}
                            viewerDisplayName={displayName}
                            roleLabel="Adversário"
                            teamLabel="Eles"
                            tone="opponent"
                            {...resolveSeatSelectionProps("T2A")}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative z-10 flex min-h-[250px] items-center justify-center px-3 text-center">
                  <div
                    className="max-w-[440px] rounded-[28px] px-5 py-5"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(5,10,16,0.82), rgba(23,49,32,0.64))",
                      border: "1px solid rgba(201,168,76,0.20)",
                      boxShadow: "0 18px 44px rgba(0,0,0,0.34)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        color: "rgba(201,168,76,0.86)",
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      {heroTitle}
                    </p>
                    <h3
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: 26,
                        fontWeight: 900,
                        color: "#f0e6d3",
                        lineHeight: 1.05,
                        marginBottom: 10,
                      }}
                    >
                      Abra uma mesa adaptável e escolha seu assento.
                    </h3>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "rgba(240,230,211,0.55)",
                        lineHeight: 1.55,
                      }}
                    >
                      {heroSummary}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="relative mb-3 overflow-hidden rounded-[24px] p-3"
          style={{
            background:
              "linear-gradient(135deg, rgba(8,34,24,0.94), rgba(5,10,14,0.96) 52%, rgba(22,17,8,0.92))",
            border: "1px solid rgba(232,199,106,0.24)",
            boxShadow:
              "0 22px 58px rgba(0,0,0,0.38), 0 0 24px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-8 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,223,128,0.62), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute -left-20 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full"
            style={{ background: "rgba(34,197,94,0.13)", filter: "blur(52px)" }}
          />
          <div
            className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full"
            style={{
              background: "rgba(201,168,76,0.12)",
              filter: "blur(48px)",
            }}
          />

          <div className="relative z-10 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(180px,0.48fr)_minmax(520px,1fr)_minmax(220px,0.42fr)] xl:items-center">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg"
                style={{
                  background:
                    "radial-gradient(circle at 35% 25%, rgba(255,223,128,0.28), rgba(34,197,94,0.12) 48%, rgba(5,12,10,0.94) 100%)",
                  border: "1px solid rgba(232,199,106,0.30)",
                  boxShadow:
                    "0 0 22px rgba(74,222,128,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                🔗
              </div>
              <div>
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 900,
                    color: "rgba(232,199,106,0.84)",
                    letterSpacing: "0.26em",
                    textTransform: "uppercase",
                  }}
                >
                  Convite rápido
                </p>
                <h2
                  style={{
                    marginTop: 4,
                    fontFamily: "Georgia, serif",
                    fontSize: 19,
                    fontWeight: 900,
                    color: "#f0e6d3",
                    lineHeight: 1.05,
                  }}
                >
                  Copie o link e chame seu amigo.
                </h2>
                <p
                  className="mt-1 max-w-[420px] text-[11px] leading-5"
                  style={{ color: "rgba(240,230,211,0.58)" }}
                >
                  O fluxo principal do lobby fica aqui: copiar, enviar no grupo
                  e trazer a mesa direto para quem recebeu o convite.
                </p>
              </div>
            </div>

            <div
              className="grid gap-2 rounded-[22px] p-2.5 md:grid-cols-[minmax(140px,0.48fr)_minmax(260px,1fr)]"
              style={{
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <button
                type="button"
                onClick={handleCopyRoomCode}
                disabled={!derivedMatchId}
                className="group rounded-[18px] px-3 py-2.5 text-left transition enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(201,168,76,0.12), rgba(0,0,0,0.18))",
                  border: "1px solid rgba(232,199,106,0.20)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p
                      style={{
                        fontSize: 8.5,
                        fontWeight: 900,
                        color: "rgba(240,230,211,0.42)",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                      }}
                    >
                      Código
                    </p>
                    <p
                      className="mt-1 font-mono text-[18px] font-black tracking-[0.12em]"
                      style={{
                        color: derivedMatchId
                          ? "#f7e6b0"
                          : "rgba(240,230,211,0.30)",
                      }}
                    >
                      {inviteCodeLabel}
                    </p>
                  </div>
                  <span
                    className="rounded-xl px-2.5 py-2 text-[12px] font-black"
                    style={{
                      background: "rgba(201,168,76,0.14)",
                      border: "1px solid rgba(201,168,76,0.22)",
                      color: "#e8c76a",
                    }}
                  >
                    ⧉
                  </span>
                </div>
              </button>

              <div
                className="rounded-[18px] px-3 py-2.5"
                style={{
                  background: "rgba(0,0,0,0.26)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p
                    style={{
                      fontSize: 8.5,
                      fontWeight: 900,
                      color: "rgba(240,230,211,0.38)",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Link da sala
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyRoomCode}
                    disabled={!derivedMatchId}
                    className="rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: "rgba(201,168,76,0.10)",
                      border: "1px solid rgba(201,168,76,0.18)",
                      color: "#e8c76a",
                    }}
                  >
                    Copiar
                  </button>
                </div>
                <p
                  className="truncate font-mono text-[11px]"
                  style={{
                    color: derivedMatchId
                      ? "rgba(240,230,211,0.74)"
                      : "rgba(240,230,211,0.34)",
                  }}
                >
                  {inviteLinkPreview}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {derivedMatchId ? (
                <>
                  <GoldButton
                    className="min-h-[42px]"
                    onClick={handleCopyRoomCode}
                  >
                    {copyRoomCodeLabel === "Copiar link"
                      ? "Copiar link"
                      : copyRoomCodeLabel}
                  </GoldButton>
                  <GoldButton
                    className="min-h-[42px]"
                    variant="outline"
                    onClick={handleCopyRoomCode}
                  >
                    Compartilhar convite
                  </GoldButton>
                </>
              ) : (
                <>
                  <GoldButton
                    className="min-h-[42px]"
                    onClick={() => setShowCreateRoomPanel((value) => !value)}
                    disabled={!canCreatePrivateMatch}
                  >
                    Criar mesa
                  </GoldButton>
                  <GoldButton
                    className="min-h-[42px]"
                    variant="outline"
                    onClick={() => handleJoinMatch(matchId)}
                    disabled={!canJoinMatch}
                  >
                    Entrar
                  </GoldButton>
                </>
              )}
            </div>

            <div
              className="xl:col-span-3 rounded-[20px] p-2.5"
              style={{
                background: "rgba(0,0,0,0.18)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="min-w-[150px]">
                  <p
                    style={{
                      fontSize: 8.5,
                      fontWeight: 900,
                      color: "rgba(201,168,76,0.78)",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                    }}
                  >
                    Entrar por convite
                  </p>
                  <p
                    className="mt-1 text-[10px] leading-4"
                    style={{ color: "rgba(240,230,211,0.46)" }}
                  >
                    Cole o código ou link que recebeu.
                  </p>
                </div>

                <input
                  value={matchId}
                  onChange={(event) => setMatchId(event.target.value)}
                  placeholder="Código ou link da mesa..."
                  className="min-h-[40px] flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none"
                  style={{
                    background: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#f0e6d3",
                  }}
                />

                <GoldButton
                  className="min-h-[40px] md:min-w-[120px]"
                  onClick={() => handleJoinMatch(matchId)}
                  disabled={!canJoinMatch}
                >
                  Entrar
                </GoldButton>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div
              className="rounded-[30px] p-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(9,17,19,0.92), rgba(5,9,14,0.90))",
                border: "1px solid rgba(201,168,76,0.18)",
                boxShadow:
                  "0 18px 48px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.035)",
              }}
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      color: "rgba(201,168,76,0.72)",
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                    }}
                  >
                    Mesas disponíveis
                  </p>
                  <h2
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 24,
                      fontWeight: 900,
                      color: "#f0e6d3",
                      lineHeight: 1.05,
                    }}
                  >
                    Escolha sua mesa
                  </h2>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
                  style={{
                    background: hasActiveLobbyFocus
                      ? "rgba(34,197,94,0.09)"
                      : "rgba(201,168,76,0.08)",
                    border: hasActiveLobbyFocus
                      ? "1px solid rgba(34,197,94,0.20)"
                      : "1px solid rgba(201,168,76,0.18)",
                    color: hasActiveLobbyFocus
                      ? "#4ade80"
                      : "rgba(232,199,106,0.82)",
                  }}
                >
                  {hasActiveLobbyFocus ? "Sessão ativa" : "Sem mesa ativa"}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ModeActionCard
                  eyebrow="Treino solo"
                  title="Contra Bot"
                  description="Treine uma queda rápida contra bot, sem fila e sem convite."
                  meta="Instantâneo"
                  icon="♠"
                  tone="gold"
                  featured
                  ctaLabel="Jogar"
                  onClick={() => handleCreateMatch("1v1")}
                  disabled={!canCreateMatch}
                />
                <ModeActionCard
                  eyebrow="Mesa flexível"
                  title="Mesa Adaptável"
                  description="Entre em uma mesa aberta ou crie uma nova; sente em qualquer lugar e complete vazios com bots."
                  meta="Entrar/criar"
                  icon="⚡"
                  tone="green"
                  ctaLabel="Entrar"
                  onClick={() => handleCreateFlexibleRoom("2v2")}
                  disabled={!canCreateMatch}
                />
                <ModeActionCard
                  eyebrow="Fila pública"
                  title="Desafiar Jogador"
                  description={
                    derivedMatchId
                      ? "Saia da sala atual e procure outro humano 1v1."
                      : "Procure outro humano para uma queda 1v1."
                  }
                  meta={
                    activeQueueMode === "1v1"
                      ? "Na fila"
                      : derivedMatchId
                        ? "Trocar sala"
                        : "Humano"
                  }
                  icon="◎"
                  tone="blue"
                  ctaLabel={
                    isPublicQueueWaiting
                      ? "Fila ativa"
                      : derivedMatchId
                        ? "Trocar para fila"
                        : "Fila"
                  }
                  onClick={() => {
                    if (derivedMatchId) {
                      handleSwitchToPublicQueue("1v1");
                      return;
                    }

                    handleJoinPublicQueue("1v1");
                  }}
                  disabled={
                    isPublicQueueWaiting ||
                    (!canJoinPublicQueue && !canSwitchActiveRoomToQueue)
                  }
                />
                <ModeActionCard
                  eyebrow="Sala privada"
                  title="Mesa com Amigo"
                  description="Crie uma mesa privada para jogar com amigo ou adversário."
                  meta={showCreateRoomPanel ? "Selecionando" : "Privado"}
                  icon="◆"
                  tone="blue"
                  ctaLabel="Criar"
                  onClick={() => setShowCreateRoomPanel((value) => !value)}
                  disabled={!canCreatePrivateMatch}
                />
              </div>
            </div>

            {showCreateRoomPanel ? (
              <div
                className="rounded-[28px] p-4"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(14,26,36,0.92), rgba(5,9,14,0.90))",
                  border: "1px solid rgba(147,197,253,0.18)",
                  boxShadow: "0 18px 48px rgba(0,0,0,0.26)",
                }}
              >
                <div className="mb-3">
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      color: "rgba(147,197,253,0.80)",
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                    }}
                  >
                    Mesas privadas
                  </p>
                  <h3
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 22,
                      fontWeight: 900,
                      color: "#f0e6d3",
                    }}
                  >
                    Convide alguém para sentar
                  </h3>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <ModeActionCard
                    eyebrow="Convite 1v1"
                    title="Duelo com Amigo"
                    description="Crie uma sala sem bot automático para jogar contra um humano."
                    meta="Você vs amigo"
                    icon="◆"
                    tone="gold"
                    ctaLabel="Criar"
                    onClick={handleCreateHumanOneVsOneRoom}
                    disabled={!canCreatePrivateMatch}
                  />
                  <ModeActionCard
                    eyebrow="2v2 convite"
                    title="Duplas Híbridas"
                    description="Cada humano joga com um parceiro bot em times opostos."
                    meta="Amigo rival"
                    icon="◇"
                    tone="blue"
                    ctaLabel="Criar"
                    onClick={() => handleCreatePrivateMatch("opposite-team")}
                    disabled={!canCreatePrivateMatch}
                  />
                  <ModeActionCard
                    eyebrow="2v2 convite"
                    title="Minha Dupla vs Bots"
                    description="Você e seu amigo jogam juntos contra dois bots."
                    meta="Dupla humana"
                    icon="♢"
                    tone="green"
                    ctaLabel="Criar"
                    onClick={() => handleCreatePrivateMatch("same-team")}
                    disabled={!canCreatePrivateMatch}
                  />
                </div>
              </div>
            ) : null}

            {continuation.state === "reconnect" ? (
              <div
                className="rounded-[28px] p-4"
                style={{ background: CARD_BG, border: CARD_BORDER }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p
                      style={{
                        fontSize: 9,
                        color: "#f87171",
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        fontWeight: 900,
                      }}
                    >
                      Sessão offline
                    </p>
                    <p
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: "rgba(240,230,211,0.56)",
                      }}
                    >
                      Reconecte o socket para carregar sala, ranking e
                      histórico.
                    </p>
                  </div>
                  <GoldButton onClick={handleConnect} disabled={!canConnect}>
                    Conectar Socket
                  </GoldButton>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div
              className="rounded-[28px] p-4"
              style={{
                background:
                  "linear-gradient(180deg, rgba(11,20,21,0.88), rgba(6,10,15,0.82))",
                border: "1px solid rgba(201,168,76,0.12)",
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      color: "rgba(201,168,76,0.76)",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                    }}
                  >
                    Ranking semanal
                  </p>
                  <h3
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 18,
                      fontWeight: 900,
                      color: "#f0e6d3",
                    }}
                  >
                    Top 5
                  </h3>
                </div>
                <span
                  style={{ fontSize: 11, fontWeight: 900, color: "#e8c76a" }}
                >
                  {progressSnapshot.rankingPosition
                    ? `#${progressSnapshot.rankingPosition}`
                    : "—"}
                </span>
              </div>

              {rankingEntries.length > 0 ? (
                <div className="space-y-2">
                  {rankingEntries.map((entry) => (
                    <div
                      key={`${entry.position}-${entry.name}`}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2"
                      style={{
                        background: entry.isCurrentUser
                          ? "rgba(201,168,76,0.10)"
                          : "rgba(255,255,255,0.035)",
                        border: entry.isCurrentUser
                          ? "1px solid rgba(201,168,76,0.20)"
                          : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          style={{
                            fontFamily: "Georgia, serif",
                            fontSize: 14,
                            fontWeight: 900,
                            color: "#e8c76a",
                            width: 18,
                          }}
                        >
                          {entry.position}
                        </span>
                        <span
                          className="truncate"
                          style={{ fontSize: 13, color: "#f0e6d3" }}
                        >
                          {entry.name}
                        </span>
                        {entry.isCurrentUser ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[8px] font-black"
                            style={{
                              background: "rgba(201,168,76,0.16)",
                              color: "#e8c76a",
                            }}
                          >
                            VOCÊ
                          </span>
                        ) : null}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: "rgba(201,168,76,0.82)",
                          fontWeight: 900,
                        }}
                      >
                        {entry.ratingLabel}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="rounded-2xl p-3"
                  style={{
                    background: "rgba(0,0,0,0.20)",
                    color: "rgba(240,230,211,0.52)",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  Conecte-se ao lobby para carregar o ranking real da semana.
                </p>
              )}
            </div>

            {!hasMinimumSession ? (
              <div
                className="rounded-[24px] p-3"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.18)",
                }}
              >
                <p style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>
                  Sessão incompleta. Faça login novamente para liberar as ações
                  do lobby.
                </p>
              </div>
            ) : null}
          </aside>
        </section>
      </main>
    </div>
  );
}
