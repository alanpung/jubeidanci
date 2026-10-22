import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { QUESTION_TYPE_LIST } from "@/lib/content/question-types";

export const dynamic = "force-dynamic";

// Exactly 8 exercise types, laid out as 4 columns x 2 rows.
const FEATURED_TYPES = QUESTION_TYPE_LIST.filter((t) => t.num !== "✨").slice(0, 8);

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center bg-lingo-bg px-4 py-8">
      {/* Main content */}
      <main className="my-auto flex w-full max-w-4xl flex-col items-center justify-center pb-8 pt-6 text-center">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-3 overflow-visible">
          <Image
            src="/icon.svg"
            alt="jubeidanci"
            width={100}
            height={100}
            className="h-24 w-24 animate-bounce-short drop-shadow-md"
            priority
          />
          <h1 className="relative z-20 inline-block overflow-visible pb-1 text-6xl font-black leading-snug tracking-tight text-rainbow">
            jubeidanci
          </h1>
          <p className="mt-1 max-w-md text-sm font-semibold text-lingo-text-light sm:text-base">
            Eight ways to practise. Every lesson mixes them so you learn by
            doing, not by reading.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl border-b-4 border-lingo-green-dark bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white transition-colors hover:bg-lingo-green/90"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl border-b-4 border-lingo-green-dark bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white transition-colors hover:bg-lingo-green/90"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl border-2 border-lingo-border bg-white px-8 py-3 text-lg font-bold uppercase text-lingo-green transition-colors hover:bg-lingo-gray/30"
              >
                I Already Have an Account
              </Link>
            </>
          )}
        </div>

        {/* App introduction — the 8 exercise types, 4 x 2 grid */}
        <section className="mt-10 w-full">
          <h2 className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-lingo-text-light">
            What you&apos;ll practise
          </h2>
          <p className="mb-5 text-xs font-semibold text-lingo-text-light/70">
            8 question types across every unit
          </p>

          <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
            {FEATURED_TYPES.map((type) => (
              <li
                key={type.id}
                className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-lingo-border bg-white px-2 py-3.5 text-center shadow-sm transition-transform hover:-translate-y-0.5 sm:px-3"
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl"
                  style={{ backgroundColor: type.color + "1f" }}
                  aria-hidden
                >
                  {type.icon}
                </span>
                <span className="text-[11px] font-black leading-tight text-lingo-text sm:text-xs">
                  {type.nameEn}
                </span>
                <span className="text-[10px] font-semibold leading-tight text-lingo-text-light sm:text-[11px]">
                  {type.nameZh}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}