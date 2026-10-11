"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLanguageName } from "@/lib/languages";
import { createManualUnit } from "@/lib/actions/units";
import { QUESTION_TYPES, type QuestionType } from "@/lib/content/question-types";

const LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "ru", "zh", "ja", "ko", "ar",
  "hi", "tr", "pl", "sv", "da", "no", "fi", "cs", "ro", "hu", "el", "he",
  "th", "vi", "id", "ms", "uk", "bg",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const QUESTION_TYPE_OPTIONS: { id: QuestionType; label: string; icon: string }[] = [
  { id: "multiple-choice", label: "Multiple Choice", icon: "🎯" },
  { id: "fill-in-the-blank", label: "Fill in Blank", icon: "✏️" },
  { id: "matching-pairs", label: "Matching Pairs", icon: "🧩" },
  { id: "listening", label: "Listening", icon: "🎧" },
  { id: "word-bank", label: "Word Bank", icon: "🧱" },
  { id: "speaking", label: "Speaking", icon: "🎙️" },
  { id: "flashcard-review", label: "Flashcards", icon: "🎴" },
  { id: "translation", label: "Translation", icon: "🌐" },
  { id: "mix", label: "Mixed (Multiple)", icon: "🔀" },
];

export function CreateUnitForm({
  onClose,
  defaultTargetLanguage,
}: {
  onClose: () => void;
  defaultTargetLanguage?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(
    defaultTargetLanguage ?? "es"
  );
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [level, setLevel] = useState("A1");
  const [questionType, setQuestionType] = useState<QuestionType>("multiple-choice");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a unit title");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createManualUnit({
          title: title.trim(),
          targetLanguage,
          sourceLanguage,
          level,
          questionType,
        });

        if (result.success) {
          router.push(`/units/edit/${result.unitId}`);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border-2 border-lingo-border bg-white p-5 shadow-[0_2px_0_0] shadow-lingo-border"
    >
      <h3 className="mb-4 text-base font-bold text-lingo-text">
        Create a New Unit
      </h3>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Unit Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Travel & Airport Vocabulary"
            disabled={isPending}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              I want to learn (Target)
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-semibold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border focus:border-lingo-green focus:outline-none"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              Explanation Language (Source)
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3 py-2 text-sm font-semibold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border focus:border-lingo-green focus:outline-none"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Proficiency Level
          </label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                disabled={isPending}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  level === lvl
                    ? "bg-lingo-green text-white"
                    : "border-2 border-lingo-border bg-white text-lingo-text hover:bg-lingo-gray/40"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Question Type (1 per unit)
          </label>
          <p className="text-xs text-lingo-text-light mb-2">
            Units contain exercises of a single type. Courses combine units with different types.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUESTION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setQuestionType(opt.id)}
                disabled={isPending}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors text-left ${
                  questionType === opt.id
                    ? "bg-lingo-green text-white border-2 border-lingo-green"
                    : "border-2 border-lingo-border bg-white text-lingo-text hover:bg-lingo-gray/40"
                }`}
              >
                <span className="text-base">{opt.icon}</span>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Creating..." : "Create & Edit Lessons"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>

        <Link
          href="/chat?prompt=I%20want%20to%20create%20a%20new%20personalised%20unit"
          className="text-xs font-bold text-lingo-blue hover:underline"
        >
          ✨ Generate via AI Tutor instead
        </Link>
      </div>
    </form>
  );
}
