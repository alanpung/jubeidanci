"use client";

import Link from "next/link";
import type { UnitWithContent } from "@/lib/content/types";
import { UnitCard } from "@/components/learning-path/unit-card";
import {
  LessonLadder,
  type LadderLesson,
} from "@/components/learning-path/lesson-ladder";
import { getUnitColor } from "@/lib/colors";

interface PublicUnitPathProps {
  unit: UnitWithContent;
}

export function PublicUnitPath({ unit }: PublicUnitPathProps) {
  const unitColor = getUnitColor(0);
  const signUpUrl = `/sign-up?redirect=${encodeURIComponent(`/unit/${unit.id}`)}`;

  return (
    <div>
      {/* Sign-up CTA banner */}
      <div className="mb-6 rounded-2xl border-2 border-lingo-green/30 bg-lingo-green/5 p-4 text-center">
        <p className="text-sm font-bold text-lingo-text mb-2">
          Sign up to start learning!
        </p>
        <Link
          href={signUpUrl}
          className="inline-flex items-center justify-center rounded-xl bg-lingo-green px-6 py-2 text-sm font-bold text-white border-b-2 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
        >
          Get Started Free
        </Link>
      </div>

      <UnitCard
        title={unit.title}
        icon={unit.icon}
        color={unitColor}
        totalLessons={unit.lessons.length}
        completedLessons={0}
        language={unit.targetLanguage}
      >
        <LessonLadder
          color={unitColor}
          lessons={unit.lessons.map((lesson, lessonIndex): LadderLesson => ({
            // Nothing is unlocked for an anonymous visitor, but every bubble
            // still leads to the sign-up page.
            state: lessonIndex === 0 ? "current" : "locked",
            href: signUpUrl,
            title: lesson.title,
            clickableWhenLocked: true,
          }))}
        />
      </UnitCard>
    </div>
  );
}
