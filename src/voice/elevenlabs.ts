import { Conversation, type VoiceConversation, type TextConversation } from "@elevenlabs/client";
import type { AgentBridge, AgentBridgeEvents, ToolHandler } from "../domain/types";

const FEED_TAG = "[[WORKSPACE]]";

/**
 * Live voice via an ElevenLabs Agent. The browser connects directly to a public
 * agent (no secrets in the page). Passive observations go in as contextual
 * updates, which never trigger a reply; workspace cues go in as user messages,
 * which always do. The agent's tool calls land in the same handlers the
 * simulated bridge uses.
 */
export class ElevenLabsBridge implements AgentBridge {
  readonly kind = "elevenlabs" as const;
  private conv: VoiceConversation | TextConversation | null = null;
  private textOnly = false;

  constructor(
    private readonly agentId: string,
    private readonly ev: AgentBridgeEvents,
  ) {}

  async start({
    dynamicVariables,
    tools,
  }: {
    dynamicVariables: Record<string, string | number | boolean>;
    tools: Record<string, ToolHandler>;
  }) {
    this.ev.onStatus("connecting");

    const clientTools = Object.fromEntries(
      Object.entries(tools).map(([name, fn]) => [name, async (params: Record<string, unknown>) => fn(params ?? {})]),
    );

    const common = {
      agentId: this.agentId,
      dynamicVariables,
      clientTools,
      onConnect: () => this.ev.onStatus("connected"),
      onDisconnect: (d: { reason: string; message?: string }) => {
        if (d.reason === "error") this.ev.onStatus("error", d.message);
        else this.ev.onStatus("ended");
      },
      onError: (message: string) => this.ev.onStatus("error", message),
      onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => this.ev.onMode(mode),
      onMessage: ({ message, role }: { message: string; role: "user" | "agent" }) => {
        if (!message || message.startsWith(FEED_TAG)) return;
        this.ev.onTranscript({ role: role === "agent" ? "agent" : "expert", text: message });
      },
    };

    const attempts: Array<() => Promise<VoiceConversation | TextConversation>> = [
      () => Conversation.startSession({ ...common, connectionType: "webrtc" }),
      () => Conversation.startSession({ ...common, connectionType: "websocket" }),
      () => {
        this.textOnly = true;
        this.ev.onTranscript({ role: "system", text: "Microphone unavailable. Continuing in text mode: type your answers below." });
        return Conversation.startSession({ ...common, connectionType: "websocket", textOnly: true });
      },
    ];

    let lastErr: unknown;
    for (const attempt of attempts) {
      try {
        this.conv = await attempt();
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    this.ev.onStatus("error", msg);
    throw lastErr;
  }

  async stop() {
    try {
      await this.conv?.endSession();
    } finally {
      this.conv = null;
      this.ev.onStatus("ended");
    }
  }

  observe(text: string) {
    this.conv?.sendContextualUpdate(text);
  }

  cue(text: string) {
    this.ev.onMode("thinking");
    this.conv?.sendUserMessage(text);
  }

  sendText(text: string) {
    this.ev.onTranscript({ role: "expert", text });
    this.ev.onMode("thinking");
    this.conv?.sendUserMessage(text);
  }

  setMuted(muted: boolean) {
    if (!this.textOnly && this.conv && "setMicMuted" in this.conv) this.conv.setMicMuted(muted);
  }

  level(): number {
    try {
      return this.conv?.getOutputVolume() ?? 0;
    } catch {
      return 0;
    }
  }
}
