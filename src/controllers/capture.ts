import { timing } from "../config";
import { actionLabel, apScenario as S } from "../domain/scenario-ap";
import type { ActionType, AgentBridge, LookupKey, WorkEvent, WorkEventInput } from "../domain/types";
import { captureAskCue, lookupObservation, openedObservation, routineObservation, wrapCue } from "../engine/cues";
import { applyEvent, detectMoment, emptyTrace, type CaseTrace } from "../engine/moments";
import { addInsight, addOpenQuestion, confirmInsight } from "../engine/workmap";
import { addTranscript, get, resetCaptureState, set } from "../state/store";
import { makeBridge } from "../voice/factory";

interface QueuedCue {
  kind: "ask" | "wrap";
  caseId: string;
  text: string;
}

/**
 * Connects the workspace to the Apprentice agent.
 *
 *   workspace events -> case traces -> moment detector -> cue queue -> agent
 *   agent tool calls -> Work Map
 *
 * The queue is the interruption policy: one dialog at a time, never while the
 * agent is speaking, never within a beat of the expert's own words.
 */
class CaptureController {
  private bridge: AgentBridge | null = null;
  private traces = new Map<string, CaseTrace>();
  private settleTimers = new Map<string, number>();
  private queue: QueuedCue[] = [];
  private dialogActive = false;
  private lastActivity = 0;
  private lastUserSpeech = 0;
  private tick: number | undefined;
  private seq = 0;
  readonly events: WorkEvent[] = [];

  async begin() {
    this.end();
    resetCaptureState();
    this.events.length = 0;
    this.traces.clear();
    this.queue = [];
    this.dialogActive = false;
    set({ screen: "capture" });

    const st = get();
    this.bridge = await makeBridge("apprentice", st.voiceMode, st.settings.apprenticeAgentId, {
      onStatus: (bridgeStatus, bridgeDetail) => set({ bridgeStatus, bridgeDetail }),
      onMode: (bridgeMode) => {
        set({ bridgeMode });
        if (bridgeMode === "speaking") this.lastActivity = Date.now();
      },
      onTranscript: (line) => {
        addTranscript(line);
        this.lastActivity = Date.now();
        if (line.role === "expert") this.lastUserSpeech = Date.now();
      },
    });

    this.tick = window.setInterval(() => this.flush(), timing.tickMs);
    this.openCase(0);

    try {
      await this.bridge.start({
        dynamicVariables: {
          expert_name: S.expertName,
          expert_role: S.expertRole,
          company: S.company,
          workflow: S.workflow,
          sop: S.sopText.map((l, i) => `${i + 1}. ${l}`).join(" "),
        },
        tools: this.tools(),
      });
      // Observations queued before connect are replayed now that the agent can hear them.
      this.bridge.observe(openedObservation(S.captureCases[get().caseIndex].invoice));
    } catch {
      /* status already surfaced */
    }
  }

  end() {
    if (this.tick) window.clearInterval(this.tick);
    this.tick = undefined;
    for (const t of this.settleTimers.values()) window.clearTimeout(t);
    this.settleTimers.clear();
    void this.bridge?.stop();
    this.bridge = null;
  }

  // ----- workspace events ---------------------------------------------------

  private emit(ev: WorkEventInput) {
    const full = { ...ev, id: `e${++this.seq}`, t: Date.now() } as WorkEvent;
    this.events.push(full);
    return full;
  }

  openCase(i: number) {
    const c = S.captureCases[i];
    if (!c) return;
    const t = Date.now();
    this.traces.set(c.invoice.id, emptyTrace(c.invoice.id, t));
    this.emit({ type: "case_opened", caseId: c.invoice.id });
    set({ caseIndex: i, activeLookup: "po_receipt" });
    this.lookup("po_receipt", true);
    if (get().bridgeStatus === "connected") this.bridge?.observe(openedObservation(c.invoice));
  }

  lookup(key: LookupKey, auto = false) {
    const st = get();
    const c = S.captureCases[st.caseIndex];
    const id = c.invoice.id;
    set({ activeLookup: key });
    if (auto) {
      // The PO panel is shown by default; it is not a deliberate act by the expert.
      return;
    }
    const ev = this.emit({ type: "lookup", caseId: id, lookup: key });
    this.traces.set(id, applyEvent(this.traces.get(id)!, ev));
    set((s) => ({ openedLookups: { ...s.openedLookups, [id]: [...(s.openedLookups[id] ?? []), key] } }));
    if (st.bridgeStatus === "connected") this.bridge?.observe(lookupObservation(c.invoice, key));
  }

  decide(action: ActionType) {
    const st = get();
    const c = S.captureCases[st.caseIndex];
    const id = c.invoice.id;
    const ev = this.emit({ type: "action", caseId: id, action });
    this.traces.set(id, applyEvent(this.traces.get(id)!, ev));
    set((s) => ({ decisions: { ...s.decisions, [id]: action } }));

    // Wait for the decision to settle. A second click inside the window is a reversal.
    const prev = this.settleTimers.get(id);
    if (prev) window.clearTimeout(prev);
    this.settleTimers.set(
      id,
      window.setTimeout(() => this.settle(id), timing.settleMs),
    );
  }

