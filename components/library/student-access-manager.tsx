"use client";

import { useState, useTransition, useCallback } from "react";
import { Check, Lock, Users, BookOpen, Layers } from "lucide-react";
import type { StudentSummary } from "@/lib/actions/teacher";
import type {
  PrivateCourseItem,
  PrivateUnitItem,
  StudentGrantSummary,
} from "@/lib/actions/student-access";
import {
  getStudentGrants,
  setStudentCourseAccess,
  setStudentUnitAccess,
} from "@/lib/actions/student-access";

type ContentItem = {
  kind: "course" | "unit";
  id: string;
  title: string;
  sub?: string;
};

interface Props {
  students: StudentSummary[];
  courses: PrivateCourseItem[];
  units: PrivateUnitItem[];
}

export function StudentAccessManager({ students, courses, units }: Props) {
  const contentItems: ContentItem[] = [
    ...courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.title,
      sub: `${c.unitCount} unit${c.unitCount === 1 ? "" : "s"}`,
    })),
    ...units.map((u) => ({
      kind: "unit" as const,
      id: u.id,
      title: u.title,
      sub: "standalone",
    })),
  ];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grants, setGrants] = useState<StudentGrantSummary>({
    courseIds: [],
    unitIds: [],
  });
  const [loading, setLoading] = useState(false);
  const [granting, setGranting] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const isGranted = (item: ContentItem) =>
    item.kind === "course"
      ? grants.courseIds.includes(item.id)
      : grants.unitIds.includes(item.id);

  const selectStudent = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setLoading(true);
      try {
        const g = await getStudentGrants(id);
        setGrants(g);
      } catch {
        setGrants({ courseIds: [], unitIds: [] });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const toggle = (item: ContentItem) => {
    if (!selectedId) return;
    const key = `${item.kind}:${item.id}`;
    const currentlyGranted = isGranted(item);
    const next = !currentlyGranted;

    // Optimistic update.
    setGrants((prev) => {
      const list = item.kind === "course" ? prev.courseIds : prev.unitIds;
      const updated = next
        ? [...list, item.id]
        : list.filter((x) => x !== item.id);
      return item.kind === "course"
        ? { ...prev, courseIds: updated }
        : { ...prev, unitIds: updated };
    });
    setGranting((prev) => new Set(prev).add(key));

    const action =
      item.kind === "course"
        ? setStudentCourseAccess(selectedId, item.id, next)
        : setStudentUnitAccess(selectedId, item.id, next);

    startTransition(async () => {
      try {
        const res = await action;
        if (!res.success) {
          // Surface the real reason instead of silently reverting to off so the
          // owner can tell what went wrong (e.g. a save failure).
          window.alert(
            `Could not save access: ${res.error ?? "unknown error"}`,
          );
          // Roll back and re-sync from the server.
          const g = await getStudentGrants(selectedId);
          setGrants(g);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "unknown error";
        window.alert(`Could not save access: ${message}`);
        const g = await getStudentGrants(selectedId);
        setGrants(g);
      } finally {
        setGranting((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    });
  };

  const selectedStudent = students.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Column 1 — Students */}
      <section className="rounded-2xl border-2 border-lingo-border bg-white p-3">
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black uppercase tracking-wide text-lingo-text-light">
          <Users className="h-4 w-4" /> Students
        </h2>
        <ul className="space-y-1">
          {students.length === 0 && (
            <li className="px-2 py-3 text-sm text-lingo-text-light">
              No registered students yet.
            </li>
          )}
          {students.map((s) => {
            const active = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectStudent(s.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
                    active
                      ? "bg-lingo-blue/10 ring-2 ring-lingo-blue/30"
                      : "hover:bg-lingo-gray/50"
                  }`}
                >
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
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-lingo-text">
                      {s.name || s.email}
                    </span>
                    <span className="block truncate text-xs text-lingo-text-light">
                      {s.email}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Column 2 — Private content with inline toggle. The icon on the left
          is the switch: tap it to share (turns green) with the selected
          student, tap again to revoke. */}
      <section className="rounded-2xl border-2 border-lingo-border bg-white p-3">
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black uppercase tracking-wide text-lingo-text-light">
          <Lock className="h-4 w-4" /> Your private course / unit
        </h2>
        {!selectedStudent && (
          <p className="px-2 py-3 text-sm text-lingo-text-light">
            Select a student on the left, then tap a book icon to share it.
          </p>
        )}
        {contentItems.length === 0 ? (
          <p className="px-2 py-3 text-sm text-lingo-text-light">
            You have no private content yet. Make a course or unit private first.
          </p>
        ) : (
          <ul className="space-y-1">
            {contentItems.map((item) => {
              const key = `${item.kind}:${item.id}`;
              const granted = isGranted(item);
              const busy = granting.has(key);
              const Icon = item.kind === "course" ? BookOpen : Layers;
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-lingo-gray/40"
                >
                  <button
                    type="button"
                    disabled={!selectedStudent || busy}
                    onClick={() => toggle(item)}
                    aria-pressed={granted}
                    title={
                      granted
                        ? "Click to revoke access"
                        : "Click to share with this student"
                    }
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 transition-colors disabled:opacity-40 ${
                      granted
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-lingo-border bg-lingo-gray/60 text-lingo-text-light hover:bg-lingo-gray"
                    }`}
                  >
                    {granted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-lingo-text">
                      {item.title}
                    </span>
                    <span className="block text-xs text-lingo-text-light">
                      {item.sub}
                    </span>
                  </span>
                  {granted && (
                    <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-600">
                      Shared
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
