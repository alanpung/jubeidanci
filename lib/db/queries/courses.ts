import { db, isDbAvailable } from "@/lib/db";
import {
  course,
  unit,
  user,
  lessonCompletion,
  userUnitLibrary,
  userCourseEnrollment,
} from "@/lib/db/schema";
import {
  eq,
  and,
  or,
  ne,
  sql,
  isNull,
  count,
  countDistinct,
  inArray,
  notInArray,
} from "drizzle-orm";
import type {
  Course,
  CourseListItem,
  StandaloneUnitInfo,
  UnitWithContent,
  OwnedCourseInfo,
  CourseManagementInfo,
  AvailableUnitForCourse,
} from "@/lib/content/types";
import { getUnitLessonsSafe, getUnitLessonCountFast } from "@/lib/content/loader";
import { getUnitQuestionType } from "@/lib/content/question-types";
import { seedContentFromFilesystem } from "@/lib/db/seed-content";

/**
 * Sorts units naturally by title (e.g. Unit 1 < Unit 2 < Unit 3 < Unit 4 < Unit 10)
 * and falls back to creation date (earlier first).
 */
export function naturalSortUnits<
  T extends { title?: string | null; createdAt?: Date | string | null }
>(units: T[]): T[] {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  return [...units].sort((a, b) => {
    const titleA = (a.title ?? "").trim();
    const titleB = (b.title ?? "").trim();

    const cmp = collator.compare(titleA, titleB);
    if (cmp !== 0) return cmp;

    if (a.createdAt && b.createdAt) {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }
    }
    return 0;
  });
}

interface CourseFilters {
  sourceLanguage?: string;
  targetLanguage?: string;
  level?: string;
}

export async function listCourses(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  try {
    await seedContentFromFilesystem();
  } catch (err) {
    console.warn("listCourses seed warning:", err);
  }

  try {
    const conditions = [eq(course.published, true)];

    // Course-level visibility: public OR owned by the current user
    if (userId) {
      conditions.push(
        or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
      );
    } else {
      conditions.push(eq(course.visibility, "public"));
    }

    if (filters?.sourceLanguage) {
      conditions.push(eq(course.sourceLanguage, filters.sourceLanguage));
    }
    if (filters?.targetLanguage) {
      conditions.push(eq(course.targetLanguage, filters.targetLanguage));
    }
    if (filters?.level) {
      conditions.push(eq(course.level, filters.level));
    }

    // Count units under each course
    const rows = await db
      .select({
        id: course.id,
        title: course.title,
        sourceLanguage: course.sourceLanguage,
        targetLanguage: course.targetLanguage,
        level: course.level,
        createdBy: course.createdBy,
        creatorName: user.name,
        unitCount: countDistinct(unit.id),
      })
      .from(course)
      .leftJoin(unit, eq(unit.courseId, course.id))
      .leftJoin(user, eq(course.createdBy, user.id))
      .where(and(...conditions))
      .groupBy(
        course.id,
        course.title,
        course.sourceLanguage,
        course.targetLanguage,
        course.level,
        course.createdBy,
        user.name
      )
      .orderBy(course.title);

    if (rows.length > 0) {
      return rows.map((r) => ({
        ...r,
        creatorName: r.creatorName ?? (SYSTEM_COURSE_IDS.includes(r.id) ? "Alan P" : null),
        unitCount: Number(r.unitCount),
        lessonCount: 0, // filled below
      }));
    }
  } catch (err) {
    console.warn("listCourses DB query failed, falling back to filesystem:", err);
  }

  // Filesystem fallback when DB is unavailable or empty
  const { getAllCourses, getAllUnits } = await import("@/lib/content/registry");
  const fsCourses = getAllCourses();
  const fsUnits = getAllUnits();
  return fsCourses
    .filter((c) => {
      if (filters?.sourceLanguage && c.sourceLanguage !== filters.sourceLanguage) return false;
      if (filters?.targetLanguage && c.targetLanguage !== filters.targetLanguage) return false;
      if (filters?.level && c.level !== filters.level) return false;
      return true;
    })
    .map((c) => {
      const cUnits = fsUnits.filter((u) => u.parsed.courseId === c.id);
      const lessonsCount = cUnits.reduce((sum, u) => sum + (u.parsed.lessons?.length ?? 0), 0);
      return {
        id: c.id,
        title: c.title,
        sourceLanguage: c.sourceLanguage,
        targetLanguage: c.targetLanguage,
        level: c.level,
        createdBy: null,
        creatorName: "Alan P",
        unitCount: cUnits.length,
        lessonCount: lessonsCount,
      };
    });
}

