import { timing } from "../config";
import type { AgentBridge, AgentBridgeEvents, BridgeMode, ToolHandler } from "../domain/types";

/**
 * A deterministic stand-in for the ElevenLabs agents. It speaks the same
 * protocol (cues in, tool calls out) with templated language instead of an LLM.
 * It exists for three reasons: end-to-end tests that need no network, a
 * failsafe if the venue Wi-Fi dies mid-demo, and a clear baseline to compare the
 * real agents against.
 */

abstract class SimBase implements AgentBridge {
  abstract readonly kind: "simulated";
  protected tools: Record<string, ToolHandler> = {};
  protected vars: Record<string, string | number | boolean> = {};
  private speakingUntil = 0;
  private queue: Promise<void> = Promise.resolve();
  protected muted = false;

  constructor(protected readonly ev: AgentBridgeEvents) {}

  async start({
    dynamicVariables,
    tools,
  }: {
    dynamicVariables: Record<string, string | number | boolean>;
    tools: Record<string, ToolHandler>;
  }) {
    this.tools = tools;
    this.vars = dynamicVariables;
    this.ev.onStatus("connecting");
    await sleep(timing.simSpeechMsPerChar > 2 ? 400 : 10);
    this.ev.onStatus("connected");
    this.ev.onMode("listening");
    await this.opening();
  }

  async stop() {
    this.ev.onStatus("ended");
  }

  protected abstract opening(): Promise<void>;
  abstract observe(text: string): void;
  abstract cue(text: string): void;
  abstract sendText(text: string): void;

  setMuted(m: boolean) {
    this.muted = m;
  }

  level(): number {
    return Date.now() < this.speakingUntil ? 0.35 + 0.35 * Math.abs(Math.sin(Date.now() / 90)) : 0;
  }

  /** Serialise speech so lines never overlap. */
  protected say(text: string, then?: () => unknown) {
    this.ev.onMode("thinking");
    this.queue = this.queue.then(async () => {
      await sleep(timing.simSpeechMsPerChar > 2 ? 500 : 5);
      this.ev.onTranscript({ role: "agent", text });
      this.ev.onMode("speaking");
      const dur = Math.max(300, text.length * timing.simSpeechMsPerChar);
      this.speakingUntil = Date.now() + dur;
      speak(text, this.muted);
      await sleep(dur);
      this.ev.onMode("listening");
      if (then) await then();
    });
  }

