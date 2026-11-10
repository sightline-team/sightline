# Sightline Voiceover Script & Demo Video Production Guide

A timing-cued narrator script and video synchronization guide for the official **Sightline** submission at the **NEAR Hackathon (Privacy & Private AI track)**.

- **Total Duration:** 2 minutes 06 seconds (126s) — optimized for X/Twitter native upload (≤ 140s) and hackathon judging criteria.
- **Visual Aesthetic:** Modernist dark obsidian (`#040407` / `#0b0c10`), hairline borders (`#232736`), NEAR Green (`#00EC97`), clean technical typography.
- **Video Output:** [`public/sightline-demo-video.mp4`](file:///home/dell/sightline/public/sightline-demo-video.mp4) (1080p, 30fps, H.264 / AAC compatible).
- **Reproduction Mode:** `npm run dev:fixtures` (zero credentials, fully deterministic).

---

## Narrator Delivery & Pronunciation Guide

- **Tone:** Calm, authoritative, empathetic, precise. No generic hype or marketing buzzwords.
- **Pacing:** ~130 to 140 words per minute. Leave natural micro-pauses at the visual transitions.
- **Pronunciation:**
  - **TEE:** Spoken as individual letters: *"T-E-E"* (Trusted Execution Environment).
  - **TDX:** Spoken as individual letters: *"T-D-X"* (Intel Trust Domain Extensions).
  - **NEAR:** Rhymes with *"peer"*.
  - **EXIF:** Spoken as *"EX-if"*.
  - **Amoxicillin:** *"uh-mox-ih-SIL-in"*.
  - **Nonce:** Rhymes with *"response"*.

---

## Timed Voiceover Script (Beat by Beat)

```
[0:00 - 0:20] BEAT 1: The Privacy Dilemma
[0:20 - 0:40] BEAT 2: Pre-Upload Hardware Attestation
[0:40 - 1:00] BEAT 3: Multi-Page Capture & Local EXIF Purge
[1:00 - 1:25] BEAT 4: Verifiable Reading Hierarchy & Fact Grounding
[1:25 - 1:45] BEAT 5: Grounded Q&A & Honest Refusal
[1:45 - 2:06] BEAT 6: Cryptographic Trust Receipt & One-Click Forget
```

---

### Beat 1: The Privacy Dilemma (0:00 – 0:20)
*Duration: 20 seconds · Word count: ~46 words*

**Visual on Screen:**
- Camera/Screen opens on Sightline's dark brutalist homepage (`/`).
- Top-right HUD telemetry displays: `● NEAR AI CLOUD TEE` | `INTEL TDX HARDWARE ENCLAVE` | `ZERO SERVER STORAGE`.
- Lower third displays: `BEAT 1 / 6 · THE PRIVACY DILEMMA`.
- Smooth camera scroll past the 4-pillar cryptographic guarantee cards (Zero Server Storage, Intel TDX Enclaves, Ed25519 Signatures, Client-Side EXIF Stripping) down to the execution pipeline.

**Voiceover Narration:**
> *"For blind and low-vision people, reading physical mail—like medical clinic letters, tax bills, or bank notices—often means sacrificing privacy by uploading to public cloud AI.
>
> Sightline solves this with verifiable privacy, running confidential vision models inside NEAR AI Cloud's hardware-attested Intel TDX enclaves."*

---

### Beat 2: Pre-Upload Hardware Attestation (0:20 – 0:40)
*Duration: 20 seconds · Word count: ~45 words*

**Visual on Screen:**
- Scroll locks onto `#workbench`.
- Focuses on the dual input streams: `// STREAM: OPTICAL_DOCUMENT_INPUT` and `// STREAM: PLAIN_TEXT_INPUT`.
- Lower third displays: `BEAT 2 / 6 · HARDWARE ATTESTATION`.
- Demonstrates that client-side attestation happens *before* any file transmission begins.

**Voiceover Narration:**
> *"Before a single byte of your document leaves the device, Sightline verifies cryptographic hardware attestation.
>
> It inspects the Intel TDX hardware quote, checks that debug mode is disabled, and binds a fresh thirty-two-byte session nonce so the model's signature is anchored directly in silicon."*

---

### Beat 3: Multi-Page Capture & Local EXIF Purge (0:40 – 1:00)
*Duration: 20 seconds · Word count: ~44 words*

**Visual on Screen:**
- Cursor clicks **"Load sample document"** (NHS Clinic Letter).
- Three document pages populate into the capture tray with high-res thumbnails.
- Browser strips 100% of EXIF GPS and camera device metadata client-side.
- Lower third updates to: `BEAT 3 / 6 · MULTI-PAGE CAPTURE`.
- Cursor presses **"Read these photographs"**; screen enters confident TEE processing state.

**Voiceover Narration:**
> *"Sightline processes multi-page documents in strict sequence. All camera metadata, GPS coordinates, and device identifiers are stripped locally in the browser before processing.
>
> When we click 'Read these photographs', the confidential vision pipeline begins transcribing without any intermediate cloud storage."*

---

### Beat 4: Verifiable Hierarchy & Fact Grounding (1:00 – 1:25)
*Duration: 25 seconds · Word count: ~54 words*

**Visual on Screen:**
- Results screen (`/read`) mounts with immediate screen-reader focus on the primary heading.
- Lower third displays: `BEAT 4 / 6 · VERIFIABLE RESULTS`.
- Smooth scroll through the invariant hierarchy: **Summary**, **Key facts**, and **Safety notices**.
- Cursor expands the fact disclosure on *"Reference: NC-0000-SYN"* revealing the exact highlighted quote: *"Northgate Example Trust Reference NC-0000-SYN PAGE 1 OF 3"* with confirmation tag `"Quote found in document transcript"`.
- Highlights the transparent grounded fact extraction and financial notice.

**Voiceover Narration:**
> *"Results render in a fixed, accessible hierarchy: Summary, Key Facts, Actions, and Safety Notices.
>
> Every fact is grounded in the transcript: clicking a fact discloses the exact verbatim quote from the page—such as reference NC-zero-zero-zero-zero-SYN. Sightline highlights what is verified and surfaces safety notices clearly."*

---

### Beat 5: Grounded Q&A & Honest Refusal (1:25 – 1:45)
*Duration: 20 seconds · Word count: ~47 words*

**Visual on Screen:**
- Focus transitions smoothly to **"Ask a question"** (`#ask-heading`).
- Lower third displays: `BEAT 5 / 6 · INTERACTIVE Q&A`.
- Selects: `"What reference number is on these pages?"` → clicks **Ask** → displays verified invoice answer with verbatim quote citation: *"The reference number on the pages is NC-0000-SYN. — quoted from the text: 'Northgate Example Trust Reference NC-0000-SYN PAGE 1 OF 3'"*.
- Selects unanswerable query: `"Is there a payment deadline in this document?"` → clicks **Ask** → displays instant, honest fail-closed refusal: *"No. The document is a synthetic invoice containing only line items... There is no payment deadline, due date, or payment terms mentioned anywhere in the transcript. — the document does not answer this."*

**Voiceover Narration:**
> *"Users can ask interactive follow-up questions. But unlike general chat bots, Sightline fails closed.
>
> For 'What reference number is on these pages?', it answers with the exact invoice reference and quote. But when asked 'Is there a payment deadline?', Sightline refuses honestly, confirming no deadline exists in the document."*

---

### Beat 6: Cryptographic Trust Receipt & One-Click Forget (1:45 – 2:06)
*Duration: 21 seconds · Word count: ~47 words*

**Visual on Screen:**
- Cursor clicks **"Verification"** in the navigation header, navigating to `/trust`.
- Lower third displays: `BEAT 6 / 6 · TRUST RECEIPT & PURGE`.
- Displays the transparent audit trail of checks that ran and passed (`TDX quote valid`, `Nonce binds to quote`, `Response signature verified`).
- Cursor scrolls down and clicks **"Forget this document"** → confirms modal.
- Screen resets instantly to clean homepage; screen reader announces *"Document forgotten. All temporary session data has been cleared."*
- Telemetry badge displays: `SIGHTLINE · ZERO CUSTODY VERIFIED`.

**Voiceover Narration:**
> *"On the Trust Receipt page, Sightline lists every cryptographic check that ran, never overstating partial guarantees.
>
> And when you're done, clicking 'Forget this document' immediately wipes all memory, revokes object URLs, and clears session storage. Zero traces remain."*

---

## Recording Automation & Verification

The demo video is programmatically generated in headful or headless Chromium via Playwright, perfectly timed to this narration track:

```bash
# Generate / re-render the 1080p MP4 demo video:
npx tsx scripts/record-demo-video.ts
```

The resulting file is saved directly to [`public/sightline-demo-video.mp4`](file:///home/dell/sightline/public/sightline-demo-video.mp4) and served on the production root for judging reviews.
