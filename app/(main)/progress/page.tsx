import { getAllCards, getLibraryWordsWithLevels } from "@/lib/actions/srs";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { getEnLevelCounts } from "@/lib/words";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { withTimeout } from "@/lib/db/timeout";
import { ProgressView } from "./progress-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressPage() {
  const session = await getSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  const language = (await getTargetLanguage()) || "en";
  const userId = session?.user?.id;

  // Read the learner's ENTIRE deck, every language. The Progress "My Words /
  // Mastered / Learning / New" tiles are a personal total, not a per-language
  // view. Filtering by a single language here hid cards whenever the unit's
  // targetLanguage (used on write) differed from the user's global preference
  // (used on read) — the rows were in Postgres but the UI showed 0. Reading
  // without a language filter makes the page authoritative and guarantees it
  // matches the "Refresh SRS Data" endpoint, which now reads the same way.
  // Both reads are time-boxed: postgres.js has no queue timeout, so an
  // unbounded await on a saturated pool would hang the page until the
  // serverless function is killed (this page used to hang past 45s).
  const srsCards = await withTimeout<Awaited<ReturnType<typeof getAllCards>>>(
    "progress:getAllCards",
    getAllCards(undefined, userId, false, false, session?.user?.email).catch(() => []),
    12000,
    [],
  ).catch((err) => {
    console.error("[progress] getAllCards failed, showing empty deck:", err);
    return [];
  });

  // "My Books" vocabulary (word + CEFR level). This is the source of truth for
  // the Progress page's "My Words" and "New" counts: New = My Books − Mastered
  // − Learning, so it reaches zero the moment My Books is empty.
  const libraryWords = await withTimeout<
    Awaited<ReturnType<typeof getLibraryWordsWithLevels>>
  >("progress:getLibraryWordsWithLevels", getLibraryWordsWithLevels(userId).catch(() => []), 12000, []).catch(
    (err) => {
      console.error("[progress] getLibraryWordsWithLevels failed:", err);
      return [];
    },
  );

  const levelCounts = getEnLevelCounts();

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-4 pb-20">
      <ProgressView
        isAdmin={isAdmin}
        srsCards={srsCards}
        libraryWords={libraryWords}
        language={language}
        levelDictionaryCounts={levelCounts}
      />
    </div>
  );
}
