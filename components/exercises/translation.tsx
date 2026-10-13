"use client";

import { useState, useEffect, useMemo, useRef, useCallback, KeyboardEvent } from "react";
import type { TranslationExercise } from "@/lib/content/types";
import { useExercise } from "@/hooks/use-exercise";
import { useAudio } from "@/hooks/use-audio";
import { checkWordMatch, generateAlternativeTranslations, WordMatchResult } from "@/lib/similarity";
import { ExerciseShell } from "./exercise-shell";
import { HoverableText } from "@/components/word/hoverable-text";
import { ReplayButton } from "@/components/replay-button";
import { detectTextLanguage } from "@/lib/language-detector";
import { Volume2 } from "lucide-react";

interface Props {
  exercise: TranslationExercise;
  onResult: (correct: boolean, answer: string) => void;
  onContinue: () => void;
  language: string;
  autoplayAudio?: boolean;
}

interface AnalyzedWord {
  word: string;
  ipa?: string;
  meaning?: string;
  pos?: string;
  grammarTag?: string;
}

interface SyntacticChunk {
  chunkLabel: string;
  words: AnalyzedWord[];
}

interface SentenceAnalysisData {
  fullTranslation?: string;
  acceptableTranslations?: string[];
  chunks: SyntacticChunk[];
}

// Built-in word dictionary for instant accurate fallback mapping
const BUILTIN_WORD_DICT: Record<string, { ipa: string; meaning: string; grammarTag: string }> = {
  did: { ipa: "/dɪd/", meaning: "做/干", grammarTag: "助动词" },
  do: { ipa: "/duː/", meaning: "做/干", grammarTag: "助动词" },
  does: { ipa: "/dʌz/", meaning: "做/干", grammarTag: "助动词" },
  have: { ipa: "/hæv/", meaning: "有/已经", grammarTag: "助动词" },
  has: { ipa: "/hæz/", meaning: "有/已经", grammarTag: "助动词" },
  had: { ipa: "/hæd/", meaning: "有/已经", grammarTag: "助动词" },
  will: { ipa: "/wɪl/", meaning: "将会", grammarTag: "助动词" },
  would: { ipa: "/wʊd/", meaning: "想要/会", grammarTag: "助动词" },
  can: { ipa: "/kæn/", meaning: "能/可以", grammarTag: "助动词" },
  could: { ipa: "/kʊd/", meaning: "能够", grammarTag: "助动词" },
  should: { ipa: "/ʃʊd/", meaning: "应该", grammarTag: "助动词" },
  must: { ipa: "/mʌst/", meaning: "必须", grammarTag: "助动词" },
  is: { ipa: "/ɪz/", meaning: "是", grammarTag: "助动词" },
  are: { ipa: "/ɑːr/", meaning: "是", grammarTag: "助动词" },
  was: { ipa: "/wɒz/", meaning: "是(过去)", grammarTag: "助动词" },
  were: { ipa: "/wɜːr/", meaning: "是(过去)", grammarTag: "助动词" },
  been: { ipa: "/bɪn/", meaning: "是(分词)", grammarTag: "动词" },
  you: { ipa: "/juː/", meaning: "你", grammarTag: "人称代词" },
  i: { ipa: "/aɪ/", meaning: "我", grammarTag: "人称代词" },
  he: { ipa: "/hiː/", meaning: "他", grammarTag: "人称代词" },
  she: { ipa: "/ʃiː/", meaning: "她", grammarTag: "人称代词" },
  it: { ipa: "/ɪt/", meaning: "它", grammarTag: "人称代词" },
  we: { ipa: "/wiː/", meaning: "我们", grammarTag: "人称代词" },
  they: { ipa: "/ðeɪ/", meaning: "他们", grammarTag: "人称代词" },
  me: { ipa: "/miː/", meaning: "我", grammarTag: "人称代词" },
  him: { ipa: "/hɪm/", meaning: "他", grammarTag: "人称代词" },
  her: { ipa: "/hɜːr/", meaning: "她/她的", grammarTag: "人称代词" },
  us: { ipa: "/ʌs/", meaning: "我们", grammarTag: "人称代词" },
  them: { ipa: "/ðɛm/", meaning: "他们", grammarTag: "人称代词" },
  my: { ipa: "/maɪ/", meaning: "我的", grammarTag: "物主限定词" },
  your: { ipa: "/jɔːr/", meaning: "你的", grammarTag: "物主限定词" },
  his: { ipa: "/hɪz/", meaning: "他的", grammarTag: "物主限定词" },
  our: { ipa: "/aʊər/", meaning: "我们的", grammarTag: "物主限定词" },
  their: { ipa: "/ðɛər/", meaning: "他们的", grammarTag: "物主限定词" },
  its: { ipa: "/ɪts/", meaning: "它的", grammarTag: "物主限定词" },
  get: { ipa: "/ɡɛt/", meaning: "使得/收到", grammarTag: "动词" },
  message: { ipa: "/ˈmɛs.ɪdʒ/", meaning: "消息", grammarTag: "名词" },
  the: { ipa: "/ðə/", meaning: "这/那", grammarTag: "冠词" },
  a: { ipa: "/ə/", meaning: "一个", grammarTag: "冠词" },
  an: { ipa: "/æn/", meaning: "一个", grammarTag: "冠词" },
  to: { ipa: "/tuː/", meaning: "去/向", grammarTag: "介词" },
  for: { ipa: "/fɔːr/", meaning: "为了/去", grammarTag: "介词" },
  in: { ipa: "/ɪn/", meaning: "在…里", grammarTag: "介词" },
  on: { ipa: "/ɒn/", meaning: "在…上", grammarTag: "介词" },
  at: { ipa: "/æt/", meaning: "在", grammarTag: "介词" },
  with: { ipa: "/wɪð/", meaning: "和…一起", grammarTag: "介词" },
  sweet: { ipa: "/swiːt/", meaning: "甜的", grammarTag: "形容词" },
  something: { ipa: "/ˈsʌm.θɪŋ/", meaning: "某物/东西", grammarTag: "代词" },
  want: { ipa: "/wɒnt/", meaning: "想要", grammarTag: "动词" },
  eat: { ipa: "/iːt/", meaning: "吃", grammarTag: "动词" },
};

