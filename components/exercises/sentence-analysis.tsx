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

const CHUNK_THEMES: Record<string, { bg: string; border: string; badge: string }> = {
  "主语": { bg: "bg-amber-50/80", border: "border-amber-300", badge: "bg-amber-700 text-white" },
  "谓语": { bg: "bg-rose-50/80", border: "border-rose-300", badge: "bg-rose-600 text-white" },
  "宾语": { bg: "bg-blue-50/80", border: "border-blue-300", badge: "bg-blue-600 text-white" },
  "状语": { bg: "bg-teal-50/80", border: "border-teal-300", badge: "bg-teal-600 text-white" },
  "定语": { bg: "bg-purple-50/80", border: "border-purple-300", badge: "bg-purple-600 text-white" },
  "补语": { bg: "bg-indigo-50/80", border: "border-indigo-300", badge: "bg-indigo-600 text-white" },
  "连词": { bg: "bg-slate-100/90", border: "border-slate-300", badge: "bg-slate-700 text-white" },
  "句子": { bg: "bg-gray-100/90", border: "border-gray-300", badge: "bg-gray-700 text-white" },
};

const FALLBACK_THEMES = [
  { bg: "bg-amber-50/80", border: "border-amber-300", badge: "bg-amber-700 text-white" },
  { bg: "bg-rose-50/80", border: "border-rose-300", badge: "bg-rose-600 text-white" },
  { bg: "bg-purple-50/80", border: "border-purple-300", badge: "bg-purple-600 text-white" },
  { bg: "bg-teal-50/80", border: "border-teal-300", badge: "bg-teal-600 text-white" },
  { bg: "bg-blue-50/80", border: "border-blue-300", badge: "bg-blue-600 text-white" },
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
      <div className="my-4 p-3 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-lingo-blue border-t-transparent mb-1"></div>
        <p className="text-xs text-gray-500">Analyzing English sentence structure...</p>
      </div>
    );
  }

  if (!data || !data.chunks) return null;

  return (
    <div className="my-4 p-4 sm:p-6 bg-white rounded-2xl border border-gray-200 shadow-xl transition-all">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🌐</span>
          <h3 className="text-sm sm:text-base font-bold text-gray-800">Sentence Structure Breakdown</h3>
        </div>
        <button
          onClick={onPlayAudio}
          className="flex items-center gap-1.5 px-3 py-1 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors"
          title="Play English Audio"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Listen Audio</span>
        </button>
      </div>

      {/* Horizontal Row Layout of Colored Structure Pills with Structure Name */}
      <div className="flex flex-row flex-wrap sm:flex-nowrap items-center justify-center gap-3 sm:gap-4 py-4 px-2 overflow-x-auto">
        {data.chunks.map((chunk, cIdx) => {
          const theme = CHUNK_THEMES[chunk.chunkLabel] || FALLBACK_THEMES[cIdx % FALLBACK_THEMES.length];
          return (
            <div
              key={cIdx}
              className={`flex flex-col items-center px-4 pt-3.5 pb-3 rounded-2xl ${theme.bg} border-2 ${theme.border} shadow-sm transition-transform hover:scale-[1.02] flex-shrink-0`}
            >
              {/* Structure Name Badge */}
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full mb-2 shadow-xs whitespace-nowrap ${theme.badge}`}>
                {chunk.chunkLabel}
              </span>

              {/* Words inside chunk */}
              <div className="flex flex-row items-center gap-3">
                {chunk.words.map((w, wIdx) => (
                  <div key={wIdx} className="flex flex-col items-center text-center">
                    {/* IPA above */}
                    <span className="hidden sm:block text-[10px] font-mono text-gray-400 mb-0.5">
                      {w.ipa || ""}
                    </span>
                    {/* Word */}
                    <span className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
                      {w.word}
                    </span>
                    {/* Meaning below */}
                    <span className="text-[11px] font-medium text-gray-600 mt-0.5 whitespace-nowrap">
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
