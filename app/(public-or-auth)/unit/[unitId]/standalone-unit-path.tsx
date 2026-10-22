"use client";

import type { UnitWithContent } from "@/lib/content/types";
import { UnitCard } from "@/components/learning-path/unit-card";
import {
  LessonLadder,
  type LadderLesson,
} from "@/components/learning-path/lesson-ladder";
import { getUnitColor } from "@/lib/colors";

interface StandaloneUnitPathProps {
  unit: UnitWithContent;
  completions: { unitId: string; lessonIndex: number }[];
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
  unitId: string,
  lessonCount: number,
  completions: { unitId: string; lessonIndex: number }[]
) {
  for (let li = 0; li < lessonCount; li++) {
    if (!isLessonCompleted(completions, unitId, li)) {
      return li;
    }
  }
  return lessonCount;
}

export function StandaloneUnitPath({
  unit,
  completions,
}: StandaloneUnitPathProps) {
  const unitColor = getUnitColor(0);
  const completedLessons = unit.lessons.filter((_, li) =>
    isLessonCompleted(completions, unit.id, li)
  ).length;
  const currentLessonIndex = findFirstIncompleteLesson(
    unit.id,
    unit.lessons.length,
    completions
  );

  return (
    <UnitCard
      title={unit.title}
      icon={unit.icon}
      color={unitColor}
      totalLessons={unit.lessons.length}
      completedLessons={completedLessons}
      language={unit.targetLanguage}
    >
      <LessonLadder
        color={unitColor}
        lessons={unit.lessons.map((lesson, lessonIndex): LadderLesson => {
          const completed = isLessonCompleted(completions, unit.id, lessonIndex);
          const isCurrent = lessonIndex === currentLessonIndex;
          const isLocked = lessonIndex > currentLessonIndex;

          return {
            state: completed
              ? "completed"
              : isCurrent || !isLocked
                ? "current"
                : "locked",
            href: `/unit/${unit.id}/lesson/${lessonIndex}`,
            title: lesson.title,
          };
        })}
      />
    </UnitCard>
  );
}
