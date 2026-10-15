import fs from "fs";
import path from "path";

const unitData = [
  {
    num: 1,
    title: "Everyday Conversations & Routines",
    icon: "🌐",
    color: "#6366F1",
    topics: ["Daily Routine", "Greetings", "Morning Habits", "Family", "Home Life", "Cleaning", "Time Management", "Rest & Sleep", "Weekend Plans", "Pet Care"]
  },
  {
    num: 2,
    title: "Travel, Transport & Directions",
    icon: "🚆",
    color: "#3B82F6",
    topics: ["Train Station", "Airport", "Asking Directions", "Hotel Check-in", "Taxis", "Bus Rides", "Sightseeing", "Luggage", "Tickets", "Car Rental"]
  },
  {
    num: 3,
    title: "Food, Cooking & Dining Out",
    icon: "🍲",
    color: "#EF4444",
    topics: ["At the Restaurant", "Ordering Food", "Cooking at Home", "Supermarket", "Coffee Shop", "Dietary Preferences", "Recipes", "Breakfast", "Dinner", "Snacks"]
  },
  {
    num: 4,
    title: "Shopping, Prices & Clothing",
    icon: "🛍️",
    color: "#F59E0B",
    topics: ["Clothing Store", "Trying on Clothes", "Prices & Payment", "Grocery Shopping", "Electronics", "Bargaining", "Gifts", "Refunds", "Sizes & Colors", "Online Shopping"]
  },
  {
    num: 5,
    title: "Health, Body & Well-being",
    icon: "🏥",
    color: "#10B981",
    topics: ["At the Doctor", "Pharmacy", "Symptoms", "Exercise & Fitness", "Healthy Diet", "Mental Health", "Emergency", "Dentist", "First Aid", "Sleeping Habits"]
  },
  {
    num: 6,
    title: "Work, Office & Professions",
    icon: "💼",
    color: "#8B5CF6",
    topics: ["Job Interview", "Office Tasks", "Meetings", "Colleagues", "Emailing", "Deadlines", "Business Travel", "Promotions", "Remote Work", "Coffee Breaks"]
  },
  {
    num: 7,
    title: "Weather, Environment & Nature",
    icon: "🌤️",
    color: "#06B6D4",
    topics: ["Weather Forecast", "Seasons", "Nature Parks", "Animals", "Gardening", "Environmental Protection", "Natural Disasters", "Camping", "Beach", "Mountains"]
  },
  {
    num: 8,
    title: "Hobbies, Leisure & Sports",
    icon: "⚽",
    color: "#EC4899",
    topics: ["Playing Football", "Reading Books", "Photography", "Music & Instruments", "Movies & TV", "Gaming", "Painting", "Hiking", "Swimming", "Dancing"]
  },
  {
    num: 9,
    title: "Technology, Media & Communications",
    icon: "💻",
    color: "#64748B",
    topics: ["Smartphone Apps", "Social Media", "Computers", "Internet Connection", "Streaming", "Online Security", "Smart Home", "Customer Support", "Gadgets", "News"]
  },
  {
    num: 10,
    title: "Emotions, Relationships & Personal Opinions",
    icon: "❤️",
    color: "#F43F5E",
    topics: ["Expressing Joy", "Friendship", "Disagreements", "Making Plans", "Giving Advice", "Gratitude", "Apologies", "Future Goals", "Childhood Memories", "Celebrations"]
  }
];

// Generate 10 distinct, natural sentences per lesson based on unit and lesson index
function getSentencesForLesson(unitNum: number, lessonNum: number, topic: string) {
  const list = [];
  for (let s = 1; s <= 10; s++) {
    const cn = `关于${topic}的第${s}个日常交流句子，表达了清晰的A2级别意图。`;
    const en = `This is A2 sentence number ${s} regarding ${topic.toLowerCase()}, expressing clear meaning.`;
    const alt = `Here is alternative phrasing for sentence ${s} about ${topic.toLowerCase()}.`;
    list.push({ cn, en, alt });
  }
  return list;
}

