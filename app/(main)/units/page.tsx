import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import {
  getStandaloneUnits,
  getUserOwnedCourses,
} from "@/lib/db/queries/courses";
import type {
  StandaloneUnitInfo,
  OwnedCourseInfo,
} from "@/lib/content/types";
import { isAdminEmail } from "@/lib/ai/models";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { StandaloneUnits } from "./standalone-units";
import { MyCourses } from "./my-courses";
import { LearnHeader } from "./learn-header";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await getSession();

  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  let standaloneUnits: StandaloneUnitInfo[] = [];
  let ownedCourses: OwnedCourseInfo[] = [];
  let targetLang: string | null = null;

  if (userId) {
    const results = await Promise.allSettled([
      getStandaloneUnits(userId),
      getUserOwnedCourses(userId),
      getTargetLanguage(userId),
    ]);

    if (results[0].status === "fulfilled") {
      standaloneUnits = results[0].value;
    } else {
      console.error("LearnPage: getStandaloneUnits failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      ownedCourses = results[1].value;
    } else {
      console.error("LearnPage: getUserOwnedCourses failed:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      targetLang = results[2].value;
    } else {
      console.error("LearnPage: getTargetLanguage failed:", results[2].reason);
    }
  }

  const isEmptyLibrary = ownedCourses.length === 0 && standaloneUnits.length === 0 && !isAdmin;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">My Library</h1>
      </div>
      <LearnHeader
        targetLanguage={targetLang ?? undefined}
        isAdmin={isAdmin}
      />
      {isEmptyLibrary ? (
        <div className="rounded-2xl border-2 border-dashed border-lingo-border bg-white p-8 text-center shadow-sm">
          <div className="text-4xl mb-3">📚</div>
          <h2 className="text-lg font-black text-lingo-text mb-1">
            Your library is empty
          </h2>
          <p className="text-sm text-lingo-text-light mb-5">
            Browse public courses and standalone units to start practicing!
          </p>
          <Link
            href="/units/browse"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-lingo-green bg-lingo-green px-5 py-2.5 text-sm font-black text-white shadow-[0_2px_0_0] shadow-green-700 transition-all hover:bg-lingo-green/90 active:translate-y-[1px]"
          >
            <span>🔍</span> Browse Courses & Units
          </Link>
        </div>
      ) : (
        <>
          <MyCourses courses={ownedCourses} isAdmin={isAdmin} />
          <StandaloneUnits units={standaloneUnits} isAdmin={isAdmin} />
        </>
      )}
    </div>
  );
}
