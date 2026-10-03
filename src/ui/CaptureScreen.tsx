import { capture } from "../controllers/capture";
import { apScenario as S } from "../domain/scenario-ap";
import { useApp, set } from "../state/store";
import { CribSheet } from "./CribSheet";
import { VoicePanel } from "./VoicePanel";
import { WorkMapView } from "./WorkMapView";
import { Workspace } from "./Workspace";

export function CaptureScreen() {
  const s = useApp();
  const c = S.captureCases[s.caseIndex];
  const id = c.invoice.id;
  const isLast = s.caseIndex === S.captureCases.length - 1;
  const decided = s.decisions[id] !== undefined;
  const doneCount = Object.keys(s.decisions).length;
  const connected = s.bridgeStatus === "connected";

  const retrySimulated = () => {
    set({ voiceMode: "simulated" });
    void capture.begin();
  };

  return (
    <div className="split">
      <div className="pane">
        {s.bridgeStatus === "error" && (
          <div className="hint-banner" role="alert" style={{ marginBottom: 12 }}>
            Voice connection failed{s.bridgeDetail ? `: ${s.bridgeDetail}` : ""}.{" "}
            <button className="btn sm" onClick={retrySimulated}>
              Continue in simulated mode
            </button>
          </div>
        )}
        <Workspace
          title="Exceptions queue"
          invoice={c.invoice}
          index={s.caseIndex}
          total={S.captureCases.length}
          doneCount={doneCount}
          decision={s.decisions[id]}
          opened={s.openedLookups[id] ?? []}
          active={s.activeLookup ?? "po_receipt"}
          onLookup={(k) => capture.lookup(k)}
          onDecide={(a) => capture.decide(a)}
          presence={connected ? "Pip is watching" : s.bridgeStatus === "connecting" ? "Connecting…" : "Pip is offline"}
        >
          <div className="ws-foot">
            {s.wrap === "done" ? (
              <>
                <span className="grow">
                  <b>Capture complete.</b> <span className="muted">Pip has what it needs.</span>
                </span>
                <button
                  className="btn primary"
                  data-testid="view-map"
                  onClick={() => {
                    capture.end();
                    set({ screen: "map" });
                  }}
                >
                  View the Work Map
                </button>
              </>
            ) : (
              <>
                <span className="grow muted" style={{ fontSize: 12.5 }}>
                  {s.wrap === "none" ? "Work as you normally would." : "Wrapping up with Pip…"}
                </span>
                {!isLast && (
                  <button
                    className="btn"
                    onClick={() => capture.next()}
                    disabled={!decided || s.wrap !== "none"}
                    data-testid="next-invoice"
                  >
                    Next invoice
                  </button>
                )}
                <button
                  className={`btn ${isLast && decided ? "primary" : ""}`}
                  onClick={() => capture.finish()}
                  disabled={doneCount === 0 || s.wrap !== "none"}
                  data-testid="finish-capture"
                >
                  Finish capture
                </button>
              </>
            )}
          </div>
        </Workspace>
      </div>

      <div className="pane pane-right">
        <VoicePanel
          name="Pip, the Apprentice"
          role="apprentice"
          sendText={(t) => capture.sendText(t)}
          setMuted={(m) => capture.setMuted(m)}
          level={() => capture.level()}
          onEnd={() => {
            capture.end();
            set({ screen: s.workMap.insights.length ? "map" : "landing" });
          }}
          stats={
            <>
              <span>
                Asked <b data-testid="asked-count">{s.asked.length}</b>
              </span>
              <span>
                Stayed quiet on <b data-testid="silent-count">{s.silent.length}</b>
              </span>
            </>
          }
        />
        <div className="mapwrap">
          <WorkMapView map={s.workMap} focus={s.focus} newIds={s.newInsightIds} expert={S.expertName} />
        </div>
      </div>
      <CribSheet />
    </div>
  );
}
