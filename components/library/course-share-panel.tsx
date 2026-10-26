"use client";

import { useState, useTransition, useEffect } from "react";
import { UserPlus } from "lucide-react";
import {
  listRegisteredStudents,
  listCourseStudentAccess,
  setStudentCourseAccess,
} from "@/lib/actions/student-access";
import type { StudentSummary } from "@/lib/actions/teacher";

interface Props {
  courseId: string;
}

/** Owner-only panel: share one private course with individual students.
 *
 *  Sits on the course page under the unit list. A student who is already a VIP
 *  of the owner can see every private course, so their switch is shown on and
 *  locked — flipping it here would not take the access away. Everyone else gets
 *  a real switch that writes a `student_access` row.
 *
 *  The list is fetched on mount instead of being rendered on the server so a
 *  slow students query never delays the course page itself; the panel just
 *  stays in its loading state. */
export function CourseSharePanel({ courseId }: Props) {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [vipIds, setVipIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRegisteredStudents(),
      listCourseStudentAccess(courseId),
    ]).then(([list, access]) => {
      if (cancelled) return;
      setStudents(list);
      setGranted(new Set(access.studentIds));
      setVipIds(new Set(access.vipIds));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  function toggle(studentId: string) {
    const next = !granted.has(studentId);
    setBusy((prev) => new Set(prev).add(studentId));
    setGranted((prev) => {
      const n = new Set(prev);
      if (next) n.add(studentId);
      else n.delete(studentId);
      return n;
    });

    startTransition(async () => {
      try {
        const res = await setStudentCourseAccess(studentId, courseId, next);
        if (!res.success) {
          window.alert(
            `Could not update access: ${res.error ?? "unknown error"}`
          );
          // Re-read the server so the switch cannot stay out of sync.
          const access = await listCourseStudentAccess(courseId);
          setGranted(new Set(access.studentIds));
          setVipIds(new Set(access.vipIds));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        window.alert(`Could not update access: ${message}`);
      } finally {
        setBusy((prev) => {
          const n = new Set(prev);
          n.delete(studentId);
          return n;
        });
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border-2 border-lingo-border bg-white p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-lingo-text-light">
        <UserPlus className="h-4 w-4" /> Share this course
      </h2>
      <p className="mb-4 text-xs text-lingo-text-light">
        This course is private. Switch a student on to let them open it — they
        still see nothing else. VIP students already reach all of your private
        courses.
      </p>

      {loading ? (
        <p className="text-sm text-lingo-text-light">Loading students…</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-lingo-text-light">
          No registered students yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {students.map((s) => {
            const isVip = vipIds.has(s.id);
            const isOn = isVip || granted.has(s.id);
            const isBusy = busy.has(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-lingo-border px-3 py-2.5 transition-colors hover:bg-lingo-gray/20"
              >
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

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`text-[11px] font-black uppercase tracking-wide transition-colors ${
                      isOn ? "text-lingo-green" : "text-gray-400"
                    }`}
                  >
                    {isVip ? "VIP" : isOn ? "Can open" : "No access"}
                  </span>
                  <button
                    type="button"
                    disabled={isBusy || isVip}
                    onClick={() => toggle(s.id)}
                    aria-pressed={isOn}
                    title={
                      isVip
                        ? "VIP students can already open every private course"
                        : isOn
                          ? "Revoke access to this course"
                          : "Grant access to this course"
                    }
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-60 ${
                      isOn ? "bg-lingo-green" : "bg-gray-300"
                    } ${isVip ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        isOn ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
