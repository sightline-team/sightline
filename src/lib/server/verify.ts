import 'server-only';

import { bindReport } from '@/lib/near-ai/attestation';
import type { AttestationReport, SigningAlgo } from '@/lib/near-ai/attestation';
import { checkQuote } from '@/lib/near-ai/quote';
import type { AttestationCheck } from '@/lib/near-ai/attestation';

/**
 * What `/api/verify` decides about a report (item **T-03**, ADR-33).
 *
 * Read the honesty of this file before its code: the browser half already runs every check that
 * needs nothing but the report's bytes and SHA-384 (**T-16**, ADR-32), so a second machine running
 * the same arithmetic proves no new fact about the enclave. Two things are still true and both are
 * why this handler exists:
 *
 * 1. **It is the shape the four remaining checks have to arrive through.** `quote_signed_by_hardware`
 *    and `platform_still_trusted` need Intel's certificate service, `gpu_evidence_verdict` needs a
 *    server allowed to reach a second host, `report_expiry` needs signed validity windows a page
 *    cannot read (**B-12**). Each retires *by name* the day it is answered here, and nothing in the
 *    client has to be re-argued when that happens.
 * 2. **It is a second opinion on the same bytes, and the receipt says so in exactly those words.**
 *    A page that displays checks it never ran, or a service that handed this app a report whose
 *    measurements disagree with each other, gets a `no` from a machine that did not write the page.
 *
 * What this can never say: that the report is *genuine*. The nonce arrives in the request — this
 * handler does not mint one, so `nonce_fresh` here means "consistent with the number the page
 * claims it chose", not "this session made it". That sentence is the detail on the passing check,
 * because a check whose strength is not stated on screen is a check the user is being lied about
 * (AGENTS.md §4 rule 5).
 *
 * `status` therefore never leaves this file as `verified`: the four gaps stand while it answers only
 * what the page can answer, and rule 5 forbids a `partial` set of checks wearing the strong word.
 * Nothing here receives or returns document content (ARCH §8), and nothing here is logged.
 */

export interface VerifyRequest {
  report: AttestationReport;
  nonce: string;
  signingAlgo: SigningAlgo;
}

export function verifyReportInput(input: VerifyRequest): AttestationCheck {
  const local = bindReport({ report: input.report, nonce: input.nonce, signingAlgo: input.signingAlgo });
  const quote = checkQuote({
    attestation: input.report.model_attestations?.[0],
    nonce: input.nonce,
    label: 'the report this service was given',
    expectedKey: local.signingKey?.keyOrAddress,
  });

  const repeated = [...local.checks, ...quote];
  const disagreed = repeated.filter((c) => c.ran && !c.passed);
  const ran = repeated.filter((c) => c.ran).length;

  const check = {
    name: 'server_verification',
    ran: true,
    passed: disagreed.length === 0,
    detail:
      disagreed.length === 0
        ? // The count is in the sentence on purpose: eight of these checks cannot run without the
          // quote, and "agreed with all of them" over four would read as a clean bill of health on
          // twelve. Whether a thin re-read is enough to send anything is the gate's call, not this
          // line's — it only reports what it looked at.
          `the checking service re-read these bytes, ran ${ran} of the report's own ${repeated.length} checks and disagreed with none. It is told this session's number rather than choosing its own, so this is a second opinion on the same arithmetic, not new proof about the machine.`
        : `the checking service re-read these bytes and disagreed with ${disagreed.map((c) => c.name).join(', ')}.`,
  };

  return {
    nonce: input.nonce,
    fetchedAt: Date.now(),
    checks: [check],
    status: disagreed.length === 0 ? 'partial' : 'failed',
  };
}
