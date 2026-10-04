import type { Insight, InsightKind, MapStep, Scenario, WorkMap } from "../domain/types";

export const KIND_LABEL: Record<InsightKind, string> = {
  judgment: "Judgment call",
  exception: "Exception",
  guardrail: "Guardrail",
  heuristic: "Rule of thumb",
  escalation: "Escalation",
};

const KINDS = new Set<InsightKind>(["judgment", "exception", "guardrail", "heuristic", "escalation"]);

export function emptyWorkMap(s: Scenario): WorkMap {
  return {
    workflow: s.workflow,
    expertName: s.expertName,
    expertRole: s.expertRole,
    company: s.company,
    capturedAt: null,
    steps: s.steps.map((st) => ({ ...st, documented: true })),
    insights: [],
    openQuestions: [],
    stats: { casesObserved: 0, questionsAsked: 0, silentCases: 0 },
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface InsightInput {
  insight_id?: unknown;
  kind?: unknown;
  step_id?: unknown;
  new_step?: unknown;
  title?: unknown;
  condition?: unknown;
  action?: unknown;
  rationale?: unknown;
  unless?: unknown;
  severity?: unknown;
  source_quote?: unknown;
  case_id?: unknown;
}

/** Ids must stay unique after a discard, so count from the highest id seen, not from the list length. */
function nextInsightNumber(map: WorkMap): number {
  return Math.max(0, ...map.insights.map((i) => Number(i.id.replace(/\D/g, "")) || 0)) + 1;
}

export interface AddInsightResult {
  map: WorkMap;
  insight: Insight;
  created: boolean;
  newStep?: MapStep;
}

/**
 * Apply a `record_insight` tool call. Tolerant of sloppy model output: unknown
 * kinds fall back to judgment, unknown steps fall back to the decision step,
 * and a near-identical insight on the same case is merged rather than
 * duplicated (the agent often refines a rule after a follow-up).
 */
export function addInsight(map: WorkMap, input: InsightInput, now = Date.now()): AddInsightResult {
  let steps = map.steps;
  let newStep: MapStep | undefined;

  let stepId = str(input.step_id);
  const newStepLabel = str(input.new_step);
  if (newStepLabel) {
    const existing = steps.find((s) => s.label.toLowerCase() === newStepLabel.toLowerCase());
    if (existing) {
      stepId = existing.id;
    } else {
      const after = steps.find((s) => s.id === stepId);
      const idx = after ? steps.indexOf(after) + 1 : Math.max(steps.length - 1, 0);
      newStep = {
        id: `H${steps.filter((s) => !s.documented).length + 1}`,
        label: newStepLabel,
        description: "Not in the written procedure. Discovered from the expert.",
        documented: false,
      };
      steps = [...steps.slice(0, idx), newStep, ...steps.slice(idx)];
      stepId = newStep.id;
    }
  }
  if (!steps.some((s) => s.id === stepId)) {
    stepId = steps.find((s) => s.label === "Decide")?.id ?? steps[Math.min(4, steps.length - 1)].id;
  }

  const kindRaw = str(input.kind).toLowerCase() as InsightKind;
  const kind: InsightKind = KINDS.has(kindRaw) ? kindRaw : "judgment";
  const severityRaw = str(input.severity);
  const severity = (["hard_stop", "strong", "soft"] as const).find((x) => x === severityRaw);

  const candidate: Omit<Insight, "id" | "status" | "createdAt"> = {
    kind,
    stepId,
    title: str(input.title) || str(input.condition).slice(0, 70) || "Untitled rule",
    condition: str(input.condition),
    action: str(input.action),
    rationale: str(input.rationale),
    unless: str(input.unless) || undefined,
    severity: kind === "guardrail" ? (severity ?? "strong") : severity,
    sourceQuote: str(input.source_quote),
    caseId: str(input.case_id) || undefined,
  };

  const explicitId = str(input.insight_id);
  const target =
    map.insights.find((i) => i.id === explicitId) ??
    map.insights.find(
      (i) =>
        i.caseId !== undefined &&
        i.caseId === candidate.caseId &&
        (i.kind === candidate.kind || similarity(i.title, candidate.title) > 0.4) &&
        similarity(`${i.title} ${i.condition}`, `${candidate.title} ${candidate.condition}`) > 0.3,
    );

  if (target) {
    const merged: Insight = {
      ...target,
      ...Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined && v !== "")),
      id: target.id,
      status: "proposed",
      createdAt: target.createdAt,
      correction: target.correction,
    } as Insight;
    return {
      map: { ...map, steps, insights: map.insights.map((i) => (i.id === target.id ? merged : i)) },
      insight: merged,
      created: false,
      newStep,
    };
  }

  const insight: Insight = {
    ...candidate,
    id: `I-${nextInsightNumber(map)}`,
    status: "proposed",
    createdAt: now,
  };
  return { map: { ...map, steps, insights: [...map.insights, insight] }, insight, created: true, newStep };
}

