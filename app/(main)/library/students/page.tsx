import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import {
  listRegisteredStudents,
  listOwnerPrivateContent,
} from "@/lib/actions/student-access";
import { withTimeout } from "@/lib/db/timeout";
import { StudentAccessManager } from "@/components/library/student-access-manager";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  const [studentsRes, contentRes] = await Promise.allSettled([
    withTimeout("students:list", listRegisteredStudents(), 8000, []),
    withTimeout(
      "students:content",
      listOwnerPrivateContent(),
      8000,
      { courses: [], units: [] },
    ),
  ]);

  const students =
    studentsRes.status === "fulfilled" ? studentsRes.value : [];
  const content =
    contentRes.status === "fulfilled"
      ? contentRes.value
      : { courses: [], units: [] };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-lingo-text">
          Student Access
        </h1>
        <p className="mt-1 text-sm text-lingo-text-light">
          Pick a registered student, then tap <span className="font-bold">Y</span>{" "}
          next to any private course or unit to let that student see it in their
          own library. Tap again to revoke.
        </p>
      </header>

      <StudentAccessManager
        students={students}
        courses={content.courses}
        units={content.units}
      />
    </div>
  );
}
