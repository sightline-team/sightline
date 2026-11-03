import { ResultsView } from '@/features/analysis/ResultsView';
import { AskPanel } from '@/features/qa/AskPanel';

/**
 * Results (item **P-04**). The route is a two-line wrapper: the section order, the flagged facts
 * and the receipt are owned by `features/analysis/ResultsView.tsx`, and the question panel by
 * `features/qa/AskPanel.tsx` (P-06). This file is the only place that knows both exist, which is
 * what keeps the fixed order in one component without making two features import each other.
 */
export default function ReadPage() {
  return <ResultsView ask={<AskPanel />} />;
}
