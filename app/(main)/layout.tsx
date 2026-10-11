import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth-server";
import { getUserStatsData } from "@/lib/actions/progress";
import { getSrsStats, migrateDefaultUserCards } from "@/lib/actions/srs";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PostHogIdentify } from "@/components/providers/posthog-identify";
import { BackgroundRoutePrefetch } from "@/components/providers/background-route-prefetch";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { isAdminEmail } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export default async function MainLayout({
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

  // Self-heal and migrate any transient practice cards recorded under 'default_user'
  migrateDefaultUserCards(session.user.id).catch((err) => {
    console.warn("Transient SRS card migration warning:", err);
  });

  let stats = null;
  try {
    const [userStatsData, srsStats] = await Promise.all([
      getUserStatsData(),
      getSrsStats(),
    ]);
    stats = {
      currentStreak: userStatsData.currentStreak,
      wordsLearned: srsStats.learned,
    };
  } catch {
    // User may not have stats yet
  }

  const isAdmin = isAdminEmail(session.user.email);

  return (
    <div className="h-dvh bg-lingo-bg flex flex-col md:flex-row">
      <PostHogIdentify
        userId={session.user.id}
        email={session.user.email}
        name={session.user.name}
      />
      <BackgroundRoutePrefetch />
      <Sidebar showChat={isAdmin} showRead={isAdmin} />
      <div className="flex flex-1 flex-col md:pl-64 min-h-0 w-full max-w-full overflow-x-hidden">
        <TopBar stats={stats} />
        <PullToRefresh className="p-3 sm:p-4 pb-36 md:p-8 md:pb-8">
          {children}
        </PullToRefresh>
      </div>
      <MobileNav showChat={isAdmin} showRead={isAdmin} />
    </div>
  );
}
