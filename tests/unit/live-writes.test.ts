import { describe, expect, it } from 'vitest';
import { liveWrites } from '@/app/_flow/live_writes';
import { initialSession, sessionReducer, type SessionAction } from '@/lib/session/reducer';
import type { Analysis, Transcript, TrustRecord } from '@/types';

/**
 * The write gate a cancelled run goes through (item **P-12**).
 *
 * The browser proof is in `tests/e2e/flow.spec.ts` (› "the request that was still going"), where
 * both presses land inside one task so the completion really is owed when Forget aborts it. This
 * file holds the rule the seam can hold: which dispatches survive an abort, and what the **real**
 * reducer does with a late write. The second half matters — it is why the gate exists at all.
 *
 * Builders are local rather than imported from `session-reducer.test.ts`: a test file reading
 * another test file's helpers couples two items' fixtures for no gain.
 */

function transcript(): Transcript {
  return { text: 'Invoice 42. Amount due £840.', pageOffsets: [0], uncertain: [], captureIssues: [] };
}

function analysis(): Analysis {
  return {
    docType: 'bill',
    summary: 'A bill for £840.',
    facts: [{ kind: 'amount', label: 'Payment due', value: '£840', sourceQuote: 'Amount due £840', quoteFound: true }],
    actions: [],
    warnings: [],
    model: 'fixture-model',
  };
}

function trustRecord(): TrustRecord {
  return {
    id: 'tr-1',
    purpose: 'analyse',
    model: 'fixture-model',
    endpoint: 'fixtures',
    requestId: 'req-1',
    e2ee: false,
    attestation: { nonce: 'a'.repeat(64), fetchedAt: 1, checks: [], status: 'partial' },
    signature: { algo: 'ed25519', verified: false },
    claim: 'fixtures',
  };
}

describe('liveWrites (P-12)', () => {
  it('hands every action to the dispatch it was given while the signal is live', () => {
    const controller = new AbortController();
    const seen: SessionAction[] = [];
    const write = liveWrites(controller.signal, (action) => void seen.push(action));

    const actions: SessionAction[] = [
      { type: 'transcript_received', transcript: transcript() },
      { type: 'trust_recorded', record: trustRecord() },
      { type: 'analysis_received', analysis: analysis() },
    ];
    for (const action of actions) write(action);

    expect(seen).toEqual(actions);
  });

  it('drops every write that arrives after the abort, in order', () => {
    const controller = new AbortController();
    const seen: SessionAction[] = [];
    const write = liveWrites(controller.signal, (action) => void seen.push(action));

    write({ type: 'transcript_received', transcript: transcript() });
    controller.abort();
    write({ type: 'trust_recorded', record: trustRecord() });
    write({ type: 'analysis_received', analysis: analysis() });

    // The press lands between two steps of one run: what was already written stays (the session's
    // own `forgotten` clears it a moment later), and what comes after the press never arrives.
    expect(seen.map((action) => action.type)).toEqual(['transcript_received']);
  });

  it('reads the signal when it writes, not when it was built', () => {
    // A run that finishes without ever being cancelled must not lose its own writes because a
    // *later* Forget aborted the controller. Timing is checked, not assumed.
    const controller = new AbortController();
    const seen: SessionAction[] = [];
    const write = liveWrites(controller.signal, (action) => void seen.push(action));

    write({ type: 'analysis_received', analysis: analysis() });
    expect(seen).toHaveLength(1);

    controller.abort();
    write({ type: 'trust_recorded', record: trustRecord() });
    expect(seen).toHaveLength(1);
  });

  describe('with the real reducer', () => {
    /** Drive the reducer the way a run does: through the gate, with Forget pressed halfway. */
    function runForgottenHalfway(throughGate: boolean) {
      const controller = new AbortController();
      let state = initialSession('fixtures');
      const dispatch = (action: SessionAction) => {
        state = sessionReducer(state, action);
      };
      const write = throughGate ? liveWrites(controller.signal, dispatch) : dispatch;

      dispatch({ type: 'input_selected', input: 'text' });
      dispatch({ type: 'analysis_started' });
      write({ type: 'transcript_received', transcript: transcript() });

      controller.abort(); // Forget
      state = sessionReducer(state, { type: 'forgotten' });

      // …and the completion the person cancelled now arrives, as a late run's callbacks do.
      write({ type: 'analysis_received', analysis: analysis() });
      write({ type: 'trust_recorded', record: trustRecord() });
      return state;
    }

    it('a forgotten session stays empty when the run writes through the gate', () => {
      const state = runForgottenHalfway(true);
      expect(state.transcript).toBeUndefined();
      expect(state.analysis).toBeUndefined();
      expect(state.trust).toEqual([]);
      expect(state.status).toBe('forgotten');
    });

    it('the reducer cannot make this check for itself — which is why the gate is load-bearing', () => {
      // The counter-factual, on purpose. A late `analysis_received` is byte-identical to a timely
      // one, so the state machine has nothing to refuse it with and happily rebuilds the reading
      // the person just forgot. Any future composition root must go through `liveWrites` too.
      const state = runForgottenHalfway(false);
      expect(state.analysis?.summary).toBe('A bill for £840.');
      expect(state.trust).toHaveLength(1);
    });
  });

  // The other half of what P-12's rationale named: a transport that *rejects* with
  // `appError('aborted')`. `NearError` becomes `RunHalt` at `lib/near-ai/verification.ts:108` and
  // the composition root's catch swallows it when the signal is aborted — so the one error path
  // that is supposed to be silent has still never executed, because Mode F's transport answers
  // whatever happens. It needs a live transport: F-04, F-05, blocker B-05.
  it.todo("a transport that rejects with appError('aborted') is swallowed by the composition root rather than reported (needs a live mode: F-04, F-05, B-05)");
});
