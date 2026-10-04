# Apprentice

**A voice agent that shadows an expert, asks "why" only when it matters, and turns the answers into a Work Map and a voice tutor.**

Hack-Nation · Challenge 01 · ElevenLabs: The AI Apprentice

> The manual says one thing. Your best people do another. That gap is where the expertise lives, and it walks out the door when they retire.

## The idea in one paragraph

Interviewing experts fails because it asks about everything, and experts can't articulate what they do without a trigger. Apprentice flips it. It watches real decisions, compares each one with the **written procedure encoded as code**, and speaks only at the moments where the expert departed from it: a decision the manual wouldn't make, a lookup the manual never mentions, a hesitation, a reversal. On routine work it stays silent. Each answer becomes a structured rule on a live **Work Map**, is read back to the expert for confirmation, and is then used by a second voice agent that **teaches a new hire**, hinting before it reveals and quoting the expert's own words.

## Try it

```bash
npm install
npm run dev            # http://localhost:5173
```

Pick **Simulated** on the landing page and the whole loop runs offline with templated questions. Use it to see the flow, as a failsafe, and as the baseline the real agents beat.

For live ElevenLabs voice:

```bash
cp .env.example .env              # add ELEVENLABS_API_KEY
npm run setup:agents              # creates both agents, writes ids to .env.local
npm run smoke:agents              # text-only check of both agents (about a minute)
npm run dev                       # choose "ElevenLabs live voice"
```

Use headphones in a live demo, otherwise the agent hears itself.

## Deploy (Vercel)

The app is a static Vite build; the browser holds no secrets, only the two public agent ids.

1. Run `npm run setup:agents` locally once and copy the two ids it prints.
2. Vercel → Add New Project → import this repo. If the repo has no `main` branch, set the production branch to `claude/happy-faraday-mysx6k` in Project Settings → Git.
3. Add environment variables `VITE_ELEVENLABS_APPRENTICE_AGENT_ID` and `VITE_ELEVENLABS_TUTOR_AGENT_ID`. Deploy.
4. Open the URL, click **Check microphone**, and run one full take before recording.

`vercel.json` sets the build to `vite build` and allows the microphone. Without the env vars the site opens in Simulated mode; `?sim=1` forces Simulated even when the ids are set, which is a handy backup link. The agents are public and capped at 300 conversations a day (`scripts/setup-agents.ts`); lower it or archive the agents after judging.

## What happens in a session

| Stage | What the user does | What Apprentice does |
|---|---|---|
| **Capture** | Works an accounts-payable exceptions queue as normal. | Feeds every lookup and click to the agent. Silent on routine cases. After a decision settles, asks one specific question if the decision broke the manual. |
| **Verify** | Answers in their own words. | Records a typed rule (judgment, exception, guardrail, heuristic, escalation) with WHEN / THEN / BECAUSE / UNLESS and the quote, plays it back, and marks it verified or corrected. Discovers steps that aren't in the manual. |
| **Map** | Reviews the Work Map. | Shows documented steps versus hidden ones, every rule tied to the invoice that prompted it. Exports JSON and a Markdown playbook. |
| **Teach** | A new hire works fresh invoices by voice. | Tutor compares each decision with the map. Wrong: asks a Socratic question first, reveals the expert's quote second. Right on a trap case: asks them to explain the distinction. Scores per rule. |

## How it works

```
 workspace events ──► case trace ──► moment detector ──► cue queue ──► ElevenLabs Agent (Claude)
 (lookup, decide)     (per invoice)   (vs. written SOP)   (interruption     │   ▲
                                                           policy)          │   │ [[WORKSPACE]] cues (user message)
                                                                            │   │ observations (contextual update, silent)
                                  Work Map ◄── client tools ◄───────────────┘
                              (live, verified)   record_insight / confirm_insight /
                                   │             park_question / close_topic
                                   ▼
                         serialised into the Tutor agent's prompt ──► coaching + scoring
```

**Moment detection** (`src/engine/moments.ts`). The written procedure is code (`sopPredict`). For each case the detector compares the expert's decision with the SOP's, and looks for unprompted lookups, hesitation and reversals. Ambient habits (glancing at vendor history) don't count. No signal means no question.

**Interruption policy** (`src/controllers/capture.ts`). Decisions must settle for 2.5 s first, so a quick change of mind is a reversal, not two questions. One dialog at a time. Never while the agent is speaking or within a beat of the expert's own words. The agent is configured with the built-in `skip_turn` tool and a long turn timeout so it never fills silence.

**Teach-back.** After `record_insight` the agent reads the rule back. `confirm_insight` marks it verified or stores the correction. The tutor is told to use corrections over originals.

**Tutor** (`src/controllers/tutor.ts`). The Work Map is serialised into the tutor's prompt. Rules stay locked on screen until the trainee has tried a related invoice, so the map can't be read off as answers. The practice queue contains the same rules in new forms, plus a trap: the same 3.8% overage as a fuel-surcharge vendor, with no surcharge clause, so the right answer is the opposite.

**Evaluation.** The scenario seeds six hidden rules across the capture queue and the Work Map screen reports how many the session surfaced. This is a ground-truth benchmark on a constructed scenario, not a claim about arbitrary workplaces.

## Repo map

```
prompts/               apprentice.md, tutor.md   (the two agent system prompts)
scripts/               setup-agents.ts           creates/updates both agents via the ElevenLabs SDK
                       smoke-agents.ts           live text-only checks of both agents
src/domain/            types, the accounts-payable scenario (SOP-as-code, 8 capture + 7 trainee invoices)
src/engine/            moments, workmap, tutor scoring, cue builders, seed map   (pure, unit-tested)
src/controllers/       capture + tutor orchestration, interruption policy, tool handlers
src/voice/             ElevenLabs bridge, simulated bridge, tool specs (single source of truth)
src/ui/                React screens
tests/  e2e/           Vitest unit tests; Playwright end-to-end flow
docs/                  DEMO.md, PITCH.md, WORKMAP_SCHEMA.md
```

## Verification status

Be skeptical of any README, including this one.

- **Verified here:** typecheck, production build, 33 unit tests (moment detection, Work Map reducers, tutor scoring, tool contract), and a Playwright end-to-end run of the full loop in simulated mode: capture, ask only on the six rule cases, teach-back, verified map, benchmark 6 of 6, tutor hint ladder, locked rules, scorecard.
- **Type-checked, not run:** `setup-agents.ts` is checked against the real `@elevenlabs/elevenlabs-js` types, and the browser bridge against `@elevenlabs/client`. The build environment could not reach `api.elevenlabs.io`, so the agents themselves have not been exercised. `npm run smoke:agents` is the first live check. Agent quality depends on the prompts in `prompts/`; expect to tune them.
- **Not built:** watching an arbitrary application. Today the "eyes" are an instrumented workspace. The same cue protocol would accept events from a browser extension or screen capture with vision; the moment detector would need that tool's SOP expressed as code or as a rubric.

## Roadmap

1. Screen-share watching: send frames at moments via the SDK's multimodal message, so the agent sees what the expert sees.
2. Author a new scenario from a runbook: generate `sopPredict` and the tutor queue from a document.
3. Post-session review: let the expert edit rules on the map; re-run the tutor against the edits.
