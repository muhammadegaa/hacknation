import { useEffect, useRef } from "react";
import type { Insight, WorkMap } from "../domain/types";
import { KIND_LABEL, mapSummary } from "../engine/workmap";

interface Props {
  map: WorkMap;
  focus: { stepId?: string; insightId?: string };
  newIds: string[];
  /** Show the expert's name in status labels. */
  expert: string;
  /** Insight ids shown as locked placeholders (tutor practice: no peeking at answers). */
  locked?: Set<string>;
}

function InsightCard({ i, focus, isNew, expert }: { i: Insight; focus: boolean; isNew: boolean; expert: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);
  const status =
    i.status === "confirmed" ? (
      <span className="status ok">Verified by {expert}</span>
    ) : i.status === "corrected" ? (
      <span className="status warn">Corrected by {expert}</span>
    ) : (
      <span className="status">
        <span className="pulse" /> Waiting for {expert} to confirm
      </span>
    );
  return (
    <div
      ref={ref}
      className={`ins k-${i.kind} ${isNew ? "new" : ""} ${focus ? "focus" : ""}`}
      data-testid="insight"
      data-insight-id={i.id}
      data-kind={i.kind}
    >
      <div className="ins-top">
        <span className="kind">{KIND_LABEL[i.kind]}</span>
        {i.severity === "hard_stop" && <span className="chip red">Hard stop</span>}
        {status}
      </div>
      <div className="ins-title">{i.title}</div>
      <dl className="rows">
        {i.condition && (
          <>
            <dt>WHEN</dt>
            <dd>{i.condition}</dd>
          </>
        )}
        {i.action && (
          <>
            <dt>THEN</dt>
            <dd>{i.action}</dd>
          </>
        )}
        {i.rationale && (
          <>
            <dt>BECAUSE</dt>
            <dd>{i.rationale}</dd>
          </>
        )}
        {i.unless && (
          <>
            <dt>UNLESS</dt>
            <dd>{i.unless}</dd>
          </>
        )}
        {i.correction && (
          <>
            <dt>FIXED</dt>
            <dd>{i.correction}</dd>
          </>
        )}
      </dl>
      {i.sourceQuote && <blockquote className="quote">“{i.sourceQuote}”</blockquote>}
      <div className="ins-foot">
        <span className="mono">{i.id}</span>
        {i.caseId && <span className="mono">from {i.caseId}</span>}
      </div>
    </div>
  );
}

export function WorkMapView({ map, focus, newIds, expert, locked }: Props) {
  const sum = mapSummary(map);
  return (
    <div data-testid="workmap">
      <div className="wm-head">
        <h3>Work Map</h3>
        <div className="delta">
          <span className="chip teal">{sum.documentedSteps} documented steps</span>
          <span className="chip amber" data-testid="hidden-steps">
            {sum.hiddenSteps} hidden {sum.hiddenSteps === 1 ? "step" : "steps"}
          </span>
          <span className="chip" data-testid="rule-count">
            {sum.rules} {sum.rules === 1 ? "rule" : "rules"} · {sum.verified} verified
          </span>
        </div>
      </div>

      {map.insights.length === 0 && map.steps.every((s) => s.documented) && (
        <div className="wm-empty">Nothing captured yet. The map fills in as {expert} explains their decisions.</div>
      )}

      <div className="flow">
        {map.steps.map((s) => {
          const ins = map.insights.filter((i) => i.stepId === s.id);
          return (
            <div
              key={s.id}
              className={`node ${s.documented ? "" : "hidden"} ${focus.stepId === s.id ? "focus" : ""}`}
              data-testid="step"
              data-step-id={s.id}
            >
              <div className="bullet">{s.id}</div>
              <div className="node-body">
                <div className="node-title">
                  <b>{s.label}</b>
                  {!s.documented && <span className="tag-hidden">Not in the manual</span>}
                </div>
                <div className="node-desc">{s.description}</div>
                {ins.length > 0 && (
                  <div className="insights">
                    {ins.map((i) =>
                      locked?.has(i.id) ? (
                        <div key={i.id} className={`ins locked k-${i.kind}`} data-testid="locked-insight">
                          <span className="kind">{KIND_LABEL[i.kind]}</span>{" "}
                          <span className="muted">Locked. Try a related invoice and Pip will unlock it.</span>
                        </div>
                      ) : (
                        <InsightCard key={i.id} i={i} focus={focus.insightId === i.id} isNew={newIds.includes(i.id)} expert={expert} />
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {map.openQuestions.length > 0 && (
        <div className="open-q">
          <b>Still unclear:</b>
          <ul>
            {map.openQuestions.map((q) => (
              <li key={q.id}>{q.topic}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
