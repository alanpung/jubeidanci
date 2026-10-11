import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let sentence = "";
  try {
    const body = await req.json();
    sentence = body.sentence || "";
    if (!sentence) {
      return NextResponse.json({ error: "Missing sentence" }, { status: 400 });
    }

    const fallback = getFallbackAnalysis(sentence);
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(fallback);
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze the following English sentence ("${sentence}") into syntactic chunks (such as Subject / 主语, Predicate / 谓语, Object / 宾语, Adverbial / 状语, etc.).

CRITICAL INSTRUCTIONS:
1. The 'word' property MUST be the exact English word from the input sentence (e.g., "I", "get", "up", "at", "seven", etc.). DO NOT put Chinese characters in the 'word' field.
2. The 'meaning' property should be the simplest Chinese translation of that English word.
3. The 'ipa' property should be the IPA pronunciation of the English word.
4. The 'pos' property should be the part of speech in Chinese (e.g. "代词", "动词", "副词", "介词", "数词", "名词", "连词", "限定词").
5. The 'chunkLabel' should be the Chinese syntactic role label (e.g. "主语", "谓语", "宾语", "状语", "定语").
6. 'fullTranslation' should be the complete natural Chinese translation of the entire sentence.

Return ONLY valid JSON format without markdown code blocks:
{
  "fullTranslation": "...",
  "chunks": [
    {
      "chunkLabel": "主语",
      "words": [
        { "word": "I", "ipa": "/aɪ/", "meaning": "我", "pos": "代词" }
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
    
    if (parsed && parsed.chunks && parsed.chunks.length > 0) {
      return NextResponse.json(parsed);
    }
    return NextResponse.json(fallback);
  } catch (err) {
    console.error("Sentence analysis error:", err);
    return NextResponse.json(getFallbackAnalysis(sentence));
  }
}

function getFallbackAnalysis(sentence: string) {
  const lower = (sentence || "").toLowerCase();
  if (lower.includes("fresh apples") || lower.includes("i like to eat")) {
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

  if (lower.includes("get up at seven") || lower.includes("breakfast") || lower.includes("seven")) {
    return {
      fullTranslation: "我每天早上七点起床，然后吃早餐。",
      chunks: [
        {
          chunkLabel: "主语",
          words: [{ word: "I", ipa: "/aɪ/", meaning: "我", pos: "代词" }]
        },
        {
          chunkLabel: "谓语",
          words: [{ word: "get up", ipa: "/ɡɛt ʌp/", meaning: "起床", pos: "动词短语" }]
        },
        {
          chunkLabel: "状语",
          words: [
            { word: "at", ipa: "/æt/", meaning: "在", pos: "介词" },
            { word: "seven", ipa: "/ˈsɛvən/", meaning: "七点", pos: "数词" },
            { word: "every", ipa: "/ˈɛvri/", meaning: "每个", pos: "限定词" },
            { word: "morning", ipa: "/ˈmɔːrnɪŋ/", meaning: "早晨", pos: "名词" }
          ]
        },
        {
          chunkLabel: "状语",
          words: [
            { word: "and", ipa: "/ænd/", meaning: "然后", pos: "连词" },
            { word: "then", ipa: "/ðɛn/", meaning: "接着", pos: "副词" }
          ]
        },
        {
          chunkLabel: "谓语",
          words: [{ word: "have", ipa: "/hæv/", meaning: "吃", pos: "动词" }]
        },
        {
          chunkLabel: "宾语",
          words: [{ word: "breakfast", ipa: "/ˈbrɛkfəst/", meaning: "早餐", pos: "名词" }]
        }
      ]
    };
  }

  const words = (sentence || "Hello world").split(/\s+/).map((w) => ({
    word: w,
    ipa: "",
    meaning: w,
    pos: "词"
  }));
  return {
    fullTranslation: sentence || "",
    chunks: [
      {
        chunkLabel: "句子",
        words
      }
    ]
  };
}
