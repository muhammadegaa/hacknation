/**
 * Narration for the demo video, generated with ElevenLabs text to speech.
 *
 *   npm run voiceover                 all segments  -> out/voiceover/<id>.mp3
 *   npm run voiceover -- 01 03        only segments whose id starts with 01 or 03
 *   npm run voiceover -- --list       print the script and timings, no audio
 *
 * The text lives in docs/voiceover.md. Drop the MP3s on a timeline in CapCut,
 * DaVinci Resolve or Clipchamp. Prefer your own voice? Read the same file aloud.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { parseVoiceover } from "./voiceoverText";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const segments = parseVoiceover(readFileSync(join(root, "docs", "voiceover.md"), "utf8"));
const wanted = args.filter((a) => !a.startsWith("--"));
const chosen = wanted.length ? segments.filter((s) => wanted.some((w) => s.id.startsWith(w))) : segments;

const total = chosen.reduce((n, s) => n + s.seconds, 0);
for (const s of chosen)
  console.log(`${s.id.padEnd(18)} ${String(s.words).padStart(3)} words  ~${String(s.seconds).padStart(2)}s   ${s.text.slice(0, 70)}…`);
console.log(`${"total".padEnd(18)} ${String(chosen.reduce((n, s) => n + s.words, 0)).padStart(3)} words  ~${total}s`);
if (args.includes("--list")) process.exit(0);
if (chosen.length === 0) {
  console.error("No segment matches. Run with --list to see the ids.");
  process.exit(1);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("\nELEVENLABS_API_KEY is not set. Put it in .env and re-run.");
  process.exit(1);
}

// A narrator voice that is neither of Pip's (Sarah and George), so the two never get confused.
const VOICE = process.env.VOICEOVER_VOICE || "nPczCjzI2devNBz1zQrb"; // Brian: calm, deep narrator
const MODEL = process.env.VOICEOVER_MODEL || "eleven_multilingual_v2";
const client = new ElevenLabsClient({ apiKey });
const outDir = join(root, "out", "voiceover");
mkdirSync(outDir, { recursive: true });

async function main() {
  console.log(`\nVoice ${VOICE}, model ${MODEL}`);
  for (const s of chosen) {
    const stream = await client.textToSpeech.convert(VOICE, {
      text: s.text,
      modelId: MODEL,
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability: 0.55, similarityBoost: 0.8, style: 0.15, speed: 0.98 },
    });
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    const file = join(outDir, `${s.id}.mp3`);
    writeFileSync(file, buf);
    // 128 kbps MP3 is 16,000 bytes a second.
    console.log(`  wrote ${file.replace(root + "/", "")}  (${(buf.length / 16000).toFixed(1)}s)`);
  }
  console.log("\nDone. Import the MP3s into your editor and place each at the time noted in docs/voiceover.md.");
}

main().catch((err) => {
  const body = err && typeof err === "object" && "body" in err ? JSON.stringify((err as { body: unknown }).body) : "";
  console.error("\nVoiceover failed:", err instanceof Error ? err.message : err, body);
  process.exit(1);
});
