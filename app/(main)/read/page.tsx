import Link from "next/link";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { article } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const NEW_ARTICLE_PROMPT = "I want to create a new translated article";


export const dynamic = "force-dynamic";

export default async function ReadPage() {
  const session = await requireSession();

  const articles = await db
    .select({
      id: article.id,
      sourceUrl: article.sourceUrl,
      title: article.title,
      sourceLanguage: article.sourceLanguage,
      targetLanguage: article.targetLanguage,
      cefrLevel: article.cefrLevel,
      status: article.status,
      translationProgress: article.translationProgress,
      totalParagraphs: article.totalParagraphs,
      wordCount: article.wordCount,
      createdAt: article.createdAt,
    })
    .from(article)
    .where(eq(article.userId, session.user.id))
    .orderBy(desc(article.createdAt));

  const STALE_FETCHING_MS = 2 * 60 * 1000; // 2 minutes
  const STALE_TRANSLATING_MS = 5 * 60 * 1000; // 5 minutes

  function isArticleStale(a: { status: string; createdAt: Date }) {
    if (a.status !== "fetching" && a.status !== "translating") return false;
    const age = Date.now() - a.createdAt.getTime();
    if (a.status === "fetching") return age > STALE_FETCHING_MS;
    return age > STALE_TRANSLATING_MS;
  }

  const cefrColors: Record<string, string> = {
    A1: "bg-lingo-green/20 text-lingo-green",
    A2: "bg-lingo-green/20 text-lingo-green",
    B1: "bg-lingo-blue/20 text-lingo-blue",
    B2: "bg-lingo-blue/20 text-lingo-blue",
    C1: "bg-lingo-purple/20 text-lingo-purple",
    C2: "bg-lingo-purple/20 text-lingo-purple",
  };

  function getDomain(url: string) {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-black text-lingo-text mb-6">
        Read Articles
      </h1>

      <div className="mb-6 flex gap-2 justify-center">
        <Link
          href={`/chat?prompt=${encodeURIComponent(NEW_ARTICLE_PROMPT)}`}
          className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2.5 text-sm font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-blue hover:bg-lingo-blue/5 active:translate-y-[1px] active:shadow-none"
        >
          + New Article
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-lingo-border p-8 text-center">
          <span className="text-4xl mb-3 block">📖</span>
          <h2 className="text-lg font-bold text-lingo-text mb-1">
            No articles yet
          </h2>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => {
            const stale = isArticleStale(a);
            const hasFailed = a.status === "failed" || stale;
            const isInProgress =
              (a.status === "fetching" || a.status === "translating") && !stale;
            return (
              <Link
                key={a.id}
                href={`/read/${a.id}`}
                className={`flex items-start gap-3 rounded-xl border-2 bg-white p-4 transition-colors ${
                  hasFailed
                    ? "border-lingo-red/30 hover:border-lingo-red/50 hover:bg-lingo-red/5"
                    : "border-lingo-border hover:border-lingo-blue/30 hover:bg-lingo-blue/5"
                }`}
              >
                <span className="text-2xl shrink-0">📖</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-lingo-text truncate">
                    {a.title || "Untitled"}
                  </h3>
                  <p className="text-xs text-lingo-text-light mt-0.5">
                    {getDomain(a.sourceUrl)}
                  </p>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.targetLanguage && (
                      <span className="inline-block rounded-full bg-lingo-gray/50 px-2 py-0.5 text-[10px] font-medium text-lingo-text">
                        {a.targetLanguage}
                      </span>
                    )}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cefrColors[a.cefrLevel] ?? "bg-lingo-gray/50 text-lingo-text"}`}
                    >
                      {a.cefrLevel}
                    </span>
                    {a.wordCount && a.wordCount > 0 && (
                      <span className="inline-block rounded-full bg-lingo-gray/50 px-2 py-0.5 text-[10px] font-medium text-lingo-text-light">
                        {a.wordCount} words
                      </span>
                    )}
                  </div>

                  {/* Progress bar for in-progress articles */}
                  {isInProgress && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-lingo-gray overflow-hidden">
                        <div
                          className="h-full rounded-full bg-lingo-blue transition-all"
                          style={{
                            width:
                              a.totalParagraphs > 0
                                ? `${(a.translationProgress / a.totalParagraphs) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-lingo-text-light">
                        {a.status === "fetching"
                          ? "Fetching..."
                          : `${a.translationProgress}/${a.totalParagraphs}`}
                      </span>
                    </div>
                  )}

                  {hasFailed && (
                    <p className="text-xs text-lingo-red mt-1.5">
                      Couldn&apos;t read this article, but other articles should work :)
                    </p>
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0 mt-1">
                  {a.status === "completed" && (
                    <svg
                      className="h-4 w-4 text-lingo-green"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {isInProgress && (
                    <span className="h-4 w-4 block animate-spin rounded-full border-2 border-lingo-text-light/30 border-t-lingo-blue" />
                  )}
                  {hasFailed && (
                    <svg
                      className="h-4 w-4 text-lingo-red"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
