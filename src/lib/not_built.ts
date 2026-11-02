/**
 * The scaffold's only shared helper.
 *
 * `docs/PROJECT_STRUCTURE.md` §1 fixes the file layout before the features
 * exist, so most modules in `src/` are typed stubs. A stub that returns a fake
 * value would be worse than one that throws: the pipeline could call it and get
 * an answer that looks real. So every unfinished function throws this, naming
 * the ROADMAP item that owns it.
 *
 * Nothing here is a feature. Deleting this file should be impossible before
 * every stub is gone, which is what keeps the scaffold honest.
 */
export class NotBuilt extends Error {
  readonly item: string;

  constructor(item: string, what: string) {
    super(`${what} is not implemented yet. Owner: ROADMAP item ${item}.`);
    this.name = 'NotBuilt';
    this.item = item;
  }
}

export function notBuilt(item: string, what: string): never {
  throw new NotBuilt(item, what);
}
