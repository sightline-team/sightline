# The X post (X-03) — final copy, one post

Attach `deliver/sightline-x.mp4`. X plays it muted in the timeline, which is why the first frame is
already the letter with the redaction moving.

**276 weighted characters** (296 raw; X counts each bare domain as 23, so the two links cost 46 of the
276). Fits a standard 280 post with 4 to spare — no Premium length needed. The links are bare domains,
not `demo:` / `code:` labels: the labels cost 12 characters, and naming the user in line one was worth
more than the labels.

---

## Post

If you're blind or low-vision, someone else has to read your letters.

Sightline reads them in an attested Intel TDX enclave on NEAR AI Cloud: signed answers, 0 KB kept.

Built at @NEARProtocol #NEARHackathon
sightline-snowy-beta.vercel.app
github.com/sightline-team/sightline
What would you try?

---

## Why one post, not a thread

A thread would buy room for the architecture, and architecture is the one thing `HACKATHON.md` §2 tells
the demo post to skip. Concretely:

- **The video is the "one complete moment"** — letter → enclave → reading → quoted answer → receipt.
  The text is its caption. A second and third post would restate the film in prose.
- **Judging reads the first post.** X truncates a thread in the timeline, and a judge who opens the
  repo does not need post 2; a reader who does not open the repo was never going to read post 3.
- **Threads cost the thing that matters here: the video is 1:52.** A reader already gives two minutes
  to the film; asking for more taps as well is how demo threads lose people.
- **A reply still exists if nuance is wanted.** The honest gap — four named checks that could not run —
  belongs in a deliberate reply, not in a second post pretending to be part of the demo.

What the single post cannot fit, and what I chose to leave out: the check list ("checks listed" was in
an earlier draft), the four-gap sentence, and any accuracy figure. All three are in the video and the
receipt, where they can be read at a person's own pace.

## How each tip in HACKATHON.md §2 is met

| Tip | Where |
|---|---|
| Lead with the user problem, understandable cold | Line 1 names the reader: "If you're blind or low-vision, someone else has to read your letters." No jargon, no statistic, no product name. |
| Show one complete moment | The attached film: the photo, the enclave, the reading, a quoted answer, the receipt. |
| Explain NEAR's role concretely | "an attested Intel TDX enclave on NEAR AI Cloud: signed answers" — NEAR is where the private inference happens, which is why the answer can be verified rather than trusted. Not "powered by NEAR". |
| Link demo and repo, invite feedback | Both links (bare domains, so X linkifies them); the closer asks "What would you try?" — a real question about the product, not a generic "thoughts?". |
| @NEARProtocol and #NEARHackathon, "built at" | "Built at @NEARProtocol #NEARHackathon". @NearLegion / @NearBuilders stay out of the post; they can be tagged in a reply if amplification is wanted. |

## Posting checklist for the human

1. Attach `deliver/sightline-x.mp4` (1:52, 18.8 MiB — under X's 2:20 / 512 MB limits).
2. Paste the copy above exactly, including the question line; X linkifies the bare domains.
3. Post publicly (not a protected account) and open both links logged out: site returns 200, repo 200.
4. Send the post URL back — it is the `demoUrl` field of the submission (max 300 characters), and the
   submission cannot be edited afterwards.
5. Optional, as a **reply** (not a second post): "Four of the checks can't run yet, and the receipt
   names them instead of hiding them." Only add it if you want the honesty beat in text.

Optional amplification reply: @NearLegion @NearBuilders.
