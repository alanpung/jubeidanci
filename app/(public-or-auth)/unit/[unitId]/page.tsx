import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { user, userUnitLibrary } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUnitWithContent } from "@/lib/db/queries/courses";
import { getUnitProgress } from "@/lib/actions/progress";
import { isAdminEmail } from "@/lib/ai/models";
import { StandaloneUnitPath } from "./standalone-unit-path";
import { PublicUnitPath } from "./public-unit-path";
import { UnitLibraryBanner } from "./unit-library-banner";
import { HoverableText } from "@/components/word/hoverable-text";
import { getLanguageName } from "@/lib/languages";
import { getSession } from "@/lib/auth-server";

interface PageProps {
  params: Promise<{ unitId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { unitId } = await params;
  const unit = await getUnitWithContent(unitId);

  if (!unit || unit.visibility !== "public") {
    return { title: "Unit | jubeidanci" };
  }

  const lessonCount = unit.lessons.length;
  const languageName = getLanguageName(unit.targetLanguage);
  const details = [
    lessonCount > 0 ? `${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}` : null,
    languageName,
    unit.level,
  ].filter(Boolean).join(" · ");

  const description = details
    ? `${unit.description} — ${details}`
    : unit.description;

  const title = `${unit.title} | jubeidanci`;

  const url = `/unit/${unitId}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "jubeidanci",
      images: [
        {
          url: `/unit/${unitId}/og-image`,
          width: 1200,
          height: 630,
          alt: unit.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/unit/${unitId}/og-image`],
    },
  };
}

export default async function StandaloneUnitPage({ params }: PageProps) {
  const { unitId } = await params;
  const session = await getSession();
  const unit = await getUnitWithContent(unitId);
  if (!unit) notFound();

  // If unit belongs to a course, redirect there
  if (unit.courseId) {
    redirect(`/library/${unit.courseId}?unit=${unitId}`);
  }

  // Visibility check for anonymous users
  const isPublic = unit.visibility === "public";
  const isOwner = session?.user?.id === unit.createdBy;

  // Check if created by site admin
  let isCreatedByAdmin = false;
  if (unit.createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, unit.createdBy));
    isCreatedByAdmin = creator?.email ? isAdminEmail(creator.email) : false;
  }

  const isAccessible = isPublic || isCreatedByAdmin;

  if (!session && !isAccessible) {
    notFound();
  }

  if (session && !isAccessible && !isOwner) {
    notFound();
  }

  // Handle unparseable units
  if (unit.parseError) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-lingo-text">{unit.title}</h1>
        </div>
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
          <div className="mb-3 text-3xl">&#9888;&#65039;</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">
            Unit can&apos;t be parsed
          </h2>
          <p className="text-sm text-red-600 mb-4">
            This unit&apos;s markdown contains errors and cannot be loaded. The
            exercises could not be parsed correctly.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/library"
              className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2 text-sm font-bold text-lingo-text hover:bg-lingo-gray/30 transition-colors"
            >
              Back to Library
            </Link>
            {session?.user?.id && (
              <Link
                href={`/library/edit/${unitId}`}
                className="rounded-xl border-2 border-lingo-blue bg-lingo-blue px-4 py-2 text-sm font-bold text-white hover:bg-lingo-blue/90 transition-colors"
              >
                Edit Markdown
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user: show full experience with progress and library addition
  if (session) {
    let completions: { unitId: string; lessonIndex: number }[] = [];
    try {
      const progress = await getUnitProgress(unitId);
      completions = progress.completions;
    } catch {
      // Progress may fail for units not owned by user, that's ok
    }

    let isInLibrary = false;
    if (!isOwner) {
      const [libRow] = await db
        .select({ unitId: userUnitLibrary.unitId })
        .from(userUnitLibrary)
        .where(
          and(
            eq(userUnitLibrary.userId, session.user.id),
            eq(userUnitLibrary.unitId, unitId)
          )
        );
      isInLibrary = !!libRow;
    }

    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/library"
            className="text-xs font-bold text-lingo-text-light hover:text-lingo-text transition-colors flex items-center gap-1"
          >
            &larr; Back to Library
          </Link>
        </div>

        {!isOwner && (
          <UnitLibraryBanner
            unitId={unitId}
            initialIsInLibrary={isInLibrary}
          />
        )}

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-lingo-text">
            <HoverableText text={unit.title} language={unit.targetLanguage} />
          </h1>
          {unit.sourceLanguage && (
            <p className="text-sm text-lingo-text-light mt-1">
              {getLanguageName(unit.sourceLanguage)} →{" "}
              {getLanguageName(unit.targetLanguage)}
            </p>
          )}
        </div>
        <StandaloneUnitPath unit={unit} completions={completions} />
      </div>
    );
  }

  // Anonymous user: show public preview
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">{unit.title}</h1>
        {unit.sourceLanguage && (
          <p className="text-sm text-lingo-text-light mt-1">
            {getLanguageName(unit.sourceLanguage)} →{" "}
            {getLanguageName(unit.targetLanguage)}
          </p>
        )}
      </div>
      <PublicUnitPath unit={unit} />
    </div>
  );
}
