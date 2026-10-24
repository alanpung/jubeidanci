"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

interface TopBarProps {
  stats?: {
    currentStreak: number;
    wordsLearned: number;
  } | null;
}

export function TopBar({ stats }: TopBarProps) {
  const router = useRouter();
  const { data: session } = useSession();

  async function handleSignOut() {
    try {
      if (typeof document !== "undefined") {
        document.cookie = "openlingo_guest=; Max-Age=0; path=/;";
      }
      await signOut();
    } catch {}
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-lingo-border bg-white px-4 md:px-6">
      <div className="md:hidden">
        <Link href="/library" className="flex items-center gap-2">
          <Image
            src="/icon.svg"
            alt="句背单词"
            width={32}
            height={32}
            className="w-8 h-8"
            priority
          />
          <span className="text-xl font-black text-rainbow tracking-tight">
            句背单词
          </span>
        </Link>
      </div>



      <div className="flex-1" />

      <div className="flex items-center gap-4 ml-4">
        {session?.user && (
          <span className="text-sm font-bold text-lingo-text hidden sm:inline">
            {session.user.name}
          </span>
        )}
        <button
          onClick={handleSignOut}
          className="rounded-xl px-3 py-1.5 text-sm font-bold text-lingo-text-light hover:bg-lingo-gray/50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
