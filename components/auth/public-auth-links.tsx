"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PublicAuthLinks() {
  const pathname = usePathname();
  const redirectParam = pathname ? `?redirect=${encodeURIComponent(pathname)}` : "";

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/sign-in${redirectParam}`}
        className="rounded-xl px-3 py-1.5 text-sm font-bold text-lingo-text-light hover:bg-lingo-gray/50 transition-colors"
      >
        Sign In
      </Link>
      <Link
        href={`/sign-up${redirectParam}`}
        className="rounded-xl bg-lingo-green px-4 py-1.5 text-sm font-bold text-white border-b-2 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
      >
        Sign Up
      </Link>
    </div>
  );
}
