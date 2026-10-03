/**
 * Creates (or updates) the two ElevenLabs agents the app talks to:
 *
 *   Pip, the Apprentice  - watches the expert, asks why, builds the work map
 *   Pip, the Tutor       - teaches a new hire from the work map
 *
 *   ELEVENLABS_API_KEY=... npm run setup:agents
 *
 * The agents are public (no secrets inside), so the browser only needs their ids.
 * The script writes the ids to .env.local. Re-running updates the same agents.
 */
import "dotenv/config";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { CAPTURE_TOOLS, TUTOR_TOOLS, type ToolSpec } from "../src/voice/toolSpecs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set. Put it in .env or export it, then re-run.");
  process.exit(1);
}
const client = new ElevenLabsClient({ apiKey });

const VOICE_APPRENTICE = process.env.ELEVENLABS_VOICE_APPRENTICE || "EXAVITQu4vr4xnSDxMaL";
const VOICE_TUTOR = process.env.ELEVENLABS_VOICE_TUTOR || "JBFqnCBsd6RMkjVDRZzb";
const TTS_MODEL = (process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5") as ElevenLabs.TtsConversationalModel;
const LLM_CANDIDATES = [process.env.APPRENTICE_LLM, "claude-sonnet-5", "claude-sonnet-4-5", "gemini-2.5-flash"].filter(Boolean) as string[];

const prompt = (f: string) => readFileSync(join(root, "prompts", f), "utf8").trim();

function toolConfig(t: ToolSpec): ElevenLabs.PromptAgentApiModelOutputToolsItem {
  const properties: Record<string, ElevenLabs.LiteralJsonSchemaProperty> = {};
  for (const [k, p] of Object.entries(t.params)) {
    properties[k] = { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}) };
  }
  return {
    type: "client",
    name: t.name,
    description: t.description,
    expectsResponse: t.blocking,
    responseTimeoutSecs: 10,
    preToolSpeech: "off",
    parameters: Object.keys(properties).length ? { type: "object", required: t.required, properties } : undefined,
  };
}

function build(opts: {
  name: string;
  llm: string;
  voice: string;
  systemPrompt: string;
  firstMessage: string;
  tools: ToolSpec[];
  placeholders: Record<string, string>;
}): ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost {
  return {
    name: opts.name,
    tags: ["hack-nation", "apprentice"],
    conversationConfig: {
      agent: {
        firstMessage: opts.firstMessage,
        language: "en",
        dynamicVariables: { dynamicVariablePlaceholders: opts.placeholders },
        prompt: {
          prompt: opts.systemPrompt,
          llm: opts.llm as ElevenLabs.Llm,
          temperature: 0.4,
          maxTokens: 400,
          ignoreDefaultPersonality: true,
          tools: opts.tools.map(toolConfig),
          builtInTools: {
            // Lets the agent stay silent while the expert works.
            skipTurn: { name: "skip_turn", params: { systemToolType: "skip_turn" } },
          },
        },
      },
      tts: { voiceId: opts.voice, modelId: TTS_MODEL, stability: 0.5, similarityBoost: 0.8, speed: 1.0 },
      turn: {
        // The expert works in silence. Do not re-engage them, and never hang up on silence.
        turnTimeout: 30,
        silenceEndCallTimeout: -1,
        turnEagerness: "patient",
      },
      conversation: {
        maxDurationSeconds: 1800,
        clientEvents: [
          "conversation_initiation_metadata",
          "ping",
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "client_tool_call",
          "agent_tool_response",
          "vad_score",
        ],
      },
    },
    platformSettings: {
      auth: { enableAuth: false },
      callLimits: { dailyLimit: 300, agentConcurrencyLimit: 5 },
      // Lets the browser fall back to text-only if the microphone is unavailable,
      // and lets scripts/smoke-agents.ts run without audio.
      overrides: { conversationConfigOverride: { conversation: { textOnly: true } } },
    },
  };
}

async function upsert(
  label: string,
  existingId: string | undefined,
  body: (llm: string) => ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost,
) {
  let lastErr: unknown;
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
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${label}: llm=${llm} rejected (${msg.slice(0, 160)}). Trying the next model.`);
    }
  }
  throw lastErr;
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
  console.log("Configuring ElevenLabs agents...");

  const apprenticeId = await upsert(
    "Apprentice",
    process.env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID || env.VITE_ELEVENLABS_APPRENTICE_AGENT_ID,
    (llm) =>
      build({
        name: "Pip - Apprentice (capture)",
        llm,
        voice: VOICE_APPRENTICE,
        systemPrompt: prompt("apprentice.md"),
        firstMessage: "Hi {{expert_name}}, I'm Pip. Work the way you normally do. I'll stay quiet unless something is worth asking.",
        tools: CAPTURE_TOOLS,
        placeholders: {
          expert_name: "the expert",
          expert_role: "an experienced practitioner",
          company: "the company",
          workflow: "their daily work",
          sop: "(not provided)",
        },
      }),
  );

  const tutorId = await upsert("Tutor", process.env.VITE_ELEVENLABS_TUTOR_AGENT_ID || env.VITE_ELEVENLABS_TUTOR_AGENT_ID, (llm) =>
    build({
      name: "Pip - Tutor (teach)",
      llm,
      voice: VOICE_TUTOR,
      systemPrompt: prompt("tutor.md"),
      firstMessage: "",
      tools: TUTOR_TOOLS,
      placeholders: {
        trainee_name: "the trainee",
        expert_name: "the expert",
        expert_role: "an experienced practitioner",
        company: "the company",
        workflow: "their daily work",
        work_map: "(empty)",
      },
    }),
  );

  const merged = {
    ...env,
    VITE_ELEVENLABS_APPRENTICE_AGENT_ID: apprenticeId,
    VITE_ELEVENLABS_TUTOR_AGENT_ID: tutorId,
  };
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
  console.error("\nSetup failed:", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "body" in err) console.error(JSON.stringify((err as { body: unknown }).body, null, 2));
  process.exit(1);
});
