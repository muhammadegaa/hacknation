/**
 * Parses docs/voiceover.md. A segment starts at "### <id>"; its narration is
 * every following line that begins with "> ". Everything else is a note for you.
 */
export interface Segment {
  id: string;
  text: string;
  words: number;
  /** Estimated speaking time at a calm 150 words a minute. */
  seconds: number;
}

export function parseVoiceover(md: string): Segment[] {
  const out: Segment[] = [];
  let id: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (id && lines.length) {
      const text = lines.join(" ").replace(/\s+/g, " ").trim();
      const words = text.split(/\s+/).length;
      out.push({ id, text, words, seconds: Math.round((words / 150) * 60) });
    }
    id = null;
    lines = [];
  };
  for (const line of md.split("\n")) {
    const h = line.match(/^###\s+(\S+)/);
    if (h) {
      flush();
      id = h[1];
    } else if (id && line.startsWith("> ")) {
      lines.push(line.slice(2).trim());
    }
  }
  flush();
  return out;
}
