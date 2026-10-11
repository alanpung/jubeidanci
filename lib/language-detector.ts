/**
 * Language detection and locale utilities for text-to-speech,
 * word lookup, and bilingual translation exercises.
 */

// BCP 47 locales for browser SpeechSynthesis
export const BROWSER_VOICE_LOCALES: Record<string, string> = {
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  pt: "pt-BR",
  ru: "ru-RU",
  ar: "ar-SA",
  hi: "hi-IN",
  nl: "nl-NL",
  tr: "tr-TR",
  pl: "pl-PL",
  sv: "sv-SE",
  da: "da-DK",
  no: "nb-NO",
  fi: "fi-FI",
  cs: "cs-CZ",
  ro: "ro-RO",
  hu: "hu-HU",
  el: "el-GR",
  he: "he-IL",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  ms: "ms-MY",
  uk: "uk-UA",
  bg: "bg-BG",
};

export function getLanguageLocale(langCode?: string | null): string {
  if (!langCode) return "en-US";
  const code = langCode.toLowerCase().trim();
  if (code.includes("-") || code.includes("_")) {
    return code.replace("_", "-");
  }
  return BROWSER_VOICE_LOCALES[code] || `${code}-${code.toUpperCase()}`;
}

/**
 * Checks if text contains Chinese (Han) characters.
 */
export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/u.test(text);
}

/**
 * Checks if text contains Japanese kana (Hiragana/Katakana).
 */
export function containsJapaneseKana(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff]/u.test(text);
}

/**
 * Checks if text contains Korean Hangul.
 */
export function containsKorean(text: string): boolean {
  return /[\uac00-\ud7af\u1100-\u11ff]/u.test(text);
}

/**
 * Checks if text contains Cyrillic characters.
 */
export function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04ff]/u.test(text);
}

/**
 * Checks if text contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06ff]/u.test(text);
}

/**
 * Checks if text contains Devanagari (Hindi) characters.
 */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097f]/u.test(text);
}

/**
 * Detect the probable language of a piece of text or word.
 * If script detection matches a specific script (e.g. Chinese, Japanese, Korean, Arabic),
 * that is returned with high confidence.
 * If text is Latin script and context is provided (targetLanguage and/or sourceLanguage),
 * it disambiguates Latin text intelligently.
 */
export function detectTextLanguage(
  text: string,
  context?: {
    targetLanguage?: string | null;
    sourceLanguage?: string | null;
    defaultLang?: string;
  }
): string {
  if (!text || typeof text !== "string") {
    return context?.defaultLang || context?.targetLanguage || "en";
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return context?.defaultLang || context?.targetLanguage || "en";
  }

  // 1. Script-based detection
  if (containsJapaneseKana(trimmed)) {
    return "ja";
  }
  if (containsChinese(trimmed)) {
    return "zh";
  }
  if (containsKorean(trimmed)) {
    return "ko";
  }
  if (containsCyrillic(trimmed)) {
    return "ru";
  }
  if (containsArabic(trimmed)) {
    return "ar";
  }
  if (containsDevanagari(trimmed)) {
    return "hi";
  }

  // 2. Text is Latin/ASCII or punctuation
  const target = context?.targetLanguage?.toLowerCase() || null;
  const source = context?.sourceLanguage?.toLowerCase() || null;

  // If one of the context languages is non-Latin (e.g. zh, ja, ko, ar, ru) and the other is Latin (e.g. en, de, es, fr),
  // then any Latin text must belong to the Latin language.
  const nonLatinCodes = new Set(["zh", "ja", "ko", "ru", "ar", "hi"]);

  if (target && nonLatinCodes.has(target)) {
    if (source && !nonLatinCodes.has(source)) {
      return source;
    }
    return "en";
  }

  if (source && nonLatinCodes.has(source)) {
    if (target && !nonLatinCodes.has(target)) {
      return target;
    }
    return "en";
  }

  // If targetLanguage is provided and is a Latin language, prefer targetLanguage
  if (target && !nonLatinCodes.has(target)) {
    return target;
  }

  return context?.defaultLang || "en";
}
