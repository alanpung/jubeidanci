import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth-server";
import { getUserStatsData } from "@/lib/actions/progress";
import { getSrsStats, migrateDefaultUserCards } from "@/lib/actions/srs";
import { isAdminEmail } from "@/lib/ai/models";
import { withTimeout } from "@/lib/db/timeout";
import { runAfterResponse } from "@/lib/after-response";
import MainLayout from "./layout-client";

export const dynamic = "force-dynamic";

export default async function ServerMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") || "";
    const redirectParam = pathname ? `?redirect=${encodeURIComponent(pathname)}` : "";
    redirect(`/sign-in${redirectParam}`);
  }

  void runAfterResponse(() =>
    migrateDefaultUserCards(session!.user.id).catch((err) => {
      console.warn("Transient SRS card migration warning:", err);
    }),
  );

  let stats = null;
  try {
    const [userStatsData, srsStats] = await Promise.all([
      withTimeout("layout:getUserStatsData", getUserStatsData(), 5000, null),
      withTimeout("layout:getSrsStats", getSrsStats(undefined, session.user.email), 5000, null),
    ]);
    stats = userStatsData
      ? {
          currentStreak: userStatsData.currentStreak,
          wordsLearned: srsStats?.learned ?? 0,
        }
      : null;
  } catch {}

  const isAdmin = isAdminEmail(session.user.email);

  return (
    <MainLayout session={session} stats={stats} isAdmin={isAdmin}>
      {children}
    </MainLayout>
  );
}
