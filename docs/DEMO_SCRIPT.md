# Sightline Voiceover Script & Demo Video Production Guide

A timing-cued narrator script and video synchronization guide for the official **Sightline** submission at the **NEAR Hackathon (Privacy & Private AI track)**.

- **Total Duration:** 1 minute 43 seconds (102.6s) — optimized for X/Twitter native upload (≤ 140s) and hackathon judging criteria.
- **Visual Aesthetic:** Modernist dark obsidian (`#040407` / `#0b0c10`), hairline borders (`#232736`), NEAR Green (`#00EC97`), clean technical typography.
- **Video Output:** [`public/sightline-demo-video.mp4`](file:///home/dell/sightline/public/sightline-demo-video.mp4) (1080p, 30fps CFR, H.264 / AAC compatible, 9.99 MB).
- **Reproduction Mode:** `npm run dev:fixtures` (zero credentials, fully deterministic).

---

## Narrator Delivery & Pronunciation Guide

- **Tone:** Calm, authoritative, empathetic, precise. No generic hype or marketing buzzwords.
- **Pacing:** ~130 to 140 words per minute. Leave natural micro-pauses at the visual transitions.
- **Total Word Count:** 221 words (~129 wpm across 103 seconds).
- **Pronunciation:**
  - **TEE:** Spoken as individual letters: *"T-E-E"* (Trusted Execution Environment).
  - **TDX:** Spoken as individual letters: *"T-D-X"* (Intel Trust Domain Extensions).
  - **NEAR:** Rhymes with *"peer"*.
  - **EXIF:** Spoken as *"EX-if"*.
  - **Nonce:** Rhymes with *"response"*.
  - **NC-0000-SYN:** *"N-C-zero-zero-zero-zero-S-Y-N"*.

---

## Timed Voiceover Script (Beat by Beat)

```
[0:00 - 0:17] BEAT 1: The Privacy Dilemma (17s)
[0:17 - 0:29] BEAT 2: Pre-Upload Hardware Attestation (12s)
[0:29 - 0:44] BEAT 3: Multi-Page Capture & Local EXIF Purge (15s)
[0:44 - 1:06] BEAT 4: Verifiable Reading Hierarchy & Fact Grounding (22s)
[1:06 - 1:25] BEAT 5: Grounded Q&A & Honest Refusal (19s)
[1:25 - 1:43] BEAT 6: Cryptographic Trust Receipt & One-Click Forget (18s)
```

---

### Beat 1: The Privacy Dilemma (0:00 – 0:17)
*Duration: 17 seconds · Word count: 39 words · Pacing: ~137 wpm*

**Visual on Screen:**
- Camera/Screen opens on Sightline's dark brutalist homepage (`/`).
- Top-right HUD telemetry displays: `● NEAR AI CLOUD TEE` | `INTEL TDX HARDWARE ENCLAVE` | `ZERO SERVER STORAGE`.
- Lower third displays: `BEAT 1 / 6 · THE PRIVACY DILEMMA`.
- Pointer glides across top telemetry indicators.
- Smooth scroll down through the 4-pillar cryptographic guarantee cards (*Zero Server Storage*, *Intel TDX Enclaves*, *Ed25519 Signatures*, *Client-Side EXIF Stripping*) to the execution pipeline.

**Voiceover Narration:**
> *"For blind and low-vision people, reading physical mail—like medical bills and financial statements—often forces a compromise between accessibility and privacy.
>
> Sightline solves this with private document intelligence, running confidential vision models inside NEAR AI Cloud's hardware-attested enclaves."*

---

### Beat 2: Pre-Upload Hardware Attestation (0:17 – 0:29)
*Duration: 12 seconds · Word count: 28 words · Pacing: ~135 wpm*

**Visual on Screen:**
- Scroll locks onto `#workbench`.
- Focuses on the dual input streams: `// STREAM: OPTICAL_DOCUMENT_INPUT` and `// STREAM: PLAIN_TEXT_INPUT`.
- Lower third displays: `BEAT 2 / 6 · HARDWARE ATTESTATION`.
- Cursor inspects the input streams, demonstrating that client-side attestation verification happens *before* any file transmission begins.

**Voiceover Narration:**
> *"Before any document leaves your device, Sightline verifies cryptographic hardware attestation.
>
> It inspects the Intel TDX quote in-browser and binds a fresh session nonce directly to the hardware."*

---

### Beat 3: Multi-Page Capture & Local EXIF Purge (0:29 – 0:44)
*Duration: 15 seconds · Word count: 32 words · Pacing: ~130 wpm*

**Visual on Screen:**
- Cursor glides and clicks **"Load sample document"** (3-page synthetic invoice from Northgate Example Trust).
- Three high-resolution document pages populate into the capture tray in strict sequential order.
- Browser purges 100% of EXIF GPS and camera device metadata client-side.
- Lower third displays: `BEAT 3 / 6 · MULTI-PAGE CAPTURE`.
- Cursor presses **"Read these photographs"**; HUD switches to `BEAT 3 / 6 · TEE PIPELINE EXECUTION`.
- Confident zero-storage transition to `/read`.

**Voiceover Narration:**
> *"Multi-page documents are captured in strict sequence, with all camera metadata and GPS coordinates stripped client-side.
>
> Clicking 'Read these photographs' transmits pages directly into the attested enclave without intermediate storage."*

---

### Beat 4: Verifiable Hierarchy & Fact Grounding (0:44 – 1:06)
*Duration: 22 seconds · Word count: 45 words · Pacing: ~130 wpm*

**Visual on Screen:**
- Results screen (`/read`) mounts with immediate screen-reader focus on primary heading (`What Sightline read`).
- Lower third displays: `BEAT 4 / 6 · VERIFIABLE RESULTS`.
- Smooth scroll through the invariant hierarchy: **Summary card**, **Key facts**, and **Safety warnings**.
- Cursor expands the fact disclosure on *"Reference: NC-0000-SYN"*, revealing the exact highlighted quote: *"Northgate Example Trust Reference NC-0000-SYN PAGE 1 OF 3"* with confirmation tag `"Quote found in document transcript"`.
- Highlights transparent grounded fact extraction without hallucinated confidence scores.

**Voiceover Narration:**
> *"Results render in a fixed, accessible hierarchy: Summary, Key Facts, Actions, and Safety Notices.
>
> Every fact is grounded in the transcript. Disclosing a fact reveals the exact verbatim quote on the page—like reference NC-zero-zero-zero-zero-SYN. No hallucinated confidence scores, just verified quotes."*

---

### Beat 5: Grounded Q&A & Honest Refusal (1:06 – 1:25)
*Duration: 19 seconds · Word count: 39 words · Pacing: ~130 wpm*

**Visual on Screen:**
- Focus transitions smoothly to **"Ask a question"** (`#ask-heading`).
- Lower third displays: `BEAT 5 / 6 · INTERACTIVE Q&A`.
- **Question 1 (Grounded):** Selects `"What reference number is on these pages?"` → clicks **Ask** → displays verified invoice answer with verbatim quote citation: *"The reference number on the pages is NC-0000-SYN..."*.
- **Question 2 (Unanswerable / Honest Refusal):** Selects `"Is there a payment deadline in this document?"` → clicks **Ask** → scrolls down to show both answers side-by-side with Sightline's honest fail-closed refusal: *"No. The document is a synthetic invoice containing only line items... There is no payment deadline, due date, or payment terms mentioned anywhere in the transcript."*

**Voiceover Narration:**
> *"Users can ask interactive questions, but Sightline fails closed.
>
> For the invoice reference, it returns the exact grounded number and quote. But when asked for a payment deadline, Sightline refuses honestly, confirming no deadline exists in the document."*

---

### Beat 6: Cryptographic Trust Receipt & One-Click Forget (1:25 – 1:43)
*Duration: 18 seconds · Word count: 38 words · Pacing: ~132 wpm*

**Visual on Screen:**
- Cursor glides to the navigation header and clicks **"Verification"**, navigating to `/trust`.
- Lower third displays: `BEAT 6 / 6 · TRUST RECEIPT & PURGE`.
- Reviews transparent audit trail of checks that ran (`Intel TDX quote valid`, `Nonce binds to quote`, `Response signature verified`).
- Cursor scrolls and clicks **"Forget this document"**; instantly wipes in-memory buffers and revokes object URLs.
- Clicks Sightline brand link to return to homepage; screen reader confirms all session state cleared.
- Final telemetry badge displays: `SIGHTLINE · ZERO CUSTODY VERIFIED` (`Document Forgotten. All In-Memory State Purged.`).

**Voiceover Narration:**
> *"The Trust Receipt lists every cryptographic check that ran, proving silicon-level integrity.
>
> When finished, 'Forget this document' instantly purges all in-memory state, revokes object URLs, and leaves zero traces behind. Accessible document reading, with true cryptographic privacy."*

---

## Recording Automation & Verification

The demo video is programmatically generated in headful or headless Chromium via Playwright, perfectly timed to this narration track:

```bash
# Generate / re-render the 1080p MP4 demo video:
npx tsx scripts/record-demo-video.ts
```

The resulting file is saved directly to [`public/sightline-demo-video.mp4`](file:///home/dell/sightline/public/sightline-demo-video.mp4) and served on the production root for judging reviews.
