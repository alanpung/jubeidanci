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
  /**
   * Unit detail view. The breadcrumb above already reads "… / Unit 2", so the
   * card drops the symbol and the "Unit N:" label instead of shouting the same
   * thing twice.
   */
  compact?: boolean;
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
  compact = false,
}: UnitCardProps) {
  const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  // Most authored titles already carry their own label ("Unit 3: Food &
  // Dining"), so prefixing "Unit 3" again printed it twice. Drop the label
  // from the title whenever the number is shown somewhere else — either as our
  // own prefix, or (in compact mode) in the breadcrumb above.
  const showNumber = unitNumber != null && !compact;
  const stripped = title.replace(/^\s*unit\s*\d+\s*:?\s*/i, "").trim();
  // Guard: a title that is *only* a label ("Unit 2") would strip to nothing.
  const titleWithoutLabel =
    showNumber || compact ? stripped || title : title;

  // Plain text titles — no word-check links (distracting on mobile library view).
  const heading = (
    <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-lingo-text">
      {showNumber && (
        <span className="text-lingo-text-light">Unit {unitNumber}: </span>
      )}
      {titleWithoutLabel}
    </h3>
  );

  const symbol = (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
      style={{ backgroundColor: color + "20" }}
    >
      {icon}
    </div>
  );

  const bar = (
    <>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-lingo-gray">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold" style={{ color }}>
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
        className="w-full max-w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-lingo-gray bg-white px-3 py-2.5 text-left transition-transform hover:scale-[1.01] active:scale-[0.99] sm:px-4"
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
        <div className="mt-2.5 flex items-center gap-3">{bar}</div>
      </div>
    );
  }

  return (
    <div className="mb-8 w-full max-w-full overflow-hidden rounded-2xl border-2 border-lingo-gray bg-white p-3.5 sm:p-4">
      <div className="mb-4 flex w-full min-w-0 items-center gap-3">
        {!compact && symbol}
        {heading}
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex items-center gap-3">{bar}</div>
      <div className="flex flex-col items-center gap-4 py-4">{children}</div>
    </div>
  );
}
