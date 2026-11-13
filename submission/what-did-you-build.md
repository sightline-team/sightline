# "What did you build?" — the submission form answer

The form asks for the problem, what was built, and how NEAR fits in (contract: 20–2000 characters).
The answer below is plain text with no markup, 1,900 characters, and safe to publish: no
personal data, no secrets, and no claim the repository does not evidence.

---

Sightline is a private reading assistant for blind and low-vision people.

The problem: a GP letter, a benefits decision or a bank statement still has to be read by someone. If you cannot see it, you either ask a sighted person to read it aloud, or paste it into a cloud AI whose operator can read it too. Either way you lose your privacy at the moment you are most vulnerable.

What we built: a web app that takes photographs of a document, or pasted text, and explains it. Summary, key facts, what you may need to do, warnings, the full reading, then questions in your own words. The order is fixed and every section is a real heading, so a screen reader can follow it. Each fact carries the line it came from, and the app checks for itself that those words really appear in the reading. If the document does not answer a question, it says so instead of inventing an answer. If part of a page cannot be read, it says that too instead of guessing. Nothing is stored on the server: no account, no database, no document content in the logs.

How NEAR fits: the explanation is produced by a vision model running inside an attested Intel TDX enclave on NEAR AI Cloud, and that enclave is the product. Before any document data leaves the browser, the app fetches the enclave's attestation report with a fresh 32-byte nonce, checks the TDX quote, and confirms the quote binds that nonce and the key that will sign the answer. If a check fails, nothing is sent. Every answer comes back signed by the enclave, and the signature is verified in the browser, so the app can show a receipt of what actually ran, including the four checks that depend on Intel and NVIDIA attestation services and are named as gaps rather than hidden. Private inference you can verify is why this runs on NEAR rather than a generic cloud.

It runs with no credentials in fixture mode, so the whole flow can be tried without a key.
