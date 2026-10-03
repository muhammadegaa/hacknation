import { timing } from "../config";
import { apScenario as S } from "../domain/scenario-ap";
import type { ActionType, AgentBridge, LookupKey } from "../domain/types";
import { tutorCaseObservation, tutorIntroCue, tutorLookupObservation, tutorMomentCue, tutorWrapCue } from "../engine/cues";
import { classifyTraineeAction } from "../engine/moments";
import { masteryByRule, overallScore, recordAttempt, recordHint, recordReasoning } from "../engine/tutor";
import { insightsForRule, serializeForLLM } from "../engine/workmap";
import { addTranscript, get, resetTutorState, set } from "../state/store";
import { makeBridge } from "../voice/factory";

/**
 * The Apprentice's work map, played back. The trainee works a fresh queue; the
 * tutor compares each decision to what the expert taught and coaches with a
 * hint ladder: ask first, reveal the expert's own words second.
 */
class TutorController {
  private bridge: AgentBridge | null = null;
  private queue: string[] = [];
  private dialogActive = false;
  private lastActivity = 0;
  private lastUserSpeech = 0;
  private tick: number | undefined;
  private settleTimer: number | undefined;
  private opened: Record<string, LookupKey[]> = {};

  async begin() {
    this.end();
    resetTutorState();
    this.queue = [];
    this.opened = {};
    this.dialogActive = false;
    set({ screen: "tutor" });

    const st = get();
    this.bridge = await makeBridge("tutor", st.voiceMode, st.settings.tutorAgentId, {
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

    try {
      await this.bridge.start({
        dynamicVariables: {
          trainee_name: st.settings.traineeName || "there",
          expert_name: S.expertName,
          expert_role: S.expertRole,
          company: S.company,
          workflow: S.workflow,
          work_map: serializeForLLM(st.workMap),
        },
        tools: this.tools(),
      });
      this.queue.push(tutorIntroCue(get().workMap, S.traineeCases.length));
      this.flush();
    } catch {
      /* status already surfaced */
    }
  }

  end() {
    if (this.tick) window.clearInterval(this.tick);
    this.tick = undefined;
    window.clearTimeout(this.settleTimer);
    void this.bridge?.stop();
    this.bridge = null;
  }

  // ----- trainee events -----------------------------------------------------

  openCase(i: number) {
    const tc = S.traineeCases[i];
    if (!tc) return false;
    set({ tutorIndex: i, tutorPhase: "practice", activeLookup: "po_receipt", focus: {} });
    if (get().bridgeStatus === "connected") this.bridge?.observe(tutorCaseObservation(tc, i, S.traineeCases.length));
    return true;
  }

  startPractice() {
    if (get().tutorIndex < 0) this.openCase(0);
  }

  nextCase() {
    const i = get().tutorIndex;
    if (i < S.traineeCases.length - 1) this.openCase(i + 1);
  }

  lookup(key: LookupKey) {
    const st = get();
    const tc = S.traineeCases[st.tutorIndex];
    if (!tc) return;
    set({ activeLookup: key });
    if (key === "po_receipt") return;
    const id = tc.invoice.id;
    this.opened[id] = [...(this.opened[id] ?? []), key];
    set((s) => ({ openedLookups: { ...s.openedLookups, [id]: this.opened[id] } }));
    if (st.bridgeStatus === "connected") this.bridge?.observe(tutorLookupObservation(tc.invoice, key));
  }

  decide(action: ActionType) {
    const st = get();
    const tc = S.traineeCases[st.tutorIndex];
    if (!tc) return;
    const id = tc.invoice.id;
    const progress = recordAttempt(st.progress, id, action);
    set({ progress, decisions: { ...st.decisions, [id]: action } });

    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.react(id), timing.traineeSettleMs);
  }

  private react(caseId: string) {
    const st = get();
    const tc = S.traineeCases.find((c) => c.invoice.id === caseId);
    const rec = st.progress[caseId];
    if (!tc || !rec) return;
    const attempt = rec.attempts.length;
    const action = rec.attempts[attempt - 1];
    const kind = classifyTraineeAction(action, tc.expectedAction, !!tc.trap, attempt);

    // Past the reveal there is nothing left to teach by cueing again.
    if (kind === "mistake" && attempt > 2) return;

    if (kind === "mistake") set({ progress: recordHint(get().progress, caseId) });
    const relevant = insightsForRule(st.workMap, S, tc.ruleKey);
    this.queue.push(
      tutorMomentCue(
        { caseId, kind, action, expected: tc.expectedAction, attempt },
        tc,
        relevant,
        this.opened[caseId] ?? [],
        st.workMap.steps.map((s) => s.id),
      ),
    );
    this.flush();
  }

  finish() {
    const st = get();
    if (st.tutorWrap !== "none") return;
    const score = overallScore(st.progress, S);
    const per = masteryByRule(st.progress, S).filter((r) => r.cases > 0);
    set({ tutorWrap: "running" });
    if (st.bridgeStatus !== "connected") {
      set({ tutorWrap: "done", tutorPhase: "done" });
      return;
    }
    this.queue.push(tutorWrapCue(score, per));
    this.flush();
  }

  // ----- policy -------------------------------------------------------------

  private flush() {
    const st = get();
    if (!this.bridge || st.bridgeStatus !== "connected") return;
    if (this.dialogActive && st.bridgeMode === "listening" && Date.now() - this.lastActivity > timing.dialogTimeoutMs) {
      this.dialogActive = false;
      if (st.tutorWrap === "running") set({ tutorWrap: "done", tutorPhase: "done" });
    }
    if (this.dialogActive || this.queue.length === 0 || st.bridgeMode !== "listening") return;
    if (Date.now() - this.lastUserSpeech < timing.userQuietMs) return;
    const text = this.queue.shift()!;
    this.dialogActive = true;
    this.lastActivity = Date.now();
    this.bridge.cue(text);
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

  // ----- tools --------------------------------------------------------------

  private tools() {
    return {
      show_on_map: (p: Record<string, unknown>) => {
        const stepId = p.step_id ? String(p.step_id) : undefined;
        const insightId = p.insight_id ? String(p.insight_id) : undefined;
        const insight = insightId ? get().workMap.insights.find((i) => i.id === insightId) : undefined;
        set({ focus: { stepId: stepId ?? insight?.stepId, insightId: insight?.id } });
        this.lastActivity = Date.now();
        return JSON.stringify({ ok: true });
      },
      record_assessment: (p: Record<string, unknown>) => {
        const r = String(p.reasoning ?? "");
        const reasoning = r === "sound" || r === "partial" || r === "unsound" ? r : "partial";
        set((s) => ({ progress: recordReasoning(s.progress, String(p.case_id ?? ""), reasoning, p.note ? String(p.note) : undefined) }));
        this.lastActivity = Date.now();
        return JSON.stringify({ ok: true });
      },
      next_case: () => {
        this.dialogActive = false;
        const i = get().tutorIndex;
        if (i >= S.traineeCases.length - 1)
          return JSON.stringify({ ok: false, message: "That was the last invoice. Give the debrief when asked." });
        this.openCase(i + 1);
        const tc = S.traineeCases[i + 1];
        return JSON.stringify({
          ok: true,
          message: `Case ${i + 2} of ${S.traineeCases.length} is on screen: ${tc.invoice.id}, ${tc.invoice.vendor}.`,
        });
      },
      close_topic: () => {
        this.dialogActive = false;
        this.lastActivity = Date.now();
        if (get().tutorWrap === "running") set({ tutorWrap: "done", tutorPhase: "done" });
        return JSON.stringify({ ok: true });
      },
    };
  }
}

export const tutor = new TutorController();
