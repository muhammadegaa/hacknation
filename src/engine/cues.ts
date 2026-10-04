import { actionLabel, lookupContent, lookupLabel } from "../domain/scenario-ap";
import type { Insight, Invoice, LookupKey, Moment, Scenario, TraineeCaseSpec, WorkMap } from "../domain/types";
import type { TraineeMoment } from "./moments";
import { knownRulesLine } from "./workmap";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export function invoiceFacts(inv: Invoice): string {
  const v = inv.poAmount ? ((inv.amount - inv.poAmount) / inv.poAmount) * 100 : null;
  return [
    `${inv.id} · ${inv.vendor} (${inv.vendorNote})`,
    `amount ${gbp(inv.amount)}, ${inv.poNumber ? `PO ${inv.poNumber} ${gbp(inv.poAmount!)}${v != null ? ` (variance ${v >= 0 ? "+" : ""}${v.toFixed(1)}%)` : ""}` : "no PO"}`,
    `receipt: ${inv.receipt}, terms: ${inv.terms}, due ${inv.dueDate}`,
    `for: ${inv.description}`,
  ].join("; ");
}

function lookupDump(inv: Invoice, keys: LookupKey[]): string {
  const seen = keys.filter((k, i) => keys.indexOf(k) === i);
  if (seen.length === 0) return "none";
  return seen.map((k) => `${lookupContent(inv, k).title}: ${lookupContent(inv, k).lines.join(" / ")}`).join(" | ");
}

const TAG = "[[WORKSPACE]]";

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** The evidence behind a question, in plain language, so the expert can see why Pip spoke. */
export function explainMoment(m: Moment): string[] {
  const out: string[] = [];
  if (m.signals.includes("sop_deviation")) out.push(`You chose ${actionLabel[m.action]}. The written procedure says ${actionLabel[m.sopAction]}.`);
  if (m.unpromptedLookups.length) out.push(`You opened ${m.unpromptedLookups.map((k) => lookupLabel[k]).join(" and ")}, which the procedure never mentions.`);
  if (m.signals.includes("reversal")) out.push("You changed your decision.");
  if (m.signals.includes("hesitation")) out.push(`It took you ${Math.round(m.dwellMs / 1000)} seconds to decide.`);
  return out;
}

export function openedObservation(inv: Invoice): string {
  return `${TAG} OBSERVE. The expert opened ${invoiceFacts(inv)}.`;
}

export function lookupObservation(inv: Invoice, key: LookupKey): string {
  const l = lookupContent(inv, key);
  return `${TAG} OBSERVE. On ${inv.id} the expert opened "${l.title}": ${l.lines.join(" / ")}`;
}

export function routineObservation(inv: Invoice, action: string): string {
  return `${TAG} OBSERVE. ${inv.id} was routine: the expert chose ${action}, exactly what the written procedure says, with nothing unusual. Do not ask about it.`;
}

export function captureAskCue(m: Moment, inv: Invoice, s: Scenario, map: WorkMap, openedLookups: LookupKey[]): string {
  const lines = [
    `${TAG} ASK`,
    `case: ${invoiceFacts(inv)}`,
    `the expert chose: ${actionLabel[m.action].toUpperCase()}`,
    `the written procedure would have chosen: ${actionLabel[m.sopAction].toUpperCase()}`,
    `signals: ${m.signals.map((x) => x.replace(/_/g, " ")).join(", ")}${m.dwellMs >= s.hesitationMs ? ` (took ${Math.round(m.dwellMs / 1000)} seconds)` : ""}`,
    `lookups the expert opened before deciding: ${lookupDump(inv, openedLookups)}`,
    `rules captured so far: ${knownRulesLine(map)}`,
    `Task: say one short, specific opening observation about what you just watched, then ask ONE question that probes the judgment behind it. If a captured rule already explains this decision, do not re-ask: confirm in one line that it is the same rule and call close_topic.`,
  ];
  return lines.join("\n");
}

