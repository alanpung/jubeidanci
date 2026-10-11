import { HoverableText } from "@/components/word/hoverable-text";
import { QuestionTypeBadge } from "@/components/units/question-type-badge";
import type { QuestionTypeInfo } from "@/lib/content/question-types";

interface UnitCardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  totalLessons: number;
  completedLessons: number;
  language?: string;
  questionType?: QuestionTypeInfo | null;
  creatorName?: string | null;
  onClick?: () => void;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

export function UnitCard({
  title,
  description,
  icon,
  color,
  totalLessons,
  completedLessons,
  language,
  questionType,
  creatorName,
  onClick,
  children,
  action,
}: UnitCardProps) {
  const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  if (onClick) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
        className="w-full max-w-full overflow-hidden min-w-0 cursor-pointer rounded-2xl border-2 border-lingo-gray bg-white p-3.5 sm:p-4 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 min-w-0 w-full">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
            style={{ backgroundColor: color + "20" }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h3 className="text-lg font-bold text-lingo-text truncate min-w-0">{title}</h3>
                {questionType && (
                  <QuestionTypeBadge questionType={questionType} size="xs" />
                )}
              </div>
              {action && (
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  {action}
                </div>
              )}
            </div>
            <p className="text-sm text-lingo-text-light line-clamp-2">{description}</p>
            {creatorName && (
              <p className="mt-0.5 text-xs text-lingo-text-light">by {creatorName}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-lingo-gray overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-sm font-bold" style={{ color }}>
            {completedLessons}/{totalLessons}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 w-full max-w-full overflow-hidden min-w-0 rounded-2xl border-2 border-lingo-gray bg-white p-3.5 sm:p-4">
      <div className="flex items-center gap-3 mb-4 min-w-0 w-full">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl shrink-0"
          style={{ backgroundColor: color + "20" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="text-lg font-bold text-lingo-text truncate min-w-0">
                {language ? <HoverableText text={title} language={language} /> : title}
              </h3>
              {questionType && (
                <QuestionTypeBadge questionType={questionType} size="xs" />
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          <p className="text-sm text-lingo-text-light line-clamp-2">{description}</p>
          {creatorName && (
            <p className="mt-0.5 text-xs text-lingo-text-light">by {creatorName}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold" style={{ color }}>
            {completedLessons}/{totalLessons}
          </span>
          <div className="mt-1 h-2 w-20 rounded-full bg-lingo-gray overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 py-4">{children}</div>
    </div>
  );
}
