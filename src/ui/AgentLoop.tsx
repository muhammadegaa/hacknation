import { capture } from "../controllers/capture";
import { apScenario as S } from "../domain/scenario-ap";
import { useApp, type Stage } from "../state/store";

const STEPS: { id: Stage; label: string; hint: string }[] = [
  { id: "observe", label: "Observe", hint: "Pip watches your lookups and decisions." },
  { id: "notice", label: "Notice", hint: "Pip compares your decision with the written procedure." },
  { id: "ask", label: "Ask", hint: "Pip asks one question, only if you broke the procedure." },
  { id: "verify", label: "Verify", hint: "Pip reads the rule back so you can confirm or correct it." },
];

/**
 * Pip's loop made visible. An agent that acts on your behalf should show what
 * it perceives, what it decided, why, and give you a way to stop it.
 */
export function AgentLoop() {
  const { stage, why, paused, coachNote, wrap, bridgeStatus, decisions, caseIndex } = useApp();
  const decided = decisions[S.captureCases[caseIndex].invoice.id] !== undefined;
  const dialog = stage === "ask" || stage === "verify";

  let line: string;
  if (bridgeStatus === "connecting") line = "Connecting Pip…";
  else if (wrap === "running") line = "Last question: what would trip up a new hire?";
  else if (wrap === "done") line = "Capture complete. Pip has what it needs.";
  else if (stage === "notice") line = "Checking your decision against the manual…";
  else if (stage === "ask") line = "Pip has a question. Answer out loud, or type it on the right.";
  else if (stage === "verify") line = "Pip wrote this down. Confirm or correct it on the right.";
  else if (coachNote) line = coachNote;
  else line = decided ? "Decision logged." : "Work this invoice the way you normally would. Pip is listening.";

  const current = STEPS.findIndex((s) => s.id === stage);

  return (
    <section className="loop" data-testid="coach" data-stage={stage} aria-label="What Pip is doing">
      <div className="loop-row">
        <ol className="stepper" aria-label="Pip's loop">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={i === current ? "now" : i < current ? "past" : ""}
              title={s.hint}
              aria-current={i === current ? "step" : undefined}
            >
              {s.label}
            </li>
          ))}
        </ol>
        <p className="loop-line" data-testid="coach-line" aria-live="polite">
          {line}
        </p>
        <div className="loop-actions">
          {dialog && (
            <button
              className="btn sm"
              onClick={() => capture.skipTopic()}
              data-testid="skip-topic"
              title="Drop this question. Pip will not ask about this invoice."
            >
              Not now
            </button>
          )}
          <button
            className={`btn sm ${paused ? "on" : ""}`}
            onClick={() => capture.setPaused(!paused)}
            aria-pressed={paused}
            data-testid="pause"
            title="Pip keeps watching but stops asking."
          >
            {paused ? "Resume Pip" : "Pause Pip"}
          </button>
        </div>
      </div>
      {stage === "ask" && why.length > 0 && (
        <div className="why" data-testid="why">
          <span className="why-h">Why Pip asked</span>
          <ul>
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
