"use client";

import React, { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

interface WordItem {
  word: string;
  ipa?: string;
  meaning: string;
  pos: string;
}

interface SyntacticChunk {
  chunkLabel: string;
  words: WordItem[];
}

interface SentenceAnalysisData {
  fullTranslation: string;
  chunks: SyntacticChunk[];
}

interface Props {
  sentence: string;
  language: string;
  onPlayAudio: () => void;
}

const CHUNK_THEMES: Record<string, { bg: string; text: string }> = {
  "主语": { bg: "bg-amber-900", text: "text-amber-100" },
  "谓语": { bg: "bg-rose-900", text: "text-rose-100" },
  "宾语": { bg: "bg-blue-900", text: "text-blue-100" },
  "状语": { bg: "bg-teal-900", text: "text-teal-100" },
  "定语": { bg: "bg-purple-950", text: "text-purple-100" },
  "补语": { bg: "bg-indigo-900", text: "text-indigo-100" },
  "连词": { bg: "bg-slate-800", text: "text-slate-100" },
  "句子": { bg: "bg-gray-900", text: "text-gray-100" },
};

const FALLBACK_COLORS = [
  { bg: "bg-amber-900", text: "text-amber-100" },
  { bg: "bg-rose-900", text: "text-rose-100" },
  { bg: "bg-purple-950", text: "text-purple-100" },
  { bg: "bg-teal-900", text: "text-teal-100" },
  { bg: "bg-blue-900", text: "text-blue-100" },
  { bg: "bg-indigo-900", text: "text-indigo-100" },
];

export function SentenceAnalysisView({ sentence, language, onPlayAudio }: Props) {
  const [data, setData] = useState<SentenceAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence, targetLanguage: language }),
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setData(json);
        }
      } catch (err) {
        console.error("Failed to analyze sentence", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [sentence, language]);

  if (loading) {
    return (
      <div className="my-4 p-3 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm text-center text-white">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-lingo-blue border-t-transparent mb-1"></div>
        <p className="text-xs text-slate-400">Analyzing English sentence structure...</p>
      </div>
    );
  }

  if (!data || !data.chunks) return null;

  return (
    <div className="my-4 p-4 sm:p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl transition-all text-white">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-base">🌐</span>
          <h3 className="text-sm sm:text-base font-bold text-slate-200">Sentence Structure Breakdown</h3>
        </div>
        <button
          onClick={onPlayAudio}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-semibold rounded-full transition-colors"
          title="Play English Audio"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Listen Audio</span>
        </button>
      </div>

      {/* Horizontal Row Layout of Colored Structure Pills (no boxes) */}
      <div className="flex flex-row flex-wrap sm:flex-nowrap items-center justify-center gap-3 sm:gap-4 py-4 px-2 overflow-x-auto">
        {data.chunks.map((chunk, cIdx) => {
          const theme = CHUNK_THEMES[chunk.chunkLabel] || FALLBACK_COLORS[cIdx % FALLBACK_COLORS.length];
          return (
            <div
              key={cIdx}
              className={`flex flex-row items-center gap-3 px-4 py-3 rounded-2xl ${theme.bg} ${theme.text} shadow-lg transition-transform hover:scale-[1.02] flex-shrink-0`}
            >
              {/* Words inside chunk */}
              <div className="flex flex-row items-center gap-3">
                {chunk.words.map((w, wIdx) => (
                  <div key={wIdx} className="flex flex-col items-center text-center">
                    {/* IPA above */}
                    <span className="hidden sm:block text-[10px] font-mono text-slate-400 mb-0.5">
                      {w.ipa || ""}
                    </span>
                    {/* Word */}
                    <span className="text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap">
                      {w.word}
                    </span>
                    {/* Meaning below */}
                    <span className="text-[11px] font-medium text-slate-300 mt-0.5 whitespace-nowrap">
                      {w.meaning}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