  protected async tool(name: string, params: Record<string, unknown>) {
    const fn = this.tools[name];
    if (!fn) return "";
    return fn(params);
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function speak(text: string, muted: boolean) {
  try {
    if (muted || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* no speech available */
  }
}

const field = (cue: string, label: string) => cue.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1]?.trim() ?? "";

// ---------------------------------------------------------------------------
// Apprentice
// ---------------------------------------------------------------------------

export class SimulatedApprentice extends SimBase {
  readonly kind = "simulated" as const;
  private stage: "idle" | "answer" | "confirm" | "sweep" = "idle";
  private caseId = "";
  private chose = "";
  private insightId = "";
  private lastTitle = "";

  protected async opening() {
    this.say(`Hi ${this.vars.expert_name}, I'm Pip. Work the way you normally do. I'll stay quiet unless something is worth asking.`);
  }

  observe() {}

  cue(text: string) {
    if (text.includes("] WRAP") || text.startsWith("[[WORKSPACE]] WRAP")) {
      this.stage = "sweep";
      this.caseId = "general";
      this.say("Last thing. What's the mistake a new hire is most likely to make that would cost real money?");
      return;
    }
    if (!text.includes("ASK")) return;
    this.stage = "answer";
    this.caseId = text.match(/INV-[\w/]+/)?.[0] ?? "general";
    this.chose = field(text, "the expert chose");
    const sop = field(text, "the written procedure would have chosen");
    const lookups = field(text, "lookups the expert opened before deciding");
    const signals = field(text, "signals");

    let q: string;
    if (/bank details/i.test(lookups)) q = `You opened the bank details log before deciding on ${this.caseId}. What were you looking for?`;
    else if (/contract/i.test(lookups) && this.chose !== sop)
      q = `You checked the contract notes and went with ${this.chose.toLowerCase()}, where the manual says ${sop.toLowerCase()}. What did you know that the manual doesn't?`;
    else if (this.chose !== sop)
      q = `On ${this.caseId} you chose ${this.chose.toLowerCase()}, and the manual says ${sop.toLowerCase()}. What's the reasoning?`;
    else if (/hesitation/.test(signals)) q = `${this.caseId} took you a moment. What were you weighing?`;
    else q = `What made you look at that before deciding on ${this.caseId}?`;
    this.say(q);
  }

  sendText(text: string) {
    this.ev.onTranscript({ role: "expert", text });
    if (this.stage === "answer" || this.stage === "sweep") return void this.record(text);
    if (this.stage === "confirm") return void this.confirm(text);
  }

  private async record(answer: string) {
    const lower = answer.toLowerCase();
    const kind = /\bnever\b|fraud|must not/.test(lower)
      ? "guardrail"
      : /escalat|controller/.test(lower)
        ? "escalation"
        : /unless|except|up to|\bline\b|\blimit\b|\bcap\b/.test(lower)
          ? "exception"
          : /smell|classic|resubmit|looks like/.test(lower)
            ? "heuristic"
            : "judgment";
    const first = answer.split(/(?<=[.!?])\s+/)[0] ?? answer;
    const title = first.replace(/\s+/g, " ").slice(0, 80);
    const unless = answer.match(/\b(unless|except|above|up to)\b[^.]*\./i)?.[0];
    const result = await this.tool("record_insight", {
      kind,
      title,
      condition: `On ${this.caseId}: ${first}`,
      action: this.chose ? `Chose ${this.chose.toLowerCase()}` : "See the expert's words",
      rationale: answer.slice(0, 200),
      unless,
      severity: kind === "guardrail" ? "strong" : undefined,
      source_quote: answer.slice(0, 220),
      case_id: this.caseId,
    });
    this.insightId = (() => {
      try {
        return JSON.parse(result).insight_id as string;
      } catch {
        return "";
      }
    })();
    this.lastTitle = title;
    if (this.stage === "sweep") {
      this.stage = "idle";
      this.say("Thank you. That's everything I needed.", async () => void (await this.tool("close_topic", { outcome: "captured" })));
      return;
    }
    this.stage = "confirm";
    this.say(`So, ${this.lastTitle.replace(/\.$/, "")}. Is that right, or is there a catch?`);
  }

  private async confirm(answer: string) {
    const yes = /^(yes|yeah|yep|right|correct|exactly|that's right|spot on|sure)/i.test(answer.trim());
    await this.tool("confirm_insight", { insight_id: this.insightId, confirmed: yes, correction: yes ? undefined : answer });
    this.stage = "idle";
    this.say(yes ? "Got it." : "Noted, I've corrected it.", async () => void (await this.tool("close_topic", { outcome: "captured" })));
  }
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

export class SimulatedTutor extends SimBase {
  readonly kind = "simulated" as const;
  private awaiting: "none" | "probe" | "restate" = "none";
  private caseId = "";
  private relevant: string[] = [];

  protected async opening() {}

  observe() {}

  cue(text: string) {
    if (text.includes("] START")) return void this.intro();
    if (text.includes("] WRAP")) {
      return void this.say(
        "That's the session. Revisit the rule you scored lowest on, and ask Maria about anything the map doesn't cover.",
        () => this.tool("close_topic", { outcome: "debriefed" }),
      );
    }
    this.caseId = text.match(/INV-[\w/]+/)?.[0] ?? "";
    this.relevant = [...(field(text, "relevant captured rules").matchAll(/I-\d+/g) ?? [])].map((m) => m[0]);

    if (text.includes("] MISTAKE")) {
      const attempt = Number(text.match(/attempt (\d+)/)?.[1] ?? "1");
      if (attempt <= 1) {
        this.say("Hold on. Before you commit, what do the contract notes and the bank log tell you about this vendor?");
      } else {
        const id = this.relevant[0];
        const quote = this.quoteFor(id);
        void this.tool("show_on_map", { insight_id: id });
        this.awaiting = "restate";
        this.say(
          id
            ? `Here's the rule. ${quote ? `${this.vars.expert_name} says: ${quote}` : "It's on your map now."} Say it back to me in your own words.`
            : "The expert hasn't covered this one yet. Go by the written steps.",
        );
      }
    } else if (text.includes("] PROBE")) {
      this.awaiting = "probe";
      this.say("Right call. What separated this one from the similar invoice earlier?");
    } else if (text.includes("] PRAISE")) {
      const id = this.relevant[0];
      this.say(
        id ? `Good. That's the ${id} rule.` : "Good.",
        () => void this.tool("record_assessment", { case_id: this.caseId, reasoning: "sound", note: "Correct first time." }),
      );
    }
  }

  sendText(text: string) {
    this.ev.onTranscript({ role: "expert", text });
    if (this.awaiting === "probe" || this.awaiting === "restate") {
      const verdict = text.trim().split(/\s+/).length >= 8 ? "sound" : "partial";
      this.awaiting = "none";
      this.say(verdict === "sound" ? "Exactly." : "Close. Add the specific thing that makes the difference.", () =>
        this.tool("record_assessment", { case_id: this.caseId, reasoning: verdict, note: "Simulated judgement from answer length." }),
      );
    } else if (/next|ready/i.test(text)) {
      void this.tool("next_case", {});
    }
  }

  private quoteFor(id?: string): string {
    if (!id) return "";
    const map = String(this.vars.work_map ?? "");
    const block = map.split(/\n(?=\[I-)/).find((b) => b.startsWith(`[${id}]`));
    return block?.match(/said: "([^"]+)"/)?.[1] ?? "";
  }

  private async intro() {
    this.say(
      `Welcome, ${this.vars.trainee_name}. The manual is a start. ${this.vars.expert_name} has taught us where it falls short, so I'll walk you through the map.`,
      async () => {
        await this.tool("show_on_map", { step_id: "S3" });
      },
    );
    this.say(
      "Watch the highlighted steps. Those are the ones the manual leaves out. Let's try the first invoice.",
      () => void this.tool("next_case", {}),
    );
  }
}

export type { BridgeMode };
