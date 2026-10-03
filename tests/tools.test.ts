import { beforeEach, describe, expect, it } from "vitest";
import { capture } from "../src/controllers/capture";
import { tutor } from "../src/controllers/tutor";
import { loadSeedMap, resetCaptureState, resetTutorState, get } from "../src/state/store";
import { CAPTURE_TOOLS, CAPTURE_TOOL_NAMES, TUTOR_TOOLS, TUTOR_TOOL_NAMES } from "../src/voice/toolSpecs";

// The controllers keep their tool tables private; reach in so a rename on either
// side (agent config vs browser handler) fails a test instead of failing a demo.
type WithTools = { tools(): Record<string, (p: Record<string, unknown>) => string> };
const captureTools = () => (capture as unknown as WithTools).tools();
const tutorTools = () => (tutor as unknown as WithTools).tools();

describe("tool contract between the agents and the browser", () => {
  it("the browser implements exactly the tools the capture agent is given", () => {
    expect(Object.keys(captureTools()).sort()).toEqual([...CAPTURE_TOOL_NAMES].sort());
  });

  it("the browser implements exactly the tools the tutor agent is given", () => {
    expect(Object.keys(tutorTools()).sort()).toEqual([...TUTOR_TOOL_NAMES].sort());
  });

  it("every required parameter is declared", () => {
    for (const t of [...CAPTURE_TOOLS, ...TUTOR_TOOLS]) {
      for (const r of t.required) expect(Object.keys(t.params), `${t.name}.${r}`).toContain(r);
    }
  });
});

describe("capture tools mutate the Work Map", () => {
  beforeEach(() => resetCaptureState());

  it("record_insight returns an id the agent can confirm, and updates focus", () => {
    const res = JSON.parse(
      captureTools().record_insight({
        kind: "guardrail",
        title: "Never pay changed bank details without a call-back",
        condition: "bank details differ",
        action: "hold and phone the vendor",
        case_id: "INV-2044",
        new_step: "Verify changed bank details by call-back",
        step_id: "S3",
      }),
    );
    expect(res).toMatchObject({ ok: true, insight_id: "I-1", created: true });
    expect(get().focus.insightId).toBe("I-1");
    expect(get().workMap.steps.some((s) => !s.documented)).toBe(true);

    const conf = JSON.parse(captureTools().confirm_insight({ insight_id: "I-1", confirmed: true }));
    expect(conf).toEqual({ ok: true, status: "confirmed" });
    expect(get().workMap.insights[0].status).toBe("confirmed");
  });

  it("confirm_insight with a correction marks it corrected, and accepts a stringly-typed boolean", () => {
    captureTools().record_insight({ title: "t", condition: "c", action: "a", case_id: "INV-2043" });
    captureTools().confirm_insight({ insight_id: "I-1", confirmed: "false", correction: "limit is 3,000" });
    expect(get().workMap.insights[0]).toMatchObject({ status: "corrected", correction: "limit is 3,000" });
  });

  it("an unknown insight id is reported, not thrown", () => {
    expect(JSON.parse(captureTools().confirm_insight({ insight_id: "I-99", confirmed: true })).ok).toBe(false);
  });

  it("park_question adds an open question", () => {
    captureTools().park_question({ topic: "Who owns the vendor master?", case_id: "INV-2046" });
    expect(get().workMap.openQuestions.map((q) => q.topic)).toEqual(["Who owns the vendor master?"]);
  });
});

describe("tutor tools", () => {
  beforeEach(() => {
    resetTutorState();
    loadSeedMap();
  });

  it("show_on_map focuses an insight and its step", () => {
    tutorTools().show_on_map({ insight_id: "I-3" });
    expect(get().focus).toMatchObject({ insightId: "I-3", stepId: get().workMap.insights[2].stepId });
  });

  it("record_assessment stores the verdict and normalises junk", () => {
    tutorTools().record_assessment({ case_id: "INV-3102", reasoning: "sound", note: "named the missing clause" });
    expect(get().progress["INV-3102"].reasoning).toBe("sound");
    tutorTools().record_assessment({ case_id: "INV-3102", reasoning: "great!" });
    expect(get().progress["INV-3102"].reasoning).toBe("partial");
  });

  it("next_case advances and stops at the end", () => {
    const first = JSON.parse(tutorTools().next_case({}));
    expect(first.ok).toBe(true);
    expect(get().tutorIndex).toBe(0);
    for (let i = 0; i < 10; i++) tutorTools().next_case({});
    expect(get().tutorIndex).toBe(6);
    expect(JSON.parse(tutorTools().next_case({})).ok).toBe(false);
  });
});
