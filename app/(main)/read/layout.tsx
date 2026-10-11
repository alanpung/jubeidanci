import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";

export default async function ReadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  return <>{children}</>;
}
