# Pitch

**Caveat AI** · *Every rule has a caveat. Your best people know them all.*

## One line

Caveat AI is a voice apprentice that shadows your best people, speaks only when they break the manual, and turns what they say into a Work Map and a voice tutor.

## 60-second version

When an expert retires, the manual stays and the judgment goes. Exit interviews fail because experts can't narrate what they do unprompted, and asking about everything wastes the one hour you have.

Caveat AI watches real decisions. It knows the written procedure, so it knows what a novice would have done. When Maria approves an invoice the manual says to hold, or checks a bank log the manual never mentions, that is the moment it asks, once, specifically. When she does something routine, it says nothing.

Every answer becomes a rule on a live Work Map: when, then, because, unless, in her own words, tied to the invoice that prompted it, and read back to her for confirmation. Then a second voice agent teaches a new hire from that map. It hints before it reveals, quotes Maria, and drills the same rule in a new form, including a trap that looks identical and has the opposite answer.

## Why this design

1. **Restraint is the product.** A mentor who speaks constantly gets tuned out. The agent asks at a settled decision, one question, only when there is information the manual lacks.
2. **Deviation from the SOP is where the knowledge is.** So the SOP is code, and the detector is a diff.
3. **Verification closes the loop.** Teach-back turns "the model heard something" into "the expert confirmed it", and corrections override originals in the tutor.
4. **The map is used, not just stored.** The tutor teaches from it and scores per rule, so a gap in capture shows up as a gap in learning.
5. **Measurable.** Six hidden rules are seeded; the app reports how many the session found.

## How we differ

Judges will ask "isn't this knowledge capture?" These are the closest, and what is different.

| Who | What they do | Caveat AI |
|---|---|---|
| [Interloom](https://fortune.com/2026/03/23/interloom-ai-agents-raises-16-million-venture-funding/) (raised $16.5M) | Captures tacit knowledge to power AI agents | We capture it **live, by voice, at the moment an expert breaks the manual**, have the expert verify it, and teach it to **people**, not only agents |
| [Graybeard](https://askgraybeard.com/manufacturers/) | Captures retiring seniors' knowledge for a support agent, sourced from documents | We don't start from documents. The knowledge is not in them. |
| [Understudy](https://github.com/understudy-ai/understudy) | Learns a task from a demonstration so a computer can repeat it | It automates the task. We capture *why an expert deviates from the procedure* and teach it to people. |

One line: Caveat AI starts where those stop. It asks the expert why they deviated from the manual, verifies the answer with them, then teaches it to a person.

*Based on each product's public description. We have not tested them; don't claim more than this on stage.*

## How ElevenLabs is used

- Two **ElevenLabs Agents** (Claude as the LLM) with voice, created by script, public so the page holds no secrets.
- **Client tools** let the agent write the Work Map live (`record_insight`, `confirm_insight`, `park_question`) and drive the tutor's screen (`show_on_map`, `next_case`, `record_assessment`).
- **Contextual updates** keep the agent aware of every click without making it speak; **user-message cues** make it speak at the right moment.
- **`skip_turn`** and a long turn timeout keep the apprentice quiet while the expert works.
- Text-only fallback when the microphone isn't available.

## Quotes (Best Quote award)

- "The manual tells you what to do. Maria tells you what to do when the manual is wrong."
- "Every rule has a caveat. Our experts know them all. Nobody wrote them down."
- "The manual says approve. Maria says: unless."
- "A good apprentice talks less than the master. That's the whole trick."
- "Pip has asked six questions and been quiet twice. That's the product."
- "We don't interview experts. We shadow them, and interrupt only when they break the rules."
- "Knowledge isn't lost when experts leave. It's lost because nobody asked at the right moment."

## LinkedIn post (Go Viral award)

Tag Hack-Nation before **Sun Oct 4, 9 am ET**, which is the same instant as the 2 pm BST submission deadline, so post before you submit.

> Every company has a Maria.
>
> The manual says hold the invoice. Maria approves it, because she knows that vendor has a fuel-surcharge side letter. The manual says approve. Maria holds it, because the bank details changed and nobody phoned.
>
> That judgment is in nobody's documentation. When she retires, it goes with her.
>
> This weekend at #HackNation I built Caveat AI with @ElevenLabs: a voice apprentice that shadows an expert, compares what they do with the written procedure, and speaks only when they break it. It asked 6 questions across 8 invoices and stayed silent on the 2 routine ones.
>
> Every answer becomes a rule on a live Work Map, read back to Maria for confirmation. Then a second voice agent teaches a new hire from it, hinting before it reveals and quoting Maria in her own words.
>
> The manual is where you start. Caveat AI captures the caveats: where your best people end up.
>
> Every rule has a caveat. Your best people know them all.
>
> [30-second demo video] [repo link]
>
> #CaveatAI #VoiceAI #KnowledgeTransfer #HackNation
