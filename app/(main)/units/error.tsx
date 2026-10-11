"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnitsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Units page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-4xl">⚠️</div>
      <h2 className="mb-2 text-xl font-bold text-lingo-text">
        Unable to load units
      </h2>
      <p className="mb-4 text-sm text-lingo-text-light">
        {error.message || "A database or query error occurred while loading this page."}
      </p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-lingo-text-light/60">
          Digest: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={() => reset()} size="sm">
          Try Again
        </Button>
        <Link href="/chat">
          <Button variant="outline" size="sm">
            Go to Chat
          </Button>
        </Link>
      </div>
    </div>
  );
}
