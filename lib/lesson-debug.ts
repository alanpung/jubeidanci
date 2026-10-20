/**
 * In-memory trace of the last few completeLesson calls.
 *
 * The "Learning count stays at 0" bug can only be diagnosed with runtime
 * facts (how many results arrived, how many exercises matched, how many words
 * survived the write). Those used to live only in Vercel logs, which meant
 * every investigation needed a fresh lesson run plus a log dive. Keeping a
 * small ring buffer on globalThis lets /api/debug/srs print the same facts on
 * demand, in the same response as the database state.
 */

export interface LessonDebugEntry {
  at: string;
  unitId: string;
  lessonIndex: number;
  resultCount: number;
  skipped: number;
  missingExercise: number;
  zeroWordExercises: number;
  lessonExerciseCount: number | null;
  fallbackUsed: boolean;
  practices: number;
  learningAdded: number;
  masteredAdded: number;
  wordsAdded: number;
  srsError?: string | null;
}

const MAX_ENTRIES = 20;

const globalStore = globalThis as unknown as {
  __lessonDebugBuffer?: LessonDebugEntry[];
};

const buffer: LessonDebugEntry[] = (globalStore.__lessonDebugBuffer ??= []);

export function recordLessonDebug(entry: Omit<LessonDebugEntry, "at">) {
  buffer.unshift({ ...entry, at: new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) {
    buffer.length = MAX_ENTRIES;
  }
}

export function readLessonDebug(): LessonDebugEntry[] {
  return buffer.slice();
}
