"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, Languages, BarChart3, Settings, Users, Table2, MessageSquareText } from "lucide-react";

const navItems = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/words", label: "Words", icon: Languages },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const vipItems = isAdmin
    ? [
        { href: "/library/students", label: "VIP", icon: Users },
        { href: "/admin/feedback", label: "Feedback Msgs", icon: MessageSquareText },
      ]
    : [];
  const statItems = isAdmin
    ? [{ href: "/course-stat", label: "Course Stat", icon: Table2 }]
    : [];
  const libraryIndex = navItems.findIndex((item) => item.href === "/library");
  const allItems = [
    ...navItems.slice(0, libraryIndex + 1),
    ...statItems,
    ...navItems.slice(libraryIndex + 1),
    ...vipItems,
  ];

  return (
    <nav className="px-3 py-4 space-y-1 w-full">
      {allItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-colors ${
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
  );
}