export const SYSTEM_COURSE_IDS = [
  "a1-flashcard-course",
  "a2-flashcard-course",
  "b1-flashcard-course",
  "b2-flashcard-course",
  "c1-flashcard-course",
  "c2-flashcard-course",
];

// Separate query for accurate lesson counts
export async function listCoursesWithLessonCounts(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  const courses = await listCourses(filters, userId);
  if (courses.length === 0) return courses;

  const courseIds = courses.map((c) => c.id);
  const lessonCountByCourse = new Map<string, number>();

  try {
    const units = await db
      .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
      .from(unit)
      .where(inArray(unit.courseId, courseIds));

    for (const u of units) {
      if (!u.courseId) continue;
      const count = getUnitLessonCountFast(u.markdown ?? "");
      const prev = lessonCountByCourse.get(u.courseId) ?? 0;
      lessonCountByCourse.set(u.courseId, prev + count);
    }
  } catch (err) {
    console.warn("listCoursesWithLessonCounts: unit query failed:", err);
  }

  let enrolledCourseIds = new Set<string>();
  if (userId) {
    try {
      const enrollments = await db
        .select({ courseId: userCourseEnrollment.courseId })
        .from(userCourseEnrollment)
        .where(eq(userCourseEnrollment.userId, userId));
      enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
    } catch (err) {
      console.warn("listCoursesWithLessonCounts: enrollment query failed:", err);
    }
    try {
      const { getLocalCourseEnrollments } = await import("@/lib/srs-store");
      const localEnrollments = await getLocalCourseEnrollments(userId);
      localEnrollments.forEach((id) => enrolledCourseIds.add(id));
    } catch {}
  }

  return courses.map((c) => ({
    ...c,
    lessonCount: lessonCountByCourse.get(c.id) ?? c.lessonCount ?? 0,
    isOwner: userId ? c.createdBy === userId && !SYSTEM_COURSE_IDS.includes(c.id) : false,
    isInLibrary: enrolledCourseIds.has(c.id),
  }));
}

const unitMemoryCache = new Map<string, { data: UnitWithContent; expiresAt: number }>();
const courseMemoryCache = new Map<string, { data: Course; expiresAt: number }>();

export function clearContentCache() {
  unitMemoryCache.clear();
  courseMemoryCache.clear();
}

