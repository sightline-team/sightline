# Sightline — X submission film ("The Bar")

A 1:52 film for the NEAR Hackathon demo post. It is a new piece, not a re-cut of
`public/sightline-demo-video.mp4` (102 s screen recording) or `public/sightline-product-launch.mp4`
(24 s UI reel): different concept, palette, typography, narration and score.

**Watch:** `deliver/sightline-x.mp4` · **Stills:** `deliver/stills/` (poster + one per scene + contact sheet)

- **1920×1080, 60 fps, H.264 High / AAC 48 kHz, 1:52.16, 18.8 MiB, -14.7 LUFS, -1.5 dBTP**
- Voice: **ElevenLabs**, `Daniel — Steady Broadcaster` (`onwK4e9ZLuTAKqWW03F9`), `eleven_multilingual_v2`,
  one take per beat, 1,248 characters in total
- Score and sound design: original, synthesized in `score.mjs` (no library, no licensed track)

## The idea

One sheet of paper, never cut. It starts as a private letter, is redacted line by line, is covered
completely, and that black cover becomes the sealed enclave, the reading, the receipt, and finally a
mint line under the wordmark. One shape carries the whole film; content inside it swaps with a short
blur. A mint cursor labelled *You* performs the three actions the voice describes (shutter, ask,
forget).

Palette: bone paper `#F2EEE4`, ink `#12140F`, NEAR mint `#00EC97`. Type: Lato + Liberation Mono
(both present on the render machine, so the build is offline). The previous films were obsidian and
neon-grid; this one is warm, printed and editorial — the privacy story told as a piece of paper.

## Scenes

| # | In | Picture | Voice |
|---|---|---|---|
| 1 | 1.0 s | A GP letter; a black bar redacts the name, then the medicine, then the dose | "This is a letter about you… to read it, someone else has to hold it." |
| 2 | 11.3 s | Labels *ASK A PERSON* / *ASK A TYPICAL AI*; a cover swallows the page; **2.2 billion** | "…their privacy is gone… Two billion people live with a vision impairment." |
| 3 | 25.2 s | The cover becomes a slab: *Inside NEAR AI Cloud*, TDX chips, three photographed pages, scan, attested-key seal | "Photograph the letter. It gets explained, privately, inside a sealed hardware enclave." |
| 4 | 35.0 s | The 16 real check names light one at a time; nonce, TDX quote, enclave key; pill goes from `0 BYTES SENT` to `CHECKS PASSED · SENDING 1 PAGE` | "Before a single byte leaves your device, your browser checks the hardware itself." |
| 5 | 51.8 s | The reading: Summary → Key facts → What you may need to do → Warnings, with the page's own lines underlined | "A fixed order a screen reader can follow." |
| 6 | 68.3 s | A question is typed, answered with its quote; a second question is refused honestly | "If the letter doesn't say it, Sightline says so. It does not guess." |
| 7 | 84.3 s | Trust receipt: signed by the enclave, 12 of 16 checks, four named as "could not run", storage counts down to 0 KB | "Proof, not promises." |
| 8 | 95.6 s | Cursor presses *FORGET THIS DOCUMENT*; the sheet collapses to a mint line; wordmark | "Built on NEAR. Verify, don't trust." |

## What is real, what is designed

**Real product behaviour and strings** (read from this repo):

- the 16 check names are exactly what `lib/near-ai/{quote,signatures,attestation}.ts` emit, and the
  four that "could not run" are the four `ran: false` gaps (**B-12**): `quote_signed_by_hardware`,
  `platform_still_trusted`, `gpu_evidence_verdict`, `report_expiry`
- the receipt's privacy sentence is `CLAIM_COPY.attested_model_signed_responses` from
  `features/trust/claims.ts`, verbatim — the film never writes its own privacy sentence, and it never
  claims end-to-end encryption (`E2EE_PROVEN_IN_BROWSER` is still `false`)
- the medication warning is `NOTICE_COPY.medicine` from `features/safety/notices.ts`, verbatim
- the refusal line "— the document does not answer this." is `AskPanel`'s own copy
- the model row `z-ai/glm-5.3-flash`, the result order and the headings are `STEP_PLANS` and
  `ResultsView`'s headings

**Designed for the film** (not live data): the letter's name (`Priya Raman`), the nonce prefix
(`9f3c41a7d2e8…`), the "8,412 bytes" quote figure, and the 4.2 KB → 0 KB countdown. The letter body
itself is the repo's authored synthetic Meadow Walk fixture. The "2.2 billion" line is WHO's figure
for people living with a vision impairment.

Not in the film on purpose: no claim that the upload is end-to-end encrypted, no "twelve checks
passed" claim, no accuracy percentage, no images of real people or real documents.

## Build

Every frame is a pure function of `t` (`film.js` → `window.seek(t)`); no CSS transitions, no timers.
The voice is measured first, and its durations become the beat grid that the picture, the score and
the SFX all read, so nothing can drift.

```bash
cd video/submission

# 1. voice (needs ELEVENLABS_API_KEY in the environment; never written to disk)
ELEVENLABS_API_KEY=... python3 voice.py        # -> audio/vo/*.mp3 + build/vo.json
python3 build_timeline.py                      # -> build/timeline.json + timeline.js
node score.mjs                                 # -> build/bed.wav (score + SFX)
python3 mix.py                                 # -> build/mix.wav (ducked, -15 LUFS target)

# 2. checks, stills, render
node audit.mjs                                 # layout audit over 160 sampled frames
node snap.mjs                                  # stills/ + contact sheet
node render.mjs                                # -> sightline-x.mp4 (112 s, 6731 frames, ~8 min)
```

## What was verified, and how

- `node audit.mjs` → **no layout problems** across 160 samples: no text overflowing its box, no
  visible block outside the frame or the sheet, no two visible text blocks overlapping, no empty
  frame. (An early run caught four real faults — content still letterboxed inside a 700 px sheet,
  a clipped `2.2 billion`, a one-scene-late content mapping, and a 0.2 s blank at the forget beat.)
- `node speak.mjs` → dumped the visible text per scene and was proof-read against the narration; it
  found the duplicated question in scene 6 and a "Warnings" line with no heading, both fixed.
- the rendered MP4 itself: **1920×1080, 60 fps, 112.16 s, 18.8 MiB, H.264 + AAC 48 kHz**, integrated
  **-14.7 LUFS**, true peak **-1.5 dBTP**, no silence gap longer than 0.35 s at -42 dB (the score runs
  under every beat)
- narration sync: a 350–3200 Hz band analysis of the delivered mix shows a speech onset rise at all
  eight beat starts (×1.4 to ×7.8 over the 0.4 s before each)
- a 1-per-second storyboard of the MP4: no cut, and no second in which the picture is static for
  longer than a held beat

**Not verified:** the audio was **not listened to** — only measured (loudness, peaks, onsets). The
mix, the score's tone and the voice's pronunciation (TDX, nonce, enclave) have not been heard by a
human or by an agent with ears. Play it before posting.

## Notes

- The ElevenLabs key came from the authenticated CLI's own credential store and was used only for
  this film's eight text-to-speech calls; it is not in this directory, the repo, or the git history.
  ElevenLabs' Music API refuses free-tier keys (`paid_plan_required`), which is why the score is
  synthesized here instead.
- `x-post.md` holds the draft copy for the post. **A human publishes it** (ROADMAP X-03).
