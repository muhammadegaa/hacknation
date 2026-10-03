import type { ActionType, Scenario, TraineeCaseSpec } from "../domain/types";

export interface CaseRecord {
  attempts: ActionType[];
  hints: number;
  /** Verdict the tutor agent gave on the trainee's spoken reasoning, if any. */
  reasoning?: "sound" | "partial" | "unsound";
  note?: string;
}

export type Progress = Record<string, CaseRecord>;

export function recordAttempt(p: Progress, caseId: string, action: ActionType): Progress {
  const cur = p[caseId] ?? { attempts: [], hints: 0 };
  return { ...p, [caseId]: { ...cur, attempts: [...cur.attempts, action] } };
}

export function recordHint(p: Progress, caseId: string): Progress {
  const cur = p[caseId] ?? { attempts: [], hints: 0 };
  return { ...p, [caseId]: { ...cur, hints: cur.hints + 1 } };
}

export function recordReasoning(p: Progress, caseId: string, reasoning: CaseRecord["reasoning"], note?: string): Progress {
  const cur = p[caseId] ?? { attempts: [], hints: 0 };
  return { ...p, [caseId]: { ...cur, reasoning, note } };
}

/** 1 = right first time, 0.5 = right after a hint, 0 = never right or not attempted. */
export function caseScore(rec: CaseRecord | undefined, tc: TraineeCaseSpec): number {
  if (!rec || rec.attempts.length === 0) return 0;
  const final = rec.attempts[rec.attempts.length - 1];
  if (final !== tc.expectedAction) return 0;
  return rec.attempts.length === 1 ? 1 : 0.5;
}

export interface RuleMastery {
  key: string;
  label: string;
  score: number;
  cases: number;
}

export function masteryByRule(p: Progress, s: Scenario): RuleMastery[] {
  return s.rules.map((r) => {
    const cs = s.traineeCases.filter((c) => c.ruleKey === r.key);
    const attempted = cs.filter((c) => (p[c.invoice.id]?.attempts.length ?? 0) > 0);
    const total = attempted.reduce((n, c) => n + caseScore(p[c.invoice.id], c), 0);
    return { key: r.key, label: r.label, score: attempted.length ? total / cs.length : 0, cases: attempted.length };
  });
}

export function overallScore(p: Progress, s: Scenario): number {
  const attempted = s.traineeCases.filter((c) => (p[c.invoice.id]?.attempts.length ?? 0) > 0);
  if (attempted.length === 0) return 0;
  return attempted.reduce((n, c) => n + caseScore(p[c.invoice.id], c), 0) / attempted.length;
}

export function readiness(score: number, attempted: number): "not_ready" | "supervised" | "ready" {
  if (attempted < 3) return "not_ready";
  if (score >= 0.85) return "ready";
  if (score >= 0.6) return "supervised";
  return "not_ready";
}
