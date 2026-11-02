import { appError } from '@/lib/errors';
import type {
  Analysis,
  ErrorCode,
  ID,
  InputKind,
  Mode,
  Page,
  QAEntry,
  Session,
  TrustRecord,
  Transcript,
} from '@/types';

/** Five pages is a product limit (`docs/PRD.md` §5) and a serverless size limit (PRD §12 Q1 row 5). */
export const MAX_PAGES = 5;

export type SessionAction =
  | { type: 'input_selected'; input: InputKind }
  | { type: 'page_added'; page: Page }
  | { type: 'page_removed'; id: ID }
  | { type: 'page_retaken'; id: ID; page: Page }
  | { type: 'analysis_started' }
  | { type: 'verification_passed' }
  | { type: 'transcript_received'; transcript: Transcript }
  | { type: 'retake_continued' }
  | { type: 'analysis_received'; analysis: Analysis }
  | { type: 'question_answered'; entry: QAEntry }
  | { type: 'trust_recorded'; record: TrustRecord }
  | { type: 'failed'; code: ErrorCode; context?: { page?: number } }
  | { type: 'error_cleared' }
  | { type: 'mode_changed'; mode: Mode }
  | { type: 'forgotten' };

export function newId(): ID {
  return crypto.randomUUID();
}

export function initialSession(mode: Mode = 'fixtures'): Session {
  return { id: newId(), createdAt: Date.now(), mode, input: 'images', pages: [], qa: [], trust: [], status: 'idle' };
}

/**
 * In-memory only (ADR-8): this reducer is the whole persistence story, there is
 * no database, and `forgotten` returns a session holding nothing.
 *
 * Deliberate non-guards: actions arriving out of order are not rejected here.
 * The pipeline (F-03, P-03, C-03) owns sequencing. This owns the state shape and
 * the page cap — the one invariant a user can break from the UI.
 */
export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'input_selected':
      return { ...state, input: action.input, status: 'idle' };

    case 'page_added': {
      if (state.pages.length >= MAX_PAGES) {
        return { ...state, status: 'error', error: appError('too_many_pages') };
      }
      const page: Page = { ...action.page, index: state.pages.length };
      return { ...state, pages: [...state.pages, page], status: 'preparing', error: undefined };
    }

    case 'page_removed': {
      // Reindex so "Page n" labels stay contiguous in capture order. There is no
      // reorder UI (PROJECT_STRUCTURE §8): capture order is the order.
      const pages = state.pages.filter((p) => p.id !== action.id).map((p, i) => ({ ...p, index: i }));
      return { ...state, pages, status: 'preparing' };
    }

    case 'page_retaken': {
      const original = state.pages.find((p) => p.id === action.id);
      if (!original) return state;
      const pages = state.pages.map((p) => (p.id === action.id ? { ...action.page, index: original.index } : p));
      return { ...state, pages, status: 'preparing' };
    }

    case 'analysis_started':
      return { ...state, status: 'verifying', error: undefined };

    case 'verification_passed':
      // Pasted text skips transcription entirely (ARCH §5.2); images go to the
      // vision step first.
      return { ...state, status: state.input === 'images' ? 'transcribing' : 'analysing' };

    case 'transcript_received':
      return {
        ...state,
        transcript: action.transcript,
        // Model-reported capture issues come before analysis time is spent
        // (ESSENTIALS pipeline step 5).
        status: action.transcript.captureIssues.length > 0 ? 'needs_retake' : 'analysing',
      };

    case 'retake_continued':
      return { ...state, status: 'analysing' };

    case 'analysis_received':
      return { ...state, analysis: action.analysis, status: 'ready', error: undefined };

    case 'question_answered':
      return { ...state, qa: [...state.qa, action.entry] };

    case 'trust_recorded':
      return { ...state, trust: [...state.trust, action.record] };

    case 'failed':
      // What has already been read stays in memory, so a dropped connection does
      // not lose the session (ARCH §13), while the status still says the step
      // did not finish.
      return { ...state, status: 'error', error: appError(action.code, action.context) };

    case 'error_cleared':
      return { ...state, status: 'idle', error: undefined };

    case 'mode_changed':
      return { ...state, mode: action.mode };

    case 'forgotten': {
      // Fresh id, nothing carried over. What the OS keeps (screen-reader
      // history, clipboard, screenshots, bfcache) is outside this app and is
      // disclosed in the README rather than claimed cleared (P-10).
      return { ...initialSession(state.mode), status: 'forgotten' };
    }
  }
}