export async function getCourseWithContent(
  courseId: string,
  userId?: string
): Promise<Course | null> {
  const cacheKey = `${courseId}:${userId ?? "anon"}`;
  const cached = courseMemoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (await isDbAvailable()) {
    try {
      seedContentFromFilesystem().catch(() => {});
    } catch (err) {
      console.warn("getCourseWithContent seed warning:", err);
    }

    try {
      const courseConditions = [eq(course.id, courseId)];
    let isEnrolled = false;
    if (userId) {
      try {
        const enrollment = await db
          .select({ id: userCourseEnrollment.id })
          .from(userCourseEnrollment)
          .where(
            and(
              eq(userCourseEnrollment.userId, userId),
              eq(userCourseEnrollment.courseId, courseId)
            )
          )
          .limit(1);
        isEnrolled = enrollment.length > 0;
        if (!isEnrolled) {
          try {
            const { getLocalCourseEnrollments } = await import("@/lib/srs-store");
            const localEnrollments = await getLocalCourseEnrollments(userId);
            if (localEnrollments.includes(courseId)) {
              isEnrolled = true;
            }
          } catch {}
        }
      } catch (err) {
        console.warn("getCourseWithContent enrollment check failed:", err);
      }
    }

    if (userId && !isEnrolled) {
      courseConditions.push(
        or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
      );
    } else if (!userId) {
      courseConditions.push(eq(course.visibility, "public"));
    }

    const [courseRow] = await db
      .select({
        id: course.id,
        title: course.title,
        sourceLanguage: course.sourceLanguage,
        targetLanguage: course.targetLanguage,
        level: course.level,
        visibility: course.visibility,
        createdBy: course.createdBy,
        creatorName: user.name,
      })
      .from(course)
      .leftJoin(user, eq(course.createdBy, user.id))
      .where(and(...courseConditions));

    if (courseRow) {
      const isSystemCourse = SYSTEM_COURSE_IDS.includes(courseRow.id);
      const courseCreatorName = courseRow.creatorName ?? (isSystemCourse ? "Alan P" : null);

      const units = await db
        .select({
          id: unit.id,
          title: unit.title,
          description: unit.description,
          icon: unit.icon,
          color: unit.color,
          markdown: unit.markdown,
          createdBy: unit.createdBy,
          createdAt: unit.createdAt,
          creatorName: user.name,
        })
        .from(unit)
        .leftJoin(user, eq(unit.createdBy, user.id))
        .where(eq(unit.courseId, courseId));

      const mappedUnits = units.map((u) => {
        const safeResult = getUnitLessonsSafe(u.markdown ?? "");
        const lessons = safeResult?.lessons ?? [];
        return {
          id: u.id,
          title: u.title ?? "Untitled",
          description: u.description ?? "",
          icon: u.icon ?? "📘",
          color: u.color ?? "#58CC02",
          lessons,
          parseError: safeResult?.parseError ?? false,
          createdBy: u.createdBy ?? null,
          creatorName: u.creatorName ?? courseCreatorName,
          createdAt: u.createdAt ?? null,
          questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
        };
      });

      const res: Course = {
        id: courseRow.id,
        title: courseRow.title,
        sourceLanguage: courseRow.sourceLanguage,
        targetLanguage: courseRow.targetLanguage,
        level: courseRow.level,
        visibility: courseRow.visibility,
        createdBy: courseRow.createdBy,
        creatorName: courseCreatorName,
        units: naturalSortUnits(mappedUnits),
      };
      courseMemoryCache.set(cacheKey, { data: res, expiresAt: Date.now() + 60000 });
      return res;
    }
  } catch (err) {
    console.warn("getCourseWithContent DB query failed, falling back to filesystem:", err);
  }
}

  // Filesystem fallback
  const { getAllCourses, getAllUnits } = await import("@/lib/content/registry");
  const fsCourse = getAllCourses().find((c) => c.id === courseId);
  if (!fsCourse) return null;

  const fsUnits = getAllUnits().filter((u) => u.parsed.courseId === courseId);
  const mappedUnits = fsUnits.map((u) => {
    const p = u.parsed;
    const match = p.title.match(/Unit\s+(\d+)/i);
    const unitNum = match ? parseInt(match[1], 10) : null;
    const unitId = unitNum ? `${courseId}-unit-${unitNum}` : `${courseId}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const lessons = p.lessons ?? [];
    return {
      id: unitId,
      title: p.title,
      description: p.description,
      icon: p.icon,
      color: p.color,
      lessons,
      parseError: false,
      createdBy: null,
      creatorName: "Alan P",
      createdAt: null,
      questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
    };
  });

  const res: Course = {
    id: fsCourse.id,
    title: fsCourse.title,
    sourceLanguage: fsCourse.sourceLanguage,
    targetLanguage: fsCourse.targetLanguage,
    level: fsCourse.level,
    visibility: "public",
    createdBy: null,
    creatorName: "Alan P",
    units: naturalSortUnits(mappedUnits),
  };
  courseMemoryCache.set(cacheKey, { data: res, expiresAt: Date.now() + 60000 });
  return res;
}

export async function getAvailableFilters(userId?: string) {
  try {
    const conditions = [eq(course.published, true)];
    if (userId) {
      conditions.push(
        or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
      );
    } else {
      conditions.push(eq(course.visibility, "public"));
    }

    const rows = await db
      .select({
        sourceLanguage: course.sourceLanguage,
        targetLanguage: course.targetLanguage,
        level: course.level,
      })
      .from(course)
      .where(and(...conditions));

    if (rows.length > 0) {
      const sourceLanguages = [...new Set(rows.map((r) => r.sourceLanguage))].sort();
      const targetLanguages = [...new Set(rows.map((r) => r.targetLanguage))].sort();
      const levels = [...new Set(rows.map((r) => r.level))].sort();
      return { sourceLanguages, targetLanguages, levels };
    }
  } catch (err) {
    console.warn("getAvailableFilters DB query failed, falling back to filesystem:", err);
  }

  const { getAllCourses } = await import("@/lib/content/registry");
  const fsCourses = getAllCourses();
  const sourceLanguages = [...new Set(fsCourses.map((r) => r.sourceLanguage))].sort();
  const targetLanguages = [...new Set(fsCourses.map((r) => r.targetLanguage))].sort();
  const levels = [...new Set(fsCourses.map((r) => r.level))].sort();
  return { sourceLanguages, targetLanguages, levels };
}

export async function getStandaloneUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  const dbUp = await isDbAvailable();
  let libraryUnitIds = new Set<string>();
  if (dbUp) {
    try {
      const libraryRows = await db
        .select({ unitId: userUnitLibrary.unitId })
        .from(userUnitLibrary)
        .where(eq(userUnitLibrary.userId, userId));
      libraryUnitIds = new Set(libraryRows.map((r) => r.unitId));
    } catch (err) {
      console.warn("userUnitLibrary query failed, continuing:", err);
    }
  }

  let rows: Array<{
    id: string;
    title: string | null;
    description: string | null;
    icon: string | null;
    color: string | null;
    targetLanguage: string | null;
    sourceLanguage: string | null;
    level: string | null;
    markdown: string | null;
    visibility: string | null;
    createdBy: string | null;
    creatorName: string | null;
    createdAt: Date | null;
  }> = [];

  if (dbUp) {
    try {
      const libraryCondition =
        libraryUnitIds.size > 0
          ? and(
              isNull(unit.courseId),
              or(
                eq(unit.createdBy, userId),
                inArray(unit.id, [...libraryUnitIds])
              )
            )
          : and(eq(unit.createdBy, userId), isNull(unit.courseId));

      rows = await db
        .select({
          id: unit.id,
          title: unit.title,
          description: unit.description,
          icon: unit.icon,
          color: unit.color,
          targetLanguage: unit.targetLanguage,
          sourceLanguage: unit.sourceLanguage,
          level: unit.level,
          markdown: unit.markdown,
          visibility: unit.visibility,
          createdBy: unit.createdBy,
          creatorName: user.name,
          createdAt: unit.createdAt,
        })
        .from(unit)
        .leftJoin(user, eq(unit.createdBy, user.id))
        .where(libraryCondition);
    } catch (err) {
      console.warn("getStandaloneUnits DB query failed:", err);
    }
  }

  // Filesystem standalone units fallback if DB query failed or returned nothing
  if (rows.length === 0) {
    try {
      const { getAllUnits } = await import("@/lib/content/registry");
      const fsUnits = getAllUnits().filter((u) => !u.parsed.courseId);
      for (const fu of fsUnits) {
        const uId = fu.parsed.id ?? fu.parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        if (libraryUnitIds.has(uId)) {
          rows.push({
            id: uId,
            title: fu.parsed.title,
            description: fu.parsed.description,
            icon: fu.parsed.icon,
            color: fu.parsed.color,
            targetLanguage: fu.parsed.targetLanguage ?? "zh",
            sourceLanguage: fu.parsed.sourceLanguage ?? "en",
            level: fu.parsed.level ?? "A1",
            markdown: fu.markdown,
            visibility: "public",
            createdBy: null,
            creatorName: "Alan P",
            createdAt: null,
          });
        }
      }
    } catch {}
  }

  if (rows.length === 0) return [];

  const unitIds = rows.map((r) => r.id);
  const completionMap = new Map<string, number>();

  if (dbUp) {
    try {
      const completionCounts = await db
        .select({
          unitId: lessonCompletion.unitId,
          count: count(),
        })
        .from(lessonCompletion)
        .where(
          and(
            eq(lessonCompletion.userId, userId),
            inArray(lessonCompletion.unitId, unitIds)
          )
        )
        .groupBy(lessonCompletion.unitId);

      for (const c of completionCounts) {
        completionMap.set(c.unitId, Number(c.count));
      }
    } catch (err) {
      console.warn("lessonCompletion query failed, continuing:", err);
    }
  }

  const mapped = rows.map((u) => {
    const safeResult = getUnitLessonsSafe(u.markdown ?? "");
    const lessons = safeResult?.lessons ?? [];
    return {
      id: u.id,
      title: u.title ?? "Untitled",
      description: u.description ?? "",
      icon: u.icon ?? "📘",
      color: u.color ?? "#58CC02",
      targetLanguage: u.targetLanguage ?? "",
      sourceLanguage: u.sourceLanguage ?? null,
      level: u.level ?? null,
      lessonCount: lessons.length,
      completedLessons: completionMap.get(u.id) ?? 0,
      visibility: u.visibility ?? "private",
      creatorName: u.creatorName ?? null,
      isOwner: u.createdBy === userId,
      isInLibrary: libraryUnitIds.has(u.id),
      parseError: safeResult?.parseError ?? false,
      createdAt: u.createdAt ?? null,
      questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
    };
  });

  return naturalSortUnits(mapped);
}

/** Public units that users can browse and add to their library. */
export async function getBrowsableUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  if (!(await isDbAvailable())) return [];
  let libraryUnitIds = new Set<string>();
  try {
    const libraryRows = await db
      .select({ unitId: userUnitLibrary.unitId })
      .from(userUnitLibrary)
      .where(eq(userUnitLibrary.userId, userId));
    libraryUnitIds = new Set(libraryRows.map((r) => r.unitId));
  } catch (err) {
    console.warn("userUnitLibrary query failed:", err);
  }

  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      icon: unit.icon,
      color: unit.color,
      targetLanguage: unit.targetLanguage,
      sourceLanguage: unit.sourceLanguage,
      level: unit.level,
      markdown: unit.markdown,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      creatorName: user.name,
      courseVisibility: course.visibility,
      createdAt: unit.createdAt,
    })
    .from(unit)
    .leftJoin(user, eq(unit.createdBy, user.id))
    .leftJoin(course, eq(unit.courseId, course.id))
    .where(
      and(
        isNull(unit.courseId),
        eq(unit.visibility, "public")
      )
    );

  if (rows.length === 0) return [];

  const mapped = rows.map((u) => {
    const safeResult = getUnitLessonsSafe(u.markdown ?? "");
    const lessons = safeResult?.lessons ?? [];
    return {
      id: u.id,
      title: u.title ?? "Untitled",
      description: u.description ?? "",
      icon: u.icon ?? "📘",
      color: u.color ?? "#58CC02",
      targetLanguage: u.targetLanguage ?? "",
      sourceLanguage: u.sourceLanguage ?? null,
      level: u.level ?? null,
      lessonCount: lessons.length,
      completedLessons: 0,
      visibility: u.visibility ?? u.courseVisibility ?? "public",
      creatorName: u.creatorName ?? null,
      isOwner: u.createdBy === userId,
      isInLibrary: libraryUnitIds.has(u.id),
      parseError: safeResult?.parseError ?? false,
      createdAt: u.createdAt ?? null,
      questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
    };
  });

  return naturalSortUnits(mapped);
}

export async function getUnitForEdit(
  unitId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<{ id: string; title: string; markdown: string; visibility: string | null } | null> {
  if (!(await isDbAvailable())) return null;
  const [u] = await db
    .select({
      id: unit.id,
      title: unit.title,
      markdown: unit.markdown,
      createdBy: unit.createdBy,
      visibility: unit.visibility,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!u) return null;

  if (isAdmin) {
    return {
      id: u.id,
      title: u.title,
      markdown: u.markdown,
      visibility: u.visibility,
    };
  }

  if (u.createdBy !== userId) return null;
  if (u.visibility === "public") return null;

  return {
    id: u.id,
    title: u.title,
    markdown: u.markdown,
    visibility: u.visibility,
  };
}

export async function getUnitWithContent(
  unitId: string
): Promise<UnitWithContent | null> {
  const cached = unitMemoryCache.get(unitId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    if (await isDbAvailable()) {
      const [u] = await db.select().from(unit).where(eq(unit.id, unitId));
      if (u) {
        const safeResult = getUnitLessonsSafe(u.markdown ?? "");
        const res: UnitWithContent = {
          id: u.id,
          title: u.title ?? "Untitled",
          description: u.description ?? "",
          icon: u.icon ?? "📘",
          color: u.color ?? "#58CC02",
          targetLanguage: u.targetLanguage ?? "",
          sourceLanguage: u.sourceLanguage ?? null,
          level: u.level ?? null,
          courseId: u.courseId,
          visibility: u.visibility ?? "private",
          createdBy: u.createdBy,
          lessons: safeResult?.lessons ?? [],
          parseError: safeResult?.parseError ?? false,
          questionType: getUnitQuestionType({ lessons: safeResult?.lessons, markdown: u.markdown }),
        };
        unitMemoryCache.set(unitId, { data: res, expiresAt: Date.now() + 60000 });
        return res;
      }
    }
  } catch (err) {
    console.warn("getUnitWithContent DB error:", err);
  }

  // Fallback to filesystem registry
  try {
    const { getAllUnits } = await import("@/lib/content/registry");
    const fsUnit = getAllUnits().find((u) => {
      const p = u.parsed;
      if (!p.courseId) return false;
      const match = p.title.match(/Unit\s+(\d+)/i);
      const unitNum = match ? parseInt(match[1], 10) : null;
      const fsUnitId = unitNum ? `${p.courseId}-unit-${unitNum}` : `${p.courseId}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      return fsUnitId === unitId;
    });

    if (fsUnit) {
      const p = fsUnit.parsed;
      const lessons = p.lessons ?? [];
      const res: UnitWithContent = {
        id: unitId,
        title: p.title,
        description: p.description,
        icon: p.icon,
        color: p.color,
        targetLanguage: p.targetLanguage ?? "zh",
        sourceLanguage: p.sourceLanguage ?? "en",
        level: p.level ?? "A1",
        courseId: p.courseId,
        visibility: "public",
        createdBy: null,
        lessons,
        parseError: false,
        questionType: getUnitQuestionType({ lessons, markdown: fsUnit.markdown }),
      };
      unitMemoryCache.set(unitId, { data: res, expiresAt: Date.now() + 60000 });
      return res;
    }
  } catch (err) {
    console.warn("getUnitWithContent filesystem fallback error:", err);
  }

  return null;
}

