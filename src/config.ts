const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

/** ?clean=1 hides presenter-only controls, for recording the demo video. */
export const CLEAN = params.has("clean");

/** ?fast=1 shortens every timer. Used by the end-to-end tests. */
export const FAST = params.has("fast");

export const timing = {
  /** After the last click, wait this long before judging the decision (catches reversals). */
  settleMs: FAST ? 200 : 2500,
  /** The tutor reacts quickly; there is no reversal window to protect. */
  traineeSettleMs: FAST ? 100 : 700,
  /** If the agent asked something and the expert never replied, give up on the dialog after this. */
  dialogTimeoutMs: FAST ? 1500 : 25000,
  /** Do not cut in within this long of the expert's last words. */
  userQuietMs: FAST ? 100 : 1200,
  tickMs: FAST ? 100 : 400,
  simSpeechMsPerChar: FAST ? 1 : 38,
};

export const envAgentIds = {
  apprentice: (import.meta.env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID as string | undefined) ?? "",
  tutor: (import.meta.env.VITE_ELEVENLABS_TUTOR_AGENT_ID as string | undefined) ?? "",
};
