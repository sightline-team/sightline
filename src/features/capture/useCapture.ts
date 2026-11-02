'use client';

import { notBuilt } from '@/lib/not_built';
import type { InputKind, Mode } from '@/types';

/**
 * Capture state (item **C-02**). Wraps the native `<input type="file" capture>` flow:
 * add page, remove page, retake the last page, up to `MAX_PAGES`.
 *
 * There is no reorder interaction on purpose (PROJECT_STRUCTURE §8): a drag target is
 * the wrong interaction for the person using this, so capture order *is* the order, and
 * the page-label sanity check (C-05) warns about gaps instead of silently fixing them.
 * The only egress for image bytes is the prepared JPEG built by `lib/image/prepare.ts`,
 * sent by the one client path in `lib/near-ai/client.ts` — this feature touches no network itself.
 */
export interface CaptureState {
  mode: Mode;
  input: InputKind;
  pageCount: number;
  canAddPage: boolean;
  canAnalyse: boolean;
}

export interface CaptureApi {
  addFiles(files: FileList | File[]): Promise<void>;
  removePage(id: string): void;
  retakeLast(): void;
  reset(): void;
}

export function useCapture(): CaptureApi {
  return notBuilt('C-02', 'Capture state') as never;
}
