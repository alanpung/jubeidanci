import fs from "fs";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const unitTopics = {
  1: {
    unitTitle: "Unit 1: Everyday Conversations & Routines",
    icon: "🌐",
    color: "#6366F1",
    lessons: ["Daily Routine", "Greetings", "Morning Habits", "Family", "Home Life", "Cleaning", "Time Management", "Rest & Sleep", "Weekend Plans", "Pet Care"]
  },
  2: {
    unitTitle: "Unit 2: Travel, Transport & Directions",
    icon: "🚆",
    color: "#3B82F6",
    lessons: ["Train Station", "Airport", "Asking Directions", "Hotel Check-in", "Taxis", "Bus Rides", "Sightseeing", "Luggage", "Tickets", "Car Rental"]
  },
  3: {
    unitTitle: "Unit 3: Food, Dining & Groceries",
    icon: "🍲",
    color: "#EF4444",
    lessons: ["At the Restaurant", "Ordering Food", "Cooking at Home", "Supermarket", "Coffee Shop", "Dietary Preferences", "Recipes", "Breakfast", "Dinner", "Snacks"]
  },
  4: {
    unitTitle: "Unit 4: Shopping, Clothes & Services",
    icon: "🛍️",
    color: "#F59E0B",
    lessons: ["Clothing Store", "Trying on Clothes", "Prices & Payment", "Grocery Shopping", "Electronics", "Bargaining", "Gifts", "Refunds", "Sizes & Colors", "Online Shopping"]
  },
  5: {
    unitTitle: "Unit 5: Health, Body & Wellness",
    icon: "🏥",
    color: "#10B981",
    lessons: ["At the Doctor", "Pharmacy", "Symptoms", "Exercise & Fitness", "Healthy Diet", "Mental Health", "Emergency", "Dentist", "First Aid", "Sleeping Habits"]
  },
  6: {
    unitTitle: "Unit 6: Work, Office & Productivity",
    icon: "💼",
    color: "#8B5CF6",
    lessons: ["Job Interview", "Office Tasks", "Meetings", "Colleagues", "Emailing", "Deadlines", "Business Travel", "Promotions", "Remote Work", "Coffee Breaks"]
  },
  7: {
    unitTitle: "Unit 7: Weather, Nature & Environment",
    icon: "🌤️",
    color: "#06B6D4",
    lessons: ["Weather Forecast", "Seasons", "Nature Parks", "Animals", "Gardening", "Environmental Protection", "Natural Disasters", "Camping", "Beach", "Mountains"]
  },
  8: {
    unitTitle: "Unit 8: Hobbies, Sports & Entertainment",
    icon: "⚽",
    color: "#EC4899",
    lessons: ["Playing Football", "Reading Books", "Photography", "Music & Instruments", "Movies & TV", "Gaming", "Painting", "Hiking", "Swimming", "Dancing"]
  },
  9: {
    unitTitle: "Unit 9: Technology & Digital Life",
    icon: "💻",
    color: "#64748B",
    lessons: ["Smartphone Apps", "Social Media", "Computers", "Internet Connection", "Streaming", "Online Security", "Smart Home", "Customer Support", "Gadgets", "News"]
  },
  10: {
    unitTitle: "Unit 10: Social Life & Emotions",
    icon: "❤️",
    color: "#F43F5E",
    lessons: ["Expressing Joy", "Friendship", "Disagreements", "Making Plans", "Giving Advice", "Gratitude", "Apologies", "Future Goals", "Childhood Memories", "Celebrations"]
  }
};

async function generateUnit(unitNum) {
  const meta = unitTopics[unitNum];
  console.log(`Generating Unit ${unitNum}: ${meta.unitTitle}...`);
  const prompt = `You are a curriculum designer for a CEFR A2 English learning app for Chinese students.
Generate realistic, topic-specific A2 English translation lessons for:
Unit ${unitNum}: "${meta.unitTitle}"
The 10 lessons in this unit are:
${meta.lessons.map((l, i) => `${i + 1}. ${l}`).join("\n")}

STRICT REQUIREMENTS FOR EACH LESSON:
- Generate exactly 10 sentences per lesson (total 100 sentences for this unit).
- CEFR LEVEL A2: High-frequency, authentic everyday communication suitable for elementary students (e.g., asking for information, describing routines, expressing preferences, basic past and future).
- TOPIC RELEVANCE: Every sentence MUST directly match its specific lesson title (e.g. for "Train Station", talk about ticket counters, platforms, departure times, catching trains, luggage).
- ALTERNATIVE ANSWERS: Provide "answer" plus at least 2 distinct, natural "acceptAlso" alternatives in English so students can see 3 total correct answers (e.g. "I usually take the train to work.", acceptAlso: ["Normally I go to work by train.", "I usually commute to work by train."]).
- VOCABULARY (srsWords): List 4-8 key A1/A2 words for spaced repetition.

Output a valid JSON object with a single property "lessons":
{
  "lessons": [
    {
      "lessonTitle": "Lesson 1: ...",
      "sentences": [
        {
          "sentence": "Chinese prompt",
          "answer": "English main answer",
          "acceptAlso": ["Alt 1", "Alt 2"],
          "srsWords": ["word1", "word2", "word3"]
        }
        ... 10 sentences
      ]
    }
    ... 10 lessons
  ]
}`;

  const res = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const text = res.text?.trim() || "";
  const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonStr);
  console.log(`Unit ${unitNum} returned ${parsed.lessons?.length} lessons`);
  return parsed;
}

generateUnit(2).then(data => {
  console.log("Lesson 1 sample sentence:", data.lessons[0].sentences[0]);
}).catch(console.error);
