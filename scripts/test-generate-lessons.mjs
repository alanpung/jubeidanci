import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateLessonsBatch(unitTitle, lessons) {
  const prompt = `You are an expert CEFR A2 curriculum author.
Unit: "${unitTitle}"
Lessons:
${lessons.map((l, i) => `${i + 1}. ${l}`).join("\n")}

For EACH of the ${lessons.length} lessons listed above, generate 10 natural, practical, everyday CEFR A2 English sentences for beginner/elementary language learners.

STRICT CONSTRAINTS:
1. Topic Relevant: Every sentence MUST clearly match its specific lesson theme (e.g. Train Station -> tickets, platforms, departures, catching the train).
2. Level Appropriate: CEFR A2 (clear, common English vocabulary, realistic everyday phrases).
3. 3 Valid Answers:
   - "answer": standard English answer
   - "acceptAlso": array of EXACTLY 2 alternative valid, natural English translations (so there are 3 valid answers in total).
4. Chinese prompt: Natural Simplified Chinese.
5. Vocabulary (srsWords): 4 to 8 individual lowercase lemmatized A1/A2 words.

Return a JSON array of ${lessons.length} lesson objects:
[
  {
    "lessonTitle": "Lesson Name",
    "sentences": [
      {
        "sentence": "中文句子",
        "answer": "Primary English translation.",
        "acceptAlso": ["Alternative English translation 1.", "Alternative English translation 2."],
        "srsWords": ["word1", "word2", "word3"]
      }
    ]
  }
]`;

  const res = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const parsed = JSON.parse(res.text);
  console.log("Successfully generated", parsed.length, "lessons");
  console.log("Sample sentence from lesson 1:", parsed[0].sentences[0]);
}

generateLessonsBatch("Unit 2: Travel, Transport & Directions", ["Train Station", "Airport"]).catch(console.error);
