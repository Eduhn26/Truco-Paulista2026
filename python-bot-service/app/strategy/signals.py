from datetime import datetime, timezone
from typing import Literal

from app.schemas import BotDecisionRequest, BotPartnerSignalView

SignalScope = Literal['hand-memory', 'round-tactic', 'bet-intent']


def signal_for_scope(
    payload: BotDecisionRequest,
    scope: SignalScope,
) -> BotPartnerSignalView | None:
    bucket = payload.partner_signals

    if bucket is not None:
        signal = {
            'hand-memory': bucket.hand_memory,
            'round-tactic': bucket.round_tactic,
            'bet-intent': bucket.bet_intent,
        }[scope]

        if _is_active(signal) and signal.scope == scope:
            return signal

    signal = payload.partner_signal
    if _is_active(signal) and signal.scope == scope:
        return signal

    return None


def _is_active(signal: BotPartnerSignalView | None) -> bool:
    if signal is None:
        return False

    try:
        expires_at = datetime.fromisoformat(signal.expires_at.replace('Z', '+00:00'))
    except ValueError:
        return False

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return expires_at > datetime.now(timezone.utc)
