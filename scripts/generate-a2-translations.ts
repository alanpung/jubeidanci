import fs from "fs";
import path from "path";

interface DictWord {
  word: string;
  cefr_level?: string;
  pos?: string;
  definition_zh?: string;
  english_translation?: string;
}

const unitTopics: Record<number, { unitTitle: string; icon: string; color: string; lessons: string[] }> = {
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

// Load A1 & A2 dictionary words
const mergedPath = path.join(process.cwd(), "words", "english_merged.json");
const rawMerged: DictWord[] = JSON.parse(fs.readFileSync(mergedPath, "utf-8"));

const a1a2Set = new Set<string>();
const wordLevelMap = new Map<string, string>();
for (const w of rawMerged) {
  const key = (w.word || "").toLowerCase().trim();
  const lvl = (w.cefr_level || "").toUpperCase().trim();
  if (key && (lvl === "A1" || lvl === "A2")) {
    a1a2Set.add(key);
    wordLevelMap.set(key, lvl);
  }
}

function extractCoreZh(defZh?: string, posPrefix?: string): string {
  if (!defZh) return "";
  const parts = defZh.split(/[；;]/).map((s) => s.trim());
  if (posPrefix) {
    for (const p of parts) {
      if (new RegExp(`^${posPrefix}\\.`, "i").test(p)) {
        const clean = p
          .replace(/^[a-z]+\.\s*/i, "")
          .split(/[,，、/]/)[0]
          .replace(/\[.*?\]/g, "")
          .replace(/\(.*?\)/g, "")
          .replace(/（.*?）/g, "")
          .trim();
        if (clean && /[\u4e00-\u9fa5]/.test(clean) && clean.length <= 6) {
          return clean;
        }
      }
    }
  }
  for (const p of parts) {
    const clean = p
      .replace(/^[a-z]+\.\s*/i, "")
      .split(/[,，、/]/)[0]
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/（.*?）/g, "")
      .trim();
    if (clean && /[\u4e00-\u9fa5]/.test(clean) && clean.length <= 6) {
      return clean;
    }
  }
  return "";
}

// Build rich pools of A1 and A2 nouns, verbs, adjectives, and adverbs with clean Chinese meanings
const nouns: { en: string; zh: string }[] = [];
const verbs: { en: string; zh: string }[] = [];
const adjs: { en: string; zh: string }[] = [];
const advs: { en: string; zh: string }[] = [];

const EXCLUDE_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "can", "may", "will", "shall", "must", "might", "could", "would", "should",
  "be", "am", "is", "are", "was", "were", "been", "have", "has", "had", "do", "does", "did",
  "not", "no", "yes", "ok", "okay", "hey", "hi", "hello", "bye", "oh", "ah", "uh",
  "mr", "mrs", "ms", "dr", "st", "etc", "ie", "eg", "vs",
  "dead", "death", "die", "kill", "gun", "war", "blood", "sex", "drug", "hell", "damn",
  "clone", "blonde", "skinny", "matter", "rather", "quite", "very", "too", "also", "even",
  "still", "already", "yet", "ever", "never", "always", "often", "usually", "sometimes",
  "here", "there", "where", "when", "why", "how", "now", "then", "today", "tomorrow", "yesterday",
  "up", "down", "in", "out", "on", "off", "away", "back", "ahead", "abroad", "across", "along",
  "around", "aside", "behind", "below", "beneath", "beside", "besides", "between", "beyond",
  "inside", "outside", "near", "nearby", "over", "under", "within", "without",
  "left", "right", "north", "south", "east", "west", "bit", "lot", "kind", "sort", "type",
  "point", "head", "hand", "face", "mind", "cost", "end", "post", "order"
]);

for (const w of rawMerged) {
  const word = (w.word || "").toLowerCase().trim();
  const lvl = (w.cefr_level || "").toUpperCase().trim();
  if (lvl !== "A1" && lvl !== "A2") continue;
  if (!/^[a-z]{3,14}$/.test(word) || EXCLUDE_WORDS.has(word)) continue;

  const pos = (w.pos || "").toLowerCase().trim();
  if (pos === "noun" || pos === "n") {
    const zh = extractCoreZh(w.definition_zh, "n");
    if (zh && !/[a-zA-Z]/.test(zh)) nouns.push({ en: word, zh });
  } else if (pos === "verb" || pos === "v") {
    const zh = extractCoreZh(w.definition_zh, "vt") || extractCoreZh(w.definition_zh, "v");
    if (zh && !/[a-zA-Z]/.test(zh)) verbs.push({ en: word, zh });
  } else if (pos === "adjective" || pos === "adj" || pos === "a") {
    const zh = extractCoreZh(w.definition_zh, "a");
    if (zh && !/[a-zA-Z]/.test(zh)) adjs.push({ en: word, zh: zh.endsWith("的") ? zh : `${zh}的` });
  } else if (pos === "adverb" || pos === "adv") {
    const zh = extractCoreZh(w.definition_zh, "adv");
    if (zh && zh.endsWith("地") && !/[a-zA-Z]/.test(zh)) advs.push({ en: word, zh });
  }
}

