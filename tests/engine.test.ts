import { describe, expect, it } from "vitest";
import { apScenario as S } from "../src/domain/scenario-ap";
import type { ActionType, WorkEvent } from "../src/domain/types";
import { captureAskCue, tutorMomentCue } from "../src/engine/cues";
import { applyEvent, classifyTraineeAction, detectMoment, emptyTrace } from "../src/engine/moments";
import { seedWorkMap } from "../src/engine/seed";
import { caseScore, masteryByRule, overallScore, readiness, recordAttempt } from "../src/engine/tutor";
import { addInsight, benchmark, confirmInsight, emptyWorkMap, insightsForRule, serializeForLLM, toMarkdown } from "../src/engine/workmap";

const inv = (id: string) => S.captureCases.find((c) => c.invoice.id === id)!.invoice;

function trace(caseId: string, opts: { lookups?: string[]; actions: ActionType[]; dwellMs?: number }) {
  const t0 = 1000;
  let tr = emptyTrace(caseId, t0);
  let n = 0;
  const ev = (e: Record<string, unknown>) => ({ ...e, id: `e${n++}` }) as unknown as WorkEvent;
  for (const l of opts.lookups ?? []) tr = applyEvent(tr, ev({ type: "lookup", caseId, lookup: l as never, t: t0 + 500 }));
  opts.actions.forEach((a, i) => {
    tr = applyEvent(tr, ev({ type: "action", caseId, action: a, t: t0 + (opts.dwellMs ?? 3000) + i * 1000 }));
  });
  return tr;
}

describe("written SOP as code", () => {
  it("predicts what a novice would do for each capture case", () => {
    const predicted = Object.fromEntries(S.captureCases.map((c) => [c.invoice.id, S.sopPredict(c.invoice)]));
    expect(predicted).toEqual({
      "INV-2042": "approve",
      "INV-2041": "hold", // 3.8% over
      "INV-2043": "hold", // no receipt
      "INV-2044": "approve", // matches, bank change invisible to the SOP
      "INV-2042/A": "approve", // not an exact duplicate number
      "INV-2046": "reject", // no PO
      "INV-2047": "approve",
      "INV-2048": "approve",
    });
  });

  it("every seeded rule departs from the SOP, and the two routine cases do not", () => {
    for (const c of S.captureCases) {
      const departs = S.sopPredict(c.invoice) !== c.expertAction;
      expect(departs, c.invoice.id).toBe(c.ruleKey !== null);
    }
  });
});

describe("moment detection", () => {
  it("stays silent on routine cases", () => {
    const m = detectMoment(trace("INV-2042", { actions: ["approve"], lookups: ["po_receipt", "vendor_history"] }), inv("INV-2042"), S);
    expect(m).toBeNull();
  });

  it("asks when the expert departs from the SOP", () => {
    const m = detectMoment(trace("INV-2041", { actions: ["approve"], lookups: ["po_receipt", "contract"] }), inv("INV-2041"), S)!;
    expect(m.type).toBe("sop_deviation");
    expect(m.signals).toContain("unprompted_lookup");
    expect(m.sopAction).toBe("hold");
  });

  it("flags the unprompted bank-log lookup even when the decision matches the SOP", () => {
    const m = detectMoment(trace("INV-2044", { actions: ["approve"], lookups: ["bank_log"] }), inv("INV-2044"), S)!;
    expect(m.type).toBe("unprompted_lookup");
    expect(m.unpromptedLookups).toEqual(["bank_log"]);
  });

  it("flags reversals", () => {
    const m = detectMoment(trace("INV-2048", { actions: ["approve", "hold"] }), inv("INV-2048"), S)!;
    expect(m.signals).toContain("reversal");
  });

  it("treats a long pause on an otherwise routine case as hesitation", () => {
    const m = detectMoment(trace("INV-2048", { actions: ["approve"], dwellMs: S.hesitationMs + 5000 }), inv("INV-2048"), S)!;
    expect(m.type).toBe("hesitation");
  });

  it("ignores ambient lookups", () => {
    const m = detectMoment(trace("INV-2048", { actions: ["approve"], lookups: ["vendor_history", "po_receipt"] }), inv("INV-2048"), S);
    expect(m).toBeNull();
  });

  it("the capture queue asks about exactly the six seeded cases and is silent on the two routine ones", () => {
    const asked = S.captureCases.filter((c) => detectMoment(trace(c.invoice.id, { actions: [c.expertAction] }), c.invoice, S) !== null);
    expect(asked.map((c) => c.invoice.id)).toEqual(["INV-2041", "INV-2044", "INV-2043", "INV-2042/A", "INV-2046", "INV-2047"]);
  });
});

