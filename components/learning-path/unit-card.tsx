import { HoverableText } from "@/components/word/hoverable-text";

interface UnitCardProps {
  title: string;
  icon: string;
  color: string;
  totalLessons: number;
  completedLessons: number;
  language?: string;
  /** 1-based position of this unit in the course; renders a "Unit N" prefix. */
  unitNumber?: number;
  onClick?: () => void;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

export function UnitCard({
  title,
  icon,
  color,
  totalLessons,
  completedLessons,
  language,
  unitNumber,
  onClick,
  children,
  action,
}: UnitCardProps) {
  const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  // Kept deliberately minimal: symbol + "Unit N · title" + progress bar.
  // The question-type badge used to sit next to the title and squeezed it
  // down to "Uni..." on mobile, and the description line added noise without
  // telling the learner anything they can't see on the path itself.
  const heading = (
    <h3 className="min-w-0 flex-1 truncate text-lg font-bold text-lingo-text">
      {unitNumber != null && (
        <span className="text-lingo-text-light">Unit {unitNumber} </span>
      )}
      {language ? <HoverableText text={title} language={language} /> : title}
    </h3>
  );

  const symbol = (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
      style={{ backgroundColor: color + "20" }}
    >
      {icon}
    </div>
  );

  const bar = (
    <>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-lingo-gray">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      <span className="shrink-0 text-sm font-bold" style={{ color }}>
        {completedLessons}/{totalLessons}
      </span>
    </>
  );

  if (onClick) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
        className="w-full max-w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-lingo-gray bg-white p-3.5 text-left transition-transform hover:scale-[1.01] active:scale-[0.99] sm:p-4"
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          {symbol}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {heading}
            {action && (
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                {action}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">{bar}</div>
      </div>
    );
  }

  return (
    <div className="mb-8 w-full max-w-full overflow-hidden rounded-2xl border-2 border-lingo-gray bg-white p-3.5 sm:p-4">
      <div className="mb-4 flex w-full min-w-0 items-center gap-3">
        {symbol}
        {heading}
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex items-center gap-3">{bar}</div>
      <div className="flex flex-col items-center gap-4 py-4">{children}</div>
    </div>
  );
}