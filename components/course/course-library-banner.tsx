"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";

interface CourseLibraryBannerProps {
  courseId: string;
  initialIsInLibrary: boolean;
}

export function CourseLibraryBanner({
  courseId,
  initialIsInLibrary,
}: CourseLibraryBannerProps) {
  const router = useRouter();
  const [isInLibrary, setIsInLibrary] = useState(initialIsInLibrary);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addCourseToLibrary(courseId);
        if (result.success) {
          setIsInLibrary(true);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add course");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeCourseFromLibrary(courseId);
        if (result.success) {
          setIsInLibrary(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove course");
      }
    });
  }

  if (isInLibrary) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-lingo-green/30 bg-lingo-green/5 p-3 sm:px-4 sm:py-2.5 min-w-0 max-w-full">
        <div className="flex items-center gap-2 text-xs font-bold text-lingo-green">
          <span>✓</span>
          <span>In My Library</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href="/library"
            className="text-xs font-bold text-lingo-blue hover:underline whitespace-nowrap"
          >
            View in Library &rarr;
          </Link>
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? "Removing..." : "Remove from My Library"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border-2 border-lingo-blue/30 bg-lingo-blue/5 p-4 text-center">
      <h2 className="text-base font-black text-lingo-text mb-1">
        Add this course to your Library
      </h2>
      <p className="text-xs text-lingo-text-light mb-3 max-w-sm mx-auto">
        Save this course and its units to your Library to track your learning progress and practice anytime.
      </p>
      {error && (
        <p className="text-xs text-red-500 font-bold mb-2">{error}</p>
      )}
      <button
        onClick={handleAdd}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-lingo-blue px-5 py-2 text-sm font-bold text-white border-b-2 border-lingo-blue-dark hover:bg-lingo-blue/90 active:translate-y-[1px] active:border-b-0 transition-all disabled:opacity-60"
      >
        {isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Adding to My Library...
          </>
        ) : (
          "+ Add to My Library"
        )}
      </button>
    </div>
  );
}
