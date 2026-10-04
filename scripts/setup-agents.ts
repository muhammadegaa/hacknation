/**
 * Creates (or updates) the two ElevenLabs agents the app talks to:
 *
 *   Pip, the Apprentice  - watches the expert, asks why, builds the work map
 *   Pip, the Tutor       - teaches a new hire from the work map
 *
 *   npm run setup:agents          (reads ELEVENLABS_API_KEY from .env)
 *
 * The agents are public (no secrets inside), so the browser only needs their ids.
 * The script writes the ids to .env.local. Re-running updates the same agents.
 */
import "dotenv/config";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import {
  apprenticeBody,
  tutorBody,
  DEFAULT_LLM_CANDIDATES,
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE_APPRENTICE,
  DEFAULT_VOICE_TUTOR,
  ENGLISH_TTS_MODELS,
  type AgentBody,
  type AgentEnv,
} from "./agentConfig";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set. Put it in .env (see .env.example) and re-run.");
  process.exit(1);
}
const client = new ElevenLabsClient({ apiKey });

// Older copies of .env.example suggested a *_v2_5 model, which English agents reject. Fix it rather than fail.
const V25_TO_V2: Record<string, string> = { eleven_flash_v2_5: "eleven_flash_v2", eleven_turbo_v2_5: "eleven_turbo_v2" };
let ttsModel = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_TTS_MODEL;
if (V25_TO_V2[ttsModel]) {
  console.warn(`ELEVENLABS_TTS_MODEL=${ttsModel} is multilingual-only; English agents need ${V25_TO_V2[ttsModel]}. Using that.`);
  ttsModel = V25_TO_V2[ttsModel];
}
if (!(ENGLISH_TTS_MODELS as readonly string[]).includes(ttsModel)) {
  console.error(`ELEVENLABS_TTS_MODEL=${ttsModel} is not allowed for English agents. Use one of: ${ENGLISH_TTS_MODELS.join(", ")}.`);
  process.exit(1);
}
const baseEnv: Omit<AgentEnv, "llm"> = {
  ttsModel,
  voiceApprentice: process.env.ELEVENLABS_VOICE_APPRENTICE || DEFAULT_VOICE_APPRENTICE,
  voiceTutor: process.env.ELEVENLABS_VOICE_TUTOR || DEFAULT_VOICE_TUTOR,
};
const LLM_CANDIDATES = [process.env.APPRENTICE_LLM, ...DEFAULT_LLM_CANDIDATES].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);

/** The server's explanation, not the SDK's one-line summary. */
function explain(err: unknown): string {
  const body = err && typeof err === "object" && "body" in err ? (err as { body: unknown }).body : undefined;
  const detail = (body as { detail?: { message?: string; param?: string } | string } | undefined)?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.message) return detail.message + (detail.param ? ` (param: ${detail.param})` : "");
  return err instanceof Error ? err.message : String(err);
}

const complainsAboutLlm = (msg: string) =>
  /\bllm\b|model.*(not|unavailable|supported|allowed)/i.test(msg) && !/tts|voice|turn|english/i.test(msg);

async function upsert(label: string, existingId: string | undefined, body: (llm: string) => AgentBody) {
  for (const llm of LLM_CANDIDATES) {
    try {
      if (existingId) {
        await client.conversationalAi.agents.update(existingId, body(llm));
        console.log(`  updated ${label} (${existingId}) with llm=${llm}`);
        return existingId;
      }
      const res = await client.conversationalAi.agents.create(body(llm));
      console.log(`  created ${label} (${res.agentId}) with llm=${llm}`);
      return res.agentId;
    } catch (err) {
      const msg = explain(err);
      if (!complainsAboutLlm(msg) || llm === LLM_CANDIDATES[LLM_CANDIDATES.length - 1]) throw new Error(`${label}: ${msg}`);
      console.warn(`  ${label}: llm=${llm} was not accepted (${msg}). Trying the next model.`);
    }
  }
  throw new Error(`${label}: no LLM candidate was accepted`);
}

function readEnvLocal(): Record<string, string> {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}

async function main() {
  const env = readEnvLocal();
  console.log(`Configuring ElevenLabs agents (tts=${ttsModel}, llm candidates: ${LLM_CANDIDATES.join(", ")})...`);

  const apprenticeId = await upsert(
    "Apprentice",
    process.env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID || env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID,
    (llm) => apprenticeBody({ ...baseEnv, llm }),
  );
  const tutorId = await upsert("Tutor", process.env.VITE_ELEVENLABS_TUTOR_AGENT_ID || env.VITE_ELEVENLABS_TUTOR_AGENT_ID, (llm) =>
    tutorBody({ ...baseEnv, llm }),
  );

  const merged = { ...env, VITE_ELEVENLABS_APPRENTICE_AGENT_ID: apprenticeId, VITE_ELEVENLABS_TUTOR_AGENT_ID: tutorId };
  writeFileSync(
    join(root, ".env.local"),
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  console.log("\nWrote .env.local:");
  console.log(`  VITE_ELEVENLABS_APPRENTICE_AGENT_ID=${apprenticeId}`);
  console.log(`  VITE_ELEVENLABS_TUTOR_AGENT_ID=${tutorId}`);
  console.log("\nNext: npm run smoke:agents   (text-only check of both agents), then npm run dev");
}

main().catch((err) => {
  console.error("\nSetup failed:", explain(err));
  if (err && typeof err === "object" && "body" in err) console.error(JSON.stringify((err as { body: unknown }).body, null, 2));
  process.exit(1);
});
