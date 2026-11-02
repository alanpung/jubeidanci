"use server";

import { db } from "@/lib/db";
import { unit, course, userUnitLibrary } from "@/lib/db/schema";
import { and, eq, isNull, count } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { parseUnitMarkdown } from "@/lib/content/unit-parser";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/ai/models";
import { getCourseForManagement, getUserOwnedStandaloneUnits, clearContentCache } from "@/lib/db/queries/courses";
import { invalidateUserLibraryWordsCache } from "@/lib/actions/srs";
import matter from "gray-matter";
import type { CourseManagementInfo, AvailableUnitForCourse } from "@/lib/content/types";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function revalidateUnitPages(courseId?: string | null) {
  clearContentCache();
  // The catalog word universe ("My Words") is derived from course/unit
  // content, so any content change must drop it — otherwise the Progress and
  // Words pages would keep showing the previous word set until the TTL expires.
  invalidateUserLibraryWordsCache().catch(() => {});
  // Use layout-level revalidation recursively in the background to avoid blocking the user action response
  setTimeout(() => {
    try {
      revalidatePath("/library", "layout");
      revalidatePath("/units", "layout");
    } catch (err) {
      console.error("Background path revalidation failed:", err);
    }
  }, 0);
}

export async function updateUnitMarkdown(unitId: string, markdown: string): Promise<
  | { success: true; title: string; lessonCount: number; exerciseCount: number }
  | { success: false; error: string }
> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: unit.createdBy, visibility: unit.visibility }).from(unit).where(eq(unit.id, unitId));
  if (!existing) return { success: false, error: "Unit not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this unit" };
  if (existing.visibility === "public" && !admin) return { success: false, error: "This unit is public and can no longer be edited. Only admins can make changes to public content." };

  const cleaned = markdown.replace(/^```(?:markdown|md)?\n/m, "").replace(/\n```\s*$/, "").trim();
  let parsedUnit;
  try {
    parsedUnit = parseUnitMarkdown(cleaned);
  } catch (err) {
    return { success: false, error: `Failed to parse markdown: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (parsedUnit.lessons.length === 0) return { success: false, error: "No lessons found. Make sure your markdown contains at least one lesson block with --- delimiters." };

  await db.update(unit).set({
    title: parsedUnit.title,
    description: parsedUnit.description,
    icon: parsedUnit.icon,
    color: parsedUnit.color,
    markdown: cleaned,
    targetLanguage: parsedUnit.targetLanguage ?? "de",
    sourceLanguage: parsedUnit.sourceLanguage,
    level: parsedUnit.level,
    updatedAt: new Date(),
  }).where(eq(unit.id, unitId));
  revalidateUnitPages();
  return {
    success: true,
    title: parsedUnit.title,
    lessonCount: parsedUnit.lessons.length,
    exerciseCount: parsedUnit.lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0),
  };
}

export async function deleteUnit(unitId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: unit.createdBy, courseId: unit.courseId }).from(unit).where(eq(unit.id, unitId));
  if (!existing) return { success: false, error: "Unit not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this unit" };
  await db.delete(userUnitLibrary).where(eq(userUnitLibrary.unitId, unitId));
  await db.delete(unit).where(eq(unit.id, unitId));
  revalidateUnitPages(existing.courseId);
  return { success: true };
}

export async function makeUnitPublic(unitId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: unit.createdBy, visibility: unit.visibility, courseId: unit.courseId }).from(unit).where(eq(unit.id, unitId));
  if (!existing) return { success: false, error: "Unit not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this unit" };
  if (existing.visibility === "public") return { success: false, error: "Unit is already public" };
  await db.update(unit).set({ visibility: "public", updatedAt: new Date() }).where(eq(unit.id, unitId));
  revalidateUnitPages(existing.courseId);
  return { success: true };
}

export async function makeUnitPrivate(unitId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: unit.createdBy, visibility: unit.visibility, courseId: unit.courseId }).from(unit).where(eq(unit.id, unitId));
  if (!existing) return { success: false, error: "Unit not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "Only the author or admin can make units private" };
  if (existing.visibility !== "public") return { success: false, error: "Unit is already private" };
  await db.update(unit).set({ visibility: null, updatedAt: new Date() }).where(eq(unit.id, unitId));
  revalidateUnitPages(existing.courseId);
  return { success: true };
}

export async function makeCoursePublic(courseId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, courseId));
  if (!existing) return { success: false, error: "Course not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  if (existing.visibility === "public") return { success: false, error: "Course is already public" };
  await db.update(course).set({ visibility: "public", updatedAt: new Date() }).where(eq(course.id, courseId));
  revalidateUnitPages(courseId);
  return { success: true };
}

export async function makeCoursePrivate(courseId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, courseId));
  if (!existing) return { success: false, error: "Course not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  if (existing.visibility === "private") return { success: false, error: "Course is already private" };
  await db.update(course).set({ visibility: "private", updatedAt: new Date() }).where(eq(course.id, courseId));
  revalidateUnitPages(courseId);
  return { success: true };
}

/** Hide a course: it becomes visible to its owner only (and admins). Non-owners
 *  — including VIP students of the owner — can no longer see or open it. */
export async function makeCourseHidden(courseId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, courseId));
  if (!existing) return { success: false, error: "Course not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  if (existing.visibility === "hidden") return { success: false, error: "Course is already hidden" };
  await db.update(course).set({ visibility: "hidden", updatedAt: new Date() }).where(eq(course.id, courseId));
  revalidateUnitPages(courseId);
  return { success: true };
}

export async function createCourse(data: { title: string; sourceLanguage: string; targetLanguage: string; level: string }): Promise<{ success: true; courseId: string } | { success: false; error: string }> {
  const session = await requireSession();
  if (!data.title.trim()) return { success: false, error: "Title is required" };
  if (!data.sourceLanguage) return { success: false, error: "Source language is required" };
  if (!data.targetLanguage) return { success: false, error: "Target language is required" };
  if (!data.level) return { success: false, error: "Level is required" };
  const courseId = `${slugify(data.title)}-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(course).values({ id: courseId, title: data.title.trim(), sourceLanguage: data.sourceLanguage, targetLanguage: data.targetLanguage, level: data.level, visibility: null, published: true, createdBy: session.user.id, createdAt: new Date(), updatedAt: new Date() });
  revalidateUnitPages();
  return { success: true, courseId };
}

export async function deleteCourse(courseId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existing] = await db.select({ createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, courseId));
  if (!existing) return { success: false, error: "Course not found" };
  if (existing.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  await db.update(unit).set({ courseId: null, updatedAt: new Date() }).where(eq(unit.courseId, courseId));
  await db.delete(course).where(eq(course.id, courseId));
  revalidateUnitPages();
  return { success: true };
}

export async function addUnitToCourse(unitId: string, courseId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existingCourse] = await db.select({ createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, courseId));
  if (!existingCourse) return { success: false, error: "Course not found" };
  if (existingCourse.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  const [existingUnit] = await db.select({ createdBy: unit.createdBy, courseId: unit.courseId }).from(unit).where(eq(unit.id, unitId));
  if (!existingUnit) return { success: false, error: "Unit not found" };
  if (existingUnit.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this unit" };
  if (existingUnit.courseId) return { success: false, error: "Unit is already assigned to a course. Remove it first." };
  await db.update(unit).set({ courseId, updatedAt: new Date() }).where(eq(unit.id, unitId));
  revalidateUnitPages(courseId);
  return { success: true };
}

export async function removeUnitFromCourse(unitId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const [existingUnit] = await db.select({ courseId: unit.courseId }).from(unit).where(eq(unit.id, unitId));
  if (!existingUnit) return { success: false, error: "Unit not found" };
  if (!existingUnit.courseId) return { success: false, error: "Unit is not in a course" };
  const [existingCourse] = await db.select({ id: course.id, createdBy: course.createdBy, visibility: course.visibility }).from(course).where(eq(course.id, existingUnit.courseId));
  if (!existingCourse) return { success: false, error: "Course not found" };
  if (existingCourse.createdBy !== session.user.id && !admin) return { success: false, error: "You do not own this course" };
  await db.update(unit).set({ courseId: null, updatedAt: new Date() }).where(eq(unit.id, unitId));
  revalidateUnitPages(existingCourse.id);
  return { success: true };
}

export async function fetchCourseManagementData(courseId: string): Promise<{ success: true; course: CourseManagementInfo; availableUnits: AvailableUnitForCourse[] } | { success: false; error: string }> {
  const session = await requireSession();
  const courseData = await getCourseForManagement(courseId, session.user.id, isAdminEmail(session.user.email));
  if (!courseData) return { success: false, error: "Course not found or access denied" };
  return { success: true, course: courseData, availableUnits: await getUserOwnedStandaloneUnits(session.user.id) };
}

export async function updateCourseTitle(
  courseId: string,
  newTitle: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  const trimmed = newTitle.trim();
  if (!trimmed) {
    return { success: false, error: "Title cannot be empty" };
  }

  const [existing] = await db
    .select({ createdBy: course.createdBy, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existing) return { success: false, error: "Course not found" };
  if (existing.createdBy !== session.user.id && !admin) {
    return { success: false, error: "You do not own this course" };
  }
  if (existing.visibility === "public" && !admin) {
    return {
      success: false,
      error:
        "This course is public and can no longer be modified. Only admins can make changes to public content.",
    };
  }

  await db
    .update(course)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(eq(course.id, courseId));

  revalidateUnitPages(courseId);
  return { success: true };
}

export async function createManualUnit(data: {
  title: string;
  targetLanguage: string;
  sourceLanguage?: string;
  level?: string;
  courseId?: string;
  questionType?: string;
}): Promise<{ success: true; unitId: string } | { success: false; error: string }> {
  const session = await requireSession();
  const admin = isAdminEmail(session.user.email);
  if (!data.title?.trim()) return { success: false, error: "Title is required" };
  if (!data.targetLanguage) return { success: false, error: "Target language is required" };

  const courseId = data.courseId || null;

  // Admins may create units anywhere. A non-admin may only create a unit for a
  // course they own — and a public course is locked for non-admins, matching
  // the rule `updateCourseTitle` already enforces.
  if (!admin) {
    if (!courseId) {
      return {
        success: false,
        error: "Only the site owner can create standalone units",
      };
    }
    const [ownerCourse] = await db
      .select({ createdBy: course.createdBy, visibility: course.visibility })
      .from(course)
      .where(eq(course.id, courseId));
    if (!ownerCourse) {
      return { success: false, error: "Course not found" };
    }
    if (ownerCourse.createdBy !== session.user.id) {
      return { success: false, error: "You do not own this course" };
    }
    if (ownerCourse.visibility === "public") {
      return {
        success: false,
        error:
          "This course is public and can no longer be modified. Only admins can make changes to public content.",
      };
    }
  }

  const unitId = crypto.randomUUID();
  const title = data.title.trim();
  const targetLanguage = data.targetLanguage;
  const sourceLanguage = data.sourceLanguage || "en";
  const level = data.level || "A1";
  const qType = data.questionType || "multiple-choice";

  let exerciseBlock = "";
  let icon = "📘";

  switch (qType) {
    case "fill-in-the-blank":
      icon = "✏️";
      exerciseBlock = `[fill-in-the-blank]\nsentence: "Complete the ___ here."\nblank: "word"\nsrsWords: "word"`;
      break;
    case "matching-pairs":
      icon = "🧩";
      exerciseBlock = `[matching-pairs]\n- "Word 1" = "Translation 1"\n- "Word 2" = "Translation 2"\n- "Word 3" = "Translation 3"`;
      break;
    case "listening":
      icon = "🎧";
      exerciseBlock = `[listening]\ntext: "Sentence to listen and transcribe"\nttsLang: "${targetLanguage}"\nsrsWords: "sample"`;
      break;
    case "word-bank":
      icon = "🧱";
      exerciseBlock = `[word-bank]\ntext: "Translate: 'Sentence here'"\nwords: "sample" "word" "here"\nanswer: "sample" "word" "here"\nsrsWords: "sample"`;
      break;
    case "speaking":
      icon = "🎙️";
      exerciseBlock = `[speaking]\nsentence: "Sentence to practice speaking"\nsrsWords: "sample"`;
      break;
    case "flashcard-review":
      icon = "🎴";
      exerciseBlock = `[flashcard-review]\nfront: "Word or prompt"\nmeaning: "English meaning or definition"\ntranslation: "中文翻译"\nsrsWords: "sample"`;
      break;
    case "translation":
      icon = "🌐";
      exerciseBlock = `[translation]\ntext: "Translate to target language:"\nsentence: "Sentence to translate"\nanswer: "Translation here"\nsrsWords: "sample"`;
      break;
    case "mix":
      icon = "🔀";
      exerciseBlock = `[multiple-choice]\ntext: "Select the correct option"\nchoices:\n  - "Option 1" (correct)\n  - "Option 2"\n  - "Option 3"\nsrsWords: "sample"\n\n[fill-in-the-blank]\nsentence: "Complete the ___ here."\nblank: "word"\nsrsWords: "word"`;
      break;
    case "multiple-choice":
    default:
      icon = "🎯";
      exerciseBlock = `[multiple-choice]\ntext: "Select the correct option"\nchoices:\n  - "Option 1" (correct)\n  - "Option 2"\n  - "Option 3"\nsrsWords: "sample"`;
      break;
  }

  // Units are ordered by the "Unit N:" prefix in their title (see
  // `naturalSortUnits`). A hand-made unit without that prefix would sort
  // alphabetically and land in the wrong place, so number it for the course
  // it is being added to.
  let finalTitle = title;
  if (courseId && !/^\s*unit\s*\d+\s*:/i.test(title)) {
    const [row] = await db
      .select({ count: count() })
      .from(unit)
      .where(eq(unit.courseId, courseId));
    finalTitle = `Unit ${Number(row?.count ?? 0) + 1}: ${title}`;
  }

  // A double quote inside the title would break the YAML front-matter below.
  const yamlSafeTitle = finalTitle.replace(/"/g, "'");
  const yamlSafeDesc = `Practice exercises for ${finalTitle}`.replace(/"/g, "'");

  const initialMarkdown = `---
unitTitle: "${yamlSafeTitle}"
description: "${yamlSafeDesc}"
icon: "${icon}"
color: "#4CAF50"
targetLanguage: "${targetLanguage}"
sourceLanguage: "${sourceLanguage}"
level: "${level}"
questionType: "${qType}"
---

---
lessonTitle: "Lesson 1: Introduction"
description: "Practice exercises"
icon: "${icon}"
color: "#FF9600"
---

${exerciseBlock}
`;

  await db.insert(unit).values({
    id: unitId,
    courseId,
    title: finalTitle,
    description: `Practice exercises for ${finalTitle}`,
    icon,
    color: "#4CAF50",
    markdown: initialMarkdown,
    targetLanguage,
    sourceLanguage,
    level,
    visibility: null,
    createdBy: session.user.id,
  });
  revalidateUnitPages(courseId);
  return { success: true, unitId };
}
