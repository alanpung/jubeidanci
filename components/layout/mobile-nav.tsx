"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";

const navItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/read", label: "Read", icon: "📖" },
  { href: "/words", label: "Words", icon: "🔤" },
  { href: "/progress", label: "Progress", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

interface MobileNavProps {
  showChat?: boolean;
  showRead?: boolean;
}

export function MobileNav({ showChat = true, showRead = true }: MobileNavProps) {
  const pathname = usePathname();
  const isKeyboardOpen = useMobileKeyboardOpen();

  // Hide nav entirely when keyboard is open (resizes-content handles layout)
  if (isKeyboardOpen) return null;

  const items = navItems.filter((item) => {
    if (item.href === "/chat" && !showChat) return false;
    if (item.href === "/read" && !showRead) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t-2 border-lingo-border bg-white/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,4px)]">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-bold transition-all duration-150 active:scale-90 active:opacity-70 touch-manipulation ${
              active ? "text-lingo-blue" : "text-lingo-text-light hover:text-lingo-text"
            }`}
          >
            <span className="text-xl transition-transform active:scale-110">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
