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
          router.push(`/library/edit/${result.unitId}`);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create unit");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border-2 border-lingo-border bg-white p-5 space-y-4"
    >
      <h3 className="text-lg font-bold text-lingo-text">New Standalone Unit</h3>

      {error && (
        <div className="rounded-xl border-2 border-lingo-red/30 bg-lingo-red/5 px-4 py-2">
          <p className="text-sm font-medium text-lingo-red">{error}</p>
        </div>
      )}

      <Input
        label="Unit Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Greetings & Introductions"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
            I speak (Source)
          </label>
          <select
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-base text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {getLanguageName(lang)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
            I want to learn (Target)
          </label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-base text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {getLanguageName(lang)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
          CEFR Level
        </label>
        <div className="flex gap-2">
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevel(lvl)}
              disabled={isPending}
              className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold transition-all ${
                level === lvl
                  ? "border-lingo-blue bg-lingo-blue/10 text-lingo-blue"
                  : "border-lingo-border bg-white text-lingo-text hover:bg-lingo-gray/30"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
          Exercise Type
        </label>
        <p className="mb-2 text-xs text-lingo-text-light">
          Choose a starter template for exercises in this unit (you can still add other types in Markdown).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {QUESTION_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setQuestionType(opt.id)}
              disabled={isPending}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-xs font-bold transition-all ${
                questionType === opt.id
                  ? "border-lingo-blue bg-lingo-blue/10 text-lingo-blue shadow-sm"
                  : "border-lingo-border bg-white text-lingo-text hover:bg-lingo-gray/30"
              }`}
            >
              <span className="text-base">{opt.icon}</span>
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="sm" loading={isPending}>
          Create &amp; Edit Markdown
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

      <div className="border-t border-lingo-border pt-3">
        <p className="text-xs text-lingo-text-light">
          Or generate units with AI in the{" "}
          <Link href="/chat" className="font-bold text-lingo-blue hover:underline">
            Chat
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
