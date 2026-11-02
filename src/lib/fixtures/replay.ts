import { notBuilt } from '@/lib/not_built';
import type { Mode } from '@/types';

/**
 * Fixture replay (item **F-09**) — the reason a reviewer or a screening agent with no
 * API key can run Sightline at all (PRD §12 Q1 row 3, HACKATHON.md Q-012/Q-017).
 *
 * Mode F replaces the network layer, not the pipeline: the same client interface is
 * fed from files in `fixtures/`, so the flow, the grounding checks and the claims
 * ladder all still execute. Fixture mode always shows the "Demo data. No real privacy
 * guarantee." banner (AGENTS.md §4 rule 11).
 *
 * Provenance rule: until S-11 records real responses, what is in `fixtures/` is
 * **authored synthetic** data and must be described that way in the README and in the
 * fixture files themselves. Calling authored data "recorded" would be a false claim
 * about the pipeline being exercised.
 */
export interface FixtureSet {
  name: string;
  input: 'images' | 'text';
  /** File names under `fixtures/responses/`, in the order the pipeline asks for them. */
  responses: string[];
}

export function fixtureModeAvailable(): boolean {
  // Mode F needs no credential of any kind, which is exactly why it is the default.
  return true;
}

export function replay(_path: string, _body: unknown): Promise<unknown> {
  return notBuilt('F-09', 'Fixture replay') as never;
}

/** Chooses relay / direct / fixture handling for a call. Kept separate from `createNearClient` so the client stays one code path. */
export function transportFor(_mode: Mode): 'network' | 'fixtures' {
  return notBuilt('F-09', 'Transport selection') as never;
}
