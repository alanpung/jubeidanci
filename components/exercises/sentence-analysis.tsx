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
      <div className="my-6 p-6 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-lingo-blue border-t-transparent mb-2"></div>
        <p className="text-sm text-gray-500">Analyzing English sentence structure...</p>
      </div>
    );
  }

  if (!data || !data.chunks) return null;

  return (
    <div className="my-6 p-4 sm:p-6 bg-white rounded-2xl border border-gray-200 shadow-xl transition-all">
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <h3 className="text-base font-bold text-gray-800">Sentence Breakdown & Structure</h3>
        </div>
        <button
          onClick={onPlayAudio}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors"
          title="Play English Audio"
        >
          <Volume2 className="w-4 h-4" />
          <span>Listen Audio</span>
        </button>
      </div>

      {/* Horizontal Row Layout for Chunks (single row matching reference photo) */}
      <div className="flex flex-row flex-nowrap items-stretch gap-3 overflow-x-auto py-3 px-1 scrollbar-thin">
        {data.chunks.map((chunk, cIdx) => {
          const styling = CHUNK_COLORS[chunk.chunkLabel] || { badgeBg: "bg-gray-700 text-white", border: "border-gray-300" };
          return (
            <div
              key={cIdx}
              className={`relative flex flex-col flex-shrink-0 bg-white border-2 ${styling.border} rounded-2xl px-4 pt-5 pb-4 shadow-sm min-w-[120px]`}
            >
              {/* Chunk Badge at Top Center */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className={`text-[11px] font-bold px-3 py-0.5 rounded-full shadow-xs whitespace-nowrap ${styling.badgeBg}`}>
                  {chunk.chunkLabel}
                </span>
              </div>

              {/* Words inside chunk in a single horizontal row */}
              <div className="flex flex-row flex-nowrap items-end justify-center gap-3 mt-2">
                {chunk.words.map((w, wIdx) => (
                  <div key={wIdx} className="flex flex-col items-center text-center group flex-shrink-0">
                    {/* IPA */}
                    <span className="text-[11px] font-mono text-gray-400 mb-1 whitespace-nowrap">
                      {w.ipa || ""}
                    </span>
                    {/* Word (English) */}
                    <span className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
                      {w.word}
                    </span>
                    {/* Underline bar */}
                    <div className="w-full h-1 bg-lingo-blue my-1.5 rounded-full"></div>
                    {/* Meaning (Chinese) */}
                    <span className="text-xs font-medium text-gray-700 max-w-[90px] truncate whitespace-nowrap">
                      {w.meaning}
                    </span>
                    {/* POS */}
                    <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1 py-0.5 mt-1 font-medium whitespace-nowrap">
                      {w.pos}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Sentence Translation at Bottom */}
      {data.fullTranslation && (
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <p className="text-lg sm:text-xl font-bold text-gray-800 bg-gray-50 py-3 px-6 rounded-xl border border-gray-200 inline-block shadow-xs">
            {data.fullTranslation}
          </p>
        </div>
      )}
    </div>
  );
}
