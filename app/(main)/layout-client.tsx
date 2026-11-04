"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PostHogIdentify } from "@/components/providers/posthog-identify";
import { BackgroundRoutePrefetch } from "@/components/providers/background-route-prefetch";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { FeedbackModal } from "@/components/feedback/feedback-button";
import { signOut } from "@/lib/auth-client";

export default function MainLayout({
  children,
  session,
  stats,
  isAdmin,
}: {
  children: React.ReactNode;
  session: any;
  stats: any;
  isAdmin: boolean;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="h-dvh bg-lingo-bg flex flex-col md:flex-row-reverse">
      <PostHogIdentify
        userId={session.user.id}
        email={session.user.email}
        name={session.user.name}
      />
      <BackgroundRoutePrefetch />
      
      {/* Right-side Navigation */}
      <div className="hidden md:flex md:w-64 md:flex-col border-l-2 border-lingo-border bg-white">
        <div className="p-6 border-b-2 border-lingo-border">
          <p className="font-bold text-lingo-text truncate">{session.user.name}</p>
          <button onClick={async () => { await signOut(); location.reload(); }} className="text-xs text-lingo-text-light hover:text-lingo-text underline cursor-pointer">Sign Out</button>
        </div>
        <div className="flex-1">
          <Sidebar isAdmin={isAdmin} />
        </div>
        <div className="p-6 border-t-2 border-lingo-border">
          <button onClick={() => setFeedbackOpen(true)} className="w-full rounded-xl bg-lingo-gray/20 py-2 text-xs font-bold text-lingo-text cursor-pointer">Feedback</button>
        </div>
      </div>

      <div className="flex flex-1 flex-col min-h-0 w-full max-w-full overflow-x-hidden">
        <PullToRefresh className="p-3 sm:p-4 pb-36 md:p-8 md:pb-8">
          {children}
        </PullToRefresh>
      </div>
      <MobileNav isAdmin={isAdmin} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
