import { useState } from "react";
import { actionLabel, apScenario as S } from "../domain/scenario-ap";

/**
 * Demo helper. The presenter is not a 14-year AP analyst, so this is Maria's
 * knowledge on a card to read from. It is never sent to the agent.
 */
export function CribSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="crib">
        <button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="crib-toggle">
          {open ? "Hide" : "Demo crib sheet"}
        </button>
      </div>
      {open && (
        <div className="crib-panel" role="dialog" aria-label="Demo crib sheet">
          <b>Playing {S.expertName}.</b>{" "}
          <span className="muted">Do what she does, then say what she says when Pip asks. Pip never sees this.</span>
          {S.captureCases.map((c) => (
            <div key={c.invoice.id}>
              <h4>
                {c.invoice.id} · {c.invoice.vendor} → <span style={{ color: "var(--amber)" }}>{actionLabel[c.expertAction]}</span>
              </h4>
              <p>{c.ruleKey ? c.expertSays : `Routine. ${c.expertSays} (Pip should stay silent.)`}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
