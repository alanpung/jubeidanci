"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import { Trash2, Plus, X, Menu, Loader2 } from "lucide-react";
import { deleteConversation, deleteAllConversations } from "@/lib/actions/chat";
import { useMobileKeyboardOpen } from "@/hooks/use-mobile-keyboard-open";

type ConversationSummary = {
  id: string;
  title: string;
  language: string;
  updatedAt: Date;
};

interface ChatLayoutProps {
  conversations: ConversationSummary[];
  children: React.ReactNode;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(date: Date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month} ${hours}:${minutes}`;
}

export function ChatLayout({ conversations, children }: ChatLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<ConversationSummary[]>(conversations);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isKeyboardOpen = useMobileKeyboardOpen();

  // Keep items synced with incoming server conversations
  useEffect(() => {
    setItems(conversations);
  }, [conversations]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();

    // Optimistically remove the deleted conversation immediately
    setDeletingId(id);
    setItems((prev) => prev.filter((c) => c.id !== id));

    try {
      await deleteConversation(id);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    } finally {
      setDeletingId(null);
      if (pathname === `/chat/${id}`) {
        router.push("/chat");
      }
      startTransition(() => {
        router.refresh();
      });
    }
  }

  async function handleClearAll() {
    setIsClearingAll(true);
    setShowConfirmClear(false);
    setItems([]);

    try {
      await deleteAllConversations();
    } catch (err) {
      console.error("Failed to clear chat history:", err);
    } finally {
      setIsClearingAll(false);
      router.push("/chat");
      startTransition(() => {
        router.refresh();
      });
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      {/* Top Header & New Chat Button */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-lingo-border/60">
        <Link
          href="/chat"
          onClick={() => setSidebarOpen(false)}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-lingo-border bg-lingo-card px-3 py-2 text-xs sm:text-sm font-black text-lingo-text transition-all hover:border-lingo-blue hover:bg-lingo-blue/10 shadow-xs active:scale-95"
        >
          <Plus className="h-4 w-4 text-lingo-blue stroke-[3]" />
          <span>New Chat</span>
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="ml-2 rounded-lg p-1.5 text-lingo-text-light hover:bg-lingo-gray/50 md:hidden cursor-pointer"
          title="Close Sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs font-bold text-lingo-text-light">
              No conversations yet
            </p>
            <p className="text-[10px] text-lingo-text-light/70 mt-1">
              Start a new chat to practice speaking & grammar
            </p>
          </div>
        ) : (
          items.map((conv) => {
            const active = pathname === `/chat/${conv.id}`;
            const isDeleting = deletingId === conv.id;
            return (
              <div
                key={conv.id}
                className={`group relative flex items-center justify-between rounded-xl transition-all ${
                  active
                    ? "bg-lingo-blue/15 text-lingo-blue font-bold border border-lingo-blue/30"
                    : "text-lingo-text hover:bg-lingo-gray/40 border border-transparent"
                } ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
              >
                <Link
                  href={`/chat/${conv.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className="min-w-0 flex-1 py-2.5 pl-2.5 pr-1 flex flex-col justify-center"
                >
                  <span className="text-xs sm:text-sm font-semibold truncate block">
                    {conv.title || "Conversation"}
                  </span>
                  <span className="text-[10px] text-lingo-text-light font-mono mt-0.5 block">
                    {formatDate(conv.updatedAt)}
                  </span>
                </Link>

                {/* Delete Button: visible on mobile, hover-revealed on desktop */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, conv.id)}
                  disabled={isDeleting || isPending}
                  className="mr-1.5 shrink-0 rounded-lg p-1.5 text-lingo-text-light/70 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-80 md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
                  title="Delete chat"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Footer: Clear All History */}
      {items.length > 0 && (
        <div className="p-2 border-t border-lingo-border/60 bg-lingo-card/30">
          {showConfirmClear ? (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 p-2.5 border border-red-200 dark:border-red-900/60 text-center space-y-1.5">
              <p className="text-[11px] font-bold text-red-800 dark:text-red-300">
                Delete all chat history?
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isClearingAll}
                  onClick={handleClearAll}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black hover:bg-red-700 transition-colors cursor-pointer"
                >
                  {isClearingAll ? "Deleting..." : "Yes, Delete All"}
                </button>
                <button
                  type="button"
                  disabled={isClearingAll}
                  onClick={() => setShowConfirmClear(false)}
                  className="px-2 py-1 rounded-lg bg-lingo-card border border-lingo-border text-lingo-text text-[10px] font-bold hover:bg-lingo-gray/40 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmClear(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold text-lingo-text-light hover:text-red-600 hover:bg-red-50/50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Chat History</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="-m-4 md:-m-8 md:-mb-8 relative flex h-[calc(100dvh-9rem)] md:h-[calc(100vh-4rem)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r-2 border-lingo-border bg-white transition-transform duration-200 md:relative md:z-0 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-xl md:shadow-none" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile toggle */}
        <div
          className={`items-center px-2 py-1 md:hidden ${
            isKeyboardOpen ? "hidden" : "flex"
          }`}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-lingo-text-light hover:bg-lingo-gray/50 cursor-pointer"
            title="Open Chat History"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
