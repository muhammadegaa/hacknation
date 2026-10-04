/**
 * Pure builders for the two ElevenLabs agents. No network, no env, no process
 * exit, so tests can run the SDK's own request validator over exactly what
 * setup-agents.ts will send.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { CAPTURE_TOOLS, TUTOR_TOOLS, type ToolSpec } from "../src/voice/toolSpecs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prompt = (f: string) => readFileSync(join(root, "prompts", f), "utf8").trim();

export type AgentBody = ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost;

export const AGENT_LANGUAGE = "en";

/**
 * ElevenLabs rejects the multilingual *_v2_5 TTS models on English-only agents:
 * "English Agents must use turbo or flash v2."
 */
export const ENGLISH_TTS_MODELS = ["eleven_turbo_v2", "eleven_flash_v2"] as const;
export const DEFAULT_TTS_MODEL = "eleven_flash_v2";

export const DEFAULT_VOICE_APPRENTICE = "EXAVITQu4vr4xnSDxMaL";
export const DEFAULT_VOICE_TUTOR = "JBFqnCBsd6RMkjVDRZzb";

/** Tried in order; setup moves to the next only when the server complains about the LLM itself. */
export const DEFAULT_LLM_CANDIDATES = ["claude-sonnet-4-5", "claude-sonnet-5", "claude-haiku-4-5", "gemini-2.5-flash", "gpt-4o"];

export const APPRENTICE_FIRST_MESSAGE =
  "Hi {{expert_name}}, I'm Pip. Work the way you normally do. I'll stay quiet unless something is worth asking.";

export const APPRENTICE_PLACEHOLDERS = {
  expert_name: "the expert",
  expert_role: "an experienced practitioner",
  company: "the company",
  workflow: "their daily work",
  sop: "(not provided)",
};

export const TUTOR_PLACEHOLDERS = {
  trainee_name: "the trainee",
  expert_name: "the expert",
  expert_role: "an experienced practitioner",
  company: "the company",
  workflow: "their daily work",
  work_map: "(empty)",
};

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

export interface BuildOpts {
  name: string;
  llm: string;
  voice: string;
  ttsModel: string;
  systemPrompt: string;
  firstMessage: string;
  tools: ToolSpec[];
  placeholders: Record<string, string>;
}

export function build(o: BuildOpts): AgentBody {
  return {
    name: o.name,
    tags: ["hack-nation", "apprentice"],
    conversationConfig: {
      agent: {
        firstMessage: o.firstMessage,
        language: AGENT_LANGUAGE,
        // Typed `unknown` in the SDK, so it skips the camelCase -> snake_case conversion. Use the wire name.
        dynamicVariables: { dynamic_variable_placeholders: o.placeholders },
        prompt: {
          prompt: o.systemPrompt,
          llm: o.llm as ElevenLabs.Llm,
          temperature: 0.4,
          maxTokens: 400,
          ignoreDefaultPersonality: true,
          tools: o.tools.map(toolConfig),
          builtInTools: {
            // Lets the agent stay silent while the expert works.
            skipTurn: { name: "skip_turn", params: { systemToolType: "skip_turn" } },
          },
        },
      },
      tts: { voiceId: o.voice, modelId: o.ttsModel as ElevenLabs.TtsConversationalModel, stability: 0.5, similarityBoost: 0.8, speed: 1.0 },
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
      callLimits: { dailyLimit: 300, agentConcurrencyLimit: 3 },
      // Lets the browser fall back to text-only if the microphone is unavailable,
      // and lets scripts/smoke-agents.ts run without audio.
      overrides: { conversationConfigOverride: { conversation: { textOnly: true } } },
    },
  };
}

export interface AgentEnv {
  llm: string;
  ttsModel: string;
  voiceApprentice: string;
  voiceTutor: string;
}

export function apprenticeBody(e: AgentEnv): AgentBody {
  return build({
    name: "Pip - Apprentice (capture)",
    llm: e.llm,
    voice: e.voiceApprentice,
    ttsModel: e.ttsModel,
    systemPrompt: prompt("apprentice.md"),
    firstMessage: APPRENTICE_FIRST_MESSAGE,
    tools: CAPTURE_TOOLS,
    placeholders: APPRENTICE_PLACEHOLDERS,
  });
}

export function tutorBody(e: AgentEnv): AgentBody {
  return build({
    name: "Pip - Tutor (teach)",
    llm: e.llm,
    voice: e.voiceTutor,
    ttsModel: e.ttsModel,
    systemPrompt: prompt("tutor.md"),
    firstMessage: "",
    tools: TUTOR_TOOLS,
    placeholders: TUTOR_PLACEHOLDERS,
  });
}
