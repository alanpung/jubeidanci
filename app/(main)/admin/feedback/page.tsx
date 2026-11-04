import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { getFeedbackMessages } from "@/lib/actions/feedback";
import { FeedbackViewer } from "@/components/admin/feedback-viewer";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const session = await getSession();

  if (!session || !isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  const feedbackRes = await getFeedbackMessages();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-black text-lingo-text">User Feedback Messages</h1>
        <p className="mt-1 text-sm text-lingo-text-light">
          View and manage feedback submitted by app users and students.
        </p>
      </header>

      <FeedbackViewer initialMessages={feedbackRes.data || []} />
    </div>
  );
}
