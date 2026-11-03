import { ResultsView } from '@/features/analysis/ResultsView';
import { AskPanel } from '@/features/qa/AskPanel';
import { ReadAloud } from '@/app/_flow/ReadAloud';

/**
 * Results (item **P-04**). The route is a three-line wrapper: the section order, the flagged facts
 * and the receipt are owned by `features/analysis/ResultsView.tsx`, the question panel by
 * `features/qa/AskPanel.tsx` (P-06), and the read-aloud control by `app/_flow/ReadAloud.tsx` (P-09).
 * This file is the only place that knows all three exist, which is what keeps the fixed order in one
 * component without making features import each other.
 */
export default function ReadPage() {
  return (
    <ResultsView
      ask={<AskPanel />}
      speak={<ReadAloud />}
    />
  );
}
