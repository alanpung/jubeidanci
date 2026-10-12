import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback/feedback-button";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-lingo-bg px-4 py-8">
      {/* Main content */}
      <main className="max-w-4xl w-full text-center flex flex-col items-center justify-center my-auto pt-6 pb-8">
        {/* Header */}
        <div className="overflow-visible mb-6 flex flex-col items-center gap-3">
          <Image
            src="/icon.svg"
            alt="jubeidanci"
            width={100}
            height={100}
            className="w-24 h-24 drop-shadow-md animate-bounce-short"
            priority
          />
          <h1 className="relative z-20 text-6xl font-black text-rainbow tracking-tight pb-1 inline-block leading-snug overflow-visible">
            jubeidanci
          </h1>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-lg font-bold uppercase text-lingo-green border-2 border-lingo-border hover:bg-lingo-gray/30 transition-colors"
              >
                I Already Have an Account
              </Link>
            </>
          )}
        </div>
      </main>

      {/* Send feedback / Ask for help button at bottom center */}
      <footer className="w-full flex items-center justify-center pb-4 pt-6">
        <FeedbackButton />
      </footer>
    </div>
  );
}

