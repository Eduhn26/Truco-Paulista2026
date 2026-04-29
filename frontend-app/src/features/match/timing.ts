// =============================================================================
//  timing.ts — the centralised pacing constants of the match table.
// =============================================================================
//
//  Every number here is load-bearing. Tweak one, re-validate the whole flow.
//
//  Hand boundary (page-level orchestration):
//    HAND_INTRO_HOLD_MS      time we keep the "fresh hand" intro frame after
//                            receiving `hand-started`, before flipping to
//                            'live'. The bot is blocked from playing until
//                            after this window, so this is also the minimum
//                            "breath" the player gets.
//    HAND_RESULT_HOLD_MS     time the climax overlay stays up before the
//                            page commits the next-hand state. Should match
//                            the shell's CLIMAX_AUTO_DISMISS_MS roughly.
//    HAND_CLIMAX_ENTRY_DELAY_MS
//                            empty-table breath between a resolved final round
//                            and the hand result takeover. Prevents the modal
//                            from opening on top of live cards.
//    NEXT_HAND_COMMIT_MS     small buffer after HAND_RESULT_HOLD_MS so the
//                            climax exit animation finishes before new state
//                            arrives and the hook wipes.
//
//  Bet feedback:
//    BET_FEEDBACK_HOLD_MS             total on-screen time of a bet banner.
//    BET_FEEDBACK_MIN_REQUESTED_MS    minimum time the "truco requested"
//                                     banner must remain visible before it
//                                     can be replaced by "accepted"/"declined".
//    POST_ACCEPT_PLAY_RELEASE_MS      after ACCEPTED, brief hold on incoming
//                                     cards so the banner doesn't flash at
//                                     the same instant as the bot's play.
//
//  Round resolution (hook-level pipeline):
//    CARD_REVEAL_DELAY_MS      delay between "opponent card-played arrives"
//                              and "opponent card appears on felt"; leaves
//                              room for the flight animation.
//    PENDING_CARD_TIMEOUT_MS   safety timeout on an own-card optimistic
//                              launch if the server never acknowledges.
//    CARD_SETTLE_BEFORE_RESOLUTION_MS
//                              minimum settle window between "last card
//                              accepted visually" and "round resolution can
//                              begin". Stops round-resolved that arrives in
//                              the same socket burst as the final card from
//                              eating the card's reveal frame.
//    RESOLUTION_HOLD_MS        total time both cards stay pinned on the felt
//                              after a round is resolved (winner badge is
//                              visible during this window).
//    NEXT_ROUND_CLEAN_FRAME_MS small extra "empty" frame after RESOLUTION_HOLD
//                              so the transition from "resolved cards" to
//                              "next round empty slots" reads clean.
//
//  Automation:
//    AUTO_NEXT_HAND_DELAY_MS    page-level delay between climax dismiss and
//                               emitting the next start-hand request.
//    REALTIME_RESOLUTION_GRACE_MS time we wait for the authoritative match-state
//                               to arrive with rounds[] before giving up on
//                               flushing a deferred round-transition.
// =============================================================================

// --- Hand boundary timing --------------------------------------------------
export const HAND_INTRO_HOLD_MS = 1400;
export const HAND_RESULT_HOLD_MS = 4400;
export const HAND_CLIMAX_ENTRY_DELAY_MS = 950;
export const NEXT_HAND_COMMIT_MS = 360;

// --- Bet feedback ----------------------------------------------------------
export const BET_FEEDBACK_HOLD_MS = 1900;
export const BET_FEEDBACK_MIN_REQUESTED_MS = 1500;
export const POST_ACCEPT_PLAY_RELEASE_MS = 1500;

// --- Round resolution pipeline --------------------------------------------
// NOTE: Patch 7.1 intentionally slows the felt cadence. The card must land,
// breathe, show the outcome badge, and only then let the next round or hand
// takeover advance. This makes bot speech and round verdicts readable instead
// of competing with the card flight in the same second.
export const CARD_REVEAL_DELAY_MS = 140;
export const PENDING_CARD_TIMEOUT_MS = 2000;
export const CARD_SETTLE_BEFORE_RESOLUTION_MS = 950;
export const RESOLUTION_HOLD_MS = 2600;
export const NEXT_ROUND_CLEAN_FRAME_MS = 520;

// --- Automation ------------------------------------------------------------
export const AUTO_NEXT_HAND_DELAY_MS = 3800;
export const REALTIME_RESOLUTION_GRACE_MS = 750;


