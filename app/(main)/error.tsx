"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Main layout error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-12 px-4 text-center">
      <div className="rounded-2xl border-2 border-lingo-border bg-white p-8 shadow-sm">
        <div className="text-4xl mb-3">🛠️</div>
        <h2 className="text-lg font-black text-lingo-text mb-2">
          Unable to load this section
        </h2>
        <p className="text-xs font-bold text-lingo-text-light mb-6">
          An unexpected error occurred while loading this page.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-lingo-green hover:bg-lingo-green/90 rounded-xl border-b-4 border-lingo-green-dark active:border-b-0 active:translate-y-1 transition-all cursor-pointer"
          >
            Retry
          </button>
          <Link
            href="/library"
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-lingo-text bg-white hover:bg-lingo-gray/30 rounded-xl border-2 border-lingo-border transition-all"
          >
            Return to Library
          </Link>
        </div>
      </div>
    </div>
  );
}
