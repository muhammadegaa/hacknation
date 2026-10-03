/**
 * Client tools the ElevenLabs agents can call. This file is the single source
 * of truth: scripts/setup-agents.ts registers these on the agents, and the app
 * implements a handler for every name listed here (checked by a test).
 */

export interface ToolParam {
  type: "string" | "boolean" | "integer";
  description: string;
  enum?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** True when the model must wait for the browser's reply before continuing. */
  blocking: boolean;
  required: string[];
  params: Record<string, ToolParam>;
}

export const CAPTURE_TOOLS: ToolSpec[] = [
  {
    name: "record_insight",
    description:
      "Save one distinct piece of the expert's tacit knowledge to the work map. Call it as soon as you have a concrete condition and action, without announcing it. Call it again with insight_id to refine or correct an existing insight. Returns the insight_id.",
    blocking: true,
    required: ["kind", "title", "condition", "action", "case_id"],
    params: {
      kind: {
        type: "string",
        description: "judgment, exception, guardrail, heuristic, or escalation.",
        enum: ["judgment", "exception", "guardrail", "heuristic", "escalation"],
      },
      title: { type: "string", description: "The rule as a short statement, at most 12 words." },
      condition: { type: "string", description: "WHEN this applies, concrete, with the expert's thresholds and numbers." },
      action: { type: "string", description: "THEN what the expert does." },
      rationale: { type: "string", description: "BECAUSE: the real reason, in the expert's terms." },
      unless: { type: "string", description: "UNLESS: the boundary or exception to the rule, if the expert gave one." },
      severity: {
        type: "string",
        description: "Guardrails only. hard_stop when never overridden, strong when rarely overridden, soft otherwise.",
        enum: ["hard_stop", "strong", "soft"],
      },
      source_quote: { type: "string", description: "The key sentence the expert said, lightly trimmed. Do not paraphrase." },
      case_id: {
        type: "string",
        description: "The invoice id the discussion was about, for example INV-2044. Use general for the closing sweep.",
      },
      step_id: { type: "string", description: "The step this applies to (S1 to S6, or H1 and up for discovered steps)." },
      new_step: { type: "string", description: "Short label for a step the expert described that is not in the written procedure." },
      insight_id: { type: "string", description: "Set to refine or correct an existing insight instead of creating a new one." },
    },
  },
  {
    name: "confirm_insight",
    description:
      "Record the expert's answer to your teach-back. Call with confirmed true when they agree, or confirmed false with their correction. Afterwards, if corrected, call record_insight again with the same insight_id.",
    blocking: true,
    required: ["insight_id", "confirmed"],
    params: {
      insight_id: { type: "string", description: "The id returned by record_insight." },
      confirmed: { type: "boolean", description: "True if the expert agreed with your summary." },
      correction: { type: "string", description: "What the expert said was wrong or missing, in their words." },
    },
  },
  {
    name: "park_question",
    description:
      "Note something that stayed unclear and that the expert could not resolve, so it appears as an open question on the work map.",
    blocking: true,
    required: ["topic"],
    params: {
      topic: { type: "string", description: "The unresolved question, in one sentence." },
      case_id: { type: "string", description: "The invoice id it came from, if any." },
    },
  },
  {
    name: "close_topic",
    description:
      "Call when you have finished with the current topic and are ready for the next workspace cue. Always call it after the expert confirms or says to move on.",
    blocking: false,
    required: ["outcome"],
    params: {
      outcome: {
        type: "string",
        description: "captured, nothing_to_add, or parked.",
        enum: ["captured", "nothing_to_add", "parked"],
      },
    },
  },
];

export const TUTOR_TOOLS: ToolSpec[] = [
  {
    name: "show_on_map",
    description: "Highlight a step or a rule on the trainee's work map while you talk about it. Pass step_id, insight_id, or both.",
    blocking: false,
    required: [],
    params: {
      step_id: { type: "string", description: "A step id such as S3 or H1." },
      insight_id: { type: "string", description: "A rule id such as I-3." },
    },
  },
  {
    name: "record_assessment",
    description:
      "Record your verdict on how well the trainee reasoned about the current case. Call it after PRAISE or PROBE, and after the trainee restates a rule.",
    blocking: true,
    required: ["case_id", "reasoning"],
    params: {
      case_id: { type: "string", description: "The invoice id." },
      reasoning: {
        type: "string",
        description: "sound if they named the real distinguishing factor, partial if they were close, unsound otherwise.",
        enum: ["sound", "partial", "unsound"],
      },
      note: { type: "string", description: "One line on what they got right or missed." },
    },
  },
  {
    name: "next_case",
    description:
      "Load the next practice invoice on the trainee's screen. Use after the walkthrough and whenever the trainee asks for the next one.",
    blocking: true,
    required: [],
    params: {},
  },
  {
    name: "close_topic",
    description: "Call when a topic is finished or the debrief is done.",
    blocking: false,
    required: ["outcome"],
    params: {
      outcome: { type: "string", description: "taught, assessed, or debriefed.", enum: ["taught", "assessed", "debriefed"] },
    },
  },
];

export const CAPTURE_TOOL_NAMES = CAPTURE_TOOLS.map((t) => t.name);
export const TUTOR_TOOL_NAMES = TUTOR_TOOLS.map((t) => t.name);
