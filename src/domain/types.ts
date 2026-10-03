// ---------------------------------------------------------------------------
// Workspace domain
// ---------------------------------------------------------------------------

export type ActionType = "approve" | "approve_early" | "hold" | "reject" | "escalate";
export type LookupKey = "po_receipt" | "vendor_history" | "contract" | "bank_log" | "dup_search";

export interface LookupContent {
  title: string;
  lines: string[];
}

export interface Invoice {
  id: string;
  vendor: string;
  vendorNote: string;
  amount: number;
  poNumber: string | null;
  poAmount: number | null;
  receipt: "full" | "partial" | "none";
  invoiceDate: string;
  dueDate: string;
  terms: string;
  description: string;
  lookups: Partial<Record<LookupKey, LookupContent>>;
}

export interface ProcessStep {
  id: string;
  label: string;
  description: string;
}

/** A case the expert works through during capture. */
export interface CaseSpec {
  invoice: Invoice;
  /** Seeded hidden rule this case exercises (benchmark ground truth; never shown to the agent). */
  ruleKey: string | null;
  /** What the persona expert does. Used by the demo crib sheet and the simulated expert. */
  expertAction: ActionType;
  /** What the persona expert would say if asked why. */
  expertSays: string;
}

/** A case a new hire works through while the tutor coaches. */
export interface TraineeCaseSpec {
  invoice: Invoice;
  ruleKey: string | null;
  expectedAction: ActionType;
  expectedWhy: string;
  /** True when the surface looks like a known rule but the right answer is different. */
  trap?: boolean;
}

export interface BenchmarkRule {
  key: string;
  label: string;
}

export interface Scenario {
  id: string;
  title: string;
  company: string;
  expertName: string;
  expertRole: string;
  workflow: string;
  steps: ProcessStep[];
  sopText: string[];
  /** The written procedure, as code: what a novice following the manual would do. */
  sopPredict: (inv: Invoice) => ActionType;
  /** Lookups the written procedure requires. Anything else is "unprompted". */
  sopLookups: LookupKey[];
  /** Lookups experts open as a matter of habit; opening them alone says nothing. */
  ambientLookups: LookupKey[];
  captureCases: CaseSpec[];
  traineeCases: TraineeCaseSpec[];
  rules: BenchmarkRule[];
  /** Dwell time before a decision counts as hesitation. */
  hesitationMs: number;
}

// ---------------------------------------------------------------------------
// Observation events (what the Apprentice "watches")
// ---------------------------------------------------------------------------

export type WorkEvent =
  | { id: string; t: number; type: "case_opened"; caseId: string }
  | { id: string; t: number; type: "lookup"; caseId: string; lookup: LookupKey }
  | { id: string; t: number; type: "action"; caseId: string; action: ActionType };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type WorkEventInput = DistributiveOmit<WorkEvent, "id" | "t">;

// ---------------------------------------------------------------------------
// Moments (when the Apprentice decides to speak)
// ---------------------------------------------------------------------------

export type MomentType = "sop_deviation" | "reversal" | "unprompted_lookup" | "hesitation";

export interface Moment {
  caseId: string;
  type: MomentType;
  /** Every signal that contributed, in priority order. */
  signals: MomentType[];
  action: ActionType;
  sopAction: ActionType;
  unpromptedLookups: LookupKey[];
  dwellMs: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// Work Map
// ---------------------------------------------------------------------------

export type InsightKind = "judgment" | "exception" | "guardrail" | "heuristic" | "escalation";
export type InsightStatus = "proposed" | "confirmed" | "corrected";

export interface Insight {
  id: string;
  kind: InsightKind;
  stepId: string;
  title: string;
  /** WHEN … */
  condition: string;
  /** THEN … */
  action: string;
  /** BECAUSE … */
  rationale: string;
  /** UNLESS … (boundary of the rule) */
  unless?: string;
  severity?: "hard_stop" | "strong" | "soft";
  sourceQuote: string;
  caseId?: string;
  status: InsightStatus;
  /** When the expert corrected the first version, what they said. */
  correction?: string;
  createdAt: number;
}

export interface MapStep extends ProcessStep {
  /** False when the step was discovered from the expert and is not in the written SOP. */
  documented: boolean;
}

export interface OpenQuestion {
  id: string;
  topic: string;
  caseId?: string;
  createdAt: number;
}

export interface WorkMap {
  workflow: string;
  expertName: string;
  expertRole: string;
  company: string;
  capturedAt: number | null;
  steps: MapStep[];
  insights: Insight[];
  openQuestions: OpenQuestion[];
  stats: {
    casesObserved: number;
    questionsAsked: number;
    silentCases: number;
  };
}

// ---------------------------------------------------------------------------
// Agent bridge (voice or simulated)
// ---------------------------------------------------------------------------

export type BridgeStatus = "idle" | "connecting" | "connected" | "error" | "ended";
export type BridgeMode = "listening" | "speaking" | "thinking";

export interface TranscriptLine {
  id: string;
  role: "agent" | "expert" | "system";
  text: string;
  t: number;
}

export type ToolHandler = (params: Record<string, unknown>) => string | Promise<string>;

export interface AgentBridgeEvents {
  onStatus: (s: BridgeStatus, detail?: string) => void;
  onMode: (m: BridgeMode) => void;
  onTranscript: (line: Omit<TranscriptLine, "id" | "t">) => void;
}

export interface AgentBridge {
  readonly kind: "elevenlabs" | "simulated";
  start(opts: { dynamicVariables: Record<string, string | number | boolean>; tools: Record<string, ToolHandler> }): Promise<void>;
  stop(): Promise<void>;
  /** Silent context. The agent must not respond. */
  observe(text: string): void;
  /** A workspace cue the agent must respond to (speech or tool call). */
  cue(text: string): void;
  /** Something the human typed. */
  sendText(text: string): void;
  setMuted(muted: boolean): void;
  /** 0..1 current output level, for the orb. */
  level(): number;
}