  next() {
    const st = get();
    const id = S.captureCases[st.caseIndex].invoice.id;
    // Leaving the case is the natural moment: settle immediately.
    if (this.settleTimers.has(id)) {
      window.clearTimeout(this.settleTimers.get(id));
      this.settle(id);
    }
    if (st.caseIndex < S.captureCases.length - 1) this.openCase(st.caseIndex + 1);
  }

  private settle(caseId: string) {
    this.settleTimers.delete(caseId);
    const spec = S.captureCases.find((c) => c.invoice.id === caseId);
    const trace = this.traces.get(caseId);
    if (!spec || !trace || get().asked.includes(caseId) || get().silent.includes(caseId)) return;

    const moment = detectMoment(trace, spec.invoice, S);
    if (!moment) {
      set((s) => ({ silent: [...s.silent, caseId] }));
      if (get().bridgeStatus === "connected")
        this.bridge?.observe(routineObservation(spec.invoice, actionLabel[trace.actions[trace.actions.length - 1].action]));
      return;
    }
    const opened = trace.lookups.map((l) => l.key);
    this.queue.push({ kind: "ask", caseId, text: captureAskCue(moment, spec.invoice, S, get().workMap, opened) });
    set((s) => ({ asked: [...s.asked, caseId] }));
    this.flush();
  }

  // ----- finishing ----------------------------------------------------------

  finish() {
    const st = get();
    if (st.wrap !== "none") return;
    for (const id of [...this.settleTimers.keys()]) {
      window.clearTimeout(this.settleTimers.get(id));
      this.settle(id);
    }
    const done = Object.keys(st.decisions).length;
    if (st.bridgeStatus !== "connected") {
      this.complete();
      return;
    }
    this.queue.push({ kind: "wrap", caseId: "general", text: wrapCue(get().workMap, done) });
    set({ wrap: "queued" });
    this.flush();
  }

  private complete() {
    const st = get();
    set({
      wrap: "done",
      workMap: {
        ...st.workMap,
        capturedAt: Date.now(),
        stats: { casesObserved: Object.keys(st.decisions).length, questionsAsked: st.asked.length, silentCases: st.silent.length },
      },
      mapSource: st.workMap.insights.length ? "captured" : "empty",
    });
  }

  // ----- interruption policy ------------------------------------------------

  private flush() {
    const st = get();
    if (!this.bridge || st.bridgeStatus !== "connected") return;

    if (this.dialogActive && st.bridgeMode === "listening" && Date.now() - this.lastActivity > timing.dialogTimeoutMs) {
      this.dialogActive = false;
      if (st.wrap === "running") this.complete();
    }
    if (this.dialogActive || this.queue.length === 0) return;
    if (st.bridgeMode !== "listening") return;
    if (Date.now() - this.lastUserSpeech < timing.userQuietMs) return;

    const item = this.queue.shift()!;
    this.dialogActive = true;
    this.lastActivity = Date.now();
    if (item.kind === "wrap") set({ wrap: "running" });
    this.bridge.cue(item.text);
  }

  sendText(text: string) {
    this.lastUserSpeech = Date.now();
    this.lastActivity = Date.now();
    this.bridge?.sendText(text);
  }

  setMuted(m: boolean) {
    set({ muted: m });
    this.bridge?.setMuted(m);
  }

  level() {
    return this.bridge?.level() ?? 0;
  }

  // ----- tools the agent can call -------------------------------------------

  private tools() {
    return {
      record_insight: (p: Record<string, unknown>) => {
        const r = addInsight(get().workMap, p);
        set((s) => ({
          workMap: r.map,
          newInsightIds: [...s.newInsightIds.filter((x) => x !== r.insight.id), r.insight.id],
          focus: { stepId: r.insight.stepId, insightId: r.insight.id },
        }));
        this.lastActivity = Date.now();
        return JSON.stringify({ ok: true, insight_id: r.insight.id, created: r.created, step_id: r.insight.stepId });
      },
      confirm_insight: (p: Record<string, unknown>) => {
        const r = confirmInsight(
          get().workMap,
          String(p.insight_id ?? ""),
          p.confirmed === true || p.confirmed === "true",
          String(p.correction ?? ""),
        );
        set({ workMap: r.map });
        this.lastActivity = Date.now();
        return r.insight
          ? JSON.stringify({ ok: true, status: r.insight.status })
          : JSON.stringify({ ok: false, error: "unknown insight_id" });
      },
      park_question: (p: Record<string, unknown>) => {
        set((s) => ({ workMap: addOpenQuestion(s.workMap, String(p.topic ?? ""), p.case_id ? String(p.case_id) : undefined) }));
        return JSON.stringify({ ok: true });
      },
      close_topic: () => {
        this.dialogActive = false;
        this.lastActivity = Date.now();
        if (get().wrap === "running") this.complete();
        return JSON.stringify({ ok: true });
      },
    };
  }
}

export const capture = new CaptureController();
