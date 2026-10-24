import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { QUESTION_TYPE_LIST } from "@/lib/content/question-types";
import { resolveCourseQuestionType } from "@/components/library/course-level-icon";

export const dynamic = "force-dynamic";

// Exactly 8 exercise types, laid out as 4 columns x 2 rows.
const FEATURED_TYPES = QUESTION_TYPE_LIST.filter((t) => t.num !== "\u2728").slice(0, 8);

// Reuse the library's own book symbols (gradient tile + lucide glyph) so the
// landing page teaches the same visual language students see on the shelf.
const FEATURED_SYMBOLS = FEATURED_TYPES.map((type) => ({
  type,
  visual: resolveCourseQuestionType(null, null, type.id),
}));

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center bg-lingo-bg px-4 py-4">
      {/* Everything lives in one screen: header, CTA, symbol grid. */}
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 sm:gap-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/icon.svg"
            alt="句背单词"
            width={72}
            height={72}
            className="h-16 w-16 animate-bounce-short drop-shadow-md sm:h-20 sm:w-20"
            priority
          />
          <h1 className="text-4xl font-black leading-none tracking-tight text-rainbow sm:text-5xl">
            句背单词
          </h1>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl border-b-4 border-lingo-green-dark bg-lingo-green px-8 py-2.5 text-base font-bold uppercase text-white transition-colors hover:bg-lingo-green/90"
            >
              Enter
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl border-b-4 border-lingo-green-dark bg-lingo-green px-7 py-2.5 text-base font-bold uppercase text-white transition-colors hover:bg-lingo-green/90"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl border-2 border-lingo-border bg-white px-7 py-2.5 text-base font-bold uppercase text-lingo-green transition-colors hover:bg-lingo-green/90"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* App introduction — the 8 exercise types as library book symbols.
            Extra breathing room here separates the CTA from what follows. */}
        <section className="mt-4 w-full sm:mt-8">
          <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
            {FEATURED_SYMBOLS.map(({ type, visual }) => {
              if (!visual) return null;
              const Icon = visual.Icon;
              return (
                <li key={type.id} className="flex flex-col items-center gap-1.5">
                  <span
                    title={visual.label}
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-white shadow-sm ${visual.bg} ${visual.border}`}
                    aria-hidden
                  >
                    <Icon className="h-5 w-5 stroke-[2.25]" />
                  </span>
                  <span className="text-center text-[11px] font-black leading-tight text-lingo-text">
                    {type.nameEn}
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight text-lingo-text-light">
                    {type.nameZh}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
