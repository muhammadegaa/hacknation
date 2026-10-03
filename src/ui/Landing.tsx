import { capture } from "../controllers/capture";
import { tutor } from "../controllers/tutor";
import { apScenario as S } from "../domain/scenario-ap";
import { loadSeedMap, set, useApp } from "../state/store";

export function Landing() {
  const { voiceMode, settings, workMap, mapSource } = useApp();
  const haveMap = workMap.insights.length > 0;
  const voiceReady = !!settings.apprenticeAgentId && !!settings.tutorAgentId;
  const blocked = voiceMode === "elevenlabs" && !voiceReady;
  const upd = (patch: Partial<typeof settings>) => set({ settings: { ...settings, ...patch } });

  return (
    <div className="landing">
      <div className="hero">
        <div className="eyebrow">Hack-Nation · ElevenLabs · The AI Apprentice</div>
        <h1>
          The manual says one thing. Your best people do <em>another</em>.
        </h1>
        <p className="lede">
          Apprentice is a voice agent that shadows an expert, speaks only when their decision departs from the written procedure, and turns
          what they explain into a Work Map. A second voice agent then teaches a new hire from that map.
        </p>

        <div className="cta-row">
          <button className="btn primary" disabled={blocked} onClick={() => void capture.begin()} data-testid="start-capture">
            Shadow {S.expertName} (capture session)
          </button>
          <button
            className="btn"
            disabled={blocked}
            onClick={() => {
              if (!haveMap) loadSeedMap();
              void tutor.begin();
            }}
            data-testid="start-tutor"
          >
            Try the tutor{" "}
            {haveMap ? (mapSource === "captured" ? "with my captured map" : "with the saved map") : "with a saved example map"}
          </button>
          {haveMap && (
            <button className="btn ghost" onClick={() => set({ screen: "map" })}>
              View the last Work Map
            </button>
          )}
        </div>

        <div className="steps3">
          <div className="step3">
            <div className="n">01 · WATCH</div>
            <h3>It sees real decisions</h3>
            <p>
              An instrumented {S.title.toLowerCase()} feeds every lookup and click to Pip. It knows the written procedure as code, so it
              knows what a novice would have done.
            </p>
          </div>
          <div className="step3">
            <div className="n">02 · ASK</div>
            <h3>It asks at the right moment</h3>
            <p>
              Silent on routine cases. After a decision settles, if the expert broke the manual, checked something it never mentions,
              hesitated or reversed, Pip asks one specific question.
            </p>
          </div>
          <div className="step3">
            <div className="n">03 · TEACH</div>
            <h3>It plays it back, then teaches it</h3>
            <p>
              Each rule is read back for confirmation, then lands on the Work Map. The tutor coaches a new hire on fresh invoices, hinting
              before it reveals, and quoting the expert.
            </p>
          </div>
        </div>

        <div className="setup">
          <h3>Voice</h3>
          <div className="seg" role="group" aria-label="Voice mode">
            <button
              className={voiceMode === "elevenlabs" ? "on" : ""}
              onClick={() => set({ voiceMode: "elevenlabs" })}
              data-testid="mode-live"
            >
              ElevenLabs live voice
            </button>
            <button
              className={voiceMode === "simulated" ? "on" : ""}
              onClick={() => set({ voiceMode: "simulated" })}
              data-testid="mode-sim"
            >
              Simulated (no network)
            </button>
          </div>
          {voiceMode === "elevenlabs" && (
            <>
              <div className="fields">
                <div className="field">
                  <label htmlFor="a1">Apprentice agent id</label>
                  <input
                    id="a1"
                    value={settings.apprenticeAgentId}
                    onChange={(e) => upd({ apprenticeAgentId: e.target.value.trim() })}
                    placeholder="agent_…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="a2">Tutor agent id</label>
                  <input
                    id="a2"
                    value={settings.tutorAgentId}
                    onChange={(e) => upd({ tutorAgentId: e.target.value.trim() })}
                    placeholder="agent_…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="a3">Trainee name</label>
                  <input id="a3" value={settings.traineeName} onChange={(e) => upd({ traineeName: e.target.value })} />
                </div>
              </div>
              <p className="note">
                No ids yet? Run <code>ELEVENLABS_API_KEY=… npm run setup:agents</code> once. It creates both agents and writes the ids to{" "}
                <code>.env.local</code>. Your browser will ask for the microphone.
              </p>
            </>
          )}
          {voiceMode === "simulated" && (
            <p className="note">
              Templated questions and browser speech, no network. It speaks the same cue and tool protocol as the real agents, so it doubles
              as a failsafe and a test harness.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
