import { getAllCards, getSrsStats, getUserLibraryWords, getRemainingDictionaryCount } from "@/lib/actions/srs";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { getEnLevelCounts } from "@/lib/words";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { withTimeout } from "@/lib/db/timeout";
import { WordExplorer } from "./word-explorer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bounded reads: postgres.js has no queue timeout, so an unbounded await on a
// stalled/saturated DB never returns and the page hangs until the serverless
// function is killed. Every read below is time-boxed; on timeout it degrades to
// an empty slice rather than hanging the whole page.
type SrsCardItem = Awaited<ReturnType<typeof getAllCards>>[number];
const EMPTY_STATS = {
  total: 0,
  due: 0,
  new: 0,
  learning: 0,
  review: 0,
  learned: 0,
  hard: 0,
  ok: 0,
  easy: 0,
};

export default async function WordsPage() {
  const session = await getSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  const language = (await getTargetLanguage()) || "en";

  const [srsCards, stats, libraryWords, remainingCount] = await Promise.all([
    withTimeout<SrsCardItem[]>(
      "words:getAllCards",
      getAllCards(language, undefined, false, false, session?.user?.email).catch(
        () => [] as SrsCardItem[],
      ),
      10000,
      [],
    ),
    withTimeout(
      "words:getSrsStats",
      getSrsStats(language, session?.user?.email).catch(() => EMPTY_STATS),
      10000,
      EMPTY_STATS,
    ),
    withTimeout<string[]>(
      "words:getUserLibraryWords",
      getUserLibraryWords().catch(() => []),
      10000,
      [],
    ),
    // Exact size of the "Remaining" (R) filter's result set, computed the same
    // way the API filters it, so the D button's badge always matches the list.
    // Only the owner ever sees that button, so students skip the extra read.
    withTimeout<number>(
      "words:getRemainingDictionaryCount",
      (isAdmin
        ? getRemainingDictionaryCount(language, session?.user?.id)
        : Promise.resolve(0)
      ).catch(() => 0),
      10000,
      0,
    ),
  ]);

  const levelCounts = getEnLevelCounts();

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4">
      <WordExplorer
        isAdmin={isAdmin}
        srsCards={srsCards}
        srsStats={stats}
        libraryWords={libraryWords}
        language={language}
        levelDictionaryCounts={levelCounts}
        remainingDictionaryCount={remainingCount}
      />
    </div>
  );
}
