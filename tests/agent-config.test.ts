import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  APPRENTICE_FIRST_MESSAGE,
  APPRENTICE_PLACEHOLDERS,
  DEFAULT_LLM_CANDIDATES,
  DEFAULT_TTS_MODEL,
  ENGLISH_TTS_MODELS,
  TUTOR_PLACEHOLDERS,
  apprenticeBody,
  tutorBody,
  type AgentEnv,
} from "../scripts/agentConfig";
import { CAPTURE_TOOL_NAMES, TUTOR_TOOL_NAMES } from "../src/voice/toolSpecs";

// The SDK's own request validator: the same code that produced "Expected enum. Received ...".
const require = createRequire(import.meta.url);
const sdk = require("@elevenlabs/elevenlabs-js/serialization").conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost as {
  jsonOrThrow(body: unknown, opts: unknown): Record<string, any>;
};
const wire = (body: unknown) => sdk.jsonOrThrow(body, { unrecognizedObjectKeys: "fail" });

const env = (llm: string, ttsModel = DEFAULT_TTS_MODEL): AgentEnv => ({
  llm,
  ttsModel,
  voiceApprentice: "EXAVITQu4vr4xnSDxMaL",
  voiceTutor: "JBFqnCBsd6RMkjVDRZzb",
});

describe("agent payloads pass the SDK validator", () => {
  for (const llm of DEFAULT_LLM_CANDIDATES) {
    it(`both agents validate with llm=${llm}`, () => {
      expect(() => wire(apprenticeBody(env(llm)))).not.toThrow();
      expect(() => wire(tutorBody(env(llm)))).not.toThrow();
    });
  }

  it("rejects a TTS model name used as an LLM, which is how the first failure looked", () => {
    expect(() => wire(apprenticeBody(env("eleven_flash_v2_5")))).toThrow(/Expected enum/);
  });
});

describe("rules the server enforces that the SDK cannot", () => {
  it("English agents use a turbo or flash v2 TTS model, never *_v2_5", () => {
    expect(ENGLISH_TTS_MODELS as readonly string[]).toContain(DEFAULT_TTS_MODEL);
    for (const b of [apprenticeBody(env("claude-sonnet-4-5")), tutorBody(env("claude-sonnet-4-5"))]) {
      expect(b.conversationConfig?.agent?.language).toBe("en");
      expect(ENGLISH_TTS_MODELS as readonly string[]).toContain(b.conversationConfig?.tts?.modelId);
    }
  });

  it("sends the dynamic-variable placeholders under their wire name", () => {
    const w = wire(apprenticeBody(env("claude-sonnet-4-5")));
    expect(Object.keys(w.conversation_config.agent.dynamic_variables)).toEqual(["dynamic_variable_placeholders"]);
  });

  it("every {{variable}} in a prompt or first message has a placeholder, so a missing value cannot fail a session", () => {
    const vars = (t: string) => [...t.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const read = (f: string) => readFileSync(new URL(`../prompts/${f}`, import.meta.url), "utf8");
    for (const v of [...vars(read("apprentice.md")), ...vars(APPRENTICE_FIRST_MESSAGE)])
      expect(APPRENTICE_PLACEHOLDERS, v).toHaveProperty(v);
    for (const v of vars(read("tutor.md"))) expect(TUTOR_PLACEHOLDERS, v).toHaveProperty(v);
  });

  it("the browser supplies every placeholder the agents declare", () => {
    const src = (f: string) => readFileSync(new URL(`../src/controllers/${f}`, import.meta.url), "utf8");
    for (const k of Object.keys(APPRENTICE_PLACEHOLDERS)) expect(src("capture.ts"), k).toContain(`${k}:`);
    for (const k of Object.keys(TUTOR_PLACEHOLDERS)) expect(src("tutor.ts"), k).toContain(`${k}:`);
  });

  it("agents expose exactly the tools the browser implements", () => {
    const names = (b: ReturnType<typeof apprenticeBody>) =>
      (b.conversationConfig?.agent?.prompt?.tools ?? []).map((t) => (t as { name: string }).name).sort();
    expect(names(apprenticeBody(env("claude-sonnet-4-5")))).toEqual([...CAPTURE_TOOL_NAMES].sort());
    expect(names(tutorBody(env("claude-sonnet-4-5")))).toEqual([...TUTOR_TOOL_NAMES].sort());
  });

  it("keeps the apprentice quiet: skip_turn enabled, no re-engagement, no hang-up on silence", () => {
    const b = apprenticeBody(env("claude-sonnet-4-5")).conversationConfig!;
    expect(b.agent?.prompt?.builtInTools?.skipTurn).toBeTruthy();
    expect(b.turn?.silenceEndCallTimeout).toBe(-1);
  });
});
