import type { QuestionTypeInfo } from "@/lib/content/question-types";

interface QuestionTypeBadgeProps {
  questionType: QuestionTypeInfo;
  size?: "xs" | "sm" | "md";
  showZh?: boolean;
}

export function QuestionTypeBadge({
  questionType,
  size = "sm",
  showZh = false,
}: QuestionTypeBadgeProps) {
  if (size === "xs") {
    return (
      <span
        title={`${questionType.nameEn} · ${questionType.nameZh}`}
        className="inline-flex items-center gap-1 rounded-md border border-lingo-border bg-lingo-bg/80 px-1.5 py-0.5 text-[11px] font-bold text-lingo-text shrink-0"
      >
        <span aria-hidden="true">{questionType.icon}</span>
        <span>{questionType.nameEn}</span>
      </span>
    );
  }

  if (size === "md") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border-2 border-lingo-border bg-lingo-bg px-3 py-1 text-xs font-black text-lingo-text shadow-2xs">
        <span className="text-base" aria-hidden="true">
          {questionType.icon}
        </span>
        <span>{questionType.nameEn}</span>
        {showZh && (
          <span className="text-lingo-text-light font-bold">
            · {questionType.nameZh}
          </span>
        )}
      </span>
    );
  }

  // Default "sm" size for cards and lists
  return (
    <span
      title={`${questionType.nameEn} · ${questionType.nameZh}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-lingo-border bg-lingo-bg/90 px-2 py-0.5 text-xs font-bold text-lingo-text shadow-2xs shrink-0"
    >
      <span aria-hidden="true">{questionType.icon}</span>
      <span>{questionType.nameEn}</span>
      {showZh && (
        <span className="text-lingo-text-light/80 font-normal">
          {questionType.nameZh}
        </span>
      )}
    </span>
  );
}
