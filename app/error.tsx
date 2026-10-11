"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalErrorComponent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error caught by error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-black text-lingo-text mb-2">
        Something went wrong
      </h2>
      <p className="text-sm font-bold text-lingo-text-light mb-6 max-w-sm">
        We encountered a temporary rendering issue. Please try refreshing the page.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white bg-lingo-blue hover:bg-lingo-blue/90 rounded-xl border-b-4 border-lingo-blue-dark active:border-b-0 active:translate-y-1 transition-all cursor-pointer"
        >
          Try Again
        </button>
        <Link
          href="/library"
          className="px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-lingo-text bg-white hover:bg-lingo-gray/30 rounded-xl border-2 border-lingo-border transition-all"
        >
          Go to Library
        </Link>
      </div>
    </div>
  );
}
