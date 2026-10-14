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

interface SentenceAnalysisData {
  fullTranslation?: string;
  acceptableTranslations?: string[];
  words?: AnalyzedWord[];
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
  like: { ipa: "/laɪk/", meaning: "喜欢", grammarTag: "动词" },
  fresh: { ipa: "/freʃ/", meaning: "新鲜的", grammarTag: "形容词" },
  apples: { ipa: "/ˈæplz/", meaning: "苹果", grammarTag: "名词" },
  this: { ipa: "/ðɪs/", meaning: "这", grammarTag: "指示代词" },
  polluted: { ipa: "/pəˈluːtɪd/", meaning: "受污染的", grammarTag: "形容词" },
  river: { ipa: "/ˈrɪv.ər/", meaning: "河流", grammarTag: "名词" },
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

const POS_COLORS: Record<string, string> = {
  "代词": "text-blue-600",
  "限定词": "text-purple-600",
  "冠词": "text-orange-600",
  "助动词": "text-teal-600",
  "动词": "text-red-600",
  "名词": "text-emerald-700",
  "形容词": "text-amber-600",
  "副词": "text-pink-600",
  "介词": "text-indigo-600",
  "连词": "text-yellow-600",
};

function resolveGrammarTag(word: string, pos?: string): string {
  const clean = word.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");

  if (PRONOUN_WORDS.has(clean)) return "代词";
  if (POSSESSIVE_WORDS.has(clean)) return "限定词";
  if (ARTICLE_WORDS.has(clean)) return "冠词";
  if (AUXILIARY_WORDS.has(clean)) return "助动词";

  if (BUILTIN_WORD_DICT[clean]?.grammarTag) {
    return BUILTIN_WORD_DICT[clean].grammarTag;
  }

  if (pos === "auxiliary" || pos === "助动词") return "助动词";
  if (pos === "possessive" || pos === "物主限定词") return "限定词";
  if (pos === "pronoun" || pos === "代词" || pos === "人称代词") return "代词";
  if (pos === "verb" || pos === "动词") return "动词";
  if (pos === "noun" || pos === "名词") return "名词";
  if (pos === "adjective" || pos === "adj" || pos === "形容词") return "形容词";
  if (pos === "adverb" || pos === "adv" || pos === "副词") return "副词";
  if (pos === "preposition" || pos === "prep" || pos === "介词") return "介词";
  if (pos === "conjunction" || pos === "conj" || pos === "连词") return "连词";
  if (pos === "determiner" || pos === "限定词") return "限定词";

  return "名词";
}

export function Translation({ exercise, onResult, onContinue, language, autoplayAudio = true }: Props) {
  const [analysis, setAnalysis] = useState<SentenceAnalysisData | null>(null);

  const rawAnswerTokens = useMemo(() => {
    return exercise.answer.trim().split(/\s+/).filter(Boolean);
  }, [exercise.answer]);

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

  const analyzedWordList = useMemo<AnalyzedWord[]>(() => {
    return rawAnswerTokens.map((token: string, idx: number) => {
      const clean = token.toLowerCase().replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, "");
      const dict = BUILTIN_WORD_DICT[clean];
      const gTag = dict?.grammarTag || resolveGrammarTag(token);

      return {
        word: token,
        ipa: dict?.ipa || "",
        meaning: dict?.meaning || clean,
        pos: dict?.grammarTag || "名词",
        grammarTag: gTag,
      };
    });
  }, [rawAnswerTokens]);

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

