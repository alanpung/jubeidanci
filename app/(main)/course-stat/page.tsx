import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import {
  getCourseSrsReport,
  CEFR_ORDER,
  type Cefr,
  type CourseSrsRow,
  type CourseSrsUnique,
} from "@/lib/content/course-srs-report";

export const dynamic = "force-dynamic";

// Course-level badge colours (mirrors the Library shelf styling).
const LEVEL_STYLE: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700",
  A2: "bg-teal-100 text-teal-700",
  B1: "bg-sky-100 text-sky-700",
  B2: "bg-indigo-100 text-indigo-700",
  C1: "bg-violet-100 text-violet-700",
  C2: "bg-rose-100 text-rose-700",
};

function LevelBadge({ level }: { level: string }) {
  const cls = LEVEL_STYLE[level] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>
      {level}
    </span>
  );
}

function CefrHead({ level }: { level: Cefr }) {
  return <th className="px-2 py-2 text-right font-bold text-lingo-text">{level}</th>;
}

function NumCell({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <td
      className={`px-2 py-2 text-right tabular-nums ${
        strong ? "font-bold text-lingo-text" : "text-lingo-text-light"
      }`}
    >
      {value.toLocaleString()}
    </td>
  );
}

export default async function CoursesReportPage() {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    redirect("/library");
  }

  const { rows, unique } = getCourseSrsReport();

  const totals: { byLevel: Record<Cefr, number>; unknown: number; total: number } = {
    byLevel: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
    unknown: 0,
    total: 0,
  };
  for (const r of rows) {
    CEFR_ORDER.forEach((c) => (totals.byLevel[c] += r.byLevel[c]));
    totals.unknown += r.unknown;
    totals.total += r.total;
  }

  const renderBody = (list: CourseSrsRow[]) =>
    list.map((r) => (
      <tr key={r.courseId} className="border-t border-lingo-border/60">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <LevelBadge level={r.level} />
            <span className="font-semibold text-lingo-text">{r.courseId}</span>
            <span className="text-xs text-lingo-text-light">
              {r.kind === "flashcard" ? "闪卡" : "翻译"}
            </span>
          </div>
        </td>
        {CEFR_ORDER.map((c) => (
          <NumCell key={c} value={r.byLevel[c]} />
        ))}
        <NumCell value={r.unknown} />
        <NumCell value={r.total} strong />
      </tr>
    ));

  // A summary row is any object with per-level counts + unknown + total.
  type Summary = { byLevel: Record<Cefr, number>; unknown: number; total: number };
  const renderSummaryRow = (
    label: string,
    data: Summary,
    labelClass: string,
    cellClass: string,
  ) => (
    <tr className="border-t-2 border-lingo-border">
      <td className={`px-3 py-2 font-black ${labelClass}`}>{label}</td>
      {CEFR_ORDER.map((c) => (
        <td key={c} className={`px-2 py-2 text-right tabular-nums ${cellClass}`}>
          {data.byLevel[c].toLocaleString()}
        </td>
      ))}
      <td className={`px-2 py-2 text-right tabular-nums ${cellClass}`}>
        {data.unknown.toLocaleString()}
      </td>
      <td className={`px-2 py-2 text-right tabular-nums ${cellClass}`}>
        {data.total.toLocaleString()}
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-lingo-text">Course Stat</h1>
        <p className="mt-1 text-sm text-lingo-text-light">
          各课程的 <span className="font-bold">srsWord</span> 总数，按英文词典标注的真实
          CEFR 等级拆分（A1–C2）。<span className="font-bold">未收录</span>{" "}
          指该词（或其词素）未出现在内置词典中；所有者可见，学生不可见。
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-lingo-border bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-lingo-text">
              <th className="px-3 py-2 text-left font-bold">课程</th>
              {CEFR_ORDER.map((c) => (
                <CefrHead key={c} level={c} />
              ))}
              <th className="px-2 py-2 text-right font-bold text-lingo-text">
                未收录
              </th>
              <th className="px-2 py-2 text-right font-bold text-lingo-text">
                合计
              </th>
            </tr>
          </thead>
          <tbody>
            {renderBody(rows)}
            {renderSummaryRow(
              "去重总计（不重叠）",
              unique,
              "text-sky-700 bg-sky-50/60",
              "font-bold text-sky-700 bg-sky-50/60",
            )}
            {renderSummaryRow(
              "总计",
              totals,
              "text-lingo-text bg-gray-50",
              "font-bold text-lingo-text bg-gray-50",
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
