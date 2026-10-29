"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";
import {
  MessageSquare,
  Library,
  FileText,
  Languages,
  BarChart3,
  Settings,
  Users,
  Table2,
} from "lucide-react";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/library", label: "Library", icon: Library },
  { href: "/markdown", label: "Markdown", icon: FileText },
  { href: "/words", label: "Words", icon: Languages },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface MobileNavProps {
  showChat?: boolean;
  /** Owner-only: the markdown workspace replaces the old Read page. */
  showMarkdown?: boolean;
  isAdmin?: boolean;
}

export function MobileNav({
  showChat = true,
  showMarkdown = true,
  isAdmin = false,
}: MobileNavProps) {
  const pathname = usePathname();
  const isKeyboardOpen = useMobileKeyboardOpen();

  // Hide nav entirely when keyboard is open (resizes-content handles layout)
  if (isKeyboardOpen) return null;

  const items = navItems.filter((item) => {
    if (item.href === "/chat" && !showChat) return false;
    if (item.href === "/markdown" && !showMarkdown) return false;
    return true;
  });
  const adminItems = isAdmin
    ? [
        { href: "/library/students", label: "VIP", icon: Users },
        { href: "/library/course-stat", label: "Course Stat", icon: Table2 },
      ]
    : [];
  const allItems = [...items, ...adminItems];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t-2 border-lingo-border bg-white/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,4px)]">
      {allItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-bold transition-all duration-150 active:scale-90 active:opacity-70 touch-manipulation ${
              active ? "text-lingo-blue" : "text-lingo-text-light hover:text-lingo-text"
            }`}
          >
            <Icon className="w-5 h-5 transition-transform active:scale-110 stroke-[2.25]" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