export function wrapCue(map: WorkMap, casesDone: number): string {
  return [
    `${TAG} WRAP`,
    `The queue is finished (${casesDone} cases observed). Rules captured: ${map.insights.length}. Open questions: ${map.openQuestions.length}.`,
    `Task: run the closing sweep. Ask the expert, one at a time, what would trip up a new hire that did not come up today. Cover: the most expensive mistake, things that look wrong but are fine, and who a new hire should ask. Record answers with record_insight. When done, thank them in one sentence and call close_topic.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

export function tutorCaseObservation(tc: TraineeCaseSpec, index: number, total: number): string {
  return `${TAG} OBSERVE. Case ${index + 1} of ${total} is now on the trainee's screen: ${invoiceFacts(tc.invoice)}. The trainee has not decided yet. Stay quiet unless they speak to you.`;
}

export function tutorLookupObservation(inv: Invoice, key: LookupKey): string {
  const l = lookupContent(inv, key);
  return `${TAG} OBSERVE. The trainee opened "${l.title}" on ${inv.id}: ${l.lines.join(" / ")}`;
}

function relevantLine(ins: Insight[]): string {
  if (ins.length === 0)
    return "none captured for this situation (teach from the written procedure and say the expert has not explained this yet)";
  return ins.map((i) => `${i.id} "${i.title}"`).join("; ");
}

export function tutorMomentCue(
  m: TraineeMoment,
  tc: TraineeCaseSpec,
  relevant: Insight[],
  openedLookups: LookupKey[],
  mapStepIds: string[],
): string {
  const base = [
    `${TAG} ${m.kind === "mistake" ? "MISTAKE" : m.kind === "trap_avoided" ? "PROBE" : "PRAISE"}`,
    `case: ${invoiceFacts(tc.invoice)}`,
    `the trainee chose: ${actionLabel[m.action].toUpperCase()} (attempt ${m.attempt})`,
    `the correct decision: ${actionLabel[m.expected].toUpperCase()}`,
    `why: ${tc.expectedWhy}`,
    `relevant captured rules: ${relevantLine(relevant)}`,
    `lookups the trainee opened: ${lookupDump(tc.invoice, openedLookups)}`,
    `step ids available for show_on_map: ${mapStepIds.join(", ")}`,
  ];
  if (m.kind === "mistake") {
    base.push(
      m.attempt <= 1
        ? `Task: do NOT reveal the answer yet. Ask one Socratic question that points at what they should have checked or noticed (name the lookup or the detail, not the rule). Keep it under 25 words.`
        : `Task: they are still wrong after a hint. Now reveal the rule: quote the expert's own words from the work map, call show_on_map with the insight id, and say the correct decision. Then ask them to restate the rule.`,
    );
  } else if (m.kind === "trap_avoided") {
    base.push(
      `Task: they got it right, but this case is a trap that looks like another rule. Say "right call" in two words, then ask them to explain what separated this from the similar case. Judge their answer and call record_assessment.`,
    );
  } else {
    base.push(`Task: one short sentence of praise that names the rule they applied. Then call record_assessment. Do not lecture.`);
  }
  return base.join("\n");
}

export function tutorIntroCue(map: WorkMap, total: number): string {
  return [
    `${TAG} START`,
    `The trainee is ready. The practice queue has ${total} invoices. The work map has ${map.steps.length} steps and ${map.insights.length} rules.`,
    `Task: greet the trainee in one sentence, then give a 30-second orientation: the written procedure is the starting point, and ${map.expertName} has taught you where it falls short. Walk the map step by step, calling show_on_map for each step you mention and spending most of your time on steps that carry rules. Stop after the walkthrough and call next_case to start practice.`,
  ].join("\n");
}

export function tutorWrapCue(score: number, perRule: { label: string; score: number }[]): string {
  return [
    `${TAG} WRAP`,
    `Practice is over. Overall score ${(score * 100).toFixed(0)}%.`,
    `By rule: ${perRule.map((r) => `${r.label}: ${(r.score * 100).toFixed(0)}%`).join("; ")}`,
    `Task: give a two-sentence verbal debrief naming their strongest and weakest rule, then say who to ask for the weak one. Then call close_topic.`,
  ].join("\n");
}
