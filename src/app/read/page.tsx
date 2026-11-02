import { ResultsView } from '@/features/analysis/ResultsView';

/**
 * Results (item **P-04**). The route is a one-line wrapper: the section order, the flagged
 * facts and the receipt are all owned by `features/analysis/ResultsView.tsx`, so the order a
 * screen-reader user learns by position cannot differ between the route and any later embed.
 */
export default function ReadPage() {
  return <ResultsView />;
}
