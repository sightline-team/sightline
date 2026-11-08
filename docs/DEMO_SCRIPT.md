# Sightline Demo Script (Six Beats)

A timing-cued, narrator-scripted walk-through covering the six core demo beats defined in [`docs/PRD.md` §9](file:///home/ademola/sightline/docs/PRD.md#L166) for the NEAR Hackathon (Privacy & Private AI track) video and screening agent reproduction.

Target Video Duration: 2 minutes 45 seconds (≤ 3:00 max).
Reproduction Mode: `npm run dev:fixtures` (zero credentials required) or live relay mode (`npm run dev`).

---

## Technical Setup & Reproduction Preflight

To reproduce this exact sequence locally without credentials:

```bash
# 1. Install dependencies from lockfile
npm ci

# 2. Start the app in fixture mode (no API key needed)
npm run dev:fixtures

# 3. Open browser
# URL: http://localhost:3000
```

---

## Beat 1: The Problem & Eyes-Closed Capture (0:00 – 0:30)

*Focus: A blind or low-vision person handling a sensitive physical document (medical result, council tax bill, bank statement) cannot safely upload it to a public commercial AI vision service.*

### Audio / Narration
> "Every week, millions of blind and low-vision people receive physical letters they cannot read—hospital appointments, tax bills, prescriptions. Current AI vision tools require sending these intimate documents to centralized cloud servers where human reviewers or model trainers can see them.
>
> Sightline was built from scratch for the NEAR Hackathon to solve this. It provides private, verifiable document understanding running inside hardware-attested Confidential Computing enclaves on NEAR AI Cloud."

### Visual & Interaction Action
- **Screen:** Sightline home screen (`/`) on `http://localhost:3000`.
- **Action:**
  - Screen reader cursor navigates to the skip link, then to the main landmark.
  - Announcer speaks: `"Sightline. Understand sensitive documents with private AI."`
  - Camera cuts to a physical user attempting to photograph a synthetic NHS clinic letter on a table without looking at the screen (eyes closed/off-camera).
  - The first photograph is taken at a steep tilt (35° angle, edge cropped).
  - In the web app, select `Add photographs` and upload `public/sample-docs/photographs/page-1.jpg`.

---

## Beat 2: Pre-Upload Hardware Attestation (0:30 – 0:55)

*Focus: Sightline proves the model enclave exists and verifies its hardware measurements BEFORE a single byte of document text leaves the machine.*

### Audio / Narration
> "Before any document bytes or images leave your device, Sightline generates a cryptographically fresh 32-byte nonce and queries the NEAR AI Cloud Confidential Computing attestation service.
>
> In the browser, Sightline parses the Intel TDX hardware quote, verifies that the enclave is not in debug mode, binds the session nonce to the quote's report data, and confirms that the model's signing key is anchored directly in hardware."

### Visual & Interaction Action
- **Screen:** Network tab / Status panel showing attestation hand-shake.
- **Action:**
  - The app displays `"Verifying enclave attestation..."`.
  - The live announcer states: `"Checking hardware attestation from NEAR AI Cloud."`
  - In live mode (Mode B): `GET /v1/attestation/report?nonce=...` completes. Client-side verifier runs 12 cryptographic checks (`bindReport` + `checkQuote`).
  - In demo fixture mode (Mode F): The persistent banner confirms: `"Demo data. No real privacy guarantee in this mode."`

---

## Beat 3: Retake Feedback & Honest Capture Processing (0:55 – 1:25)

*Focus: Sightline never guesses unreadable text; severe capture issues trigger plain-language retake announcements.*

### Audio / Narration
> "Sightline processes multiple pages in strict sequence. If a photo is blurry, dark, or clipped, Sightline tells the user plainly rather than hallucinating details. If a page cannot be transcribed, it leaves a marked hole in place so the user knows what was missed.
>
> Here, our synthetic NHS clinic letter is transcribed across two pages. Let's hit 'Read these photographs'."

### Visual & Interaction Action
- **Screen:** Capture view showing two uploaded pages.
- **Action:**
  - Upload `public/sample-docs/photographs/page-1.jpg` and `public/sample-docs/photographs/page-2.jpg`.
  - Notice the announced page count: `"Two photographs ready to read."`
  - Press `Read these photographs`.
  - Focus moves to the processing status landmark.
  - Announcer updates every 10 seconds without spamming: `"Transcribing page 1...", "Extracting key facts..."`.
  - In fixture mode, sample responses load instantly; in live mode, completions stream from the attested model `Qwen/Qwen3.8-27B`.

---

## Beat 4: Honest Results Presentation (1:25 – 1:55)

*Focus: Results follow a fixed, screen-reader-optimized heading hierarchy. Safety notices flag medication, money, and deadlines. Every fact carries source grounding.*

### Audio / Narration
> "Sightline's results screen always renders in an invariant, honest order: Summary, Key facts, What you may need to do, Warnings, Full text, followed by Ask a question and the Trust receipt.
>
> Important medical facts—like this prescription for Amoxicillin 500mg—are presented with verbatim quotes from the document. A dedicated safety notice warns the user to confirm dosages with a pharmacist. Numbers and dates are never guessed."

### Visual & Interaction Action
- **Screen:** Results screen (`/read`).
- **Action:**
  - Focus moves automatically to `<h1>Document reading</h1>`.
  - Step through headings:
    1. `<h2>Summary</h2>`: Plain-language medical appointment summary.
    2. `<h2>Key facts</h2>`: List of structured facts (Patient Name, NHS Number from drama range, Clinic Date, Medication).
    3. Source quote disclosure expanded on "Amoxicillin 500mg": shows quote `"take 500mg capsules three times daily"` with `"Quote found in document transcript"`.
    4. `<h2>What you may need to do</h2>`: Action item with deadline.
    5. `<h2>Safety notices</h2>`: Notice: `"Medication or dosage mentioned. Confirm all prescription details with a pharmacist or doctor."`
  - Press `Read aloud` to demonstrate Web Speech API synthesis at the user's configured rate (`1.0x` or `1.5x`).
  - Toggle High Contrast mode in `/settings` to show WCAG 2.2 AA compliant contrast palette.

---

## Beat 5: Grounded Follow-Up Q&A (1:55 – 2:20)

*Focus: Interactive follow-up questions answered strictly from the transcript. Honest refusal when text lacks the answer.*

### Audio / Narration
> "Users can ask follow-up questions. But unlike general-purpose chat bots, Sightline fails closed: answers are grounded strictly in the verified transcript.
>
> When asked 'What should I do if I miss a dose?', Sightline answers only what the letter says. When asked 'Can I drive while taking this?', which the letter does not state, Sightline refuses honestly: 'The document does not answer this question.'"

### Visual & Interaction Action
- **Screen:** `Ask a question` section on `/read`.
- **Action:**
  - Focus enters the question input box.
  - Type: `"What is my dosage?"` and press `Ask`.
  - Response displays: `"Amoxicillin 500mg capsules, three times daily for 7 days"`, citing the exact paragraph.
  - Now select the suggested question or type: `"Can I drive?"` and press `Ask`.
  - Response displays: `"The document does not answer this question."`
  - Announcer speaks the honest refusal. No hallucination, no speculation.

---

## Beat 6: Trust Receipt & Complete Forget (2:20 – 2:45)

*Focus: Full transparency in the Trust Receipt, followed by one-click total forgetting.*

### Audio / Narration
> "At any time, the user can review the Trust Receipt on `/trust`. Sightline lists every check that ran and every check that did not run. It never calls a partial check 'verified'.
>
> Finally, when the user presses 'Forget this document', Sightline immediately aborts in-flight network requests, revokes object URLs, and purges all document data from memory and session storage. Zero traces remain on the machine."

### Visual & Interaction Action
- **Screen:** `/trust` receipt view, followed by pressing `Forget`.
- **Action:**
  - Navigate to `/trust`.
  - Review check list:
    - `TDX quote valid`: Passed
    - `Nonce binds to quote`: Passed
    - `Response signature verified`: Passed
    - `Hardware signature chain (Intel PCS)`: Not run (transparently documented)
  - Press `Forget this document` in the navigation header.
  - Confirmation prompt accepted.
  - App state immediately clears, object URLs are revoked, storage keys starting with `sightline.` are wiped.
  - Screen transitions back to `/` with focus placed on the primary heading.
  - Announcer announces: `"Document forgotten. All temporary session data has been cleared."`

---

## Demo Checklist Summary Table

| Beat | Feature | What Reviewer Sees / Hears | PRD Reference |
|---|---|---|---|
| **1** | Eyes-closed photo | Multi-page capture, natural camera workflow | PRD §9.1 |
| **2** | Hardware Attestation | Pre-upload TDX quote check, nonce echo | PRD §9.2, §8 |
| **3** | Honest Capture | Capture feedback, marked page holes | PRD §9.6, §6 R7 |
| **4** | Honest Results | Fixed order, safety notice, grounded facts | PRD §9.3, §6 R4 |
| **5** | Grounded Q&A | Grounded responses + honest out-of-scope refusal | PRD §9.3, §6 R4 |
| **6** | Trust & Forget | Verifiable receipt + complete session purge | PRD §9.4, §9.5, §6 R6 |
