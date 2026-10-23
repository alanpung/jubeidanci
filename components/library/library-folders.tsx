import Link from "next/link";
import { Folder } from "lucide-react";
import {
  QUESTION_TYPE_LEGEND,
  resolveCourseQuestionType,
} from "@/components/library/course-level-icon";

/**
 * The bottom "Library" section of /library: eight folders, one per exercise
 * type. Tapping a folder jumps to the Browse page pre-filtered to that type.
 *
 * Eight concrete types are shown (Mixed Practice is intentionally omitted) in
 * the order the owner requested — Flashcard first, Translation second.
 */
const FOLDER_ORDER = [
  "flashcard-review",
  "translation",
  "multiple-choice",
  "fill-in-the-blank",
  "matching-pairs",
  "listening",
  "word-bank",
  "speaking",
];

export function LibraryFolders() {
  const folders = FOLDER_ORDER.map((id) => {
    const found = QUESTION_TYPE_LEGEND.find((f) => f.id === id);
    // Fall back to the resolver so the label always matches what the type
    // filter in CourseBrowser derives (otherwise the folder and the filter
    // could disagree about a folder's name).
    const visual = resolveCourseQuestionType(undefined, undefined, id);
    const label = found?.label ?? visual?.label ?? id;
    const Icon = found?.Icon ?? visual?.Icon;
    const bg = found?.bg ?? visual?.bg ?? "bg-lingo-gray";
    return { id, label, Icon, bg };
  }).filter((f) => f.Icon);

  return (
    <section className="mt-8">
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-lingo-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-lingo-text-light">
          <Folder className="h-3 w-3" /> Library
        </span>
        <span className="h-px flex-1 bg-lingo-border" />
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-base font-bold text-lingo-text">Browse by Type</h2>
        <span className="text-xs text-lingo-text-light">
          Pick an exercise type to explore.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
        {folders.map(({ id, label, Icon, bg }) => (
          <Link
            key={id}
            href={`/library/browse?type=${encodeURIComponent(label)}`}
            className="group flex flex-col items-center rounded-2xl border-2 border-lingo-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-lingo-green hover:shadow-[0_4px_0_0] hover:shadow-lingo-border active:translate-y-0"
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm ${bg}`}
            >
              {Icon ? <Icon className="h-6 w-6 stroke-[2.25]" /> : null}
            </span>
            <span className="mt-2 text-center text-xs font-bold leading-tight text-lingo-text">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