// ─── Course management queries ───

export async function getUserOwnedCourses(
  userId: string
): Promise<OwnedCourseInfo[]> {
  const dbUp = await isDbAvailable();
  if (dbUp) {
    try {
      await seedContentFromFilesystem();
    } catch (err) {
      console.warn("getUserOwnedCourses seed warning:", err);
    }
  }

  let enrolledCourseIds: string[] = [];
  if (dbUp) {
    try {
      const enrollments = await db
        .select({ courseId: userCourseEnrollment.courseId })
        .from(userCourseEnrollment)
        .where(eq(userCourseEnrollment.userId, userId));
      enrolledCourseIds = enrollments.map((e) => e.courseId);
    } catch (err) {
      console.warn("getUserOwnedCourses enrollment query failed:", err);
    }
  }

  try {
    const { getLocalCourseEnrollments } = await import("@/lib/srs-store");
    const localEnrollments = await getLocalCourseEnrollments(userId);
    localEnrollments.forEach((id) => {
      if (!enrolledCourseIds.includes(id)) enrolledCourseIds.push(id);
    });
  } catch {}

  if (dbUp) {
    try {
      const userUnits = await db
        .select({ courseId: unit.courseId })
        .from(userUnitLibrary)
        .innerJoin(unit, eq(unit.id, userUnitLibrary.unitId))
        .where(eq(userUnitLibrary.userId, userId));
      userUnits.forEach((u) => {
        if (u.courseId && !enrolledCourseIds.includes(u.courseId)) {
          enrolledCourseIds.push(u.courseId);
        }
      });
    } catch (err) {
      console.warn("getUserOwnedCourses userUnitLibrary query failed:", err);
    }

    try {
      const completedUnits = await db
        .select({ courseId: unit.courseId })
        .from(lessonCompletion)
        .innerJoin(unit, eq(unit.id, lessonCompletion.unitId))
        .where(eq(lessonCompletion.userId, userId));
      completedUnits.forEach((u) => {
        if (u.courseId && !enrolledCourseIds.includes(u.courseId)) {
          enrolledCourseIds.push(u.courseId);
        }
      });
    } catch (err) {
      console.warn("getUserOwnedCourses lessonCompletion query failed:", err);
    }

    try {
      const createdCourses = await db
        .select({ id: course.id })
        .from(course)
        .where(and(eq(course.createdBy, userId), notInArray(course.id, SYSTEM_COURSE_IDS)));
      createdCourses.forEach((c) => {
        if (!enrolledCourseIds.includes(c.id)) enrolledCourseIds.push(c.id);
      });
    } catch (err) {
      console.warn("getUserOwnedCourses createdCourses query failed:", err);
    }
  }

  const allTargetCourseIds = Array.from(new Set(enrolledCourseIds));

  if (allTargetCourseIds.length === 0) {
    return [];
  }

  let rows: Array<{
    id: string;
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    level: string;
    visibility: string | null;
    createdBy: string | null;
    creatorName: string | null;
    createdAt: Date | null;
    unitCount: number;
  }> = [];

  if (dbUp) {
    try {
      const dbRows = await db
        .select({
          id: course.id,
          title: course.title,
          sourceLanguage: course.sourceLanguage,
          targetLanguage: course.targetLanguage,
          level: course.level,
          visibility: course.visibility,
          createdBy: course.createdBy,
          creatorName: user.name,
          createdAt: course.createdAt,
          unitCount: countDistinct(unit.id),
        })
        .from(course)
        .leftJoin(unit, eq(unit.courseId, course.id))
        .leftJoin(user, eq(course.createdBy, user.id))
        .where(inArray(course.id, allTargetCourseIds))
        .groupBy(
          course.id,
          course.title,
          course.sourceLanguage,
          course.targetLanguage,
          course.level,
          course.visibility,
          course.createdBy,
          user.name,
          course.createdAt
        )
        .orderBy(course.title);

      rows = dbRows.map((r) => ({ ...r, unitCount: Number(r.unitCount) }));
    } catch (err) {
      console.warn("getUserOwnedCourses DB query failed, using filesystem fallback:", err);
    }
  }

  // Hydrate missing enrolled courses from filesystem registry if not found in DB
  const foundIds = new Set(rows.map((r) => r.id));
  const missingIds = allTargetCourseIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    try {
      const { getAllCourses, getAllUnits } = await import("@/lib/content/registry");
      const fsCourses = getAllCourses();
      const fsUnits = getAllUnits();
      for (const id of missingIds) {
        const fc = fsCourses.find((c) => c.id === id);
        if (fc) {
          const cUnits = fsUnits.filter((u) => u.parsed.courseId === fc.id);
          rows.push({
            id: fc.id,
            title: fc.title,
            sourceLanguage: fc.sourceLanguage,
            targetLanguage: fc.targetLanguage,
            level: fc.level,
            visibility: "public",
            createdBy: null,
            creatorName: "Alan P",
            createdAt: null,
            unitCount: cUnits.length,
          });
        }
      }
    } catch (err) {
      console.warn("getUserOwnedCourses filesystem fallback error:", err);
    }
  }

  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.id);
  const completionMap = new Map<string, number>();

  if (dbUp) {
    try {
      const completionCounts = await db
        .select({
          courseId: unit.courseId,
          count: count(),
        })
        .from(lessonCompletion)
        .innerJoin(unit, eq(unit.id, lessonCompletion.unitId))
        .where(
          and(
            eq(lessonCompletion.userId, userId),
            inArray(unit.courseId, courseIds)
          )
        )
        .groupBy(unit.courseId);

      for (const c of completionCounts) {
        if (c.courseId) {
          completionMap.set(c.courseId, Number(c.count));
        }
      }
    } catch (err) {
      console.warn("getUserOwnedCourses completion count failed:", err);
    }
  }

  const lessonCountMap = new Map<string, number>();
  if (dbUp) {
    try {
      const allUnits = await db
        .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
        .from(unit)
        .where(inArray(unit.courseId, courseIds));

      for (const u of allUnits) {
        if (!u.courseId) continue;
        const count = getUnitLessonCountFast(u.markdown ?? "");
        lessonCountMap.set(
          u.courseId,
          (lessonCountMap.get(u.courseId) ?? 0) + count
        );
      }
    } catch (err) {
      console.warn("getUserOwnedCourses unit query failed:", err);
    }
  }

  // Filesystem lesson count fallback if DB didn't supply lesson counts
  try {
    const { getAllUnits } = await import("@/lib/content/registry");
    const fsUnits = getAllUnits();
    for (const id of courseIds) {
      if (!lessonCountMap.has(id) || lessonCountMap.get(id) === 0) {
        const cUnits = fsUnits.filter((u) => u.parsed.courseId === id);
        const count = cUnits.reduce((sum, u) => sum + (u.parsed.lessons?.length ?? 0), 0);
        if (count > 0) {
          lessonCountMap.set(id, count);
        }
      }
    }
  } catch {}

  return rows.map((r) => ({
    ...r,
    creatorName: r.creatorName ?? (SYSTEM_COURSE_IDS.includes(r.id) ? "Alan P" : null),
    unitCount: Number(r.unitCount),
    lessonCount: lessonCountMap.get(r.id) ?? 0,
    completedLessons: completionMap.get(r.id) ?? 0,
    isOwner: r.createdBy === userId && !SYSTEM_COURSE_IDS.includes(r.id),
    isInLibrary: true,
  }));
}

