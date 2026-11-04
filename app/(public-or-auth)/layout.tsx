import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth-server";
import { getUserStatsData } from "@/lib/actions/progress";
import { getSrsStats } from "@/lib/actions/srs";
import MainLayout from "@/app/(main)/layout-client";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { isAdminEmail } from "@/lib/ai/models";
import { SITE_URL } from "@/lib/constants";

export default async function PublicOrAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Authenticated: render full app layout (same as main layout)
  if (session) {
    const isAdmin = isAdminEmail(session.user.email);
    let stats = null;
    try {
      const [userStatsData, srsStats] = await Promise.all([
        getUserStatsData(),
        getSrsStats(),
      ]);
      stats = {
        currentStreak: userStatsData.currentStreak,
        wordsLearned: srsStats.total,
      };
    } catch {
      // User may not have stats yet
    }

    return (
      <MainLayout session={session} stats={stats} isAdmin={isAdmin}>
        {children}
      </MainLayout>
    );
  }

  // Not authenticated: minimal public layout
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const redirectParam = pathname ? `?redirect=${encodeURIComponent(pathname)}` : "";

  return (
    <div className="min-h-screen bg-lingo-bg">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-lingo-border bg-white px-4 md:px-6">
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={SITE_URL}
          className="text-xl font-black text-rainbow tracking-tight"
        >
          句背单词
        </a>
        <div className="flex items-center gap-3">
          <Link
            href={`/sign-in${redirectParam}`}
            className="rounded-xl px-3 py-1.5 text-sm font-bold text-lingo-text-light hover:bg-lingo-gray/50 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href={`/sign-up${redirectParam}`}
            className="rounded-xl bg-lingo-green px-4 py-1.5 text-sm font-bold text-white border-b-2 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </header>
      <PullToRefresh className="p-4 pb-20 md:p-8 md:pb-8">
        <div className="mx-auto max-w-lg">{children}</div>
      </PullToRefresh>
    </div>
  );
}
