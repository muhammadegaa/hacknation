import { capture } from "./controllers/capture";
import { tutor } from "./controllers/tutor";
import { set, useApp, type Screen } from "./state/store";
import { CaptureScreen } from "./ui/CaptureScreen";
import { CribSheet } from "./ui/CribSheet";
import { Landing } from "./ui/Landing";
import { MapScreen } from "./ui/MapScreen";
import { TutorScreen } from "./ui/TutorScreen";

const CRUMBS: { screen: Screen; label: string }[] = [
  { screen: "capture", label: "1  Capture" },
  { screen: "map", label: "2  Work Map" },
  { screen: "tutor", label: "3  Tutor" },
];

export default function App() {
  const { screen, workMap, voiceMode } = useApp();
  const haveMap = workMap.insights.length > 0;

  const go = (to: Screen) => {
    capture.end();
    tutor.end();
    set({ screen: to });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go("landing")} aria-label="Caveat AI home">
          <span className="brand-dot" /> Caveat <span className="brand-ai">AI</span>
        </button>
        <nav className="crumbs" aria-label="Stages">
          {CRUMBS.map((c) => (
            <button
              key={c.screen}
              className={`crumb ${screen === c.screen ? "active" : ""}`}
              disabled={c.screen === "map" ? !haveMap : c.screen === "capture" || c.screen === "tutor" ? screen !== c.screen : false}
              onClick={() => go(c.screen)}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {screen === "capture" && <CribSheet />}
        <span className={`pill ${voiceMode === "elevenlabs" ? "live" : "sim"}`}>
          <span className="dot" />
          {voiceMode === "elevenlabs" ? "ElevenLabs voice" : "Simulated voice"}
        </span>
      </header>
      {screen === "landing" && <Landing />}
      {screen === "capture" && <CaptureScreen />}
      {screen === "map" && <MapScreen />}
      {screen === "tutor" && <TutorScreen />}
    </div>
  );
}
