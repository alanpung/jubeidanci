import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { getUnitForEdit } from "@/lib/db/queries/courses";
import { isAdminEmail } from "@/lib/ai/models";
import { UnitEditor } from "./unit-editor";

interface EditUnitPageProps {
  params: Promise<{ unitId: string }>;
}

export default async function EditUnitPage({ params }: EditUnitPageProps) {
  const { unitId } = await params;
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const isAdmin = isAdminEmail(session.user.email);
  const unitData = await getUnitForEdit(unitId, session.user.id, isAdmin);

  if (!unitData) {
    redirect("/library");
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <UnitEditor
        unitId={unitData.id}
        title={unitData.title}
        initialMarkdown={unitData.markdown}
        isPublic={unitData.visibility === "public"}
        isAdmin={isAdmin}
      />
    </div>
  );
}
