"use client";
import { Plus, Check } from "lucide-react";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StandaloneUnitInfo } from "@/lib/content/types";
import { getLanguageName } from "@/lib/languages";
import { getUnitColor } from "@/lib/colors";
import { addUnitToLibrary } from "@/lib/actions/library";
import { QuestionTypeBadge } from "@/components/units/question-type-badge";

interface BrowseUnitsProps {
  units: StandaloneUnitInfo[];
  initialTargetLanguage?: string | null;
}

export function BrowseUnits({ units, initialTargetLanguage }: BrowseUnitsProps) {
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLanguage ?? "");
  const [level, setLevel] = useState("");

  if (units.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-lingo-text">
          Public Units
        </h2>
        <div className="rounded-2xl border-2 border-dashed border-lingo-border p-6 text-center">
          <p className="text-sm font-medium text-lingo-text-light">
            No public units available to browse yet.
          </p>
        </div>
      </section>
    );
  }

  const targetLanguages = [
    ...new Set(units.map((u) => u.targetLanguage)),
  ].sort();
  const levels = [
    ...new Set(units.map((u) => u.level).filter(Boolean)),
  ].sort();

  const filtered = units.filter((u) => {
    if (targetLanguage && u.targetLanguage !== targetLanguage) return false;
    if (level && u.level !== level) return false;
    return true;
  });

  const hasFilters = targetLanguages.length > 1 || levels.length > 1;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-lingo-text">
        Public Units
      </h2>

      {hasFilters && (
        <div className="mb-3 flex flex-wrap gap-2">
          {targetLanguages.length > 1 && (
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All languages</option>
              {targetLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {getLanguageName(lang)}
                </option>
              ))}
            </select>
          )}
          {levels.length > 1 && (
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="max-w-full min-w-0 rounded-lg border-2 border-lingo-border bg-lingo-card px-3 py-2 text-sm font-bold text-lingo-text"
            >
              <option value="">All levels</option>
              {levels.map((l) => (
                <option key={l} value={l!}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-lingo-text-light">
          No units match your filters.
        </p>
      ) : (
        <div className="grid min-w-0 gap-3">
          {filtered.map((unit, i) => (
            <BrowseUnitCard key={unit.id} unit={unit} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function BrowseUnitCard({
  unit,
  index,
}: {
  unit: StandaloneUnitInfo;
  index: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const color = getUnitColor(index);
  const hasParseError = unit.parseError === true;

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await addUnitToLibrary(unit.id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border-2 shadow-[0_2px_0_0] transition-all ${
        hasParseError
          ? "border-red-200 bg-white shadow-red-200 cursor-not-allowed"
          : "border-lingo-border bg-white shadow-lingo-border hover:border-lingo-blue hover:bg-lingo-blue/5"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {hasParseError ? (
          <div className={`flex min-w-0 flex-1 items-center gap-3 p-4 opacity-60`}>
            <UnitCardContent unit={unit} color={color} hasParseError />
          </div>
        ) : (
          <Link
            href={`/unit/${unit.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 p-4"
          >
            <UnitCardContent unit={unit} color={color} hasParseError={false} />
          </Link>
        )}
        {!hasParseError && (
          <div className="shrink-0 pr-4 flex items-center justify-end">
            {unit.isOwner ? (
              <span
                title="Your Unit"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-lingo-gray bg-lingo-gray/50 text-xs font-black text-lingo-text-light"
              >
                ★
              </span>
            ) : unit.isInLibrary ? (
              <span
                title="Added to My Library"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-lingo-green/40 bg-lingo-green/10 text-sm font-black text-lingo-green shadow-xs"
              >
                ✓
              </span>
            ) : (
              <button
                onClick={handleAdd}
                disabled={isPending}
                title="Add to My Library"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-lingo-blue bg-lingo-blue text-sm font-black text-white hover:bg-lingo-blue/90 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isPending ? "…" : "+"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UnitCardContent({
  unit,
  color,
  hasParseError,
}: {
  unit: StandaloneUnitInfo;
  color: string;
  hasParseError: boolean;
}) {
  return (
    <>
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{ backgroundColor: `${color}20` }}
      >
        {unit.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-lingo-text truncate">{unit.title}</p>
          {unit.questionType && (
            <QuestionTypeBadge questionType={unit.questionType} size="xs" />
          )}
          {hasParseError && (
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
              Can&apos;t be parsed
            </span>
          )}
        </div>
        <p className="text-sm text-lingo-text-light truncate">
          {unit.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-lingo-text-light">
          <span>{getLanguageName(unit.targetLanguage)}</span>
          {unit.level && (
            <>
              <span>·</span>
              <span>{unit.level}</span>
            </>
          )}
          {!hasParseError && (
            <>
              <span>·</span>
              <span>
                {unit.lessonCount}{" "}
                {unit.lessonCount === 1 ? "lesson" : "lessons"}
              </span>
            </>
          )}
          {unit.creatorName && (
            <>
              <span>·</span>
              <span className="truncate">by {unit.creatorName}</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
