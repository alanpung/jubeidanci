"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCourseToLibrary, removeCourseFromLibrary } from "@/lib/actions/library";

interface CourseLibraryButtonProps {
  courseId: string;
  initialIsInLibrary: boolean;
}

export function CourseLibraryButton({
  courseId,
  initialIsInLibrary,
}: CourseLibraryButtonProps) {
  const router = useRouter();
  const [isInLibrary, setIsInLibrary] = useState(initialIsInLibrary);
  const [isPending, startTransition] = useTransition();

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    startTransition(async () => {
      try {
        if (isInLibrary) {
          const result = await removeCourseFromLibrary(courseId);
          if (result.success) {
            setIsInLibrary(false);
            router.refresh();
          } else {
            alert(result.error);
          }
        } else {
          const result = await addCourseToLibrary(courseId);
          if (result.success) {
            setIsInLibrary(true);
            router.refresh();
          } else {
            alert(result.error);
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update library");
      }
    });
  }

  if (isInLibrary) {
    return (
      <button
        onClick={handleToggle}
        disabled={isPending}
        title="Added to My Library (Click to remove)"
        className="group/lib inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-lingo-green/40 bg-lingo-green/10 text-sm font-black text-lingo-green hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50 shadow-xs cursor-pointer"
      >
        <span className="group-hover/lib:hidden">✓</span>
        <span className="hidden group-hover/lib:inline text-xs">✕</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      title="Add to My Library"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-lingo-blue bg-lingo-blue text-sm font-black text-white hover:bg-lingo-blue/90 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
    >
      {isPending ? "…" : "+"}
    </button>
  );
}