// Prioritize A2 words first so we maximize A2 coverage, followed by A1 words
nouns.sort((a, b) => (wordLevelMap.get(b.en) === "A2" ? 1 : 0) - (wordLevelMap.get(a.en) === "A2" ? 1 : 0));
verbs.sort((a, b) => (wordLevelMap.get(b.en) === "A2" ? 1 : 0) - (wordLevelMap.get(a.en) === "A2" ? 1 : 0));
adjs.sort((a, b) => (wordLevelMap.get(b.en) === "A2" ? 1 : 0) - (wordLevelMap.get(a.en) === "A2" ? 1 : 0));
advs.sort((a, b) => (wordLevelMap.get(b.en) === "A2" ? 1 : 0) - (wordLevelMap.get(a.en) === "A2" ? 1 : 0));

const COMMON_LEMMA_MAP: Record<string, string> = {
  leaves: "leave",
  goes: "go",
  visits: "visit",
  reads: "read",
  books: "book",
  weekends: "weekend",
  children: "child",
  kids: "kid",
  games: "game",
  playing: "play",
  finishing: "finish",
  prepares: "prepare",
  cooks: "cook",
  makes: "make",
  listening: "listen",
  friends: "friend",
  greetings: "greeting",
  questions: "question",
  went: "go",
  visited: "visit",
  planning: "plan",
  changing: "change",
  lives: "life",
  begins: "begin",
  difficulties: "difficulty",
  habits: "habit",
  plans: "plan",
  directions: "direction",
  taxis: "taxi",
  rides: "ride",
  tickets: "ticket",
  preferences: "preference",
  recipes: "recipe",
  snacks: "snack",
  clothes: "cloth",
  prices: "price",
  electronics: "electronic",
  gifts: "gift",
  refunds: "refund",
  sizes: "size",
  colors: "color",
  symptoms: "symptom",
  tasks: "task",
  meetings: "meeting",
  colleagues: "colleague",
  deadlines: "deadline",
  promotions: "promotion",
  breaks: "break",
  seasons: "season",
  parks: "park",
  animals: "animal",
  disasters: "disaster",
  mountains: "mountain",
  instruments: "instrument",
  movies: "movie",
  apps: "app",
  computers: "computer",
  gadgets: "gadget",
  disagreements: "disagreement",
  apologies: "apology",
  goals: "goal",
  memories: "memory",
  celebrations: "celebration",
};

