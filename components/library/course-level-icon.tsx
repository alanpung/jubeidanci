import React from "react";

const LEVEL_STYLES: Record<
  string,
  { bg: string; border: string; text: string; pill: string }
> = {
  A1: {
    bg: "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-600/30",
    border: "border-emerald-300/60",
    text: "text-white",
    pill: "bg-emerald-500 text-white",
  },
  A2: {
    bg: "bg-gradient-to-br from-teal-400 to-cyan-600 shadow-cyan-600/30",
    border: "border-teal-300/60",
    text: "text-white",
    pill: "bg-teal-500 text-white",
  },
  B1: {
    bg: "bg-gradient-to-br from-sky-400 to-blue-600 shadow-blue-600/30",
    border: "border-sky-300/60",
    text: "text-white",
    pill: "bg-blue-500 text-white",
  },
  B2: {
    bg: "bg-gradient-to-br from-indigo-400 to-violet-600 shadow-violet-600/30",
    border: "border-indigo-300/60",
    text: "text-white",
    pill: "bg-indigo-500 text-white",
  },
  C1: {
    bg: "bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-fuchsia-600/30",
    border: "border-purple-300/60",
    text: "text-white",
    pill: "bg-purple-600 text-white",
  },
  C2: {
    bg: "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-600/30",
    border: "border-rose-300/60",
    text: "text-white",
    pill: "bg-rose-500 text-white",
  },
};

const DEFAULT_STYLE = {
  bg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/30",
  border: "border-amber-300/60",
  text: "text-white",
  pill: "bg-amber-500 text-white",
};

export function getCourseLevelStyle(level?: string | null) {
  const key = (level || "A1").toUpperCase().trim();
  return LEVEL_STYLES[key] || DEFAULT_STYLE;
}

export function CourseLevelIcon({
  level,
  size = "md",
}: {
  level?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const cleanLevel = (level || "A1").toUpperCase().trim();
  const style = getCourseLevelStyle(cleanLevel);

  const sizeClasses =
    size === "sm"
      ? "h-10 w-10 rounded-xl text-sm"
      : size === "lg"
      ? "h-14 w-14 rounded-2xl text-xl"
      : "h-12 w-12 rounded-xl text-base";

  return (
    <div
      className={`flex shrink-0 items-center justify-center border-2 font-black tracking-tight shadow-sm select-none ${sizeClasses} ${style.bg} ${style.border} ${style.text}`}
    >
      {cleanLevel}
    </div>
  );
}
