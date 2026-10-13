import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "50mb" }));

// Initialize GoogleGenAI SDK per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// AI Language Tutor Chat API
app.post("/api/tutor/chat", async (req, res) => {
  try {
    const { messages, targetLanguage = "English", learnerLevel = "A2" } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const systemInstruction = `You are the friendly, encouraging AI Language Tutor for jubeidanci (OpenLingo).
Target Language: ${targetLanguage}
Learner Level: ${learnerLevel} (CEFR)

Your goals:
1. Converse naturally in the target language (${targetLanguage}) matched to CEFR ${learnerLevel}.
2. If the user makes grammatical or vocabulary mistakes, provide a brief, polite tip or correction enclosed in [Correction: ...], then continue the natural dialogue.
3. Keep answers concise, engaging, and always end with an interactive question or prompt to keep the conversation flowing.
4. If the user asks in English or their native tongue for an explanation or translation, explain clearly and warmly.`;

    // Format chat history
    const conversationPrompt = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
      .join("\n\n");

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: conversationPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("Error in /api/tutor/chat:", error);
    res.status(500).json({ error: error.message || "Failed to generate tutor response" });
  }
});

app.post("/api/analyze-sentence", async (req, res) => {
  try {
    const { POST } = await import("./app/api/analyze-sentence/route.js");
    const fullUrl = `http://${req.headers.host || "localhost:3000"}${req.url}`;
    const webReq = new Request(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const nextRes = await POST(webReq as any);
    const data = await nextRes.json();
    res.status(nextRes.status).json(data);
  } catch (err: any) {
    console.error("Error in /api/analyze-sentence:", err);
    res.status(500).json({ error: err.message || "Failed to analyze sentence" });
  }
});

// AI Unit & Lesson Generator
app.post("/api/tutor/create-unit", async (req, res) => {
  try {
    const { topic = "Daily Routine", language = "Spanish", level = "A1" } = req.body;

    const prompt = `Create an interactive language learning lesson unit for jubeidanci.
Topic: "${topic}"
Target Language: ${language}
CEFR Level: ${level}

Return a valid JSON object with the following structure:
{
  "title": "Unit Title",
  "description": "Short unit overview",
  "vocabulary": [
    { "word": "word in target lang", "translation": "English translation", "example": "Example sentence", "partOfSpeech": "noun/verb/adj" }
  ],
  "exercises": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text in English or target language",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct Option",
      "explanation": "Why this is correct"
    },
    {
      "id": 2,
      "type": "fill_in_the_blank",
      "sentence": "Sentence with ___ blank in target lang",
      "correctWord": "word",
      "options": ["word", "wrong1", "wrong2"],
      "translation": "English translation of full sentence"
    },
    {
      "id": 3,
      "type": "translation",
      "prompt": "Translate this sentence",
      "sourceText": "Original sentence",
      "correctTranslation": "Accurate translation in target lang",
      "acceptableAlternatives": ["Alternative translation"]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/tutor/create-unit:", error);
    res.status(500).json({ error: error.message || "Failed to generate unit" });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`jubeidanci Server running on http://localhost:${PORT}`);
  });
}

startServer();
