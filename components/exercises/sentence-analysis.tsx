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

const STRUCTURE_BADGE_COLORS: Record<string, string> = {
  "主语": "bg-amber-100 text-amber-900 border border-amber-300",
  "谓语": "bg-rose-100 text-rose-900 border border-rose-300",
  "宾语": "bg-blue-100 text-blue-900 border border-blue-300",
  "状语": "bg-teal-100 text-teal-900 border border-teal-300",
  "定语": "bg-purple-100 text-purple-900 border border-purple-300",
  "补语": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  "连词": "bg-slate-100 text-slate-800 border border-slate-300",
  "句子": "bg-gray-100 text-gray-800 border border-gray-300",
};

const FALLBACK_BADGES = [
  "bg-amber-100 text-amber-900 border border-amber-300",
  "bg-rose-100 text-rose-900 border border-rose-300",
  "bg-purple-100 text-purple-900 border border-purple-300",
  "bg-teal-100 text-teal-900 border border-teal-300",
  "bg-blue-100 text-blue-900 border border-blue-300",
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
    <div className="my-4 p-4 sm:p-8 bg-white rounded-3xl border border-gray-200 shadow-xl transition-all w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🌐</span>
          <h3 className="text-sm sm:text-base font-bold text-gray-800">Sentence Structure Breakdown</h3>
        </div>
        <button
          onClick={onPlayAudio}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors cursor-pointer"
          title="Play English Audio"
        >
          <Volume2 className="w-4 h-4" />
          <span>Listen Audio</span>
        </button>
      </div>

      {/* Wrap layout with white background, no outer boxes, colored structure badges, fitting window width without horizontal scroller */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-4 px-1">
        {data.chunks.map((chunk, cIdx) => {
          const badgeStyle = STRUCTURE_BADGE_COLORS[chunk.chunkLabel] || FALLBACK_BADGES[cIdx % FALLBACK_BADGES.length];
          return (
            <div
              key={cIdx}
              className="flex flex-col items-center bg-white border border-gray-100 rounded-2xl p-3 sm:px-4 sm:py-3.5 shadow-xs hover:border-gray-200 transition-all flex-shrink-0"
            >
              {/* Structure Name (e.g. 主语, 谓语) */}
              <span className={`text-[10px] sm:text-xs font-bold px-3 py-0.5 rounded-full mb-2 shadow-2xs whitespace-nowrap ${badgeStyle}`}>
                {chunk.chunkLabel}
              </span>

              {/* Words inside chunk in a row */}
              <div className="flex flex-row items-center gap-3 sm:gap-4">
                {chunk.words.map((w, wIdx) => (
                  <div key={wIdx} className="flex flex-col items-center text-center">
                    {/* IPA above: hidden on mobile as requested */}
                    <span className="hidden sm:block text-[10px] font-mono text-gray-400 mb-0.5">
                      {w.ipa || ""}
                    </span>
                    {/* Word */}
                    <span className="text-base sm:text-xl font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
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
