import { useEffect, useRef, useState } from "react";
import type { Insight, WorkMap } from "../domain/types";
import { KIND_LABEL, mapSummary } from "../engine/workmap";

interface Props {
  map: WorkMap;
  focus: { stepId?: string; insightId?: string };
  newIds: string[];
  /** Show the expert's name in status labels. */
  expert: string;
  /** Insight ids withheld from view (tutor practice: no peeking at answers). */
  locked?: Set<string>;
  /** "compact" shows the essentials and opens a rule only when it is new or focused. "full" opens everything. */
  variant?: "compact" | "full";
  /** Human control over a captured rule. Offered only while a rule is unverified. */
  onConfirm?: (id: string) => void;
  onDiscard?: (id: string) => void;
}

function InsightCard({
  i,
  focus,
  isNew,
  expert,
  variant,
  onConfirm,
  onDiscard,
}: {
  i: Insight;
  focus: boolean;
  isNew: boolean;
  expert: string;
  variant: "compact" | "full";
  onConfirm?: (id: string) => void;
  onDiscard?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (variant === "full" || focus);

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
  const hasMore = !!(i.rationale || i.unless || i.correction || i.sourceQuote);
  const manual = i.status === "proposed" && (onConfirm || onDiscard);

  return (
    <div
      ref={ref}
      className={`ins k-${i.kind} ${isNew ? "new" : ""} ${focus ? "focus" : ""} ${open ? "open" : "shut"}`}
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
            <dd className={open ? "" : "clamp"}>{i.condition}</dd>
          </>
        )}
        {i.action && (
          <>
            <dt>THEN</dt>
            <dd className={open ? "" : "clamp"}>{i.action}</dd>
          </>
        )}
        {open && i.rationale && (
          <>
            <dt>BECAUSE</dt>
            <dd>{i.rationale}</dd>
          </>
        )}
        {open && i.unless && (
          <>
            <dt>UNLESS</dt>
            <dd>{i.unless}</dd>
          </>
        )}
        {open && i.correction && (
          <>
            <dt>FIXED</dt>
            <dd>{i.correction}</dd>
          </>
        )}
      </dl>
      {open && i.sourceQuote && <blockquote className="quote">“{i.sourceQuote}”</blockquote>}
      <div className="ins-foot">
        <span className="mono">
          {i.id}
          {i.caseId ? ` · from ${i.caseId}` : ""}
        </span>
        <span className="grow" />
        {manual && onDiscard && (
          <button
            className="btn sm ghost"
            onClick={() => onDiscard(i.id)}
            data-testid="discard-rule"
            title="This rule is wrong. Remove it."
          >
            Discard
          </button>
        )}
        {manual && onConfirm && (
          <button className="btn sm" onClick={() => onConfirm(i.id)} data-testid="confirm-rule" title="This is right. Mark it verified.">
            Confirm
          </button>
        )}
        {variant === "compact" && hasMore && (
          <button className="btn sm ghost" onClick={() => setUserOpen(!open)} aria-expanded={open}>
            {open ? "Less" : "Details"}
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkMapView({ map, focus, newIds, expert, locked, variant = "compact", onConfirm, onDiscard }: Props) {
  const sum = mapSummary(map);
  const compact = variant === "compact";
  const visible = (id: string) => !locked?.has(id);
  const lockedCount = map.insights.filter((i) => locked?.has(i.id)).length;
  const shown = map.insights.filter((i) => visible(i.id));
  const empty = map.insights.length === 0;

  return (
    <div data-testid="workmap">
      <div className="wm-head">
        <h3>Work Map</h3>
        <div className="delta">
          {!compact && <span className="chip teal">{sum.documentedSteps} documented steps</span>}
          {(!compact || sum.hiddenSteps > 0) && (
            <span className="chip amber" data-testid="hidden-steps">
              {sum.hiddenSteps} hidden {sum.hiddenSteps === 1 ? "step" : "steps"}
            </span>
          )}
          <span className="chip" data-testid="rule-count">
            {sum.rules} {sum.rules === 1 ? "rule" : "rules"} · {sum.verified} verified
          </span>
          {lockedCount > 0 && (
            <span className="chip" data-testid="locked-count" title="Try a related invoice and Pip will unlock the rule.">
              {lockedCount} locked
            </span>
          )}
        </div>
      </div>

      {empty && (
        <div className="wm-empty">
          Nothing captured yet.
          <br />
          Each caveat appears here the moment {expert} explains it.
        </div>
      )}

      <div className="flow">
        {map.steps.map((s) => {
          const ins = shown.filter((i) => i.stepId === s.id);
          const slim = compact && s.documented && ins.length === 0 && focus.stepId !== s.id;
          return (
            <div
              key={s.id}
              className={`node ${s.documented ? "" : "hidden"} ${focus.stepId === s.id ? "focus" : ""} ${slim ? "slim" : ""}`}
              data-testid="step"
              data-step-id={s.id}
            >
              <div className="bullet">{s.id}</div>
              <div className="node-body">
                <div className="node-title">
                  <b>{s.label}</b>
                  {!s.documented && <span className="tag-hidden">Not in the manual</span>}
                </div>
                {!slim && <div className="node-desc">{s.description}</div>}
                {ins.length > 0 && (
                  <div className="insights">
                    {ins.map((i) => (
                      <InsightCard
                        key={i.id}
                        i={i}
                        focus={focus.insightId === i.id}
                        isNew={newIds.includes(i.id)}
                        expert={expert}
                        variant={variant}
                        onConfirm={onConfirm}
                        onDiscard={onDiscard}
                      />
                    ))}
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
