import { getAllCards } from "@/lib/actions/srs";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { getEnLevelCounts } from "@/lib/words";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { ProgressView } from "./progress-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressPage() {
  const session = await getSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  const language = (await getTargetLanguage()) || "en";

  // Read the learner's ENTIRE deck, every language. The Progress "My Words /
  // Mastered / Learning / New" tiles are a personal total, not a per-language
  // view. Filtering by a single language here hid cards whenever the unit's
  // targetLanguage (used on write) differed from the user's global preference
  // (used on read) — the rows were in Postgres but the UI showed 0. Reading
  // without a language filter makes the page authoritative and guarantees it
  // matches the "Refresh SRS Data" endpoint, which now reads the same way.
  const srsCards = await getAllCards(undefined, session?.user?.id).catch((err) => {
    console.error("[progress] getAllCards failed, showing empty deck:", err);
    return [];
  });

  const levelCounts = getEnLevelCounts();

  return (
    <div className="w-full max-w-3xl mx-auto px-1 sm:px-4 py-4 pb-20">
      <ProgressView
        isAdmin={isAdmin}
        isAuthorAllWords={false}
        srsCards={srsCards}
        language={language}
        levelDictionaryCounts={levelCounts}
      />
    </div>
  );
}
