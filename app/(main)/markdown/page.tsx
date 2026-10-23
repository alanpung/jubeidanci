import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { MarkdownWorkspace } from "./markdown-workspace";

export const dynamic = "force-dynamic";

/**
 * Owner-only markdown workspace. Replaces the old "Read" nav slot: the owner
 * authors courses with the AI agent and needs one place to review and tweak the
 * raw markdown that agent produced.
 */
export default async function MarkdownPage() {
  const session = await requireSession();

  // Only the site owner (admin) edits course markdown here.
  if (!isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  return <MarkdownWorkspace />;
}