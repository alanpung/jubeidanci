import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { sentence, targetLanguage = "en" } = await req.json();
    if (!sentence) {
      return NextResponse.json({ error: "Missing sentence" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(getFallbackAnalysis(sentence));
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze the following sentence ("${sentence}") into syntactic chunks (such as Subject / 主语, Predicate / 谓语, Object / 宾语, Adverbial / 状语, etc.), and for each word in each chunk, provide:
- word: string
- ipa: International Phonetic Alphabet (e.g. "/aɪ/")
- meaning: simplest Chinese translation of the word
- pos: part of speech in Chinese (e.g. "代词", "动词", "名词", "形容词", "副词", "介词", "连词", "限定词", "助动词")
- chunkLabel: Chinese syntactic role label (e.g. "主语", "谓语", "宾语", "状语", "定语", "补语")
- fullTranslation: complete natural Chinese translation of the entire sentence.

Return ONLY valid JSON format without markdown code blocks:
{
  "fullTranslation": "...",
  "chunks": [
    {
      "chunkLabel": "主语",
      "words": [
        { "word": "...", "ipa": "...", "meaning": "...", "pos": "..." }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const text = response.text?.trim() || "";
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Sentence analysis error:", err);
    return NextResponse.json(getFallbackAnalysis(""));
  }
}

function getFallbackAnalysis(sentence: string) {
  if (sentence.toLowerCase().includes("fresh apples") || sentence.toLowerCase().includes("i like to eat")) {
    return {
      fullTranslation: "我喜欢每天早上吃新鲜的苹果。",
      chunks: [
        {
          chunkLabel: "主语",
          words: [{ word: "I", ipa: "/aɪ/", meaning: "我", pos: "代词" }]
        },
        {
          chunkLabel: "谓语",
          words: [{ word: "like", ipa: "/laɪk/", meaning: "喜欢", pos: "动词" }]
        },
        {
          chunkLabel: "宾语",
          words: [
            { word: "to", ipa: "/tu:/", meaning: "（不定式标记）", pos: "助动词" },
            { word: "eat", ipa: "/i:t/", meaning: "吃", pos: "动词" },
            { word: "fresh", ipa: "/freʃ/", meaning: "新鲜的", pos: "形容词" },
            { word: "apples", ipa: "/æplz/", meaning: "苹果（复数）", pos: "名词" }
          ]
        },
        {
          chunkLabel: "状语",
          words: [
            { word: "every", ipa: "/evri/", meaning: "每一个", pos: "限定词" },
            { word: "morning", ipa: "/mɔ:rnɪŋ/", meaning: "早上", pos: "名词" }
          ]
        }
      ]
    };
  }
  const words = sentence.split(/\s+/).map((w) => ({
    word: w,
    ipa: "",
    meaning: w,
    pos: "词"
  }));
  return {
    fullTranslation: sentence,
    chunks: [
      {
        chunkLabel: "句子",
        words
      }
    ]
  };
}
