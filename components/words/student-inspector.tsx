"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  BookOpen,
  GraduationCap,
  Volume2,
  Calendar,
  Flame,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  getStudentsList,
  getStudentSrsDeck,
  type StudentSummary,
  type StudentSrsDetail,
} from "@/lib/actions/teacher";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const LEVEL_BADGES: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300",
  A2: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300",
  B1: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300",
  B2: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300",
  C1: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300",
  C2: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300",
};

let currentAudioInstance: HTMLAudioElement | null = null;

function playAudio(text: string, lang: string = "en", accent: "us" | "uk" = "us") {
  if (typeof window === "undefined") return;

  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause();
      currentAudioInstance.currentTime = 0;
    } catch {}
    currentAudioInstance = null;
  }

  let clean = text.trim().toLowerCase();
  if (clean.includes("/")) {
    clean = clean.split("/")[0].trim();
  }
  clean = clean.replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "").trim();
  const isEnglish = !lang || lang === "en" || lang === "english";

  // For single words or hyphenated words, use the high-quality human MP3 audio from ismartcoding/endict
  if (isEnglish && /^[a-z]+(?:-[a-z]+)*$/i.test(clean)) {
    const audioUrl = `https://raw.githubusercontent.com/ismartcoding/endict/main/audio/${accent}/${encodeURIComponent(clean)}.mp3`;
    const audio = new Audio(audioUrl);
    currentAudioInstance = audio;

    audio.play().catch(() => {
      fallbackSpeechSynthesis(text, lang);
    });
    return;
  }

  fallbackSpeechSynthesis(text, lang);
}

function fallbackSpeechSynthesis(text: string, lang: string = "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "en" || lang === "english" ? "en-US" : lang;
  window.speechSynthesis.speak(utterance);
}

