import type { AgentBridge, AgentBridgeEvents } from "../domain/types";
import { SimulatedApprentice, SimulatedTutor } from "./simulated";

/** The ElevenLabs SDK (WebRTC client included) is large, so it loads only when live voice is chosen. */
export async function makeBridge(
  role: "apprentice" | "tutor",
  mode: "elevenlabs" | "simulated",
  agentId: string,
  ev: AgentBridgeEvents,
): Promise<AgentBridge> {
  if (mode === "elevenlabs") {
    const { ElevenLabsBridge } = await import("./elevenlabs");
    return new ElevenLabsBridge(agentId, ev);
  }
  return role === "apprentice" ? new SimulatedApprentice(ev) : new SimulatedTutor(ev);
}
