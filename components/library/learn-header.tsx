"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateUnitForm } from "@/components/library/create-unit-form";

export function LearnHeader({
  targetLanguage,
  isAdmin,
}: {
  targetLanguage?: string;
  isAdmin?: boolean;
}) {
  const [showCreateUnit, setShowCreateUnit] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2 justify-center">
        {isAdmin && (
          <button
            onClick={() => setShowCreateUnit(!showCreateUnit)}
            className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2.5 text-sm font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-green hover:bg-lingo-green/5 active:translate-y-[1px] active:shadow-none"
          >
            {showCreateUnit ? "Close Form" : "+ New Unit"}
          </button>
        )}
        <Link
          href="/library/browse"
          className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2.5 text-sm font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-blue hover:bg-lingo-blue/5 active:translate-y-[1px] active:shadow-none"
        >
          Browse Content
        </Link>
      </div>

      {isAdmin && showCreateUnit && (
        <div className="mt-4">
          <CreateUnitForm
            onClose={() => setShowCreateUnit(false)}
            defaultTargetLanguage={targetLanguage}
          />
        </div>
      )}
    </div>
  );
}
