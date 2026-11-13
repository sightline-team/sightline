# Sightline — X submission film (v3, "The Bar")

New 96 s piece for the @nearhackathon post. Different concept, palette, typography and
narration from `video/sightline-launch.mp4` (75 s, obsidian/grid UI walkthrough) and from
`docs/DEMO_SCRIPT.md` (103 s, screen recording with a cursor on the live app).

- Voice: ElevenLabs **Daniel — Steady Broadcaster** (`onwK4e9ZLuTAKqWW03F9`), `eleven_multilingual_v2`.
- Score: original, synthesized in `score.py` (numpy), 100 BPM, mint-pulse motif.
- Look: warm bone paper (`#F2EEE4`), ink (`#12140F`), NEAR mint (`#00EC97`), Lato + Liberation Mono.
- One shape: a single sheet of paper, never cut. One bar: a redaction black bar that becomes the
  enclave seal, the quote underline, and finally the wordmark rule.

## Beats

| # | Beat | VO (ElevenLabs) |
|---|---|---|
| 1 | The letter | "This is a letter about you. Your health. Your money. Your business. And right now, to read it, someone else has to hold it." |
| 2 | The trade-off | "Ask a person, and your privacy is gone. Ask a typical AI, and your privacy is gone too. Two billion people live with a vision impairment. They deserve a third option." |
| 3 | Sightline | "So here it is. Photograph the letter. It gets explained, privately, inside a sealed hardware enclave on NEAR AI Cloud." |
| 4 | Proof, before sending | "Before a single byte leaves your device, your browser checks the hardware itself. A fresh session nonce. A signed Intel TDX quote. The enclave's own key. If a check fails, nothing is sent." |
| 5 | Explained | "Inside that sealed memory, an AI reads every page and explains it. A summary. The key facts. What you may need to do. Warnings. In a fixed order a screen reader can follow." |
| 6 | Every fact traced | "Every fact points back to the line it came from. Ask a question in your own words, and the answer arrives with its quote. If the letter doesn't say it, Sightline says so. It does not guess." |
| 7 | The receipt | "Each answer is signed by the enclave that produced it, and the receipt shows which checks ran, and which could not. Proof, not promises." |
| 8 | Forget | "Then press Forget. The pages vanish from memory. Nothing is stored, and no account is holding your documents. Sightline. Built on NEAR. Verify, don't trust." |

## Fact discipline

- "Two billion people" — WHO: 2.2 billion people have a near or distance vision impairment.
- "twelve checks" is not spoken; the receipt on screen lists the app's real check names
  (`quote_is_tdx`, `quote_binds_our_nonce`, `td_not_debug`, `gpu_evidence_verdict`, …) and states the
  ones that could not run, which is the app's `partial` behaviour.
- No claim beyond `claims.ts`: the film never says the upload is end-to-end encrypted, because
  `E2EE_PROVEN_IN_BROWSER` is false.
- Model names shown on screen are the real `STEP_PLANS` rows: `z-ai/glm-5.3-flash` (page + Q&A) and
  `Qwen/Qwen3.8-27B` (structure).
- Letter content is the repo's authored synthetic Northgate / Meadow Walk fixture text.
