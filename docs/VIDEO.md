# Demo video: production guide

Target: about 3 minutes, 1080p, English, captions burned in. Then a 30-second cut for LinkedIn.

**The one idea:** during the live parts, Pip's real voice and yours (as Maria) *are* the product. Never talk over them. Narration frames the live parts; on-screen captions explain them.

First, check the challenge PDF for a required length or format, and follow that over this guide.

## 1. Set up (15 minutes)

1. **Narration.** `npm run voiceover -- --list` shows the script and timings. `npm run voiceover` writes `out/voiceover/*.mp3` with ElevenLabs (narrator voice Brian, neither of Pip's two voices). Prefer your own voice? Read `docs/voiceover.md` aloud instead. Either is fine; the ElevenLabs one is on-brand for the sponsor, so say so in the post.
2. **Recording URL.** Your deployed site plus `?clean=1`, for example `https://caveat-ai.vercel.app/?clean=1`. That hides the presenter-notes button.
3. **Window.** Chrome, a fresh incognito window, 1920×1080 or 1440×900, zoom 100%. Hide the bookmarks bar, close other tabs, turn on Do Not Disturb.
4. **Clear state before each take.** DevTools → Application → Local Storage → delete `apprentice.v1`.
5. **Maria's lines** open on your phone (section 3), so your eyes stay on the screen.
6. **Wired headphones in.** Otherwise Pip hears itself.

### Recording tool and Pip's voice

You need to capture three things: the screen, your microphone, and Pip's voice.

| Setup | How |
|---|---|
| Windows | OBS Studio: add **Display Capture**, **Audio Output Capture** (Pip's voice) and **Audio Input Capture** (your mic). |
| Mac | OBS plus the free BlackHole driver for system audio (10 minutes to set up). If that is too slow, record with QuickTime (Cmd+Shift+5, Options → Microphone), drop the headphones for this recording, and play Pip at low volume so your mic hears it. Chrome's echo cancellation stops Pip hearing itself in most rooms. |
| Quickest | Loom desktop app with **Record system audio** on, if your plan has it. |

## 2. Shots (record in four clips, retake any one without redoing the rest)

| Clip | Length | Screen | You do | Audio |
|---|---|---|---|---|
| **A. Hook** | 0:35 | Landing page | Hold on the page; click **Shadow Maria** at the end | Narration `01-hook`, `02-what` added later |
| **B. Live capture** | about 75 s | Capture screen | Harbor: **Approve**, **Next**. Brightline: open *Contract notes*, **Approve**, answer Pip, say "yes". Vantage: open *Bank details*, **Hold**, answer, say "yes". **Finish capture**, answer the sweep. | **Live**: Pip and you. No narration. |
| **C. Map and tutor** | about 90 s | Work Map, then tutor | Start on the Work Map left open from B. Hold 30 s, scrolling slowly (narration `03-map`, `04-tutor`). Click **Teach with Maria's full example map**. Let Pip talk about 10 s. When the first invoice appears, pick **Reject** (wrong, on purpose), listen to the hint, pick **Hold** (still wrong), listen to the reveal, pick **Approve** (right). | Narration over the first 30 s; then **live** Pip |
| **D. Close** | about 35 s | Capture screen, then landing | New window, **Shadow Maria**, wait for Pip's greeting to finish, then hold on the loop bar and click **Pause Pip**. Then click the **Caveat AI** logo and hold on the landing page. | Narration `05-principles` (from 8 s in), then `06-close` |

Do not close the browser window between B and C: the Work Map lives in it. Stop the recording, take a breath, and start a new one on the same screen.

Tip: do each clip twice and keep the better one. Total recording time is about 40 minutes.

## 3. Maria's lines (short and natural)

Say them like a tired expert, not a script. Pip will extract the rule either way.

- **Brightline:** "Brightline always runs three to four percent over. There's a fuel surcharge side letter, capped at five. Over five, I hold it."
- **Vantage:** "The bank details changed and nobody phoned them. I never pay a changed account on an email. I hold it and call the vendor on the number we already have."
- **Closing sweep:** "Invoices that land on a Friday afternoon. People rush and skip the bank check."
- When Pip reads a rule back: "Yes, that's right."

## 4. Captions (burn these in over Clip B and C)

Six to eight words each, on screen for about 3 seconds. White text, dark band.

| When | Caption |
|---|---|
| Harbor approved, Pip silent | Routine invoice. Pip stays quiet. |
| Brightline approved | Maria breaks the manual. |
| The "Why Pip asked" band appears | Pip shows why it is asking. |
| Pip reads the rule back | Pip reads it back. Maria verifies. |
| Vantage held | Everything matches. Maria checks the bank log. |
| Hard stop card appears | Guardrail: never pay changed bank details. |
| Work Map | Every rule: when, then, because, unless. |
| Tutor reveals | Asks first. Reveals second. Quotes Maria. |
| Optional: you click **Not now** | The expert is always in control. |

## 5. Edit (45 minutes, CapCut free is enough)

1. Import clips A–D and the narration MP3s.
2. Lay out A, B, C, D on the timeline. In B, speed up dead air (Pip thinking, you reading) to 1.5–2×; never speed up speech.
3. Place the narration at the notes in `docs/voiceover.md`. Leave Pip's live audio untouched.
4. Add captions from section 4. Turn on **auto captions** for the live speech if the tool offers it.
5. Optional quiet music under the narration only, at about -25 dB.
6. Trim silence at every cut. Export 1080p, 30 fps, MP4 (H.264).

If the whole thing runs over 3:15, cut the closing sweep from Clip B before anything else.

## 6. The 30-second cut (for LinkedIn)

80 percent of people watch muted, so captions carry it.

| Seconds | Show |
|---|---|
| 0–4 | Text card: **Every rule has a caveat.** |
| 4–14 | Pip asking, with the **Why Pip asked** band on screen |
| 14–21 | The rule appearing and turning **Verified by Maria** |
| 21–27 | Tutor revealing Maria's quote |
| 27–30 | Caveat AI wordmark and the line: **Your best people know them all.** |

## 7. Submit

- [ ] Deployed URL opens in a fresh incognito window and the mic prompt works.
- [ ] Video uploaded where the portal asks (a direct upload, or an unlisted YouTube link).
- [ ] README renders on GitHub; repo link is public to the judges.
- [ ] LinkedIn post live and tagged **before 9 am ET**, which is the same instant as the 2 pm BST deadline.
- [ ] Submitted at least 30 minutes early. Uploads stay open for 15 minutes after, but do not use that.

## 8. If a take goes wrong

- Pip talks over you: stop, wait for *Watching quietly*, redo that clip only.
- No question appears: you clicked too fast. Wait 3 seconds after the decision, or click **Next invoice**.
- The agent says something odd: keep it if it is accurate, retake if not. Three takes per clip at most, then move on.
- Don't claim "six of six" unless you worked all eight invoices on camera. The honest version is in `docs/DEMO.md`.

## Time budget

| Step | Time |
|---|---|
| Narration and setup | 15 min |
| Record four clips | 40 min |
| Edit and export | 45 min |
| Upload, LinkedIn, submit | 25 min |
| **Total** | **about 2 h 05** |