export function confirmInsight(map: WorkMap, id: string, confirmed: boolean, correction?: string): { map: WorkMap; insight?: Insight } {
  const target = map.insights.find((i) => i.id === id);
  if (!target) return { map };
  const next: Insight = {
    ...target,
    status: confirmed ? "confirmed" : "corrected",
    correction: confirmed ? target.correction : str(correction) || target.correction,
  };
  return { map: { ...map, insights: map.insights.map((i) => (i.id === id ? next : i)) }, insight: next };
}

/** The expert says a captured rule is wrong. Remove it; nothing downstream (tutor) should teach it. */
export function removeInsight(map: WorkMap, id: string): WorkMap {
  return { ...map, insights: map.insights.filter((i) => i.id !== id) };
}

export function addOpenQuestion(map: WorkMap, topic: string, caseId?: string, now = Date.now()): WorkMap {
  if (!topic.trim()) return map;
  return {
    ...map,
    openQuestions: [...map.openQuestions, { id: `Q-${map.openQuestions.length + 1}`, topic: topic.trim(), caseId, createdAt: now }],
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export function mapSummary(map: WorkMap) {
  const documented = map.steps.filter((s) => s.documented).length;
  const hidden = map.steps.length - documented;
  const verified = map.insights.filter((i) => i.status !== "proposed").length;
  return {
    documentedSteps: documented,
    hiddenSteps: hidden,
    rules: map.insights.length,
    verified,
    guardrails: map.insights.filter((i) => i.kind === "guardrail").length,
  };
}

/** Benchmark: how many of the seeded hidden rules did the session surface? */
export function benchmark(map: WorkMap, s: Scenario) {
  const caseRule = new Map(s.captureCases.map((c) => [c.invoice.id, c.ruleKey]));
  const foundKeys = new Set<string>();
  for (const i of map.insights) {
    const k = i.caseId ? caseRule.get(i.caseId) : null;
    if (k) foundKeys.add(k);
  }
  const found = s.rules.filter((r) => foundKeys.has(r.key));
  const missed = s.rules.filter((r) => !foundKeys.has(r.key));
  return { found, missed, total: s.rules.length };
}

/** The seeded rule an insight belongs to, via the capture case it came from. */
export function ruleKeyOfInsight(i: Insight, s: Scenario): string | null {
  return s.captureCases.find((c) => c.invoice.id === i.caseId)?.ruleKey ?? null;
}

/** Insights relevant to a seeded rule key, via the case each insight was captured on. */
export function insightsForRule(map: WorkMap, s: Scenario, ruleKey: string | null): Insight[] {
  if (!ruleKey) return [];
  const caseIds = new Set(s.captureCases.filter((c) => c.ruleKey === ruleKey).map((c) => c.invoice.id));
  return map.insights.filter((i) => i.caseId && caseIds.has(i.caseId));
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const statusWord = (i: Insight) =>
  i.status === "confirmed" ? "verified by expert" : i.status === "corrected" ? "corrected by expert" : "unverified";

/** Compact text form handed to the tutor agent as a dynamic variable. */
export function serializeForLLM(map: WorkMap): string {
  const lines: string[] = [];
  lines.push(`WORK MAP: ${map.workflow}`);
  lines.push(`Captured from ${map.expertName}, ${map.expertRole}, at ${map.company}.`);
  lines.push("");
  lines.push("STEPS");
  for (const s of map.steps) {
    lines.push(`${s.id} ${s.label}${s.documented ? "" : " [NOT IN THE WRITTEN PROCEDURE]"}: ${s.description}`);
  }
  lines.push("");
  lines.push("RULES AND JUDGMENT");
  if (map.insights.length === 0) lines.push("(none captured)");
  for (const i of map.insights) {
    lines.push(
      `[${i.id}] ${KIND_LABEL[i.kind].toUpperCase()} at ${i.stepId}: ${i.title} (${statusWord(i)}${i.severity ? `, ${i.severity}` : ""})`,
    );
    if (i.condition) lines.push(`  WHEN: ${i.condition}`);
    if (i.action) lines.push(`  THEN: ${i.action}`);
    if (i.rationale) lines.push(`  BECAUSE: ${i.rationale}`);
    if (i.unless) lines.push(`  UNLESS: ${i.unless}`);
    if (i.correction) lines.push(`  CORRECTION: ${i.correction}`);
    if (i.sourceQuote) lines.push(`  ${map.expertName} said: "${i.sourceQuote}"${i.caseId ? ` (on ${i.caseId})` : ""}`);
  }
  if (map.openQuestions.length) {
    lines.push("");
    lines.push("STILL UNCLEAR");
    for (const q of map.openQuestions) lines.push(`- ${q.topic}`);
  }
  return lines.join("\n");
}

/** Short running summary used inside capture cues so the agent does not re-ask. */
export function knownRulesLine(map: WorkMap): string {
  if (map.insights.length === 0) return "none yet";
  return map.insights.map((i) => `${i.id} "${i.title}" (case ${i.caseId ?? "n/a"})`).join("; ");
}

export function toMarkdown(map: WorkMap): string {
  const out: string[] = [];
  out.push(`# Work Map: ${map.workflow}`);
  out.push("");
  out.push(`Captured from **${map.expertName}**, ${map.expertRole}, ${map.company}.`);
  const sum = mapSummary(map);
  out.push(
    `${sum.documentedSteps} documented steps, ${sum.hiddenSteps} hidden steps, ${sum.rules} rules and judgment calls (${sum.verified} verified by the expert).`,
  );
  out.push("");
  for (const step of map.steps) {
    out.push(`## ${step.id}. ${step.label}${step.documented ? "" : " (not in the written procedure)"}`);
    out.push(step.description);
    out.push("");
    for (const i of map.insights.filter((x) => x.stepId === step.id)) {
      out.push(`### ${KIND_LABEL[i.kind]}: ${i.title}`);
      if (i.condition) out.push(`- **When:** ${i.condition}`);
      if (i.action) out.push(`- **Then:** ${i.action}`);
      if (i.rationale) out.push(`- **Because:** ${i.rationale}`);
      if (i.unless) out.push(`- **Unless:** ${i.unless}`);
      if (i.sourceQuote) out.push(`- **In ${map.expertName}'s words:** "${i.sourceQuote}"`);
      out.push(`- **Status:** ${statusWord(i)}${i.caseId ? ` · seen on ${i.caseId}` : ""}`);
      out.push("");
    }
  }
  if (map.openQuestions.length) {
    out.push("## Still unclear");
    for (const q of map.openQuestions) out.push(`- ${q.topic}`);
  }
  return out.join("\n");
}
