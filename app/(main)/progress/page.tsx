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

  const srsCards = await getAllCards(language).catch(() => []);

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
