"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Course } from "@/lib/content/types";
import { UnitCard } from "@/components/learning-path/unit-card";
import { LessonNode } from "@/components/learning-path/lesson-node";
import { PathConnector } from "@/components/learning-path/path-connector";
import { getUnitColor } from "@/lib/colors";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface LearningPathProps {
  course: Course;
  completions: {
    unitId: string;
    lessonIndex: number;
  }[];
  userId?: string;
}

function isLessonCompleted(
  completions: { unitId: string; lessonIndex: number }[],
  unitId: string,
  lessonIndex: number
) {
  return completions.some(
    (c) => c.unitId === unitId && c.lessonIndex === lessonIndex
  );
}

function findFirstIncompleteLesson(
  unit: Course["units"][number],
  completions: { unitId: string; lessonIndex: number }[]
) {
  for (let li = 0; li < unit.lessons.length; li++) {
    if (!isLessonCompleted(completions, unit.id, li)) {
      return li;
    }
  }
  return unit.lessons.length; // all complete
}

export function LearningPath({
  course,
  completions,
  userId,
}: LearningPathProps) {
  const searchParams = useSearchParams();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    searchParams.get("unit")
  );

  // Directory bar that stays put as you flip between the unit list, a unit and
  // a lesson: Library / <course> / Unit n / Lesson n. Clicking the course name
  // goes back to the full unit list.
  const crumbBase = [
    { label: "Library", href: "/library" },
    { label: course.title, onClick: () => setSelectedUnitId(null) },
  ];

  // Unit selector view
  if (selectedUnitId === null) {
    return (
      <div>
        <Breadcrumb items={crumbBase} className="mb-4" />
        <div className="grid gap-4">
        {course.units.map((unit, unitIndex) => {
          if (unit.parseError) {
            return (
              <div
                key={unit.id}
                className="w-full rounded-2xl border-2 border-red-200 bg-white p-4 opacity-60 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{ backgroundColor: getUnitColor(unitIndex) + "20" }}
                  >
                    {unit.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-lingo-text">{unit.title}</h3>
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                        Can&apos;t be parsed
                      </span>
                    </div>
                    <p className="text-sm text-lingo-text-light">{unit.description}</p>
                  </div>
                </div>
              </div>
            );
          }

          const completedLessons = unit.lessons.filter((_, li) =>
            isLessonCompleted(completions, unit.id, li)
          ).length;

          const isOwner = Boolean(
            userId &&
              (unit.createdBy === userId ||
                (!unit.createdBy && course.createdBy === userId))
          );

          return (
            <UnitCard
              key={unit.id}
              title={unit.title}
              icon={unit.icon}
              color={getUnitColor(unitIndex)}
              unitNumber={unitIndex + 1}
              totalLessons={unit.lessons.length}
              completedLessons={completedLessons}
              language={course.targetLanguage}
              onClick={() => setSelectedUnitId(unit.id)}
            />
          );
        })}
        </div>
      </div>
    );
  }

  // Lesson path view for selected unit
  const unitIndex = course.units.findIndex((u) => u.id === selectedUnitId);
  const unit = unitIndex >= 0 ? course.units[unitIndex] : undefined;
  if (!unit) return null;

  // If selected unit has parse error, show error and back button
  if (unit.parseError) {
    return (
      <div>
        <Breadcrumb
          items={[...crumbBase, { label: `Unit ${unitIndex + 1}` }]}
          className="mb-4"
        />
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
          <div className="mb-3 text-3xl">&#9888;&#65039;</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">
            Unit can&apos;t be parsed
          </h2>
          <p className="text-sm text-red-600">
            This unit&apos;s markdown contains errors and its lessons cannot be loaded.
          </p>
        </div>
      </div>
    );
  }

  const unitColor = getUnitColor(unitIndex);
  const completedLessons = unit.lessons.filter((_, li) =>
    isLessonCompleted(completions, unit.id, li)
  ).length;
  const currentLessonIndex = findFirstIncompleteLesson(unit, completions);

  return (
    <div>
      <Breadcrumb
        items={[...crumbBase, { label: `Unit ${unitIndex + 1}` }]}
        className="mb-4"
      />

      <UnitCard
        title={unit.title}
        icon={unit.icon}
        color={unitColor}
        unitNumber={unitIndex + 1}
        totalLessons={unit.lessons.length}
        completedLessons={completedLessons}
        language={course.targetLanguage}
      >
        {unit.lessons.map((_lesson, lessonIndex) => {
          const completed = isLessonCompleted(completions, unit.id, lessonIndex);
          const isCurrent = lessonIndex === currentLessonIndex;
          const isLocked = lessonIndex > currentLessonIndex;

          const state = completed
            ? "completed"
            : isCurrent
              ? "current"
              : isLocked
                ? "locked"
                : "current";

          return (
            <div key={lessonIndex}>
              {lessonIndex > 0 && (
                <PathConnector
                  color={unitColor}
                  completed={completed}
                />
              )}
              <LessonNode
                state={state}
                href={`/lesson/${course.id}/${unit.id}/${lessonIndex}`}
                color={unitColor}
                index={lessonIndex}
              />
            </div>
          );
        })}
      </UnitCard>
    </div>
  );
}
