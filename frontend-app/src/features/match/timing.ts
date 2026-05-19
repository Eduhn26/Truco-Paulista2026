// Match pacing constants shared by page orchestration and table transition flows.
// Changes here affect gameplay cadence across hand start, betting, round resolution,
// and automatic hand progression; validate those flows together after tuning.

// Hand boundary timing.
export const HAND_INTRO_HOLD_MS = 1400;
export const HAND_RESULT_HOLD_MS = 4400;
export const HAND_CLIMAX_ENTRY_DELAY_MS = 950;
export const NEXT_HAND_COMMIT_MS = 360;

// Bet feedback timing.
export const BET_FEEDBACK_HOLD_MS = 1900;
export const BET_FEEDBACK_MIN_REQUESTED_MS = 1500;
export const POST_ACCEPT_PLAY_RELEASE_MS = 1500;

// Round resolution pipeline.
export const CARD_REVEAL_DELAY_MS = 140;
export const PENDING_CARD_TIMEOUT_MS = 2000;
export const CARD_SETTLE_BEFORE_RESOLUTION_MS = 950;
export const RESOLUTION_HOLD_MS = 3200;
export const NEXT_ROUND_CLEAN_FRAME_MS = 520;

// Automated progression.
export const AUTO_NEXT_HAND_DELAY_MS = 3800;

// Keep this above the backend's post-resolution sync delay so deferred round
// transitions can still reconcile against the authoritative match-state snapshot.
export const REALTIME_RESOLUTION_GRACE_MS = 2800;
