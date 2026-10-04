import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVoiceover } from "../scripts/voiceoverText";

const md = readFileSync(new URL("../docs/voiceover.md", import.meta.url), "utf8");
const segs = parseVoiceover(md);

describe("voiceover script", () => {
  it("parses every segment, in order, with narration", () => {
    expect(segs.map((s) => s.id)).toEqual(["01-hook", "02-what", "03-map", "04-tutor", "05-principles", "05b-benchmark", "06-close"]);
    for (const s of segs) expect(s.text.length, s.id).toBeGreaterThan(20);
  });

  it("ignores notes, headings and italics: only '>' lines are spoken", () => {
    for (const s of segs) {
      expect(s.text, s.id).not.toMatch(/Over the|Starts at|Optional|###/);
    }
  });

  it("fits a three-minute video with room for the live demo", () => {
    const required = segs.filter((s) => s.id !== "05b-benchmark");
    const seconds = required.reduce((n, s) => n + s.seconds, 0);
    expect(seconds).toBeLessThan(100);
    for (const s of segs) expect(s.words, s.id).toBeLessThan(65); // short enough to stay on one screen
  });

  it("only claims what the product can show", () => {
    const all = segs.map((s) => s.text).join(" ");
    expect(all).not.toMatch(/\b(production|enterprise|customers|accuracy|%)\b/i);
    // The benchmark line is optional and conditional on a full run; everything else must hold on the 3-invoice path.
    for (const s of segs.filter((x) => x.id !== "05b-benchmark")) expect(s.text, s.id).not.toMatch(/six|eight/i);
  });
});
