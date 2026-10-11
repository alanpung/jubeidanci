"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/read", label: "Read", icon: "📖" },
  { href: "/words", label: "Words", icon: "🔤" },
  { href: "/progress", label: "Progress", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

interface SidebarProps {
  showChat?: boolean;
  showRead?: boolean;
}

export function Sidebar({ showChat = true, showRead = true }: SidebarProps) {
  const pathname = usePathname();
  const items = navItems.filter((item) => {
    if (item.href === "/chat" && !showChat) return false;
    if (item.href === "/read" && !showRead) return false;
    return true;
  });

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r-2 border-lingo-border bg-white">
      <div className="flex h-16 items-center px-6">
        <Link href="/library" className="flex items-center gap-2.5 group">
          <Image
            src="/icon.svg"
            alt="jubeidanci"
            width={36}
            height={36}
            className="w-9 h-9 transition-transform group-hover:scale-105"
            priority
          />
          <span className="text-2xl font-black text-rainbow tracking-tight">
            jubeidanci
          </span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
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
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
