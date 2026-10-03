import { useState } from "react";
import { tutor } from "../controllers/tutor";
import { apScenario as S } from "../domain/scenario-ap";
import { caseScore, masteryByRule, overallScore, readiness } from "../engine/tutor";
import { ruleKeyOfInsight } from "../engine/workmap";
import { set, useApp } from "../state/store";
import { VoicePanel } from "./VoicePanel";
import { WorkMapView } from "./WorkMapView";
import { Workspace } from "./Workspace";

function Scorecard({ onClose }: { onClose: () => void }) {
  const { progress, workMap } = useApp();
  const score = overallScore(progress, S);
  const attempted = S.traineeCases.filter((c) => (progress[c.invoice.id]?.attempts.length ?? 0) > 0);
  const verdict = readiness(score, attempted.length);
  const label = { ready: "Ready for supervised work", supervised: "Needs a supervised first week", not_ready: "Not ready yet" }[verdict];
  return (
    <div className="score-overlay" role="dialog" aria-label="Scorecard" data-testid="scorecard">
      <div className="score-card">
        <div className="eyebrow">Practice results</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "6px 0 4px" }}>
          <div className="score-big" data-testid="score">
            {Math.round(score * 100)}%
          </div>
          <span className={`verdict ${verdict}`}>{label}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {attempted.length} of {S.traineeCases.length} invoices attempted. Scored 100% first time, 50% after a hint.
        </p>

        <h3 style={{ fontSize: 16, margin: "16px 0 4px" }}>By rule</h3>
        {masteryByRule(progress, S).map((r) => (
          <div key={r.key} className="rule-row">
            <span style={{ color: r.cases ? undefined : "var(--faint)" }}>{r.label}</span>
            <div className="meter">
              <i style={{ width: `${r.score * 100}%` }} />
            </div>
            <span className="mono">{r.cases ? `${Math.round(r.score * 100)}%` : "–"}</span>
          </div>
        ))}

        <h3 style={{ fontSize: 16, margin: "16px 0 4px" }}>By invoice</h3>
        {S.traineeCases.map((c) => {
          const rec = progress[c.invoice.id];
          const sc = caseScore(rec, c);
          return (
            <div key={c.invoice.id} style={{ display: "flex", gap: 10, fontSize: 13, margin: "4px 0" }}>
              <span className="mono" style={{ width: 70 }}>
                {c.invoice.id}
              </span>
              <span style={{ flex: 1 }}>{c.invoice.vendor}</span>
              <span className={sc === 1 ? "chip teal" : sc > 0 ? "chip amber" : "chip red"}>
                {!rec ? "skipped" : sc === 1 ? "first time" : sc > 0 ? "after a hint" : "missed"}
              </span>
              {rec?.reasoning && <span className="chip">{rec.reasoning} reasoning</span>}
            </div>
          );
        })}

        <div className="maprow" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={() => void tutor.begin()}>
            Practice again
          </button>
          <button
            className="btn"
            onClick={() => {
              tutor.end();
              set({ screen: workMap.insights.length ? "map" : "landing" });
            }}
          >
            Back to the Work Map
          </button>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorScreen() {
  const s = useApp();
  const [showScore, setShowScore] = useState(false);
  const tc = S.traineeCases[s.tutorIndex];
  const connected = s.bridgeStatus === "connected";
  const rec = tc ? s.progress[tc.invoice.id] : undefined;
  const attempts = rec?.attempts ?? [];
  const lastOk = attempts.length > 0 && attempts[attempts.length - 1] === tc?.expectedAction;
  const doneCount = S.traineeCases.filter((c) => (s.progress[c.invoice.id]?.attempts.length ?? 0) > 0).length;
  const isLast = s.tutorIndex === S.traineeCases.length - 1;
  const showCard = showScore || s.tutorPhase === "done";

  // Orientation shows the whole map. Practice locks each rule until the trainee has tried a related invoice.
  const attemptedRules = new Set(S.traineeCases.filter((c) => (s.progress[c.invoice.id]?.attempts.length ?? 0) > 0).map((c) => c.ruleKey));
  const practiceRules = new Set(S.traineeCases.map((c) => c.ruleKey));
  const locked = new Set(
    s.tutorIndex < 0
      ? []
      : s.workMap.insights
          .filter((i) => {
            const k = ruleKeyOfInsight(i, S);
            return k && practiceRules.has(k) && !attemptedRules.has(k) && s.focus.insightId !== i.id;
          })
          .map((i) => i.id),
  );

  return (
    <div className="split">
      <div className="pane">
        {!tc ? (
          <div className="card inv" data-testid="tutor-intro">
            <div className="eyebrow">Orientation</div>
            <h2 style={{ fontSize: 26, margin: "6px 0 8px" }}>Pip is walking you through {S.expertName}'s map</h2>
            <p className="muted">
              Listen to the walkthrough on the right: Pip highlights each step as it goes. When you're ready, practise on{" "}
              {S.traineeCases.length} fresh invoices. Pip stays quiet unless you get one wrong or it's a trap.
            </p>
            <button className="btn primary" onClick={() => tutor.startPractice()} data-testid="start-practice">
              Start practice
            </button>
          </div>
        ) : (
          <Workspace
            title="Practice queue"
            invoice={tc.invoice}
            index={s.tutorIndex}
            total={S.traineeCases.length}
            doneCount={doneCount - (attempts.length ? 1 : 0)}
            decision={s.decisions[tc.invoice.id]}
            grade={(a) => (attempts.includes(a) ? (a === tc.expectedAction ? "good" : "bad") : undefined)}
            opened={s.openedLookups[tc.invoice.id] ?? []}
            active={s.activeLookup ?? "po_receipt"}
            onLookup={(k) => tutor.lookup(k)}
            onDecide={(a) => tutor.decide(a)}
            presence={connected ? "Pip is coaching" : s.bridgeStatus === "connecting" ? "Connecting…" : "Pip is offline"}
          >
            <div className="ws-foot">
              <span className="grow muted" style={{ fontSize: 12.5 }}>
                {attempts.length === 0 ? `Decide, ${s.settings.traineeName}.` : lastOk ? "Right call." : "Not quite. Pip will help."}
              </span>
              {!isLast && (
                <button className="btn" onClick={() => tutor.nextCase()} disabled={attempts.length === 0} data-testid="next-case">
                  Next invoice
                </button>
              )}
              <button
                className={`btn ${isLast && attempts.length ? "primary" : ""}`}
                onClick={() => {
                  tutor.finish();
                  setShowScore(true);
                }}
                disabled={doneCount === 0}
                data-testid="finish-practice"
              >
                Finish and score
              </button>
            </div>
          </Workspace>
        )}
      </div>

      <div className="pane pane-right">
        <VoicePanel
          name="Pip, the Tutor"
          role="tutor"
          sendText={(t) => tutor.sendText(t)}
          setMuted={(m) => tutor.setMuted(m)}
          level={() => tutor.level()}
          onEnd={() => {
            tutor.end();
            set({ screen: "map" });
          }}
          stats={
            <span>
              Teaching from <b>{s.workMap.insights.length}</b> rules {s.mapSource === "seed" ? "(saved example)" : "(captured)"}
            </span>
          }
        />
        <div className="mapwrap">
          <WorkMapView map={s.workMap} focus={s.focus} newIds={[]} expert={S.expertName} locked={locked} />
        </div>
      </div>
      {showCard && <Scorecard onClose={() => setShowScore(false)} />}
    </div>
  );
}