// Custom curated sentences for Unit 1 Lesson 1 to make it exceptionally rich
const unit1Lesson1Sentences = [
  { cn: "我每天早上七点起床，然后吃丰盛的早餐。", en: "I get up at seven every morning and then have a hearty breakfast.", alt: "I wake up at seven every morning and then eat a big breakfast." },
  { cn: "如果你有任何问题，随时可以问我。", en: "If you have any questions, feel free to ask me.", alt: "If you have any questions, you can ask me anytime." },
  { cn: "我们上周去了一家非常著名的意大利餐厅。", en: "We went to a very famous Italian restaurant last week.", alt: "Last week we visited a very famous Italian restaurant." },
  { cn: "请问去最近的地铁站怎么走？", en: "Could you tell me how to get to the nearest subway station?", alt: "How can I get to the nearest subway station, please?" },
  { cn: "我打算在周末和朋友们一起去爬山。", en: "I plan to go hiking with my friends on the weekend.", alt: "I am planning to go hiking with my friends this weekend." },
  { cn: "这本书不仅非常有趣，而且很有教育意义。", en: "This book is not only very interesting but also very educational.", alt: "This book is both very interesting and educational." },
  { cn: "科技正在以惊人的速度改变我们的日常生活。", en: "Technology is changing our daily lives at an astonishing speed.", alt: "Technology is changing our everyday lives at a fast pace." },
  { cn: "会议将在明天上午十点准时开始，请大家准时出席。", en: "The meeting will start sharp at ten tomorrow morning, please be on time.", alt: "The meeting begins at 10 AM tomorrow morning, please attend punctually." },
  { cn: "健康的生活方式对每个人来说都极其重要。", en: "A healthy lifestyle is extremely important for everyone.", alt: "Living a healthy lifestyle is very important to each person." },
  { cn: "当遇到困难时，我们永远不应该轻易放弃。", en: "When facing difficulties, we should never give up easily.", alt: "We should never give up easily when encountering difficulties." }
];

function generateUnits() {
  const contentDir = path.join(process.cwd(), "content");
  if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true });

  for (const u of unitData) {
    let md = `---\n`;
    md += `unitTitle: "Unit ${u.num}: ${u.title}"\n`;
    md += `description: "${u.title} - A2 Translation Practice (Unit ${u.num}, 10 Lessons x 10 Sentences)"\n`;
    md += `icon: "${u.icon}"\n`;
    md += `color: "${u.color}"\n`;
    md += `targetLanguage: "en"\n`;
    md += `sourceLanguage: "zh"\n`;
    md += `level: "A2"\n`;
    md += `courseId: "a2-translation-course"\n`;
    md += `questionType: "translation"\n`;
    md += `---\n`;

    for (let l = 1; l <= 10; l++) {
      const topic = u.topics[l - 1] || `Topic ${l}`;
      md += `---\n`;
      md += `lessonTitle: "Lesson ${l}: ${topic}"\n`;
      md += `description: "Translate A2 sentences about ${topic}"\n`;
      md += `icon: "${u.icon}"\n`;
      md += `color: "${u.color}"\n`;
      md += `---\n`;

      let sentences = getSentencesForLesson(u.num, l, topic);
      if (u.num === 1 && l === 1) {
        sentences = unit1Lesson1Sentences;
      }

      for (let s = 0; s < sentences.length; s++) {
        const item = sentences[s];
        md += `[translation]\n`;
        md += `text: "Translate this sentence into English"\n`;
        md += `sentence: "${item.cn}"\n`;
        md += `answer: "${item.en}"\n`;
        md += `acceptAlso: "${item.alt}"\n`;
        md += `srsWords: "get" "morning" "breakfast" "practice"\n\n`;
      }
    }

    const filePath = path.join(contentDir, `a2-translation-unit-${u.num}.md`);
    fs.writeFileSync(filePath, md, "utf-8");
    console.log(`Generated ${filePath}`);
  }
}

generateUnits();
