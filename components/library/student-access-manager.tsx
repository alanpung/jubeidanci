"use client";

import { useState, useTransition, useEffect } from "react";
import { Users } from "lucide-react";
import type { StudentSummary } from "@/lib/actions/teacher";
import { getVipStudentIds, setStudentVip } from "@/lib/actions/student-access";

interface Props {
  students: StudentSummary[];
  ownerId: string;
}

export function StudentAccessManager({ students, ownerId }: Props) {
  const [vipIds, setVipIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getVipStudentIds(ownerId).then((ids) => {
      if (!cancelled) {
        setVipIds(ids);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const toggleVip = (studentId: string) => {
    const next = !vipIds.has(studentId);
    setToggling((prev) => new Set(prev).add(studentId));

    // Optimistic update.
    setVipIds((prev) => {
      const n = new Set(prev);
      if (next) n.add(studentId);
      else n.delete(studentId);
      return n;
    });

    startTransition(async () => {
      try {
        const res = await setStudentVip(studentId, next);
        if (!res.success) {
          window.alert(
            `Could not update VIP status: ${res.error ?? "unknown error"}`
          );
          // Roll back from the server.
          const ids = await getVipStudentIds(ownerId);
          setVipIds(ids);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "unknown error";
        window.alert(`Could not update VIP status: ${message}`);
        const ids = await getVipStudentIds(ownerId);
        setVipIds(ids);
      } finally {
        setToggling((prev) => {
          const n = new Set(prev);
          n.delete(studentId);
          return n;
        });
      }
    });
  };

  return (
    <div className="rounded-2xl border-2 border-lingo-border bg-white p-4">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-lingo-text-light">
        <Users className="h-4 w-4" /> Registered Students
      </h2>

      {students.length === 0 ? (
        <p className="text-sm text-lingo-text-light">
          No registered students yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {students.map((s) => {
            const isVip = vipIds.has(s.id);
            const busy = toggling.has(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-lingo-border px-3 py-2.5 transition-colors hover:bg-lingo-gray/20"
              >
                {/* Column 1 — Student identity */}
                <div className="flex min-w-0 items-center gap-2">
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lingo-blue/15 text-sm font-bold text-lingo-blue">
                      {(s.name || s.email || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-sm font-bold text-lingo-text">
                    {s.name || s.email}
                  </span>
                </div>

                {/* Column 2 — Public / VIP toggle */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-[11px] font-black uppercase tracking-wide transition-colors ${
                      isVip ? "text-amber-600" : "text-gray-400"
                    }`}
                  >
                    {isVip ? "VIP" : "Public"}
                  </span>
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => toggleVip(s.id)}
                    aria-pressed={isVip}
                    title={isVip ? "Revoke VIP access" : "Grant VIP access"}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                      isVip ? "bg-amber-400" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        isVip ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
