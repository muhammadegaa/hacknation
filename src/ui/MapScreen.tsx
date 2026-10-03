import { tutor } from "../controllers/tutor";
import { apScenario as S } from "../domain/scenario-ap";
import { benchmark, mapSummary, toMarkdown } from "../engine/workmap";
import { loadSeedMap, set, useApp } from "../state/store";
import { WorkMapView } from "./WorkMapView";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function MapScreen() {
  const { workMap: map, mapSource, newInsightIds } = useApp();
  const sum = mapSummary(map);
  const b = benchmark(map, S);
  const empty = map.insights.length === 0;

  return (
    <div className="mapscreen">
      <div className="mapin">
        <div className="eyebrow">{mapSource === "seed" ? "Saved example from Maria" : "Captured work map"}</div>
        <h2 style={{ fontSize: 34, margin: "6px 0 4px" }}>What the manual says vs. what {S.expertName} actually does</h2>
        <p className="muted" style={{ maxWidth: "46em", margin: 0 }}>
          {map.workflow} at {map.company}. Every rule below was said aloud by {map.expertName}, tied to the exact invoice that prompted it,
          and played back to her for confirmation.
        </p>

        <div className="kpis">
          <div className="kpi">
            <div className="big">{sum.documentedSteps}</div>
            <div className="lbl">steps in the written procedure</div>
          </div>
          <div className="kpi hl">
            <div className="big" data-testid="kpi-hidden">
              +{sum.hiddenSteps}
            </div>
            <div className="lbl">hidden steps discovered</div>
          </div>
          <div className="kpi hl">
            <div className="big" data-testid="kpi-rules">
              {sum.rules}
            </div>
            <div className="lbl">
              rules and judgment calls, {sum.verified} verified by {map.expertName}
            </div>
          </div>
          <div className="kpi">
            <div className="big">
              {map.stats.questionsAsked}
              <small> / {map.stats.casesObserved}</small>
            </div>
            <div className="lbl">questions asked across cases; silent on {map.stats.silentCases} routine</div>
          </div>
        </div>

        {!empty && (
          <>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>
              Benchmark: seeded hidden rules found{" "}
              <span className={`chip ${b.missed.length ? "amber" : "teal"}`} data-testid="bench-score">
                {b.found.length} of {b.total}
              </span>
            </h3>
            <div className="bench">
              {b.found.map((r) => (
                <div key={r.key}>
                  <span className="y">✓</span> {r.label}
                </div>
              ))}
              {b.missed.map((r) => (
                <div key={r.key}>
                  <span className="n">✗</span> <span className="muted">{r.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="maprow">
          <button
            className="btn primary"
            data-testid="teach"
            onClick={() => {
              if (empty) loadSeedMap();
              void tutor.begin();
            }}
          >
            Teach a new hire with this map
          </button>
          {mapSource === "captured" && b.missed.length > 0 && (
            <button
              className="btn"
              data-testid="teach-full"
              onClick={() => {
                loadSeedMap();
                void tutor.begin();
              }}
            >
              Teach with Maria's full example map
            </button>
          )}
          <button
            className="btn"
            disabled={empty}
            onClick={() => download("work-map.json", JSON.stringify(map, null, 2), "application/json")}
          >
            Download JSON
          </button>
          <button className="btn" disabled={empty} onClick={() => download("playbook.md", toMarkdown(map), "text/markdown")}>
            Download playbook (.md)
          </button>
          <button className="btn ghost" onClick={() => set({ screen: "landing" })}>
            Back
          </button>
        </div>

        <WorkMapView map={map} focus={{}} newIds={newInsightIds} expert={map.expertName} />
      </div>
    </div>
  );
}