export async function getCourseForManagement(
  courseId: string,
  userId: string,
  isAdmin: boolean
): Promise<CourseManagementInfo | null> {
  const [courseRow] = await db
    .select({
      id: course.id,
      title: course.title,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      visibility: course.visibility,
      createdBy: course.createdBy,
    })
    .from(course)
    .where(eq(course.id, courseId));

  if (!courseRow) return null;

  if (courseRow.createdBy !== userId && !isAdmin) return null;

  const units = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      visibility: unit.visibility,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  return {
    id: courseRow.id,
    title: courseRow.title,
    sourceLanguage: courseRow.sourceLanguage,
    targetLanguage: courseRow.targetLanguage,
    level: courseRow.level,
    visibility: courseRow.visibility,
    createdBy: courseRow.createdBy,
    units: naturalSortUnits(
      units.map((u) => {
        const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
        return {
          id: u.id,
          title: u.title,
          icon: u.icon,
          visibility: u.visibility,
          lessonCount: lessons.length,
          questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
        };
      })
    ),
  };
}

/** Units owned by user that are NOT assigned to any course (available to add). */
export async function getUserOwnedStandaloneUnits(
  userId: string
): Promise<AvailableUnitForCourse[]> {
  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      targetLanguage: unit.targetLanguage,
      level: unit.level,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(and(eq(unit.createdBy, userId), isNull(unit.courseId)));

  const mapped = rows.map((u) => {
    const { lessons } = getUnitLessonsSafe(u.markdown ?? "");
    return {
      id: u.id,
      title: u.title,
      icon: u.icon,
      targetLanguage: u.targetLanguage,
      level: u.level,
      lessonCount: lessons.length,
      questionType: getUnitQuestionType({ lessons, markdown: u.markdown }),
    };
  });

  return naturalSortUnits(mapped);
}
