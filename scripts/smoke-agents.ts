/**
 * Live check of both ElevenLabs agents, in text-only mode (no microphone, no audio).
 *
 *   npm run smoke:agents
 *
 * It plays the browser: sends the same [[WORKSPACE]] cues the app sends, answers
 * the agents' client-tool calls, and asserts on what the agents say and do.
 * Run it after `npm run setup:agents` and again after any prompt change.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import WebSocket from "ws";
import { apScenario as S } from "../src/domain/scenario-ap";
import { captureAskCue, routineObservation, tutorIntroCue, tutorMomentCue } from "../src/engine/cues";
import { applyEvent, detectMoment, emptyTrace } from "../src/engine/moments";
import { seedWorkMap } from "../src/engine/seed";
import { addInsight, confirmInsight, emptyWorkMap, insightsForRule, serializeForLLM } from "../src/engine/workmap";
import type { WorkEvent } from "../src/domain/types";

function envFromFile(): Record<string, string> {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}
const fileEnv = envFromFile();
const APPRENTICE = process.env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID || fileEnv.VITE_ELEVENLABS_APPRENTICE_AGENT_ID;
const TUTOR = process.env.VITE_ELEVENLABS_TUTOR_AGENT_ID || fileEnv.VITE_ELEVENLABS_TUTOR_AGENT_ID;
if (!APPRENTICE || !TUTOR) {
  console.error("Agent ids missing. Run `npm run setup:agents` first.");
  process.exit(1);
}

// ---------------------------------------------------------------------------

interface ToolCall {
  name: string;
  params: Record<string, unknown>;
}
interface Turn {
  said: string[];
  tools: ToolCall[];
}

class Session {
  private ws!: WebSocket;
  private turn: Turn = { said: [], tools: [] };
  private lastEvent = Date.now();
  constructor(
    private agentId: string,
    private vars: Record<string, string>,
    private onTool: (c: ToolCall) => string,
  ) {}

  async open() {
    this.ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.agentId}`);
    await new Promise<void>((resolve, reject) => {
      this.ws.on("open", () => {
        this.ws.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            conversation_config_override: { conversation: { text_only: true } },
            dynamic_variables: this.vars,
          }),
        );
      });
      this.ws.on("message", (raw) => {
        const m = JSON.parse(String(raw));
        this.lastEvent = Date.now();
        switch (m.type) {
          case "conversation_initiation_metadata":
            resolve();
            break;
          case "ping":
            this.ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
            break;
          case "agent_response":
            if (m.agent_response_event.agent_response) this.turn.said.push(m.agent_response_event.agent_response);
            break;
          case "client_tool_call": {
            const c = m.client_tool_call;
            const call = { name: c.tool_name as string, params: c.parameters as Record<string, unknown> };
            this.turn.tools.push(call);
            this.ws.send(
              JSON.stringify({ type: "client_tool_result", tool_call_id: c.tool_call_id, result: this.onTool(call), is_error: false }),
            );
            break;
          }
          case "error":
          case "client_error":
            console.error("  agent error:", JSON.stringify(m).slice(0, 300));
            break;
        }
      });
      this.ws.on("error", reject);
      this.ws.on("close", (code, reason) => reject(new Error(`socket closed ${code} ${reason}`)));
      setTimeout(() => reject(new Error("timed out waiting for conversation_initiation_metadata")), 20_000);
    }).catch((e) => {
      throw e;
    });
    // From here a close is just the end of the session.
    this.ws.removeAllListeners("close");
  }

  /** Send, then wait until the agent has gone quiet. */
  async say(kind: "user_message" | "contextual_update", text: string, quietMs = 5000, maxMs = 60_000): Promise<Turn> {
    this.turn = { said: [], tools: [] };
    this.lastEvent = Date.now();
    const start = Date.now();
    this.ws.send(JSON.stringify({ type: kind, text }));
    while (Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 250));
      const anything = this.turn.said.length + this.turn.tools.length > 0;
      if (anything && Date.now() - this.lastEvent > quietMs) break;
      if (!anything && kind === "contextual_update" && Date.now() - start > quietMs) break;
    }
    return this.turn;
  }

  /** Wait for whatever the agent says on its own (its opening greeting) and return it. */
  async drain(quietMs = 3000, maxMs = 25_000): Promise<Turn> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 250));
      const anything = this.turn.said.length + this.turn.tools.length > 0;
      if (anything && Date.now() - this.lastEvent > quietMs) break;
    }
    const t = this.turn;
    this.turn = { said: [], tools: [] };
    return t;
  }

  close() {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const spoken = (t: Turn) => t.said.join(" ");

function traceFor(caseId: string, lookups: string[], action: string, dwell = 4000) {
  let tr = emptyTrace(caseId, 0);
  let n = 0;
  const ev = (e: Record<string, unknown>) => ({ ...e, id: `e${n++}` }) as unknown as WorkEvent;
  for (const l of lookups) tr = applyEvent(tr, ev({ type: "lookup", caseId, lookup: l, t: 500 }));
  tr = applyEvent(tr, ev({ type: "action", caseId, action, t: dwell }));
  return tr;
}

async function apprentice() {
  console.log("\nApprentice (capture agent)");
  let map = emptyWorkMap(S);
  const s = new Session(
    APPRENTICE!,
    {
      expert_name: S.expertName,
      expert_role: S.expertRole,
      company: S.company,
      workflow: S.workflow,
      sop: S.sopText.map((l, i) => `${i + 1}. ${l}`).join(" "),
    },
    (c) => {
      if (c.name === "record_insight") {
        const r = addInsight(map, c.params);
        map = r.map;
        return JSON.stringify({ ok: true, insight_id: r.insight.id, created: r.created, step_id: r.insight.stepId });
      }
      if (c.name === "confirm_insight") {
        const r = confirmInsight(map, String(c.params.insight_id), c.params.confirmed === true, String(c.params.correction ?? ""));
        map = r.map;
        return JSON.stringify({ ok: !!r.insight });
      }
      return JSON.stringify({ ok: true });
    },
  );
  await s.open();

  // 0. The agent greets on connect. That is not a reply to anything we send.
  const greeting = await s.drain();
  console.log(`      Pip: ${spoken(greeting)}`);
  check("greets by name when the session opens", /pip/i.test(spoken(greeting)) && /maria/i.test(spoken(greeting)));

  // 1. Routine case: silence.
  const routine = S.captureCases.find((x) => x.invoice.id === "INV-2042")!;
  const t1 = await s.say("contextual_update", routineObservation(routine.invoice, "Approve"), 6000);
  check("stays silent on a routine case", t1.said.length === 0 && t1.tools.length === 0, spoken(t1).slice(0, 80));

  // 2. Vantage: bank details changed, fully matched, expert holds.
  const c = S.captureCases.find((x) => x.invoice.id === "INV-2044")!; // Vantage: matches, but the bank details changed
  const moment = detectMoment(traceFor(c.invoice.id, ["bank_log"], "hold"), c.invoice, S)!;
  const ask = await s.say("user_message", captureAskCue(moment, c.invoice, S, map, ["bank_log"]));
  const q = spoken(ask);
  console.log(`      Pip: ${q}`);
  check("asks a question after an ASK cue", q.includes("?"));
  check("question is short (under 45 words)", words(q) > 0 && words(q) <= 45, `${words(q)} words`);
  check("does not leak the workspace tag", !q.includes("[[") && !/workspace/i.test(q));
  check("refers to the specific situation", /bank|account|hold|matched|log/i.test(q));

  // 3. Expert explains. Pip should record a guardrail and teach back.
  const ans = await s.say("user_message", c.expertSays);
  console.log(`      Pip: ${spoken(ans)}`);
  const rec = ans.tools.find((t) => t.name === "record_insight");
  check("calls record_insight", !!rec);
  check("classifies it as a guardrail", rec?.params.kind === "guardrail", String(rec?.params.kind));
  check("ties it to the right invoice", String(rec?.params.case_id).includes("INV-2044"), String(rec?.params.case_id));
  check("captures the call-back action", /call|phone|ring/i.test(`${rec?.params.action} ${rec?.params.condition}`));
  check("quotes the expert", String(rec?.params.source_quote ?? "").length > 20);
  check("plays it back with a question", spoken(ans).includes("?"));

  // 4. Expert confirms.
  const yes = await s.say("user_message", "Yes, that's exactly right.");
  console.log(`      Pip: ${spoken(yes) || "(silent)"}`);
  const conf = yes.tools.find((t) => t.name === "confirm_insight");
  check("calls confirm_insight with confirmed=true", conf?.params.confirmed === true || conf?.params.confirmed === "true");
  check(
    "calls close_topic",
    yes.tools.some((t) => t.name === "close_topic"),
  );
  check(
    "work map now holds a verified guardrail",
    map.insights.some((i) => i.kind === "guardrail" && i.status === "confirmed"),
  );

  // 5. The expert is always in control: "not now" drops the topic and records nothing.
  const before = map.insights.length;
  const bl = S.captureCases.find((x) => x.invoice.id === "INV-2041")!;
  const blMoment = detectMoment(traceFor(bl.invoice.id, ["contract"], "approve"), bl.invoice, S)!;
  const ask2 = await s.say("user_message", captureAskCue(blMoment, bl.invoice, S, map, ["contract"]));
  console.log(`      Pip: ${spoken(ask2)}`);
  const skip = await s.say("user_message", "Not now. Let's skip this one and move on.");
  console.log(`      Pip: ${spoken(skip) || "(silent)"}`);
  check("'not now': records nothing", !skip.tools.some((t) => t.name === "record_insight") && map.insights.length === before);
  check(
    "'not now': closes the topic",
    skip.tools.some((t) => t.name === "close_topic"),
  );
  check(
    "'not now': acknowledges briefly, without a follow-up question",
    words(spoken(skip)) <= 8 && !spoken(skip).includes("?"),
    `${words(spoken(skip))} words`,
  );

  s.close();
}

async function tutor() {
  console.log("\nTutor (teaching agent)");
  const seed = seedWorkMap(S);
  const s = new Session(
    TUTOR!,
    {
      trainee_name: "Sam",
      expert_name: S.expertName,
      expert_role: S.expertRole,
      company: S.company,
      workflow: S.workflow,
      work_map: serializeForLLM(seed),
    },
    (c) =>
      c.name === "next_case"
        ? JSON.stringify({ ok: true, message: "Case 1 of 7 is on screen: INV-3101, Kestrel Fuel & Freight." })
        : JSON.stringify({ ok: true }),
  );
  await s.open();

  const intro = await s.say("user_message", tutorIntroCue(seed, S.traineeCases.length), 8000, 90_000);
  console.log(`      Pip: ${spoken(intro).slice(0, 220)}…`);
  check("greets and walks the map", spoken(intro).length > 80);
  check(
    "highlights steps while it talks",
    intro.tools.filter((t) => t.name === "show_on_map").length >= 2,
    `${intro.tools.filter((t) => t.name === "show_on_map").length} calls`,
  );
  check(
    "starts practice with next_case",
    intro.tools.some((t) => t.name === "next_case"),
  );

  const tc = S.traineeCases[3]; // Ridgeway: perfect match, bank details changed
  const rel = insightsForRule(seed, S, tc.ruleKey);
  const ids = seed.steps.map((x) => x.id);
  const m1 = await s.say(
    "user_message",
    tutorMomentCue(
      { caseId: tc.invoice.id, kind: "mistake", action: "approve", expected: "hold", attempt: 1 },
      tc,
      rel,
      ["po_receipt"],
      ids,
    ),
  );
  console.log(`      Pip: ${spoken(m1)}`);
  check(
    "first mistake: asks, does not reveal",
    spoken(m1).includes("?") && !/call.?back|phone the vendor|number (we|on) file/i.test(spoken(m1)),
  );
  check("first mistake: short", words(spoken(m1)) <= 45, `${words(spoken(m1))} words`);

  const m2 = await s.say(
    "user_message",
    tutorMomentCue(
      { caseId: tc.invoice.id, kind: "mistake", action: "approve", expected: "hold", attempt: 2 },
      tc,
      rel,
      ["po_receipt", "bank_log"],
      ids,
    ),
  );
  console.log(`      Pip: ${spoken(m2)}`);
  const show = m2.tools.find((t) => t.name === "show_on_map");
  check(
    "second mistake: highlights the rule on the map",
    !!show && String(show.params.insight_id ?? "").startsWith("I-"),
    JSON.stringify(show?.params),
  );
  check("second mistake: states the correct decision", /hold/i.test(spoken(m2)));
  // A question mark or an instruction both count: "In your own words, what's the rule?" / "Tell me this back in your own words."
  check(
    "second mistake: asks the trainee to say it back",
    spoken(m2).includes("?") || /own words|say it back|tell me .* back|restate/i.test(spoken(m2)),
  );

  s.close();
}

(async () => {
  try {
    await apprentice();
    await tutor();
  } catch (e) {
    console.error("\nSmoke test could not complete:", e instanceof Error ? e.message : e);
    process.exit(2);
  }
  console.log(
    failures
      ? `\n${failures} check(s) failed. Read the transcript above, adjust prompts/*.md, run npm run setup:agents, retry.`
      : "\nAll checks passed.",
  );
  process.exit(failures ? 1 : 0);
})();