describe("work map", () => {
  it("adds an insight, creates a hidden step on request, and verifies on confirm", () => {
    let map = emptyWorkMap(S);
    const r = addInsight(map, {
      kind: "guardrail",
      step_id: "S3",
      new_step: "Verify changed bank details by call-back",
      title: "Never pay changed bank details without a call-back",
      condition: "bank details changed",
      action: "hold and call",
      rationale: "fraud",
      source_quote: "I never pay a changed account on an email",
      case_id: "INV-2044",
    });
    map = r.map;
    expect(r.created).toBe(true);
    expect(r.newStep?.documented).toBe(false);
    expect(map.steps.map((s) => s.id)).toEqual(["S1", "S2", "S3", "H1", "S4", "S5", "S6"]);
    expect(r.insight.severity).toBe("strong");
    expect(r.insight.stepId).toBe("H1");
    map = confirmInsight(map, r.insight.id, true).map;
    expect(map.insights[0].status).toBe("confirmed");
  });

  it("merges a refinement of the same rule instead of duplicating it", () => {
    let map = emptyWorkMap(S);
    map = addInsight(map, {
      kind: "exception",
      step_id: "S3",
      title: "Fuel surcharge vendors run over",
      condition: "freight vendor over PO",
      action: "approve",
      case_id: "INV-2041",
    }).map;
    const r = addInsight(map, {
      kind: "exception",
      step_id: "S3",
      title: "Fuel surcharge vendors can run up to 5% over",
      condition: "freight vendor over PO with side letter",
      unless: "above 5%",
      case_id: "INV-2041",
    });
    expect(r.created).toBe(false);
    expect(r.map.insights).toHaveLength(1);
    expect(r.map.insights[0].unless).toBe("above 5%");
    expect(r.map.insights[0].action).toBe("approve");
  });

  it("is tolerant of bad model output", () => {
    const r = addInsight(emptyWorkMap(S), { kind: "banana", step_id: "S99", title: "x", condition: "y" });
    expect(r.insight.kind).toBe("judgment");
    expect(r.insight.stepId).toBe("S5");
  });

  it("a correction is recorded and visible to the tutor", () => {
    let map = emptyWorkMap(S);
    const r = addInsight(map, { title: "Small vendors", condition: "c", case_id: "INV-2043" });
    map = confirmInsight(r.map, r.insight.id, false, "The limit is 3,000 not 2,500").map;
    expect(map.insights[0].status).toBe("corrected");
    expect(serializeForLLM(map)).toContain("CORRECTION: The limit is 3,000");
  });

  it("the seed map covers all six benchmark rules and serialises for the tutor", () => {
    const map = seedWorkMap(S);
    const b = benchmark(map, S);
    expect(b.found).toHaveLength(6);
    expect(b.missed).toHaveLength(0);
    expect(map.steps.filter((s) => !s.documented).map((s) => s.label)).toEqual([
      "Confirm delivery with the requester",
      "Verify changed bank details by call-back",
    ]);
    const text = serializeForLLM(map);
    expect(text).toContain("NOT IN THE WRITTEN PROCEDURE");
    expect(text).toContain("Never pay changed bank details");
    expect(toMarkdown(map)).toContain("Guardrail: Never pay changed bank details");
    expect(map.insights.every((i) => i.status === "confirmed")).toBe(true);
  });

  it("benchmark reports misses", () => {
    const map = seedWorkMap(S);
    map.insights = map.insights.filter((i) => i.caseId !== "INV-2046");
    expect(benchmark(map, S).missed.map((r) => r.key)).toEqual(["new_vendor_threshold"]);
  });

  it("links rules to insights via the case they were captured on", () => {
    const map = seedWorkMap(S);
    expect(insightsForRule(map, S, "bank_change").map((i) => i.title)).toEqual(["Never pay changed bank details without a call-back"]);
    expect(insightsForRule(map, S, null)).toEqual([]);
  });
});

