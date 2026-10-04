import { useEffect, useRef, useState } from "react";
import type { BridgeMode } from "../domain/types";
import { useApp } from "../state/store";

interface Props {
  name: string;
  role: "apprentice" | "tutor";
  sendText: (t: string) => void;
  setMuted: (m: boolean) => void;
  level: () => number;
  onEnd: () => void;
  stats?: React.ReactNode;
}

function Orb({ mode, level }: { mode: BridgeMode; level: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const l = mode === "speaking" ? Math.min(1, level() * 1.7) : 0;
      ref.current?.style.setProperty("--lvl", String(l));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [mode, level]);
  return (
    <div className="orb-wrap" aria-hidden>
      <div ref={ref} className={`orb ${mode}`} />
      <div className="orb-ring" />
    </div>
  );
}

function stateLabel(role: Props["role"], status: string, mode: BridgeMode, detail?: string) {
  if (status === "connecting") return "Connecting…";
  if (status === "error") return `Connection problem${detail ? `: ${detail}` : ""}`;
  if (status === "ended") return "Session ended";
  if (mode === "speaking") return "Speaking";
  if (mode === "thinking") return role === "apprentice" ? "Thinking of a question…" : "Thinking…";
  return role === "apprentice" ? "Watching quietly" : "Listening";
}

export function VoicePanel(p: Props) {
  const { bridgeStatus, bridgeMode, bridgeDetail, transcript, muted } = useApp();
  const [text, setText] = useState("");
  const [full, setFull] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript.length, full]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    p.sendText(text.trim());
    setText("");
  };

  return (
    <section className="card voice" aria-label={`${p.name} voice agent`} data-testid="voice-panel">
      <div className="voice-top">
        <Orb mode={bridgeStatus === "connected" ? bridgeMode : "listening"} level={p.level} />
        <div className="voice-meta">
          <div className="voice-name">{p.name}</div>
          <div className="voice-state" data-testid="voice-state" aria-live="polite">
            {stateLabel(p.role, bridgeStatus, bridgeMode, bridgeDetail)}
          </div>
          {p.stats && <div className="voice-stats">{p.stats}</div>}
        </div>
        <button className="btn sm" onClick={() => p.setMuted(!muted)} aria-pressed={muted} title="Mute Pip's voice">
          {muted ? "Unmute" : "Mute"}
        </button>
        <button className="btn sm ghost" onClick={p.onEnd}>
          End
        </button>
      </div>

      {/* Live captions: the last couple of lines. The full conversation is one click away. */}
      <div className={`transcript ${full ? "full" : "captions"}`} role="log" aria-live="polite" data-testid="transcript">
        {transcript.length === 0 && <div className="empty-t">Nothing said yet.</div>}
        {transcript.map((l) => (
          <div key={l.id} className={`line ${l.role}`}>
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="compose" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Speak, or type your answer here"
          aria-label="Type a message"
          data-testid="compose-input"
        />
        <button className="btn sm" type="submit" disabled={!text.trim()}>
          Send
        </button>
        {transcript.length > 2 && (
          <button className="btn sm ghost" type="button" onClick={() => setFull(!full)} aria-pressed={full} data-testid="toggle-transcript">
            {full ? "Captions" : "Full transcript"}
          </button>
        )}
      </form>
    </section>
  );
}
