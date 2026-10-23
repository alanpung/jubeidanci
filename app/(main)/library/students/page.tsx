import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { listRegisteredStudents } from "@/lib/actions/student-access";
import { withTimeout } from "@/lib/db/timeout";
import { StudentAccessManager } from "@/components/library/student-access-manager";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  const students = await withTimeout(
    "students:list",
    listRegisteredStudents(),
    8000,
    []
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-lingo-text">VIP</h1>
        <p className="mt-1 text-sm text-lingo-text-light">
          Toggle a student to <span className="font-bold">VIP</span> to grant
          them access to all of your private content. Public students can only
          see public courses and units.
        </p>
      </header>

      <StudentAccessManager
        students={students}
        ownerId={session.user.id}
      />
    </div>
  );
}