  function handleCheck() {
    const matchResult: WordMatchResult = checkWordMatch(inputWords, allAnswers);

    setSimilarityScore(matchResult.score);
    setMatchDetail(`${matchResult.matchCount}/${matchResult.totalCount} words correct (${matchResult.percentage}%)`);
    setMatchedWordIndices(matchResult.matchedWordIndices);
    const primaryCorrect = allAnswers[0] || exercise.answer;
    setBestMatchAnswer(primaryCorrect);

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
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-2 sm:py-4">
        {/* Chinese Sentence Prompt at the top */}
        <div className="flex flex-col items-center mt-2 mb-6 text-center px-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-800 tracking-normal select-none">
              <HoverableText text={exercise.sentence} language={sentenceLang} />
            </h1>
            {!exercise.noAudio?.includes("sentence") && (
              <ReplayButton onPlay={() => play(exercise.sentence, sentenceLang)} />
            )}
          </div>
        </div>

        {/* Word Input Cards Layout (without word structure/chunk labels) */}
        <div
          onClick={() => {
            if (status === "answering") {
              const firstEmpty = inputWords.findIndex((w) => !w.trim());
              focusInputSlot(firstEmpty === -1 ? activeSlot : firstEmpty);
            }
          }}
          className="w-full flex flex-col items-center cursor-text mb-4"
        >
          {status !== "answering" && (
            <div className="w-full flex items-center justify-end mb-3 max-w-4xl">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  play(bestMatchAnswer, "en");
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-lingo-blue/10 hover:bg-lingo-blue/20 text-lingo-blue text-xs font-semibold rounded-full transition-colors cursor-pointer"
                title="Listen English Audio"
              >
                <Volume2 className="w-4 h-4" />
                <span>Listen Audio</span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 w-full max-w-4xl">
            {analyzedWordList.map((item, idx) => {
              const targetWord = item.word;
              const typedWord = inputWords[idx] || "";
              const isSlotActive = activeSlot === idx;
              const isWordMatched = matchedWordIndices[idx] !== undefined ? matchedWordIndices[idx] : true;

              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-blue-200 shadow-xs px-4 py-3.5 flex flex-col items-center justify-center min-w-[95px] sm:min-w-[115px]"
                >
                  {/* POS on top as hint */}
                  <div className="h-5 flex items-center justify-center mb-1">
                    {item.grammarTag && (
                      <span className={`text-[11px] sm:text-xs font-sans font-medium tracking-wider select-none whitespace-nowrap ${
                        POS_COLORS[item.grammarTag] || "text-gray-500"
                      }`}>
                        {item.grammarTag}
                      </span>
                    )}
                  </div>

                  {/* Input or Result */}
                  <div className="flex flex-col items-center justify-center my-1">
                    {status === "answering" ? (
                      <input
                        id={`word-input-${idx}`}
                        ref={(el: HTMLInputElement | null) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        autoFocus={idx === 0}
                        value={typedWord}
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
                        style={{ width: `${Math.max(3, targetWord.length + 1)}ch` }}
                        className={`text-center font-serif text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 bg-transparent focus:outline-none pb-0.5 min-w-[2.5rem] sm:min-w-[3rem] transition-all border-b-2 ${
                          isSlotActive
                            ? "border-[#007a55] border-b-[3px] shadow-[0_2px_0_0_#007a55]"
                            : "border-[#007a55]/60 hover:border-[#007a55]"
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col items-center">
                        {!isWordMatched && (
                          <span className="font-serif text-xs sm:text-sm font-bold text-emerald-600 mb-0.5 whitespace-nowrap">
                            {targetWord}
                          </span>
                        )}
                        <span
                          className={`font-serif text-xl sm:text-2xl font-bold tracking-tight pb-0.5 px-1 whitespace-nowrap ${
                            isWordMatched ? "text-emerald-700" : "text-red-600 line-through decoration-red-500"
                          }`}
                        >
                          {typedWord || "(empty)"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Meaning & IPA below after Enter */}
                  <div className="h-10 flex flex-col items-center justify-start mt-1">
                    {status !== "answering" && (
                      <>
                        {item.meaning && (
                          <span className="text-[11px] sm:text-xs font-bold text-gray-800 whitespace-nowrap select-none leading-tight">
                            {item.meaning}
                          </span>
                        )}
                        {item.ipa && (
                          <span className="text-[10px] text-gray-400 select-none leading-tight mt-0.5">
                            {item.ipa}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ExerciseShell>
  );
}
