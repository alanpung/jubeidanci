/**
 * SM-2 spaced repetition algorithm.
 *
 * Quality scale:
 *   0 – complete blackout
 *   1 – incorrect, but remembered upon seeing the answer
 *   2 – incorrect, but the answer felt easy to recall
 *   3 – correct with serious difficulty
 *   4 – correct after hesitation
 *   5 – perfect response
 */

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * "new" survives as a *derived* status only: a word is New when it belongs to
 * the learner's library (the course catalog, plus any word they have already
 * practised) and carries no learning/mastered progress. It is never written to
 * `srs_card` — every write goes through normalizePersistedStatus.
 */
export type CardStatus = "new" | "learning" | "review" | "learned";

export const GRADUATION_THRESHOLD = 3;

/**
 * The status a card is actually allowed to carry in the deck.
 *
 * New is DERIVED (library − mastered − learning), never stored: a row exists
 * only once the learner has touched the word. Every write path funnels its
 * computed status through here, so a "new" result — e.g. SM-2 holding a card at
 * "new" after a failed first attempt — is persisted as "learning" instead.
 * Without this the deck silently re-grows the very rows the purge removes.
 */
export function normalizePersistedStatus(status: string): CardStatus {
  if (status === "learning" || status === "review" || status === "learned") {
    return status;
  }
  // Covers "new" and any unexpected value. The learner has just been shown the
  // word, so it belongs in the learning queue rather than sitting invisible.
  return "learning";
}

/**
 * Is this SRS card status one of the tracked states? A stored row always means
 * the learner has started the word, so the tracked set is learning / learned /
 * review only. "new" is deliberately excluded — New is derived from the library
 * instead — so the "Remaining" (R) filter and getRemainingDictionaryCount no
 * longer treat unpractised words as already owned. A card with any other status
 * (e.g. a removed one) is not in the deck for study.
 */
export function hasTrackedSrsStatus(status: string): boolean {
  return status === "learning" || status === "learned" || status === "review";
}

export interface SrsState {
  easeFactor: number;
  interval: number; // days
  repetitions: number;
  status: CardStatus;
}

export interface SrsResult extends SrsState {
  nextReviewAt: Date;
}

export function calculateNextReview(
  state: SrsState,
  quality: Quality
): SrsResult {
  let { easeFactor, interval, repetitions, status } = state;

  if (quality >= 3) {
    // Correct response (Yes) – advance the schedule
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Incorrect response (No) – reset repetitions
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.max(1.3, easeFactor);

  // Status transitions:
  // - No on new card -> remains "new"
  // - Yes on new card -> transitions to "learning"
  // - 3 consecutive Yes (repetitions >= 3) -> transitions to "learned"
  if (status === "new") {
    if (quality >= 3) {
      status = "learning";
    } else {
      status = "new";
    }
  } else if (status === "learning") {
    if (repetitions >= GRADUATION_THRESHOLD) {
      status = "learned";
    } else {
      status = "learning";
    }
  } else if ((status === "review" || status === "learned") && quality < 3) {
    status = "learning";
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);

  return { easeFactor, interval, repetitions, status, nextReviewAt };
}