const AUXILIARY_WORDS = new Set([
  "did", "do", "does", "have", "has", "had", "will", "would",
  "can", "could", "should", "must", "may", "might", "shall",
  "am", "is", "are", "was", "were"
]);

const PRONOUN_WORDS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them"
]);

const POSSESSIVE_WORDS = new Set([
  "my", "your", "his", "her", "its", "our", "their"
]);

const ARTICLE_WORDS = new Set(["a", "an", "the"]);

function resolveGrammarTag(word: string, pos?: string, chunkLabel?: string): string {
  const clean = word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");

  if (PRONOUN_WORDS.has(clean)) return "人称代词";
  if (POSSESSIVE_WORDS.has(clean)) return "物主限定词";
  if (ARTICLE_WORDS.has(clean)) return "冠词";
  if (AUXILIARY_WORDS.has(clean)) return "助动词";

  if (BUILTIN_WORD_DICT[clean]?.grammarTag) {
    return BUILTIN_WORD_DICT[clean].grammarTag;
  }

  if (pos === "auxiliary" || pos === "助动词") return "助动词";
  if (pos === "possessive" || pos === "物主限定词") return "物主限定词";
  if (pos === "pronoun" || pos === "代词" || pos === "人称代词") return "人称代词";
  if (pos === "verb" || pos === "动词") return "动词";
  if (pos === "noun" || pos === "名词") return "名词";
  if (pos === "adjective" || pos === "adj" || pos === "形容词") return "形容词";
  if (pos === "adverb" || pos === "adv" || pos === "副词") return "副词";
  if (pos === "preposition" || pos === "prep" || pos === "介词") return "介词";
  if (pos === "conjunction" || pos === "conj" || pos === "连词") return "连词";
  if (pos === "determiner" || pos === "限定词") return "限定词";
  if (pos === "numeral" || pos === "num" || pos === "数词") return "数词";

  if (chunkLabel && chunkLabel !== "句子") return chunkLabel;
  return "名词";
}

