"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

interface CopyLinkButtonProps {
  path: string;
  className?: string;
  size?: "default" | "sm" | "xs" | "icon";
  showLabel?: boolean;
}

export function CopyLinkButton({
  path,
  className = "",
  size = "xs",
  showLabel = false,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Link copied!" : "Share / Copy link"}
      aria-label={copied ? "Link copied" : "Share link"}
      className={`inline-flex items-center justify-center gap-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer ${
        copied
          ? "bg-green-100 text-green-700 border border-green-300"
          : "text-lingo-text-light hover:text-lingo-blue hover:bg-lingo-blue/10 bg-lingo-gray/40 border border-transparent"
      } ${
        size === "icon"
          ? "p-1.5 h-7 w-7"
          : size === "xs"
          ? "px-2 py-1 text-[11px] h-6"
          : "px-3 py-1.5 text-xs"
      } ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
          {showLabel && <span>Copied!</span>}
        </>
      ) : (
        <>
          <Share2 className="h-3 w-3 shrink-0" />
          {showLabel && <span>Share</span>}
        </>
      )}
    </button>
  );
}
