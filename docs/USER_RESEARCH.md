# User research

Item **U-02** holds the sessions; **U-03** updates `docs/PRD.md` from them. Written before any
session happened, deliberately: the file exists so the absence of evidence is visible rather
than implied.

**Status as of 2026-11-02: no session has taken place.** U-01 (find at least one blind or
low-vision person) is open and owned by the human. If nobody is reachable by **2026-11-05**,
**U-04** applies: record it here, weaken the Impact claim in `README.md`, and mark the items
`[!]`. Until a session happens, the personas and the "explanation beats transcription" premise
in `docs/PRD.md` §2 remain an assumption we are honest about — not a finding.

## Why this project needs it

Sightline's whole argument is that a blind or low-vision person would trust an attested enclave
with a benefits letter or a medical result. Every one of our answers to "would you use this"
currently comes from the people building it. The two questions research can actually change the
design are:

1. Is the trust model legible? If the trust receipt reads as noise, T-09/T-04 need a different shape.
2. Is the privacy trade worth it for documents like these? If not, the product premise is wrong
   and ROADMAP §9's "cut from the scope list" trigger fires.

## Consent and recording rules (before the first session)

- Consent spoken at the start, and again for recording; either can be withdrawn mid-session.
- **No personal documents.** Do not photograph, paste, upload or transcribe a real piece of mail
  during research. If a participant wants to show one, that is a conversation, not a specimen.
- Notes are about workflow and judgement, not identity. No names, addresses, NHS or account
  numbers, no quotations tied to a person.
- The participant's own assistive tech is theirs; we observe how they use it, we do not configure it.
- Never send a participant an API key, and never ask them to pay for anything.

## Session protocol (four questions from U-02)

1. How do you handle sensitive mail today? (who reads it for you, what you refuse to share, what you tolerate)
2. What would make you trust a service with it? (name the thing you'd need to see or verify)
3. Is explanation more useful than reading? (does "what this means and what to do" beat accurate text?)
4. What would make you stop using this? (the failure that ends it)

Then a 10-minute walkthrough of whatever build exists at that date, with them driving and us silent.

## Sessions

_None recorded. Copy this block per session._

### Template

| Field | Value |
|---|---|
| Date (UTC) | |
| Device + OS + screen reader + version | |
| Participant (role only, no name) | |
| Build shown (commit) | |
| Consent for notes / recording | |

**Answers to the four questions** — verbatim where it matters, anonymised.

**Observed**: where they got stuck, what they skipped, what they asked for that we do not have.

**Findings that change the plan** — each one names the ROADMAP item it moves.

**Not learned** — what the session did not answer, so a later one can.

## Decisions changed by research

_None yet._ This section is the only place findings become product decisions; if it is still empty
at submission, `README.md` must say the design was not validated with a user.