// Color styles matching IMG_7510.jpeg
const GRAMMAR_PILL_COLORS: Record<string, string> = {
  "助动词": "bg-[#009b69] text-white",     // Green
  "人称代词": "bg-[#c026d3] text-white",   // Magenta/fuchsia
  "动词": "bg-[#7c3aed] text-white",       // Violet/purple
  "物主限定词": "bg-[#0284c7] text-white", // Sky blue
  "名词": "bg-[#b91c1c] text-white",       // Crimson/Rose
  "副词": "bg-[#0d9488] text-white",       // Teal
  "形容词": "bg-[#d97706] text-white",     // Amber
  "介词": "bg-[#4f46e5] text-white",       // Indigo
  "连词": "bg-[#475569] text-white",       // Slate
  "冠词": "bg-[#0ea5e9] text-white",       // Light blue
  "指示代词": "bg-[#0284c7] text-white",   // Blue
  "疑问词": "bg-[#d97706] text-white",     // Amber
  "数词": "bg-[#f59e0b] text-white",       // Orange
  "主语": "bg-[#f59e0b] text-white",
  "谓语": "bg-[#f43f5e] text-white",
  "宾语": "bg-[#2563eb] text-white",
  "状语": "bg-[#059669] text-white",
  "定语": "bg-[#8b5cf6] text-white",
};

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

  // Generate multiple rich acceptable alternative translations
  const allAnswers = useMemo(() => {
    const fromProps = exercise.acceptAlso || [];
    const fromApi = analysis?.acceptableTranslations || [];
    return generateAlternativeTranslations(exercise.answer, [...fromProps, ...fromApi]);
  }, [exercise.answer, exercise.acceptAlso, analysis?.acceptableTranslations]);

  const [inputWords, setInputWords] = useState<string[]>(() => rawAnswerTokens.map(() => ""));
  const [bestMatchAnswer, setBestMatchAnswer] = useState<string>(exercise.answer);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [matchDetail, setMatchDetail] = useState<string>("");
  const [matchedWordIndices, setMatchedWordIndices] = useState<boolean[]>([]);
  const [activeSlot, setActiveSlot] = useState<number>(0);

  const { status, checkAnswer } = useExercise();
  const { play, stop, prefetch } = useAudio();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInputSlot = useCallback(
    (idx: number = 0) => {
      if (status !== "answering") return;
      const targetIdx = Math.max(0, Math.min(rawAnswerTokens.length - 1, idx));
      setActiveSlot(targetIdx);
      requestAnimationFrame(() => {
        const el = inputRefs.current[targetIdx] || (document.getElementById(`word-input-${targetIdx}`) as HTMLInputElement | null);
        if (el) {
          el.focus({ preventScroll: true });
          try {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          } catch {}
        }
      });
    },
    [status, rawAnswerTokens.length]
  );

  useEffect(() => {
    setInputWords(rawAnswerTokens.map(() => ""));
    setSimilarityScore(null);
    setMatchDetail("");
    setMatchedWordIndices([]);
    setBestMatchAnswer(exercise.answer);
    setActiveSlot(0);

    // Staggered triggers to guarantee the cursor/pointer points to the first word line immediately
    focusInputSlot(0);
    const t1 = setTimeout(() => focusInputSlot(0), 30);
    const t2 = setTimeout(() => focusInputSlot(0), 100);
    const t3 = setTimeout(() => focusInputSlot(0), 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [exercise.answer, rawAnswerTokens, focusInputSlot]);

  useEffect(() => {
    if (status === "answering") {
      focusInputSlot(0);
    }
  }, [status, focusInputSlot]);


  useEffect(() => {
    let isMounted = true;
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence: exercise.answer, targetLanguage: "en" }),
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setAnalysis(json);
        }
      } catch (err) {
        console.error("Failed to fetch sentence analysis", err);
      }
    }
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [exercise.answer]);

  // Flattened analyzed word list with grammar tags, IPA, and meaning
  const analyzedWordList = useMemo<AnalyzedWord[]>(() => {
    const fallbackList = rawAnswerTokens.map((token: string) => {
      const clean = token.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];
      return {
        word: token,
        ipa: dict?.ipa || "",
        meaning: dict?.meaning || clean,
        pos: dict?.grammarTag || "名词",
        grammarTag: dict?.grammarTag || resolveGrammarTag(token),
      };
    });

    if (!analysis || !Array.isArray(analysis.chunks)) {
      return fallbackList;
    }

    const flattened: AnalyzedWord[] = [];
    for (const chunk of analysis.chunks) {
      if (!chunk || !Array.isArray(chunk.words)) continue;
      for (const w of chunk.words) {
        if (!w) continue;
        const parts = String(w.word || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length > 1) {
          for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            const sub = parts[pIdx];
            const cleanSub = sub.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
            const dict = BUILTIN_WORD_DICT[cleanSub];
            flattened.push({
              word: sub,
              ipa: dict?.ipa || (pIdx === 0 ? (w.ipa || "") : ""),
              meaning: dict?.meaning || (pIdx === 0 ? (w.meaning || "") : ""),
              pos: w.pos,
              grammarTag: dict?.grammarTag || resolveGrammarTag(sub, w.pos, chunk.chunkLabel),
            });
          }
        } else if (parts.length === 1) {
          const cleanSingle = parts[0].toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
          const dict = BUILTIN_WORD_DICT[cleanSingle];
          flattened.push({
            word: parts[0],
            ipa: dict?.ipa || w.ipa || "",
            meaning: dict?.meaning || w.meaning || "",
            pos: w.pos,
            grammarTag: dict?.grammarTag || resolveGrammarTag(parts[0], w.pos, chunk.chunkLabel),
          });
        }
      }
    }

    return rawAnswerTokens.map((token: string, idx: number) => {
      const found = flattened[idx];
      const clean = token.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];
      return {
        word: token,
        ipa: dict?.ipa || found?.ipa || "",
        meaning: dict?.meaning || found?.meaning || clean,
        pos: found?.pos || dict?.grammarTag,
        grammarTag: dict?.grammarTag || found?.grammarTag || resolveGrammarTag(token, found?.pos),
      };
    });
  }, [analysis, rawAnswerTokens]);

  const orderedAnswers = useMemo(() => {
    if (!bestMatchAnswer) return allAnswers;
    const matched = allAnswers.find((a) => a.toLowerCase() === bestMatchAnswer.toLowerCase());
    if (!matched) return allAnswers;
    return [matched, ...allAnswers.filter((a) => a.toLowerCase() !== bestMatchAnswer.toLowerCase())];
  }, [allAnswers, bestMatchAnswer]);

  const sentenceLang = useMemo(
    () => detectTextLanguage(exercise.sentence, { targetLanguage: language }),
    [exercise.sentence, language]
  );

  useEffect(() => {
    const toFetch = [exercise.sentence, ...allAnswers].filter(Boolean);
    prefetch(toFetch, language);
  }, [exercise.sentence, allAnswers, language, prefetch]);

  useEffect(() => {
    if (autoplayAudio && !exercise.noAudio?.includes("sentence")) {
      play(exercise.sentence, sentenceLang);
    }
    return stop;
  }, [exercise.sentence, sentenceLang, autoplayAudio, play, stop, exercise.noAudio]);

  /**
   * Word-by-word accuracy match calculation requested by user:
   * Counts matched words against target sentence.
   * Example: "Did you get my message" vs "Did you got my message" => 4/5 words = 80%.
   * 80% and above considered correct!
   */
  function handleCheck() {
    const matchResult: WordMatchResult = checkWordMatch(inputWords, allAnswers);

    setSimilarityScore(matchResult.score);
    setMatchDetail(`${matchResult.matchCount}/${matchResult.totalCount} words correct (${matchResult.percentage}%)`);
    setMatchedWordIndices(matchResult.matchedWordIndices);
    const primaryCorrect = allAnswers[0] || exercise.answer;
    setBestMatchAnswer(primaryCorrect);

    // 80% and above is considered correct (>= 80% correct, <= 79% wrong)
    checkAnswer(matchResult.isCorrect);
    onResult(matchResult.isCorrect, inputWords.join(" ").trim());

    if (!exercise.noAudio?.includes("sentence")) {
      play(primaryCorrect, "en");
    }
  }

  const handleNavigation = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusInputSlot(Math.min(rawAnswerTokens.length - 1, i + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusInputSlot(Math.max(0, i - 1));
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (i + 1 < rawAnswerTokens.length) {
        focusInputSlot(i + 1);
      }
    } else if (e.key === "Backspace" && (!inputWords[i] || inputWords[i].length === 0)) {
      if (i > 0) {
        e.preventDefault();
        focusInputSlot(i - 1);
      }
    }
  };

  return (
    <ExerciseShell
      status={status}
      onCheck={handleCheck}
      onContinue={onContinue}
      canCheck={inputWords.length === rawAnswerTokens.length && inputWords.every((w: string) => w.trim().length > 0)}
      correctAnswer={bestMatchAnswer}
      allAnswers={orderedAnswers}
      language={language}
      similarityScore={similarityScore}
      similarityDetail={matchDetail}
    >
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center py-1 sm:py-3">
        {/* Chinese Sentence Prompt at Top (Compact) */}
        <div className="flex flex-col items-center mb-3 sm:mb-5 text-center px-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-normal select-none">
              <HoverableText text={exercise.sentence} language={sentenceLang} />
            </h1>
            {!exercise.noAudio?.includes("sentence") && (
              <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
            )}
          </div>
        </div>

        {/* Word Columns Card (Click anywhere to focus active/first word line) */}
        <div
          onClick={() => {
            if (status === "answering") {
              const firstEmpty = inputWords.findIndex((w) => !w.trim());
              focusInputSlot(firstEmpty === -1 ? activeSlot : firstEmpty);
            }
          }}
          className="w-full bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-xs p-3 sm:p-6 mb-4 transition-all cursor-text"
        >
          {status !== "answering" && (
            <div className="flex items-center justify-end mb-3 pb-2 border-b border-gray-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  play(bestMatchAnswer, "en");
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors cursor-pointer"
                title="Listen English Audio"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Listen Audio</span>
              </button>
            </div>
          )}

          {/* Horizontal Layout of Columns - Tight gap-x & gap-y to fit more words per row */}
          <div className="flex flex-wrap items-start justify-center gap-x-2 sm:gap-x-4 gap-y-2.5 sm:gap-y-4 py-1">
            {analyzedWordList.map((item, idx) => {
              const targetWord = item.word;
              const pillColor = GRAMMAR_PILL_COLORS[item.grammarTag || "名词"] || "bg-[#009b69] text-white";
              const isWordMatched = matchedWordIndices[idx] !== undefined ? matchedWordIndices[idx] : true;
              const userTyped = inputWords[idx] || "";
              const isSlotActive = activeSlot === idx;

              return (
                <div key={idx} className="flex flex-col items-center min-w-[36px] sm:min-w-[56px] px-0.5">
                  {/* Tier 1: Grammatical Structure Badge (Compact Pill) */}
                  <div className="mb-1 sm:mb-1.5">
                    <span
                      className={`inline-block px-1.5 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-tight shadow-2xs whitespace-nowrap ${pillColor}`}
                    >
                      {item.grammarTag}
                    </span>
                  </div>

                  {/* Tier 2: Word Input (During typing) OR Word Result (After Enter) */}
                  <div className="flex flex-col items-center justify-center">
                    {status === "answering" ? (
                      <input
                        id={`word-input-${idx}`}
                        ref={(el: HTMLInputElement | null) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        autoFocus={idx === 0}
                        value={inputWords[idx] || ""}
                        onFocus={() => setActiveSlot(idx)}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes(" ")) {
                            const clean = val.replace(/\s+/g, "");
                            const next = [...inputWords];
                            next[idx] = clean;
                            setInputWords(next);
                            if (idx + 1 < rawAnswerTokens.length) {
                              focusInputSlot(idx + 1);
                            }
                            return;
                          }
                          const next = [...inputWords];
                          next[idx] = val;
                          setInputWords(next);
                        }}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleNavigation(idx, e)}
                        disabled={status !== "answering"}
                        style={{ width: `${Math.max(2, targetWord.length + 0.5)}ch` }}
                        className={`text-center font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#007a55] bg-transparent focus:outline-none pb-0.5 min-w-[2rem] sm:min-w-[2.75rem] transition-all border-b-2 ${
                          isSlotActive
                            ? "border-[#007a55] border-b-[3px] shadow-[0_2px_0_0_#007a55]"
                            : "border-[#007a55]/60 hover:border-[#007a55]"
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col items-center">
                        {!isWordMatched ? (
                          <div className="flex flex-col items-center">
                            <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#007a55] mb-1 whitespace-nowrap">
                              {targetWord}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-red-500 font-bold select-none text-sm">✕</span>
                              <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-red-600 line-through border-b-2 border-red-500 pb-0.5 px-0.5 whitespace-nowrap">
                                {userTyped ? userTyped : "(missing)"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span
                            className={`font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight pb-0.5 px-0.5 whitespace-nowrap border-b-2 ${
                              isWordMatched
                                ? "text-[#007a55] border-[#007a55]"
                                : "text-[#007a55] border-red-500"
                            }`}
                          >
                            {targetWord}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tier 3 & Tier 4: IPA & Meaning (ONLY rendered after submit, zero empty space during answering) */}
                  {status !== "answering" && (
                    <div className="flex flex-col items-center mt-1">
                      {item.ipa && (
                        <span className="text-[10px] sm:text-xs font-sans font-medium text-gray-400 tracking-wider select-none leading-tight">
                          {item.ipa}
                        </span>
                      )}
                      {item.meaning && (
                        <span className="text-xs sm:text-sm font-bold text-gray-800 whitespace-nowrap select-none mt-0.5 leading-tight">
                          {item.meaning}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ExerciseShell>
  );
}
