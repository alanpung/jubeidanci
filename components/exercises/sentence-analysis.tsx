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

const CHUNK_COLORS: Record<string, { badgeBg: string; border: string }> = {
  "主语": { badgeBg: "bg-amber-700 text-white", border: "border-amber-300" },
  "谓语": { badgeBg: "bg-rose-600 text-white", border: "border-rose-300" },
  "宾语": { badgeBg: "bg-blue-600 text-white", border: "border-blue-300" },
  "状语": { badgeBg: "bg-teal-600 text-white", border: "border-teal-300" },
  "定语": { badgeBg: "bg-purple-600 text-white", border: "border-purple-300" },
  "补语": { badgeBg: "bg-indigo-600 text-white", border: "border-indigo-300" },
  "句子": { badgeBg: "bg-gray-600 text-white", border: "border-gray-300" },
};

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
    <div className="my-3 p-2.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-xl transition-all">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🌐</span>
          <h3 className="text-xs sm:text-base font-bold text-gray-800">Sentence Breakdown & Structure</h3>
        </div>
        <button
          onClick={onPlayAudio}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors"
          title="Play English Audio"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Listen Audio</span>
        </button>
      </div>

      {/* Chunks Layout: Wrapping rows on mobile, single row on desktop */}
      <div className="flex flex-row flex-wrap sm:flex-nowrap items-stretch justify-center sm:justify-start gap-2 sm:gap-3 py-1.5 px-0.5 sm:overflow-x-auto scrollbar-thin">
        {data.chunks.map((chunk, cIdx) => {
          const styling = CHUNK_COLORS[chunk.chunkLabel] || { badgeBg: "bg-gray-700 text-white", border: "border-gray-300" };
          return (
            <div
              key={cIdx}
              className={`relative flex flex-col flex-shrink-0 bg-white border-2 ${styling.border} rounded-xl px-2 pt-3.5 pb-2 shadow-xs min-w-[85px] sm:min-w-[110px]`}
            >
              {/* Chunk Badge at Top Center */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full shadow-xs whitespace-nowrap ${styling.badgeBg}`}>
                  {chunk.chunkLabel}
                </span>
              </div>

              {/* Words inside chunk in a compact horizontal row */}
              <div className="flex flex-row flex-nowrap items-end justify-center gap-1.5 mt-1">
                {chunk.words.map((w, wIdx) => (
                  <div key={wIdx} className="flex flex-col items-center text-center group flex-shrink-0">
                    {/* IPA (Hidden on mobile) */}
                    <span className="hidden sm:block text-[10px] font-mono text-gray-400 mb-0.5 whitespace-nowrap">
                      {w.ipa || ""}
                    </span>
                    {/* Word (English) */}
                    <span className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
                      {w.word}
                    </span>
                    {/* Underline bar */}
                    <div className="w-full h-0.5 bg-lingo-blue my-0.5 rounded-full"></div>
                    {/* Meaning (Chinese) */}
                    <span className="text-[10px] sm:text-xs font-medium text-gray-700 max-w-[70px] truncate whitespace-nowrap">
                      {w.meaning}
                    </span>
                    {/* POS (Hidden on mobile) */}
                    <span className="hidden sm:block text-[9px] text-gray-500 bg-gray-100 rounded px-1 py-0.2 mt-0.5 font-medium whitespace-nowrap">
                      {w.pos}
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
