"use client";

import Link from "next/link";
import type { UnitWithContent } from "@/lib/content/types";
import { UnitCard } from "@/components/learning-path/unit-card";
import { PathConnector } from "@/components/learning-path/path-connector";
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
        description={unit.description}
        icon={unit.icon}
        color={unitColor}
        totalLessons={unit.lessons.length}
        completedLessons={0}
        language={unit.targetLanguage}
      >
        {unit.lessons.map((lesson, lessonIndex) => (
          <div key={lessonIndex}>
            {lessonIndex > 0 && <PathConnector color={unitColor} />}
            <PublicLessonNode
              title={lesson.title}
              index={lessonIndex}
              color={unitColor}
              signUpUrl={signUpUrl}
              isCurrent={lessonIndex === 0}
            />
          </div>
        ))}
      </UnitCard>
    </div>
  );
}

function PublicLessonNode({
  title,
  index,
  color,
  signUpUrl,
  isCurrent,
}: {
  title: string;
  index: number;
  color: string;
  signUpUrl: string;
  isCurrent: boolean;
}) {
  const offset = index % 2 === 0 ? "-translate-x-8" : "translate-x-8";

  if (!isCurrent) {
    return (
      <div className={`flex flex-col items-center ${offset}`}>
        <Link href={signUpUrl}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lingo-gray border-b-4 border-lingo-gray-dark cursor-pointer opacity-60 hover:opacity-80 transition-opacity">
            <svg
              className="h-6 w-6 text-lingo-gray-dark"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
        </Link>
        <span className="mt-2 text-xs font-bold text-lingo-gray-dark">
          {title}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${offset}`}>
      <Link href={signUpUrl} className="group">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full border-b-4 transition-transform group-hover:scale-110 animate-pulse-glow"
          style={{ backgroundColor: color, borderColor: color + "cc" }}
        >
          <svg
            className="h-7 w-7 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </Link>
      <span className="mt-2 text-xs font-bold text-lingo-text">{title}</span>
    </div>
  );
}
