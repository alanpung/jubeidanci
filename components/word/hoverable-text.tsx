"use client";

import { useState, useCallback, useRef } from "react";
import { WordPopover } from "./word-popover";
import { useAudio } from "@/hooks/use-audio";
import { detectTextLanguage } from "@/lib/language-detector";

interface HoverableTextProps {
  text: string;
  language: string;
  as?: "p" | "span" | "h2";
  className?: string;
  noAudio?: boolean;
}

interface ActiveWord {
  word: string;
  rect: DOMRect;
  language?: string;
}

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** Parse basic inline markdown (**bold**, *italic*) into segments */
function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: true });
    } else if (match[4]) {
      segments.push({ text: match[4], italic: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

export function HoverableText({
  text,
  language,
  as: Tag = "span",
  className,
  noAudio,
}: HoverableTextProps) {
  const [active, setActive] = useState<ActiveWord | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);
  const { play, prefetch } = useAudio();

  const triggerInspect = useCallback(
    (el: HTMLElement, word: string, wordLang?: string) => {
      const rect = el.getBoundingClientRect();
      const resolvedLang = wordLang || detectTextLanguage(word, { targetLanguage: language });
      setActive({ word, rect, language: resolvedLang });
      if (!noAudio) play(word, resolvedLang);
    },
    [play, language, noAudio]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string, wordLang?: string) => {
      const target = e.currentTarget;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      // Immediately prefetch word audio so it's loaded by the time the hover triggers
      if (!noAudio) {
        const resolvedLang = wordLang || detectTextLanguage(word, { targetLanguage: language });
        prefetch([word], resolvedLang);
      }
      // Brief 180ms delay to prevent accidental pops while quickly moving mouse
      hoverTimer.current = setTimeout(() => {
        triggerInspect(target, word, wordLang);
      }, 180);
    },
    [triggerInspect, noAudio, language, prefetch]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string, wordLang?: string) => {
      e.stopPropagation();
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      triggerInspect(e.currentTarget, word, wordLang);
    },
    [triggerInspect]
  );

  function renderWords(str: string, keyPrefix: string) {
    // If Intl.Segmenter is available, use it for accurate word boundaries (vital for Chinese/Japanese)
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      try {
        const textLang = detectTextLanguage(str, { targetLanguage: language });
        const segmenter = new Intl.Segmenter(textLang, { granularity: "word" });
        const segments = Array.from(segmenter.segment(str));

        return segments.map((item, i) => {
          const seg = item.segment;
          // Punctuation or whitespace
          if (!item.isWordLike || /^\s+$/.test(seg)) {
            return <span key={`${keyPrefix}-${i}`}>{seg}</span>;
          }
          const cleanWord = seg.replace(/[^\p{L}\p{M}'-]/gu, "");
          if (!cleanWord) {
            return <span key={`${keyPrefix}-${i}`}>{seg}</span>;
          }
          const wordLang = detectTextLanguage(cleanWord, { targetLanguage: textLang });
          return (
            <span
              key={`${keyPrefix}-${i}`}
              onMouseEnter={(e) => handleMouseEnter(e, cleanWord, wordLang)}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => handleClick(e, cleanWord, wordLang)}
              className="cursor-pointer border-b border-dotted border-foreground/30 rounded-sm px-0.5 transition-all duration-150 hover:border-lingo-blue hover:bg-lingo-blue/15 hover:text-lingo-blue"
            >
              {seg}
            </span>
          );
        });
      } catch {
        // Fall back to regex
      }
    }

    const words = str.split(/(\s+)/);
    return words.map((segment, i) => {
      if (/^\s+$/.test(segment)) {
        return <span key={`${keyPrefix}-${i}`}>{segment}</span>;
      }
      const cleanWord = segment.replace(/[^\p{L}\p{M}'-]/gu, "");
      if (!cleanWord) {
        return <span key={`${keyPrefix}-${i}`}>{segment}</span>;
      }
      const wordLang = detectTextLanguage(cleanWord, { targetLanguage: language });
      return (
        <span
          key={`${keyPrefix}-${i}`}
          onMouseEnter={(e) => handleMouseEnter(e, cleanWord, wordLang)}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => handleClick(e, cleanWord, wordLang)}
          className="cursor-pointer border-b border-dotted border-foreground/30 rounded-sm px-0.5 transition-all duration-150 hover:border-lingo-blue hover:bg-lingo-blue/15 hover:text-lingo-blue"
        >
          {segment}
        </span>
      );
    });
  }

  const mdSegments = parseInlineMarkdown(text);

  return (
    <>
      <Tag className={className}>
        {mdSegments.map((seg, si) => {
          const inner = renderWords(seg.text, `s${si}`);
          if (seg.bold && seg.italic) return <strong key={si}><em>{inner}</em></strong>;
          if (seg.bold) return <strong key={si}>{inner}</strong>;
          if (seg.italic) return <em key={si}>{inner}</em>;
          return <span key={si}>{inner}</span>;
        })}
      </Tag>

      {active && (
        <WordPopover
          word={active.word}
          language={active.language || language}
          anchorRect={active.rect}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
