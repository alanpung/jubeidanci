"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface KindOption {
  id: string;
  label: string;
}

const LEVEL_STYLE: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700",
  A2: "bg-teal-100 text-teal-700",
  B1: "bg-sky-100 text-sky-700",
  B2: "bg-indigo-100 text-indigo-700",
  C1: "bg-violet-100 text-violet-700",
  C2: "bg-rose-100 text-rose-700",
};

function Chip({
  label,
  active,
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass?: string;
}) {
  const base =
    "rounded-full px-3 py-1 text-xs font-semibold transition-colors border";
  const inactive =
    "border-lingo-border bg-white text-lingo-text-light hover:bg-gray-50";
  const on =
    activeClass ?? "border-lingo-text bg-lingo-text text-white";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${base} ${active ? on : inactive}`}
    >
      {label}
    </button>
  );
}

export default function CourseStatFilters({
  availableLevels,
  availableKinds,
  selectedLevels,
  selectedKinds,
  resultCount,
}: {
  availableLevels: string[];
  availableKinds: KindOption[];
  selectedLevels: string[];
  selectedKinds: string[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggleParam(key: "level" | "type", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = (params.get(key) ?? "").split(",").filter(Boolean);
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    if (current.length) params.set(key, current.join(","));
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasFilter = selectedLevels.length > 0 || selectedKinds.length > 0;

  function clearAll() {
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="space-y-3 rounded-xl border border-lingo-border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-lingo-text">等级</span>
        {availableLevels.map((lv) => (
          <Chip
            key={lv}
            label={lv}
            active={selectedLevels.includes(lv)}
            onClick={() => toggleParam("level", lv)}
            activeClass={LEVEL_STYLE[lv]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-lingo-text">课程类型</span>
        {availableKinds.map((k) => (
          <Chip
            key={k.id}
            label={k.label || k.id}
            active={selectedKinds.includes(k.id)}
            onClick={() => toggleParam("type", k.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-lingo-text-light">
          共 <span className="font-bold text-lingo-text">{resultCount}</span> 门课程
        </span>
        {hasFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full border border-lingo-border bg-white px-3 py-1 text-xs font-semibold text-lingo-text-light hover:bg-gray-50"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
