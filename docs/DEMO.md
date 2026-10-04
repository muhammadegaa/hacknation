# Demo script (3 minutes)

The point to land: **it only speaks when the expert breaks the manual, and what it learns becomes a tutor.**

## Before you record

- [ ] `npm run setup:agents` and `npm run smoke:agents` pass. Read the transcript it prints; those are the lines the real agent will say.
- [ ] Headphones in. A speaker makes the agent hear itself and interrupt.
- [ ] Chrome, mic permission granted on the page, 1440 px wide window, browser zoom 100%.
- [ ] Open the app, choose **ElevenLabs live voice**, confirm both agent ids are filled in.
- [ ] Open **Presenter notes** (top bar) on a second screen, or read from `docs/VIDEO.md`. You are playing Maria. When you record, add `?clean=1` to the URL to hide the button.
- [ ] Failsafe: switch to **Simulated** and rehearse once. If the network dies mid-take, the flow still runs.
- [ ] Clear state: DevTools → Application → Local Storage → delete `apprentice.v1`.

## Beats

| Time | You do | You say | Judge should notice |
|---|---|---|---|
| 0:00 | Landing page. | "Every rule has a caveat. Every company has a Maria who knows them all, and none of it is written down. When she leaves, it leaves." | The framing: the gap between SOP and practice. |
| 0:15 | Click **Shadow Maria**. Pip greets. | "This is Caveat AI, and Pip is its apprentice voice. It sits beside her while she works. The bar on top shows what Pip is doing: observe, notice, ask, verify." | The loop bar, orb, "Watching quietly". |
| 0:25 | **INV-2042** Harbor: click Approve. Click Next. | "Routine invoice. Watch what Pip does." *(silence)* | **Pip says nothing.** Point at "Stayed quiet on 1". |
| 0:40 | **INV-2041** Brightline: open *Contract notes*, Approve. Pip asks. Answer from the crib sheet. | "The manual says hold, 3.8% over. Maria approves." | Pip asks one question, and the **Why Pip asked** band shows its evidence. Say: "It tells me why it is interrupting." The rule appears on the map. |
| 1:05 | Pip plays it back. Say "Yes." | | WHEN / THEN, **Details** for because / unless / quote, then **Verified by Maria**. The expert can also **Confirm** or **Discard** by hand. |
| 1:15 | **INV-2044** Vantage: open *Bank details*, then **Hold**. Answer from the crib sheet. | "Everything matches. A novice approves. Maria checked the bank log." | The red **Hard stop** guardrail. If Pip passed `new_step`, a hidden step appears on the map (amber, dashed, "Not in the manual"). |
| 1:45 | Click **Finish capture**. Answer the closing sweep with one sentence. | | Pip asks what would trip up a new hire. |
| 2:00 | **View the Work Map.** | "Three invoices in, and it already has the fuel-surcharge exception and the bank-change guardrail, each verified by Maria and tied to its invoice. A full eight-invoice session finds all six seeded rules." | KPI tiles. The benchmark honestly says *2 of 6* because only 3 of 8 invoices were worked. |
| 2:15 | Click **Teach with Maria's full example map**. | "Here's the map a full session produces." | Six rules, two hidden steps, all verified. |
| 2:20 | Let Pip talk through the map for ~10 s, then **Start practice** (or let it call `next_case`). | | Voice walkthrough with steps highlighting. Locked rules. |
| 2:30 | On the first invoice, choose the wrong answer (Reject). Let the hint land. Choose Hold again. | "Pip hints before it tells." | Hint ladder, then the reveal in Maria's own words. |
| 2:50 | Click **Finish and score**. | "The expert's judgment, captured once, now trains the next hire." | Scorecard by rule. |

## Agentic principles to say out loud (pick two)

- **"It tells me why it asked."** The Why band lists the evidence.
- **"It's quiet when it should be."** Point at *Routine: same as the manual. Pip stayed quiet.*
- **"I'm in control."** Click **Not now** or **Pause Pip** once on camera. Pip drops it and records nothing.
- **"Nothing is remembered until I confirm it."** Proposed, then Verified. Discard removes it before the tutor sees it.

## If something goes wrong on camera

- Pip speaks over you: say "one second", wait for the mode to return to *Watching quietly*, continue.
- No question after a decision: it waits 2.5 s after your last click, and for the agent to be idle. Click Next to force it.
- Mic denied: the app drops to text mode automatically; type your answers.
- Agent misclassifies a rule: say "no, it's actually..." That is the correction path, and it is a good thing to show.

## What not to say

- Don't call the benchmark a general accuracy figure. It is "seeded rules found in a constructed scenario".
- Don't claim 6 of 6 unless you actually worked all eight invoices on camera. A full session takes about six minutes; the short path shows the saved example map and says so.
- Don't say it watches any application. It watches an instrumented workspace today.