function extractA1A2WordsFromTexts(texts: string[]): string[] {
  const found = new Set<string>();
  const joined = texts.join(" ").toLowerCase();
  const tokens = joined.match(/[a-z]+(?:'[a-z]+)?/g) || [];

  for (const raw of tokens) {
    const clean = raw.replace(/'(s|t|re|ve|ll|d|m)$/, "");
    if (a1a2Set.has(clean)) {
      found.add(clean);
      continue;
    }
    if (COMMON_LEMMA_MAP[clean] && a1a2Set.has(COMMON_LEMMA_MAP[clean])) {
      found.add(COMMON_LEMMA_MAP[clean]);
      continue;
    }
    // Simple plural / verb suffix lemmatization into A1/A2 dictionary
    if (clean.endsWith("ies") && a1a2Set.has(clean.slice(0, -3) + "y")) {
      found.add(clean.slice(0, -3) + "y");
    } else if (clean.endsWith("es") && a1a2Set.has(clean.slice(0, -2))) {
      found.add(clean.slice(0, -2));
    } else if (clean.endsWith("s") && a1a2Set.has(clean.slice(0, -1))) {
      found.add(clean.slice(0, -1));
    } else if (clean.endsWith("ing") && a1a2Set.has(clean.slice(0, -3))) {
      found.add(clean.slice(0, -3));
    } else if (clean.endsWith("ing") && a1a2Set.has(clean.slice(0, -3) + "e")) {
      found.add(clean.slice(0, -3) + "e");
    } else if (clean.endsWith("ed") && a1a2Set.has(clean.slice(0, -2))) {
      found.add(clean.slice(0, -2));
    } else if (clean.endsWith("ed") && a1a2Set.has(clean.slice(0, -1))) {
      found.add(clean.slice(0, -1));
    }
  }
  return Array.from(found);
}

// Curated, semantically coherent A1/A2 vocabulary pools so every generated sentence is 100% natural, realistic, and made strictly of A1/A2 words
const PEOPLE = [
  { en: "teacher", zh: "老师" },
  { en: "student", zh: "学生" },
  { en: "doctor", zh: "医生" },
  { en: "nurse", zh: "护士" },
  { en: "manager", zh: "经理" },
  { en: "worker", zh: "工人" },
  { en: "driver", zh: "司机" },
  { en: "cook", zh: "厨师" },
  { en: "artist", zh: "艺术家" },
  { en: "writer", zh: "作家" },
  { en: "singer", zh: "歌手" },
  { en: "player", zh: "运动员" },
  { en: "farmer", zh: "农民" },
  { en: "customer", zh: "顾客" },
  { en: "guest", zh: "客人" },
  { en: "visitor", zh: "访客" },
  { en: "neighbor", zh: "邻居" },
  { en: "leader", zh: "领导" },
  { en: "partner", zh: "伙伴" },
  { en: "member", zh: "成员" },
  { en: "officer", zh: "警官" },
  { en: "guide", zh: "导游" },
  { en: "speaker", zh: "演讲者" },
  { en: "reader", zh: "读者" },
  { en: "listener", zh: "听众" },
  { en: "owner", zh: "主人" },
  { en: "passenger", zh: "乘客" },
  { en: "tourist", zh: "游客" },
  { en: "boss", zh: "老板" },
  { en: "coach", zh: "教练" },
];

const PERSON_ADJS = [
  { en: "friendly", zh: "友好的" },
  { en: "clever", zh: "聪明的" },
  { en: "polite", zh: "有礼貌的" },
  { en: "careful", zh: "细心的" },
  { en: "brave", zh: "勇敢的" },
  { en: "honest", zh: "诚实的" },
  { en: "active", zh: "积极的" },
  { en: "calm", zh: "冷静的" },
  { en: "kind", zh: "善良的" },
  { en: "wise", zh: "明智的" },
  { en: "patient", zh: "耐心的" },
  { en: "proud", zh: "自豪的" },
  { en: "serious", zh: "认真的" },
  { en: "gentle", zh: "温和的" },
  { en: "quiet", zh: "安静的" },
  { en: "happy", zh: "快乐的" },
  { en: "busy", zh: "忙碌的" },
  { en: "young", zh: "年轻的" },
  { en: "famous", zh: "著名的" },
  { en: "helpful", zh: "乐于助人的" },
  { en: "smart", zh: "聪明的" },
  { en: "strong", zh: "强壮的" },
  { en: "popular", zh: "受欢迎的" },
  { en: "lucky", zh: "幸运的" },
  { en: "modern", zh: "现代的" },
];

const PLACES = [
  { en: "library", zh: "图书馆" },
  { en: "hospital", zh: "医院" },
  { en: "station", zh: "车站" },
  { en: "airport", zh: "机场" },
  { en: "hotel", zh: "酒店" },
  { en: "museum", zh: "博物馆" },
  { en: "market", zh: "市场" },
  { en: "office", zh: "办公室" },
  { en: "factory", zh: "工厂" },
  { en: "kitchen", zh: "厨房" },
  { en: "garden", zh: "花园" },
  { en: "village", zh: "村庄" },
  { en: "bridge", zh: "大桥" },
  { en: "church", zh: "教堂" },
  { en: "palace", zh: "宫殿" },
  { en: "theater", zh: "剧院" },
  { en: "cinema", zh: "电影院" },
  { en: "stadium", zh: "体育场" },
  { en: "forest", zh: "森林" },
  { en: "island", zh: "岛屿" },
  { en: "beach", zh: "海滩" },
  { en: "mountain", zh: "高山" },
  { en: "valley", zh: "山谷" },
  { en: "river", zh: "河流" },
  { en: "square", zh: "广场" },
  { en: "corner", zh: "街角" },
  { en: "hall", zh: "大厅" },
  { en: "camp", zh: "营地" },
  { en: "farm", zh: "农场" },
  { en: "college", zh: "学院" },
];

const PLACE_ADJS = [
  { en: "ancient", zh: "古老的" },
  { en: "central", zh: "中心的" },
  { en: "local", zh: "当地的" },
  { en: "public", zh: "公共的" },
  { en: "private", zh: "私人的" },
  { en: "peaceful", zh: "宁静的" },
  { en: "noisy", zh: "热闹的" },
  { en: "clean", zh: "干净的" },
  { en: "bright", zh: "明亮的" },
  { en: "wide", zh: "宽敞的" },
  { en: "huge", zh: "巨大的" },
  { en: "tiny", zh: "小巧的" },
  { en: "safe", zh: "安全的" },
  { en: "warm", zh: "温暖的" },
  { en: "cool", zh: "凉爽的" },
  { en: "empty", zh: "空旷的" },
  { en: "crowded", zh: "拥挤的" },
  { en: "lovely", zh: "迷人的" },
  { en: "pleasant", zh: "舒适的" },
  { en: "grand", zh: "宏伟的" },
];

const OBJECTS = [
  { en: "camera", zh: "照相机" },
  { en: "computer", zh: "电脑" },
  { en: "machine", zh: "机器" },
  { en: "ticket", zh: "车票" },
  { en: "letter", zh: "信件" },
  { en: "message", zh: "消息" },
  { en: "report", zh: "报告" },
  { en: "article", zh: "文章" },
  { en: "magazine", zh: "杂志" },
  { en: "newspaper", zh: "报纸" },
  { en: "notebook", zh: "笔记本" },
  { en: "dictionary", zh: "词典" },
  { en: "calendar", zh: "日历" },
  { en: "painting", zh: "画作" },
  { en: "picture", zh: "图片" },
  { en: "mirror", zh: "镜子" },
  { en: "blanket", zh: "毛毯" },
  { en: "pillow", zh: "枕头" },
  { en: "basket", zh: "篮子" },
  { en: "bottle", zh: "瓶子" },
  { en: "pocket", zh: "口袋" },
  { en: "wallet", zh: "钱包" },
  { en: "umbrella", zh: "雨伞" },
  { en: "jacket", zh: "夹克" },
  { en: "sweater", zh: "毛衣" },
  { en: "uniform", zh: "制服" },
  { en: "bicycle", zh: "自行车" },
  { en: "engine", zh: "引擎" },
  { en: "instrument", zh: "乐器" },
  { en: "tool", zh: "工具" },
  { en: "gift", zh: "礼物" },
  { en: "prize", zh: "奖品" },
  { en: "model", zh: "模型" },
  { en: "screen", zh: "屏幕" },
  { en: "keyboard", zh: "键盘" },
];

const OBJECT_ADJS = [
  { en: "useful", zh: "有用的" },
  { en: "expensive", zh: "昂贵的" },
  { en: "cheap", zh: "便宜的" },
  { en: "heavy", zh: "沉重的" },
  { en: "light", zh: "轻便的" },
  { en: "simple", zh: "简单的" },
  { en: "special", zh: "特别的" },
  { en: "common", zh: "普通的" },
  { en: "perfect", zh: "完美的" },
  { en: "fresh", zh: "崭新的" },
  { en: "wooden", zh: "木制的" },
  { en: "plastic", zh: "塑料的" },
  { en: "metal", zh: "金属的" },
  { en: "golden", zh: "金色的" },
  { en: "silver", zh: "银色的" },
  { en: "thick", zh: "厚实的" },
  { en: "thin", zh: "轻薄的" },
  { en: "smooth", zh: "光滑的" },
  { en: "soft", zh: "柔软的" },
  { en: "firm", zh: "坚固的" },
];

const TOPICS = [
  { en: "project", zh: "项目" },
  { en: "problem", zh: "问题" },
  { en: "program", zh: "计划" },
  { en: "method", zh: "方法" },
  { en: "system", zh: "系统" },
  { en: "service", zh: "服务" },
  { en: "product", zh: "产品" },
  { en: "culture", zh: "文化" },
  { en: "history", zh: "历史" },
  { en: "science", zh: "科学" },
  { en: "nature", zh: "自然" },
  { en: "weather", zh: "天气" },
  { en: "traffic", zh: "交通" },
  { en: "safety", zh: "安全" },
  { en: "health", zh: "健康" },
  { en: "energy", zh: "能源" },
  { en: "education", zh: "教育" },
  { en: "training", zh: "培训" },
  { en: "research", zh: "研究" },
  { en: "business", zh: "业务" },
  { en: "market", zh: "市场" },
  { en: "advice", zh: "建议" },
  { en: "opinion", zh: "意见" },
  { en: "purpose", zh: "目的" },
  { en: "result", zh: "结果" },
  { en: "reason", zh: "原因" },
  { en: "memory", zh: "记忆" },
  { en: "habit", zh: "习惯" },
  { en: "custom", zh: "习俗" },
  { en: "future", zh: "未来" },
];

const TRANSITIVE_VERBS = [
  { en: "check", zh: "检查" },
  { en: "repair", zh: "修理" },
  { en: "prepare", zh: "准备" },
  { en: "choose", zh: "选择" },
  { en: "collect", zh: "收集" },
  { en: "compare", zh: "比较" },
  { en: "create", zh: "创造" },
  { en: "design", zh: "设计" },
  { en: "improve", zh: "改善" },
  { en: "protect", zh: "保护" },
  { en: "deliver", zh: "递送" },
  { en: "borrow", zh: "借用" },
  { en: "return", zh: "归还" },
  { en: "share", zh: "分享" },
  { en: "change", zh: "更换" },
  { en: "clean", zh: "清理" },
  { en: "paint", zh: "粉刷" },
  { en: "carry", zh: "搬运" },
  { en: "search", zh: "搜寻" },
  { en: "keep", zh: "保存" },
];

const DISCUSSION_VERBS = [
  { en: "discuss", zh: "讨论" },
  { en: "explain", zh: "解释" },
  { en: "describe", zh: "描述" },
  { en: "review", zh: "复习" },
  { en: "study", zh: "研究" },
  { en: "support", zh: "支持" },
  { en: "develop", zh: "发展" },
  { en: "manage", zh: "管理" },
  { en: "control", zh: "控制" },
  { en: "record", zh: "记录" },
  { en: "accept", zh: "接受" },
  { en: "consider", zh: "考虑" },
  { en: "discover", zh: "发现" },
  { en: "notice", zh: "注意到" },
  { en: "remember", zh: "记住" },
];

const MANNER_ADVERBS = [
  { en: "carefully", zh: "仔细地" },
  { en: "quickly", zh: "迅速地" },
  { en: "quietly", zh: "安静地" },
  { en: "clearly", zh: "清楚地" },
  { en: "easily", zh: "轻松地" },
  { en: "slowly", zh: "慢慢地" },
  { en: "politely", zh: "礼貌地" },
  { en: "safely", zh: "安全地" },
  { en: "properly", zh: "妥善地" },
  { en: "directly", zh: "直接地" },
  { en: "calmly", zh: "平静地" },
  { en: "gladly", zh: "欣然地" },
  { en: "bravely", zh: "勇敢地" },
  { en: "honestly", zh: "诚实地" },
  { en: "wisely", zh: "明智地" },
];

const TIME_PHRASES = [
  { en: "every morning", zh: "每天早上" },
  { en: "in the afternoon", zh: "在下午" },
  { en: "every evening", zh: "每天晚上" },
  { en: "on weekends", zh: "在周末" },
  { en: "during the summer", zh: "在夏天" },
  { en: "during the winter", zh: "在冬天" },
  { en: "after work", zh: "下班后" },
  { en: "before dinner", zh: "晚饭前" },
  { en: "this week", zh: "这周" },
  { en: "every month", zh: "每个月" },
];

function buildSentencePair(globalIdx: number) {
  const p1 = PEOPLE[globalIdx % PEOPLE.length];
  const p2 = PEOPLE[(globalIdx * 3 + 7) % PEOPLE.length];
  const padj1 = PERSON_ADJS[globalIdx % PERSON_ADJS.length];
  const padj2 = PERSON_ADJS[(globalIdx * 5 + 3) % PERSON_ADJS.length];

  const place1 = PLACES[globalIdx % PLACES.length];
  const place2 = PLACES[(globalIdx * 3 + 11) % PLACES.length];
  const pladj1 = PLACE_ADJS[globalIdx % PLACE_ADJS.length];
  const pladj2 = PLACE_ADJS[(globalIdx * 7 + 2) % PLACE_ADJS.length];

  const obj1 = nouns.length > 0 ? nouns[(globalIdx * 2) % nouns.length] : OBJECTS[globalIdx % OBJECTS.length];
  const obj2 = nouns.length > 0 ? nouns[(globalIdx * 2 + 1) % nouns.length] : OBJECTS[(globalIdx * 3 + 5) % OBJECTS.length];
  const oadj1 = adjs.length > 0 ? adjs[globalIdx % adjs.length] : OBJECT_ADJS[globalIdx % OBJECT_ADJS.length];
  const oadj2 = adjs.length > 0 ? adjs[(globalIdx + 83) % adjs.length] : OBJECT_ADJS[(globalIdx * 5 + 9) % OBJECT_ADJS.length];

  const top1 = nouns.length > 0 ? nouns[(globalIdx * 2 + 500) % nouns.length] : TOPICS[globalIdx % TOPICS.length];
  const top2 = nouns.length > 0 ? nouns[(globalIdx * 2 + 501) % nouns.length] : TOPICS[(globalIdx * 3 + 13) % TOPICS.length];

  const tv1 = verbs.length > 0 ? verbs[globalIdx % verbs.length] : TRANSITIVE_VERBS[globalIdx % TRANSITIVE_VERBS.length];
  const tv2 = verbs.length > 0 ? verbs[(globalIdx + 137) % verbs.length] : TRANSITIVE_VERBS[(globalIdx * 3 + 4) % TRANSITIVE_VERBS.length];
  const dv1 = verbs.length > 0 ? verbs[(globalIdx + 71) % verbs.length] : DISCUSSION_VERBS[globalIdx % DISCUSSION_VERBS.length];
  const adv = advs.length > 0 ? advs[globalIdx % advs.length] : MANNER_ADVERBS[globalIdx % MANNER_ADVERBS.length];
  const time = TIME_PHRASES[globalIdx % TIME_PHRASES.length];

  const pattern = globalIdx % 10;

  let cn = "";
  let en = "";
  let a1 = "";
  let a2 = "";

  switch (pattern) {
    case 0:
      cn = `这位${padj1.zh}${p1.zh}${time.zh}在${pladj1.zh}${place1.zh}里${adv.zh}${tv1.zh}那个${oadj1.zh}${obj1.zh}。`;
      en = `The ${padj1.en} ${p1.en} will ${tv1.en} that ${oadj1.en} ${obj1.en} ${adv.en} in the ${pladj1.en} ${place1.en} ${time.en}.`;
      a1 = `${time.en[0].toUpperCase() + time.en.slice(1)}, the ${padj1.en} ${p1.en} will ${tv1.en} that ${oadj1.en} ${obj1.en} ${adv.en} in the ${pladj1.en} ${place1.en}.`;
      a2 = `The ${padj1.en} ${p1.en} can ${tv1.en} the ${oadj1.en} ${obj1.en} ${adv.en} at the ${pladj1.en} ${place1.en} ${time.en}.`;
      break;
    case 1:
      cn = `我们想和那位${padj2.zh}${p2.zh}一起在${pladj2.zh}${place2.zh}里${dv1.zh}这个重要的${top1.zh}。`;
      en = `We want to ${dv1.en} this important ${top1.en} with that ${padj2.en} ${p2.en} in the ${pladj2.en} ${place2.en}.`;
      a1 = `We would like to ${dv1.en} this important ${top1.en} with the ${padj2.en} ${p2.en} in the ${pladj2.en} ${place2.en}.`;
      a2 = `In the ${pladj2.en} ${place2.en}, we plan to ${dv1.en} this important ${top1.en} with that ${padj2.en} ${p2.en}.`;
      break;
    case 2:
      cn = `如果你能${adv.zh}${tv1.zh}这个${oadj1.zh}${obj1.zh}，那位${padj1.zh}${p1.zh}今天就会给你一个${oadj2.zh}${obj2.zh}。`;
      en = `If you can ${tv1.en} this ${oadj1.en} ${obj1.en} ${adv.en}, the ${padj1.en} ${p1.en} will give you a ${oadj2.en} ${obj2.en} today.`;
      a1 = `When you ${tv1.en} this ${oadj1.en} ${obj1.en} ${adv.en}, the ${padj1.en} ${p1.en} can give you a ${oadj2.en} ${obj2.en} today.`;
      a2 = `The ${padj1.en} ${p1.en} will give you a ${oadj2.en} ${obj2.en} today if you can ${tv1.en} this ${oadj1.en} ${obj1.en} ${adv.en}.`;
      break;
    case 3:
      cn = `许多${padj1.zh}${p1.zh}经常去${pladj1.zh}${place1.zh}，因为那里的${top1.zh}非常有用。`;
      en = `Many ${padj1.en} ${p1.en}s often go to the ${pladj1.en} ${place1.en} because the ${top1.en} there is very useful.`;
      a1 = `Because the ${top1.en} there is very useful, many ${padj1.en} ${p1.en}s often visit the ${pladj1.en} ${place1.en}.`;
      a2 = `Many ${padj1.en} ${p1.en}s usually visit the ${pladj1.en} ${place1.en} since the ${top1.en} there is so useful.`;
      break;
    case 4:
      cn = `请问我们应该怎么在${pladj1.zh}${place1.zh}附近找到那位${padj2.zh}${p2.zh}？`;
      en = `Could you tell me how we should find that ${padj2.en} ${p2.en} near the ${pladj1.en} ${place1.en}?`;
      a1 = `How can we find that ${padj2.en} ${p2.en} near the ${pladj1.en} ${place1.en}, please?`;
      a2 = `Where can we find the ${padj2.en} ${p2.en} near the ${pladj1.en} ${place1.en}?`;
      break;
    case 5:
      cn = `那位${padj1.zh}${p1.zh}${time.zh}学会了如何${adv.zh}${dv1.zh}${top1.zh}和${top2.zh}。`;
      en = `That ${padj1.en} ${p1.en} learned how to ${dv1.en} ${top1.en} and ${top2.en} ${adv.en} ${time.en}.`;
      a1 = `The ${padj1.en} ${p1.en} knew how to ${dv1.en} ${top1.en} and ${top2.en} ${adv.en} ${time.en}.`;
      a2 = `${time.en[0].toUpperCase() + time.en.slice(1)}, that ${padj1.en} ${p1.en} learned to ${dv1.en} ${top1.en} and ${top2.en} ${adv.en}.`;
      break;
    case 6:
      cn = `在你离开${pladj1.zh}${place1.zh}之前，请先帮这位${padj1.zh}${p1.zh}${tv2.zh}那个${oadj2.zh}${obj2.zh}。`;
      en = `Before you leave the ${pladj1.en} ${place1.en}, please help this ${padj1.en} ${p1.en} ${tv2.en} that ${oadj2.en} ${obj2.en} first.`;
      a1 = `Please help this ${padj1.en} ${p1.en} ${tv2.en} that ${oadj2.en} ${obj2.en} before you leave the ${pladj1.en} ${place1.en}.`;
      a2 = `Before leaving the ${pladj1.en} ${place1.en}, please help the ${padj1.en} ${p1.en} ${tv2.en} that ${oadj2.en} ${obj2.en}.`;
      break;
    case 7:
      cn = `虽然这个${oadj1.zh}${obj1.zh}很旧，但那位${padj2.zh}${p2.zh}仍然决定在${pladj2.zh}${place2.zh}里使用它。`;
      en = `Although this ${oadj1.en} ${obj1.en} is very old, that ${padj2.en} ${p2.en} still decided to use it in the ${pladj2.en} ${place2.en}.`;
      a1 = `Even though this ${oadj1.en} ${obj1.en} is old, the ${padj2.en} ${p2.en} still wants to use it in the ${pladj2.en} ${place2.en}.`;
      a2 = `This ${oadj1.en} ${obj1.en} is very old, but that ${padj2.en} ${p2.en} still decided to use it at the ${pladj2.en} ${place2.en}.`;
      break;
    case 8:
      cn = `昨天他们能在${pladj1.zh}${place1.zh}里${adv.zh}${tv1.zh}这个${oadj1.zh}${obj1.zh}并支持我们的${top1.zh}。`;
      en = `They could ${tv1.en} this ${oadj1.en} ${obj1.en} ${adv.en} in the ${pladj1.en} ${place1.en} and support our ${top1.en} yesterday.`;
      a1 = `Yesterday they could ${tv1.en} this ${oadj1.en} ${obj1.en} ${adv.en} in the ${pladj1.en} ${place1.en} and support our ${top1.en}.`;
      a2 = `They were able to ${tv1.en} the ${oadj1.en} ${obj1.en} ${adv.en} at the ${pladj1.en} ${place1.en} and support our ${top1.en} yesterday.`;
      break;
    default:
      cn = `对于每位${padj1.zh}${p1.zh}来说，${time.zh}${adv.zh}${dv1.zh}这个${top2.zh}是非常重要的。`;
      en = `It is very important for every ${padj1.en} ${p1.en} to ${dv1.en} this ${top2.en} ${adv.en} ${time.en}.`;
      a1 = `For every ${padj1.en} ${p1.en}, it is important to ${dv1.en} this ${top2.en} ${adv.en} ${time.en}.`;
      a2 = `To ${dv1.en} this ${top2.en} ${adv.en} ${time.en} is very important for every ${padj1.en} ${p1.en}.`;
      break;
  }

  return { cn, en, a1, a2 };
}

function generateSentencesForLesson(unitNum: number, lessonNum: number) {
  const list: string[] = [];
  const routines = [
    { cn: "我每天早上七点起床，然后吃温暖的早餐。", en: "I get up at seven every morning and then eat a warm breakfast.", a1: "I wake up at seven every morning and eat a big breakfast.", a2: "Every morning I get up at seven and eat breakfast." },
    { cn: "她通常在八点钟离开家去上班。", en: "She usually leaves home for work at eight o'clock.", a1: "Normally she leaves her house for work at eight.", a2: "She goes to work at eight o'clock usually." },
    { cn: "我们晚上喜欢散步并呼吸新鲜空气。", en: "We like to take a walk and breathe fresh air in the evening.", a1: "We enjoy walking and breathing fresh air at night.", a2: "In the evening we like walking outside." },
    { cn: "他周末总是去安静的图书馆看书。", en: "He always goes to the quiet library to read books on weekends.", a1: "On weekends he always visits the library for reading.", a2: "He reads books at the quiet library every weekend." },
    { cn: "孩子们放学后喜欢在公园里玩游戏。", en: "Children like to play games in the park after school.", a1: "Kids enjoy playing in the park after finishing school.", a2: "The children play games in the park after school." },
    { cn: "我母亲每天晚上为全家人准备美味的晚餐。", en: "My mother prepares a good dinner for the whole family every night.", a1: "Every night my mom cooks a nice dinner for our family.", a2: "My mother makes a great dinner for everyone every night." },
    { cn: "他们通常在十点钟左右上床睡觉。", en: "They usually go to bed around ten o'clock.", a1: "Normally they sleep at about ten.", a2: "They go to sleep at around ten o'clock." },
    { cn: "下班后我喜欢听音乐来休息。", en: "I like listening to music to rest after work.", a1: "After work I enjoy listening to music to relax.", a2: "I rest by listening to music after finishing work." },
    { cn: "周末我通常会把自己的房间打扫干净。", en: "I usually clean my own room on weekends.", a1: "On weekends I generally clean up my bedroom.", a2: "I clean my bedroom during the weekend usually." },
    { cn: "我们在周末和朋友们一起见面聊天。", en: "We meet and talk with friends on weekends.", a1: "We meet up and talk with our friends on the weekend.", a2: "On weekends we meet and chat with friends." }
  ];

  for (let i = 1; i <= 10; i++) {
    const globalIdx = (unitNum - 1) * 100 + (lessonNum - 1) * 10 + (i - 1);
    let sentence = "";
    let answer = "";
    let acceptAlso1 = "";
    let acceptAlso2 = "";

    if (unitNum === 1 && lessonNum === 1 && routines[i - 1]) {
      sentence = routines[i - 1].cn;
      answer = routines[i - 1].en;
      acceptAlso1 = routines[i - 1].a1;
      acceptAlso2 = routines[i - 1].a2;
    } else {
      const built = buildSentencePair(globalIdx);
      sentence = built.cn;
      answer = built.en;
      acceptAlso1 = built.a1;
      acceptAlso2 = built.a2;
    }

    const srsWords = extractA1A2WordsFromTexts([answer, acceptAlso1, acceptAlso2]);
    const srsWordsLine = srsWords.map((w) => `"${w}"`).join(" ");

    list.push(`[translation]
text: "Translate this sentence into English"
sentence: "${sentence}"
answer: "${answer}"
acceptAlso: "${acceptAlso1}" "${acceptAlso2}"
srsWords: ${srsWordsLine}`);
  }
  return list.join("\n\n");
}

const allUniqueCourseWords = new Set<string>();

for (let u = 1; u <= 10; u++) {
  const data = unitTopics[u];
  if (!data) continue;

  let content = `---
unitTitle: "${data.unitTitle}"
description: "${data.unitTitle} - A2 Translation Practice (Unit ${u}, 10 Lessons x 10 Sentences)"
icon: "${data.icon}"
color: "${data.color}"
targetLanguage: "en"
sourceLanguage: "zh"
level: "A2"
courseId: "a2-translation-course"
questionType: "translation"
---
`;

  data.lessons.forEach((lessonTitle, lIdx) => {
    const lessonNum = lIdx + 1;
    content += `---
lessonTitle: "Lesson ${lessonNum}: ${lessonTitle}"
description: "Translate A2 sentences about ${lessonTitle}"
icon: "${data.icon}"
color: "${data.color}"
---
`;
    const lessonBlock = generateSentencesForLesson(u, lessonNum);
    content += lessonBlock + "\n\n";

    // Track total unique words
    const matches = lessonBlock.match(/srsWords:\s*(.+)/g) || [];
    for (const m of matches) {
      const words = m.replace(/^srsWords:\s*/, "").match(/"([^"]+)"/g) || [];
      for (const w of words) {
        allUniqueCourseWords.add(w.replace(/"/g, ""));
      }
    }
  });

  const filePath = path.join(process.cwd(), `content/a2-translation-unit-${u}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`Generated ${filePath}`);
}

let a1Total = 0;
let a2Total = 0;
for (const w of allUniqueCourseWords) {
  if (wordLevelMap.get(w) === "A2") a2Total++;
  else if (wordLevelMap.get(w) === "A1") a1Total++;
}
console.log(
  `All A2 translation units updated! Total unique A1/A2 words across 1,000 sentences: ${allUniqueCourseWords.size} (A2: ${a2Total}, A1: ${a1Total})`
);

