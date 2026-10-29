"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

interface SidebarProps {
  showChat?: boolean;
  /** Owner-only: the markdown workspace replaces the old Read page. */
  showMarkdown?: boolean;
  isAdmin?: boolean;
}

export function Sidebar({
  showChat = true,
  showMarkdown = true,
  isAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const items = navItems.filter((item) => {
    if (item.href === "/chat" && !showChat) return false;
    if (item.href === "/markdown" && !showMarkdown) return false;
    return true;
  });
  const vipItems = isAdmin
    ? [{ href: "/library/students", label: "VIP", icon: Users }]
    : [];
  const statItems = isAdmin
    ? [{ href: "/course-stat", label: "Course Stat", icon: Table2 }]
    : [];
  const libraryIndex = items.findIndex((i) => i.href === "/library");
  const allItems = [
    ...items.slice(0, libraryIndex + 1),
    ...statItems,
    ...items.slice(libraryIndex + 1),
    ...vipItems,
  ];

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r-2 border-lingo-border bg-white">
      <div className="flex h-16 items-center px-6">
        <Link href="/library" className="flex items-center gap-2.5 group">
          <Image
            src="/icon.svg"
            alt="句背单词"
            width={36}
            height={36}
            className="w-9 h-9 transition-transform group-hover:scale-105"
            priority
          />
          <span className="text-2xl font-black text-rainbow tracking-tight">
            句背单词
          </span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {allItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-colors ${
                active
                  ? "bg-lingo-blue/10 text-lingo-blue border-2 border-lingo-blue/20"
                  : "text-lingo-text-light hover:bg-lingo-gray/50"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0 stroke-[2.25]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
