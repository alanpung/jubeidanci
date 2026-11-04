"use client";

import { useState } from "react";
import { MessageSquareText, Trash2, Search, RefreshCw, Copy, Check, Mail, User, ShieldCheck } from "lucide-react";
import { deleteFeedbackMessage, FeedbackMessageItem } from "@/lib/actions/feedback";

interface FeedbackViewerProps {
  initialMessages: FeedbackMessageItem[];
}

export function FeedbackViewer({ initialMessages }: FeedbackViewerProps) {
  const [messages, setMessages] = useState<FeedbackMessageItem[]>(initialMessages);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingError, setDeletingError] = useState<string | null>(null);

  const filteredMessages = messages.filter((msg) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      msg.userEmail.toLowerCase().includes(q) ||
      (msg.userName && msg.userName.toLowerCase().includes(q)) ||
      msg.message.toLowerCase().includes(q) ||
      (msg.authMethod && msg.authMethod.toLowerCase().includes(q))
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this feedback message?")) {
      return;
    }

    setDeletingId(id);
    setDeletingError(null);
    const result = await deleteFeedbackMessage(id);
    setDeletingId(null);

    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } else {
      setDeletingError(result.error || "Failed to delete message");
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (date: Date) => {
    try {
      const d = new Date(date);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(d);
    } catch {
      return String(date);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and stats header */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-lingo-text-light" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, or content..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-lingo-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-lingo-blue/30 focus:border-lingo-blue"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-lingo-text-light hover:text-lingo-text"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-sm text-lingo-text-light font-medium">
          <span className="px-3 py-1 bg-lingo-blue/10 text-lingo-blue font-bold rounded-lg text-xs">
            {filteredMessages.length} {filteredMessages.length === 1 ? "Message" : "Messages"}
          </span>
          <button
            onClick={() => window.location.reload()}
            className="p-2 text-lingo-text-light hover:text-lingo-text hover:bg-lingo-gray/30 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {deletingError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-200">
          {deletingError}
        </div>
      )}

      {/* Messages List */}
      {filteredMessages.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-lingo-border p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-lingo-gray/30 flex items-center justify-center mx-auto text-lingo-text-light">
            <MessageSquareText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lingo-text text-lg">No Feedback Messages</h3>
          <p className="text-sm text-lingo-text-light max-w-sm mx-auto">
            {search
              ? "No messages match your search filter."
              : "User feedback messages submitted through the app will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className="bg-white rounded-2xl border-2 border-lingo-border p-5 shadow-sm hover:border-lingo-blue/30 transition-all space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-lingo-border/60">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-lingo-blue" />
                    <span className="font-bold text-lingo-text text-base">
                      {msg.userName || msg.userEmail.split("@")[0]}
                    </span>
                    {msg.authMethod && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-lingo-gray/40 text-lingo-text-light">
                        <ShieldCheck className="w-3 h-3 text-lingo-blue" />
                        {msg.authMethod}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-lingo-text-light">
                    <Mail className="w-3.5 h-3.5 text-lingo-text-light" />
                    <a
                      href={`mailto:${msg.userEmail}`}
                      className="hover:underline hover:text-lingo-blue"
                    >
                      {msg.userEmail}
                    </a>
                    <span>•</span>
                    <span>{formatDate(msg.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopy(msg.id, msg.message)}
                    className="p-1.5 text-lingo-text-light hover:text-lingo-text hover:bg-lingo-gray/30 rounded-lg transition-colors text-xs flex items-center gap-1"
                    title="Copy message text"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(msg.id)}
                    disabled={deletingId === msg.id}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors text-xs disabled:opacity-50"
                    title="Delete message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message Content */}
              <div className="text-lingo-text text-sm whitespace-pre-wrap leading-relaxed font-normal bg-lingo-bg/50 p-4 rounded-xl border border-lingo-border/40">
                {msg.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