export function StudentInspector() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentDetail, setStudentDetail] = useState<StudentSrsDetail | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDeck, setLoadingDeck] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "learning" | "learned" | "due">("all");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [cardSearch, setCardSearch] = useState<string>("");

  // Load students list
  useEffect(() => {
    async function fetchStudents() {
      setLoadingList(true);
      try {
        const list = await getStudentsList();
        setStudents(list);
        if (list.length > 0) {
          setSelectedStudentId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
      } finally {
        setLoadingList(false);
      }
    }
    fetchStudents();
  }, []);

  // Load selected student's SRS cards
  useEffect(() => {
    if (!selectedStudentId) return;

    async function fetchStudentDeck() {
      setLoadingDeck(true);
      setDeckError(null);
      try {
        const detail = await getStudentSrsDeck(selectedStudentId);
        if (!detail) {
          setDeckError("Student not found or has no active profile.");
          setStudentDetail(null);
        } else {
          setStudentDetail(detail);
        }
      } catch (err) {
        console.error("Failed to load student deck:", err);
        setDeckError(err instanceof Error ? err.message : String(err));
        setStudentDetail(null);
      } finally {
        setLoadingDeck(false);
      }
    }
    fetchStudentDeck();
  }, [selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [students, searchFilter]);

  const filteredCards = useMemo(() => {
    if (!studentDetail?.cards) return [];
    let cards = studentDetail.cards;

    if (levelFilter) {
      cards = cards.filter(
        (c) => (c.cefrLevel || "").toUpperCase().trim() === levelFilter
      );
    }

    if (statusFilter === "learned") {
      cards = cards.filter((c) => c.status === "learned" || c.status === "review");
    } else if (statusFilter === "learning") {
      cards = cards.filter((c) => c.status === "learning");
    } else if (statusFilter === "due") {
      const now = new Date();
      cards = cards.filter(
        (c) =>
          (c.status === "learning" || c.status === "review") &&
          c.nextReviewAt &&
          new Date(c.nextReviewAt) <= now
      );
    }

    const q = cardSearch.toLowerCase().trim();
    if (q) {
      cards = cards.filter(
        (c) =>
          c.word.toLowerCase().includes(q) ||
          c.translation.toLowerCase().includes(q)
      );
    }

    return cards;
  }, [studentDetail, levelFilter, statusFilter, cardSearch]);

  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Top Banner / Student Selector */}
      <div className="rounded-2xl border-2 border-lingo-border bg-lingo-card p-3 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lingo-blue/10 text-lingo-blue">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-lingo-text flex items-center gap-2">
                Student Profile
                <span className="rounded-full bg-lingo-purple/15 text-lingo-purple text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">
                  Author Only
                </span>
              </h2>
              <p className="text-xs text-lingo-text-light mt-0.5">
                Inspect and track individual student vocabulary retention, SM-2 cards, and CEFR mastery.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (selectedStudentId) {
                setLoadingDeck(true);
                setDeckError(null);
                getStudentSrsDeck(selectedStudentId)
                  .then((detail) => {
                    if (!detail) {
                      setDeckError("Student not found or has no active profile.");
                      setStudentDetail(null);
                    } else {
                      setStudentDetail(detail);
                    }
                  })
                  .catch((err) => {
                    setDeckError(err instanceof Error ? err.message : String(err));
                    setStudentDetail(null);
                  })
                  .finally(() => setLoadingDeck(false));
              }
            }}
            disabled={loadingDeck}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-lingo-border bg-lingo-bg px-3 py-1.5 text-xs font-bold text-lingo-text-light hover:text-lingo-text transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDeck ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Student Picker Search & Dropdown */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lingo-text-light" />
            <input
              type="text"
              placeholder="Search student by name or email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border-2 border-lingo-border bg-lingo-bg text-lingo-text focus:outline-none focus:border-lingo-blue"
            />
          </div>

          <div className="relative">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={loadingList || filteredStudents.length === 0}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs sm:text-sm rounded-xl border-2 border-lingo-border bg-lingo-bg text-lingo-text font-bold focus:outline-none focus:border-lingo-blue cursor-pointer"
            >
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email}) — {s.wordsLearned} Mastered / {s.wordsLearning} Learning
                </option>
              ))}
              {filteredStudents.length === 0 && (
                <option value="">No students found matching search</option>
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lingo-text-light pointer-events-none" />
          </div>
        </div>
      </div>

      {loadingDeck ? (
        <div className="p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-lingo-blue border-t-transparent" />
          <p className="text-xs font-bold text-lingo-text-light mt-2">Loading student SRS deck...</p>
        </div>
      ) : deckError ? (
        <div className="rounded-2xl border-2 border-dashed border-red-200 p-8 text-center bg-red-50/50">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2 animate-pulse" />
          <p className="text-sm font-bold text-red-800">Failed to load student deck</p>
          <p className="text-xs text-red-600 mt-1">{deckError}</p>
        </div>
      ) : !studentDetail ? (
        <div className="rounded-2xl border-2 border-dashed border-lingo-border p-8 text-center bg-lingo-card">
          <Users className="w-10 h-10 text-lingo-text-light/50 mx-auto mb-2" />
          <p className="text-sm font-bold text-lingo-text">No student selected</p>
          <p className="text-xs text-lingo-text-light mt-1">Select a student from the dropdown above to view their vocabulary cards.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Student Overview Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-lingo-text">
                <BookOpen className="w-4 h-4" />
                <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">My Words</span>
              </div>
              <p className="text-xl font-black text-lingo-text mt-1">
                {studentDetail.summary.totalMyWords.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-lingo-green">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">Mastered</span>
              </div>
              <p className="text-xl font-black text-lingo-green mt-1">
                {studentDetail.summary.totalLearned.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-lingo-blue">
                <Clock className="w-4 h-4" />
                <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">Learning</span>
              </div>
              <p className="text-xl font-black text-lingo-blue mt-1">
                {studentDetail.summary.totalLearning.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-lingo-text-light">
                <Sparkles className="w-4 h-4" />
                <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">New</span>
              </div>
              <p className="text-xl font-black text-lingo-text-light mt-1">
                {studentDetail.summary.totalNew.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border-2 border-lingo-border bg-lingo-card p-3 shadow-xs col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-lingo-orange">
                <Flame className="w-4 h-4" />
                <span className="text-[11px] font-bold text-lingo-text-light uppercase tracking-wider">Streak</span>
              </div>
              <p className="text-xl font-black text-lingo-orange mt-1">
                {activeStudent?.currentStreak || 0} days
              </p>
            </div>
          </div>

          {/* Student CEFR Level Breakdown Table */}
          <div className="w-full rounded-2xl border-2 border-lingo-border bg-lingo-card overflow-hidden shadow-xs">
            <div className="px-3.5 py-2.5 border-b border-lingo-border flex items-center justify-between bg-lingo-card/50">
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-lingo-blue" />
                <h3 className="text-xs sm:text-sm font-black text-lingo-text">
                  {studentDetail.student.name}&apos;s CEFR Vocabulary Progress
                </h3>
              </div>
              {levelFilter && (
                <button
                  onClick={() => setLevelFilter("")}
                  className="inline-flex items-center gap-1 rounded-md bg-lingo-border/70 px-2 py-0.5 text-[10px] font-bold text-lingo-text hover:bg-lingo-border cursor-pointer"
                >
                  Clear Filter ({levelFilter})
                </button>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm table-fixed">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                </colgroup>
                <thead className="bg-lingo-gray/30 text-[10px] sm:text-xs font-black text-lingo-text-light uppercase tracking-wider border-b border-lingo-border">
                  <tr>
                    <th className="py-2.5 px-2 sm:px-3 text-left">Level</th>
                    <th className="py-2.5 px-1 sm:px-2 text-center text-lingo-text">
                      <span className="hidden sm:inline">My Words</span>
                      <span className="sm:hidden">My Words</span>
                    </th>
                    <th className="py-2.5 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-emerald-700">Mastered</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[11px] shadow-xs"
                        title="Mastered (M)"
                      >
                        M
                      </span>
                    </th>
                    <th className="py-2.5 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-blue-700">Learning</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-black text-[11px] shadow-xs"
                        title="Learning (L)"
                      >
                        L
                      </span>
                    </th>
                    <th className="py-2.5 px-1 sm:px-2 text-center">
                      <span className="hidden sm:inline text-lingo-text-light">New</span>
                      <span
                        className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-black text-[11px] shadow-xs"
                        title="New (N)"
                      >
                        N
                      </span>
                    </th>
                    <th className="py-2.5 px-1 sm:px-2 text-center text-lingo-text-light">
                      <span className="hidden sm:inline">Word Count</span>
                      <span className="sm:hidden text-[10px]">Total</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lingo-border">
                  {CEFR_LEVELS.map((lvl) => {
                    const stat = studentDetail.levelStats[lvl] || {
                      wordCount: 0,
                      myWords: 0,
                      learned: 0,
                      learning: 0,
                      new: 0,
                    };
                    const isSelected = levelFilter === lvl;
                    return (
                      <tr
                        key={lvl}
                        onClick={() => setLevelFilter(isSelected ? "" : lvl)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-lingo-blue/10 hover:bg-lingo-blue/15"
                            : "hover:bg-lingo-gray/20"
                        }`}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <span
                              className={`inline-block w-8 sm:w-9 py-0.5 text-center rounded-md text-[10px] sm:text-xs font-black border ${LEVEL_BADGES[lvl]}`}
                            >
                              {lvl}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-black text-lingo-blue">
                                ●
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-black text-lingo-text text-[11px] sm:text-xs">
                          {stat.myWords.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center font-black text-lingo-green text-[11px] sm:text-xs">
                          {stat.learned.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-lingo-blue text-[11px] sm:text-xs">
                          {stat.learning.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center font-medium text-lingo-text-light text-[11px] sm:text-xs">
                          {stat.new.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center font-medium text-lingo-text-light/80 text-[11px] sm:text-xs">
                          {stat.wordCount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Summary TOTAL Row in the Last Row */}
                <tfoot className="bg-lingo-gray/40 border-t-2 border-lingo-border font-black">
                  <tr>
                    <td className="py-2.5 px-3 text-[10px] sm:text-xs font-black text-lingo-text uppercase tracking-wider">
                      TOTAL
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-lingo-text text-[11px] sm:text-xs whitespace-nowrap">
                      {studentDetail.summary.totalMyWords.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-emerald-700 text-[11px] sm:text-xs whitespace-nowrap">
                      {studentDetail.summary.totalLearned.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-blue-700 text-[11px] sm:text-xs whitespace-nowrap">
                      {studentDetail.summary.totalLearning.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-lingo-text-light text-[11px] sm:text-xs whitespace-nowrap">
                      {studentDetail.summary.totalNew.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-black text-lingo-text-light/90 text-[11px] sm:text-xs whitespace-nowrap">
                      {studentDetail.summary.totalWordCount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
