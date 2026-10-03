import type { ActionType, Invoice, LookupKey, Moment, MomentType, Scenario, WorkEvent } from "../domain/types";

/**
 * The Apprentice does not interrupt on a timer. It speaks at natural moments:
 * right after a decision settles, and only when that decision carries
 * information the written procedure does not. Routine cases get silence.
 */

export interface CaseTrace {
  caseId: string;
  openedAt: number;
  lookups: { key: LookupKey; t: number }[];
  actions: { action: ActionType; t: number }[];
}

export function emptyTrace(caseId: string, openedAt: number): CaseTrace {
  return { caseId, openedAt, lookups: [], actions: [] };
}

export function applyEvent(trace: CaseTrace, ev: WorkEvent): CaseTrace {
  if (ev.type === "lookup" && ev.caseId === trace.caseId) {
    return { ...trace, lookups: [...trace.lookups, { key: ev.lookup, t: ev.t }] };
  }
  if (ev.type === "action" && ev.caseId === trace.caseId) {
    return { ...trace, actions: [...trace.actions, { action: ev.action, t: ev.t }] };
  }
  return trace;
}

const PRIORITY: Record<MomentType, number> = {
  sop_deviation: 100,
  reversal: 80,
  unprompted_lookup: 60,
  hesitation: 40,
};

export function unpromptedLookups(trace: CaseTrace, scenario: Scenario): LookupKey[] {
  const seen = new Set<LookupKey>();
  for (const l of trace.lookups) {
    if (scenario.sopLookups.includes(l.key)) continue;
    if (scenario.ambientLookups.includes(l.key)) continue;
    seen.add(l.key);
  }
  return [...seen];
}

/**
 * Called once the decision has settled. Returns null when the case was routine
 * (the written procedure would have produced the same decision and nothing
 * about how the expert got there was unusual).
 */
export function detectMoment(trace: CaseTrace, invoice: Invoice, scenario: Scenario): Moment | null {
  const last = trace.actions[trace.actions.length - 1];
  if (!last) return null;

  const sopAction = scenario.sopPredict(invoice);
  const signals: MomentType[] = [];

  if (last.action !== sopAction) signals.push("sop_deviation");

  const prev = trace.actions[trace.actions.length - 2];
  if (prev && prev.action !== last.action) signals.push("reversal");

  const extra = unpromptedLookups(trace, scenario);
  if (extra.length > 0) signals.push("unprompted_lookup");

  const firstAction = trace.actions[0];
  const dwellMs = firstAction.t - trace.openedAt;
  if (dwellMs >= scenario.hesitationMs) signals.push("hesitation");

  if (signals.length === 0) return null;

  signals.sort((a, b) => PRIORITY[b] - PRIORITY[a]);
  return {
    caseId: trace.caseId,
    type: signals[0],
    signals,
    action: last.action,
    sopAction,
    unpromptedLookups: extra,
    dwellMs,
    priority: signals.reduce((n, s) => n + PRIORITY[s], 0),
  };
}

// ---------------------------------------------------------------------------
// Tutor side: the same idea, reversed. Compare the trainee against the map.
// ---------------------------------------------------------------------------

export type TraineeMomentKind = "mistake" | "trap_avoided" | "correct";

export interface TraineeMoment {
  caseId: string;
  kind: TraineeMomentKind;
  action: ActionType;
  expected: ActionType;
  attempt: number;
}

export function classifyTraineeAction(
  action: ActionType,
  expected: ActionType,
  trap: boolean,
  attempt: number,
): TraineeMoment["kind"] {
  if (action !== expected) return "mistake";
  // Right answer on a trap case is the interesting one: probe the distinction.
  if (trap && attempt === 1) return "trap_avoided";
  return "correct";
}
