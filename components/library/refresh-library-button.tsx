"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshLibraryButton() {
  const [loading, setLoading] = useState(false);

  function handleRefresh() {
    setLoading(true);
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <h2 className="text-lg font-black text-lingo-text mb-2">
        click refresh to load library
      </h2>
      <p className="text-sm text-lingo-text-light mb-5">
        Please refresh the page to view your content.
      </p>
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border-b-4 border-lingo-blue-dark bg-lingo-blue px-6 py-2.5 text-sm font-bold uppercase text-white shadow-sm transition-all hover:bg-lingo-blue/90 active:translate-y-[1px] disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Refreshing..." : "Refresh Library"}</span>
      </button>
    </div>
  );
}