describe("tutor", () => {
  const tc = (id: string) => S.traineeCases.find((c) => c.invoice.id === id)!;

  it("every trainee case has the expected action the seeded rules imply", () => {
    expect(S.traineeCases.map((c) => [c.invoice.id, c.expectedAction])).toEqual([
      ["INV-3101", "approve"],
      ["INV-3102", "hold"],
      ["INV-3103", "approve"],
      ["INV-3104", "hold"],
      ["INV-7781", "reject"],
      ["INV-3106", "escalate"],
      ["INV-3107", "approve_early"],
    ]);
  });

  it("the trap case looks like the fuel-surcharge case but the SOP agrees with the right answer", () => {
    const dalton = tc("INV-3102");
    expect(dalton.trap).toBe(true);
    expect(S.sopPredict(dalton.invoice)).toBe(dalton.expectedAction);
  });

  it("classifies trainee actions", () => {
    expect(classifyTraineeAction("approve", "hold", false, 1)).toBe("mistake");
    expect(classifyTraineeAction("hold", "hold", true, 1)).toBe("trap_avoided");
    expect(classifyTraineeAction("hold", "hold", false, 1)).toBe("correct");
    expect(classifyTraineeAction("hold", "hold", true, 2)).toBe("correct");
  });

  it("scores first-time, after-hint and wrong", () => {
    let p = recordAttempt({}, "INV-3101", "approve");
    expect(caseScore(p["INV-3101"], tc("INV-3101"))).toBe(1);
    p = recordAttempt(recordAttempt({}, "INV-3104", "approve"), "INV-3104", "hold");
    expect(caseScore(p["INV-3104"], tc("INV-3104"))).toBe(0.5);
    p = recordAttempt({}, "INV-3106", "reject");
    expect(caseScore(p["INV-3106"], tc("INV-3106"))).toBe(0);
  });

  it("mastery and readiness", () => {
    let p = {};
    for (const c of S.traineeCases) p = recordAttempt(p, c.invoice.id, c.expectedAction);
    expect(overallScore(p, S)).toBe(1);
    expect(masteryByRule(p, S).every((r) => r.score === 1)).toBe(true);
    expect(readiness(1, 7)).toBe("ready");
    expect(readiness(0.7, 7)).toBe("supervised");
    expect(readiness(1, 2)).toBe("not_ready");
  });
});

describe("cues", () => {
  it("capture cue carries the contrast the agent needs and never leaks hidden rule keys", () => {
    const c = S.captureCases.find((x) => x.invoice.id === "INV-2044")!;
    const m = detectMoment(trace("INV-2044", { actions: ["hold"], lookups: ["bank_log"] }), c.invoice, S)!;
    const cue = captureAskCue(m, c.invoice, S, emptyWorkMap(S), ["bank_log"]);
    expect(cue).toContain("the expert chose: HOLD");
    expect(cue).toContain("the written procedure would have chosen: APPROVE");
    expect(cue).toContain("Bank details log");
    expect(cue).not.toContain("bank_change");
  });

  it("tutor cue withholds the answer on the first mistake and reveals on the second", () => {
    const t = tc2();
    const map = seedWorkMap(S);
    const rel = insightsForRule(map, S, t.ruleKey);
    const first = tutorMomentCue(
      { caseId: t.invoice.id, kind: "mistake", action: "approve", expected: "hold", attempt: 1 },
      t,
      rel,
      [],
      ["S1"],
    );
    const second = tutorMomentCue(
      { caseId: t.invoice.id, kind: "mistake", action: "approve", expected: "hold", attempt: 2 },
      t,
      rel,
      [],
      ["S1"],
    );
    expect(first).toContain("do NOT reveal");
    expect(second).toContain("reveal the rule");
  });
});

function tc2() {
  return S.traineeCases.find((c) => c.invoice.id === "INV-3104")!;
}
