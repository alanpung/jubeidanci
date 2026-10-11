const fs = require("fs");
const path = require("path");

const mergedPath = path.join(process.cwd(), "words", "english_merged.json");
const combinedPath = path.join(process.cwd(), "words", "combined_a1_c2.json");
const enCombinedPath = path.join(process.cwd(), "words", "en", "combined_a1_c2.json");
const pubCombinedPath = path.join(process.cwd(), "public", "combined_a1_c2.json");

const merged = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
const combined = JSON.parse(fs.readFileSync(combinedPath, "utf8"));

const isDummyZh = (s) => {
  if (!s || typeof s !== "string") return true;
  if (!/[\u4e00-\u9fa5]/.test(s)) return true;
  if (/（(noun|verb|adjective|adverb|preposition|conjunction|determiner|pronoun)）/i.test(s)) return true;
  return false;
};

// Comprehensive manual translations for abbreviations, loanwords, and compound/derived entries
const MANUAL_DICT = {
  "p.m": { zh: "abbr. 下午（post meridiem）", en: "in the afternoon or evening (post meridiem)", ipa: "ˌpiː ˈem" },
  "p.m.": { zh: "abbr. 下午（post meridiem）", en: "in the afternoon or evening (post meridiem)", ipa: "ˌpiː ˈem" },
  "a.m": { zh: "abbr. 上午，午前（ante meridiem）", en: "in the morning, before noon (ante meridiem)", ipa: "ˌeɪ ˈem" },
  "a.m.": { zh: "abbr. 上午，午前（ante meridiem）", en: "in the morning, before noon (ante meridiem)", ipa: "ˌeɪ ˈem" },
  "o'clock": { zh: "adv. …点钟", en: "used after a number from one to twelve to indicate the hour of the day", ipa: "əˈklɒk" },
  "ph.d": { zh: "n. 哲学博士学位；博士", en: "Doctor of Philosophy (a high-level doctoral degree)", ipa: "ˌpiː eɪtʃ ˈdiː" },
  "café": { zh: "n. 咖啡馆；小餐馆", en: "a small restaurant selling light meals and drinks", ipa: "ˈkæfeɪ" },
  "cafe": { zh: "n. 咖啡馆；小餐馆", en: "a small restaurant selling light meals and drinks", ipa: "ˈkæfeɪ" },
  "mp3": { zh: "n. MP3数字音频格式；MP3播放器", en: "a digital audio encoding format and player", ipa: "ˌem piː ˈθriː" },
  "mp3 player": { zh: "n. MP3音乐播放器", en: "a portable electronic device for playing MP3 digital audio files", ipa: "ˌem piː ˈθriː ˈpleɪər" },
  "fiancé": { zh: "n. 未婚夫", en: "a man to whom someone is engaged to be married", ipa: "fiˈɒnseɪ" },
  "fiancée": { zh: "n. 未婚妻", en: "a woman to whom someone is engaged to be married", ipa: "fiˈɒnseɪ" },
  "a.d": { zh: "abbr. 公元（Anno Domini）", en: "Anno Domini, used to indicate years after the birth of Christ", ipa: "ˌeɪ ˈdiː" },
  "eid": { zh: "n. 开斋节；古尔邦节（伊斯兰教传统节日）", en: "an important religious festival celebrated by Muslims worldwide", ipa: "iːd" },
  "vape": { zh: "v. 抽电子烟；n. 电子烟", en: "to inhale and exhale vapor produced by an electronic cigarette", ipa: "veɪp" },
  "cliché": { zh: "n. 陈词滥调；老套", en: "a phrase or opinion that is overused and betrays a lack of original thought", ipa: "ˈkliːʃeɪ" },
  "q3": { zh: "abbr. 第三季度（Third Quarter）", en: "the third quarter of a calendar or fiscal year", ipa: "ˌkjuː ˈθriː" },
  "d.j": { zh: "n. 唱片骑师；电台节目主持人（DJ）", en: "disc jockey; a person who introduces and plays recorded pop music", ipa: "ˌdiː ˈdʒeɪ" },
  "rewatch": { zh: "v. 重看，重温（影视剧）；n. 重看", en: "to watch a movie, television show, or video again", ipa: "ˌriːˈwɒtʃ" },
  "façade": { zh: "n. 建筑物的正面；（虚假的）表面，伪装", en: "the principal front of a building; a deceptive outward appearance", ipa: "fəˈsɑːd" },
  "werent": { zh: "v. were not 的常用缩写（不是，没有）", en: "contraction of were not", ipa: "wɜːnt" },
  "i.d": { zh: "n. 身份证；身份证明（Identification）", en: "official identification document or card", ipa: "ˌaɪ ˈdiː" },
  "brimm": { zh: "n. 边缘；帽舌；v. 满溢，充盈", en: "the upper edge or lip of a cup, bowl, or hat; to be full to the point of overflowing", ipa: "brɪm" },
  "château": { zh: "n. （法国的）城堡，庄园，酒庄", en: "a large French country house or castle, often giving its name to wine made in its neighborhood", ipa: "ˈʃætəʊ" },
  "g.i": { zh: "n. 美国大兵，美国军人；abbr. 胃肠道的", en: "a private soldier in the US army (Government Issue)", ipa: "ˌdʒiː ˈaɪ" },
  "résumé": { zh: "n. 个人简历，履历；摘要", en: "a brief account of a person's education, qualifications, and previous experience", ipa: "ˈrezjuːmeɪ" },
  "fanfiction": { zh: "n. 同人小说", en: "fiction written by a fan of, and featuring characters from, a particular TV series, movie, or book", ipa: "ˈfænˌfɪkʃən" },
  "crème": { zh: "n. 奶油；精华，精髓", en: "cream or a rich culinary preparation; the very best of a group", ipa: "krem" },
  "über": { zh: "adj. 超级的，极端的；adv. 非常，极其", en: "denoting an outstanding or supreme example of a particular kind of person or thing", ipa: "ˈuːbər" },
  "attaché": { zh: "n. （大使馆的）专员，随员", en: "a person on the staff of an ambassador with a specialized area of responsibility", ipa: "əˈtæʃeɪ" },
  "twerk": { zh: "v. 跳电臀舞；n. 电臀舞", en: "to dance to popular music in a sexually provocative manner involving thrusting hip movements", ipa: "twɜːk" },
  "protégé": { zh: "n. 门生，受提携者，徒弟", en: "a person who is guided and supported by an older and more experienced or influential person", ipa: "ˈprəʊtəʒeɪ" },
  "rosé": { zh: "n. 桃红葡萄酒；粉红酒", en: "a pink wine in which the skin of the grapes is removed after fermentation has begun", ipa: "ˈrəʊzeɪ" },
  "señor": { zh: "n. （西班牙语）先生", en: "a form of address for a Spanish-speaking man, corresponding to Mr. or sir", ipa: "seˈnjɔːr" },
  "señora": { zh: "n. （西班牙语）夫人，太太，女士", en: "a title or form of address used of or to a Spanish-speaking married woman, corresponding to Mrs. or madam", ipa: "seˈnjɔːrə" },
  "clickbait": { zh: "n. 标题党；诱饵式点击链接", en: "content on the internet whose main purpose is to attract attention and encourage visitors to click on a link", ipa: "ˈklɪkbeɪt" },
  "rock'n'roll": { zh: "n. 摇滚乐（Rock and Roll）", en: "a type of popular dance music originating in the 1950s, characterized by a heavy beat and simple melodies", ipa: "ˌrɒk ən ˈrəʊl" },
  "m.c": { zh: "n. 节目主持人，司仪；说唱歌手（Master of Ceremonies）", en: "Master of Ceremonies; a person who acts as host at a formal event or performs rap music", ipa: "ˌem ˈsiː" },
  "anarcho": { zh: "n./adj. 无政府主义者（的）", en: "relating to anarchism or anarchists", ipa: "əˈnɑːkəʊ" },
  "exposé": { zh: "n. 揭露，曝光（丑闻或秘闻的报道）", en: "a report in the media that reveals something discreditable", ipa: "ekˈspəʊzeɪ" },
  "undaunt": { zh: "v./adj. 无畏，不屈不挠，毫不气馁", en: "not intimidated or discouraged by difficulty, danger, or disappointment", ipa: "ʌnˈdɔːnt" },
  "goalkeep": { zh: "v. 守门，担任守门员", en: "to play as a goalkeeper in sports such as soccer or hockey", ipa: "ˈɡəʊlkiːp" },
  "goaltend": { zh: "v. 担任守门员；（篮球）干扰球违例", en: "to tend the goal in a game; to commit goaltending in basketball", ipa: "ˈɡəʊltend" },
  "décor": { zh: "n. 室内装潢，装饰风格", en: "the furnishing and decoration of a room", ipa: "ˈdeɪkɔːr" },
  "s'more": { zh: "n. 烤棉花糖巧克力夹心饼干（露营甜点）", en: "a sweet snack consisting of toasted marshmallow and chocolate sandwiched between graham crackers", ipa: "smɔːr" },
  "piñata": { zh: "n. 皮纳塔（装满糖果玩具的彩饰陶罐或纸偶）", en: "a decorated container filled with candy and toys, broken open with a stick during celebrations", ipa: "pɪnˈjɑːtə" },
  "communiqué": { zh: "n. 官方公报，联合公报", en: "an official announcement or statement, especially one made to the media", ipa: "kəˈmjuːnɪkeɪ" },
  "coziness/cosiness": { zh: "n. 舒适，惬意，温馨", en: "the quality of being warm, comfortable, and snug", ipa: "ˈkəʊzinəs" },
  "cybercafe/cybercafé": { zh: "n. 网吧，网络咖啡馆", en: "a cafe or shop providing computers with internet access for a fee", ipa: "ˈsaɪbəkæfeɪ" },
  "dehumanize/dehumanise": { zh: "vt. 使失掉人性；使非人化", en: "to deprive of positive human qualities", ipa: "ˌdiːˈhjuːmənaɪz" },
  "furor/furore": { zh: "n. 轰动；狂热；盛怒", en: "an outbreak of public anger or excitement", ipa: "ˈfjʊərɔːr" },
  "high-tech/hi-tech": { zh: "adj. 高科技的，高技术的；n. 高科技", en: "employing, requiring, or involved in high technology", ipa: "ˌhaɪ ˈtek" },
  "humanize/humanise": { zh: "vt. 使人性化；使通人情；教化", en: "to make something more humane or civilized", ipa: "ˈhjuːmənaɪz" },
  "italicize/italicise": { zh: "vt. 用斜体排印，把…设为斜体字", en: "to print or write text in italics", ipa: "ɪˈtælɪsaɪz" },
  "micrometer/micrometre": { zh: "n. 微米（百万分之一米）；千分尺，测微计", en: "one millionth of a meter; a gauge that measures small distances or thicknesses", ipa: "maɪˈkrɒmɪtər" },
  "netsurfer/net surfer": { zh: "n. 网民，网络冲浪者", en: "a person who browses or surfs the Internet", ipa: "ˈnetsɜːfər" },
  "overemphasize/overemphasise": { zh: "vt. 过分强调，过度重视", en: "to place excessive emphasis on something", ipa: "ˌəʊvərˈemfəsaɪz" },
  "skillfully/skilfully": { zh: "adv. 巧妙地，娴熟地，精湛地", en: "in a skillful, adept, and proficient manner", ipa: "ˈskɪlfəli" },
  "sports center/sports centre": { zh: "n. 体育中心，运动场馆", en: "a building or complex where the public can engage in various sports and fitness activities", ipa: "ˈspɔːts ˌsentər" },
  "well-organized/well-organised": { zh: "adj. 组织有序的，井井有条的", en: "arranged or planned effectively and systematically", ipa: "ˌwel ˈɔːɡənaɪzd" },
  "wornout/worn out/worn-out": { zh: "adj. 疲惫不堪的；磨破的，用旧的", en: "extremely tired or exhausted; damaged by long or hard use", ipa: "ˌwɔːn ˈaʊt" },
  "recognizably/recognisably": { zh: "adv. 可辨认地，明显地", en: "in a way that can be easily recognized or identified", ipa: "ˈrekəɡnaɪzəbli" },
  "somberly/sombrely": { zh: "adv. 忧郁地，阴沉地，严肃地", en: "in a solemn, serious, or melancholy manner", ipa: "ˈsɒmbəli" },
  "neutralization/neutralisation": { zh: "n. 中和；中立化；抵消", en: "the action of making something ineffective or chemically neutral", ipa: "ˌnjuːtrəlaɪˈzeɪʃən" },
  "digitalize/digitalise": { zh: "vt. 使数字化", en: "to convert data, signals, or processes into digital form", ipa: "ˈdɪdʒɪtəlaɪz" },
  "digitalization/digitalisation": { zh: "n. 数字化，数字化转型", en: "the conversion of text, pictures, or sound into a digital form that can be processed by a computer", ipa: "ˌdɪdʒɪtəlaɪˈzeɪʃən" },
  "evokingly": { zh: "adv. 唤起回忆地，引人联想地，富有感染力地", en: "in an evocative manner that brings strong images, memories, or feelings to mind", ipa: "ɪˈvəʊkɪŋli" },
  "carbonize/carbonise": { zh: "vt. 使碳化，使焦化", en: "to convert organic matter into carbon by heating or burning", ipa: "ˈkɑːbənaɪz" },
  "centralized/centralised": { zh: "adj. 集权的，集中管理的，集中式的", en: "controlled by a single authority or managed in one central place", ipa: "ˈsentrəlaɪzd" },
  "materialization/materialisation": { zh: "n. 实现，具体化，实体化", en: "the process of becoming actual fact or taking physical form", ipa: "məˌtɪəriəlaɪˈzeɪʃən" },
  "paralyzingly/paralysingly": { zh: "adv. 使人麻痹地，令人不知所措地，极度地", en: "in a way that causes paralysis or renders someone unable to think or act normally", ipa: "ˈpærəlaɪzɪŋli" },
  "porten": { zh: "vt. 预示，预兆（同 portend）；n. 征兆", en: "to be a sign or warning that something momentous or calamitous is likely to happen", ipa: "pɔːˈtend" },
  "economize/economise": { zh: "v. 节约，节省，精打细算", en: "to spend less; reduce one's expenses", ipa: "ɪˈkɒnəmaɪz" },
  "tantalizingly/tantalisingly": { zh: "adv. 诱人地，撩人地，令人心痒难耐地", en: "in a way that torments or teases by keeping something desirable just out of reach", ipa: "ˈtæntəlaɪzɪŋli" },
  "ardor/ardour": { zh: "n. 热情，热忱，激情", en: "great enthusiasm or passion", ipa: "ˈɑːdər" },
  "self-aggrandizement/self-aggrandisement": { zh: "n. 自我吹嘘，自我膨胀，谋求个人权势", en: "the action or process of promoting oneself as being powerful or important", ipa: "ˌself əˈɡrændɪzmənt" },
  "patronizing/patronising": { zh: "adj. 居高临下的，摆架子的，傲慢俯就的", en: "apparently kind or helpful but betraying a feeling of superiority; condescending", ipa: "ˈpætrənaɪzɪŋ" },
  "patronizingly/patronisingly": { zh: "adv. 居高临下地，屈尊俯就地", en: "in a condescending manner that betrays a feeling of superiority", ipa: "ˈpætrənaɪzɪŋli" },
  "tranquilize/tranquilise": { zh: "vt. 使镇静，使平静；给…服镇静剂", en: "to make calm or unconscious, especially by administering a sedative drug", ipa: "ˈtræŋkwɪlaɪz" },
  "deviantly": { zh: "adv. 偏离常规地，反常地，越轨地", en: "in a manner that departs from usual or accepted standards", ipa: "ˈdiːviəntli" },
  "bereftly": { zh: "adv. 丧失地，孤独无助地，若有所失地", en: "in a sad, lonely, and deprived manner", ipa: "bɪˈreftli" },
  "driver's license": { zh: "n. 驾驶执照，驾照", en: "an official document permitting a specific individual to operate one or more types of motorized vehicles", ipa: "ˈdraɪvərz ˌlaɪsəns" },
  "check-in counter": { zh: "n. 值机柜台，登记柜台", en: "a desk at an airport or hotel where passengers or guests register on arrival", ipa: "ˈtʃek ɪn ˌkaʊntər" },
  "check-in desk": { zh: "n. 登记处，值机台，前台接待处", en: "a service desk at an airport or hotel where guests register", ipa: "ˈtʃek ɪn desk" },
  "i": { zh: "pron. 我（第一人称单数主格）", en: "used by a speaker to refer to himself or herself", ipa: "aɪ" },
  "'m": { zh: "v. am 的缩写（是，常用于 I'm）", en: "short form of am (used with I)", ipa: "əm" },
  "'re": { zh: "v. are 的缩写（是，常用于 you're, we're, they're）", en: "short form of are", ipa: "ər" },
  "'s": { zh: "v. is / has 的缩写，或表示名词所有格（…的）", en: "short form of is or has, or possessive marker", ipa: "s" },
};

// Build lookup map from combined_a1_c2 and english_merged
const dictMap = new Map();

for (const [k, v] of Object.entries(MANUAL_DICT)) {
  dictMap.set(k.toLowerCase(), v);
}

for (const w of combined) {
  const k = String(w.word || "").toLowerCase().trim();
  const zh = String(w.translation_zh || w.definition_zh || "").trim();
  const en = String(w.meaning || w.english_translation || "").trim();
  if (k && !isDummyZh(zh)) {
    const existing = dictMap.get(k);
    dictMap.set(k, {
      zh: existing?.zh || zh,
      en: (en && !/[\u4e00-\u9fa5]/.test(en) && en.toLowerCase() !== k ? en : "") || existing?.en || "",
      ipa: w.ipa || existing?.ipa || "",
      pos: w.pos || existing?.pos || "",
      example: w.example || existing?.example || "",
      example_zh: w.example_translation || existing?.example_zh || "",
    });
  }
}

for (const w of merged) {
  const k = String(w.word || "").toLowerCase().trim();
  const zh = String(w.definition_zh || w.translation_zh || "").trim();
  const en = String(w.english_translation || w.meaning || "").trim();
  if (k && !isDummyZh(zh)) {
    const existing = dictMap.get(k);
    dictMap.set(k, {
      zh: existing?.zh || zh,
      en: (en && !/[\u4e00-\u9fa5]/.test(en) && en.toLowerCase() !== k ? en : "") || existing?.en || "",
      ipa: w.ipa || existing?.ipa || "",
      pos: w.pos || existing?.pos || "",
      example: w.example_sentence_native || w.example_sentence_english || existing?.example || "",
      example_zh: w.example_zh || existing?.example_zh || "",
    });
  }
}

function resolveWordEntry(rawWord, rawPos) {
  const k = String(rawWord || "").toLowerCase().trim();
  if (dictMap.has(k)) return dictMap.get(k);

  // Try splitting by / (e.g., "color/colour", "doctor/Dr./Dr")
  const parts = k
    .split("/")
    .map((p) => p.trim().replace(/\.$/, ""))
    .filter(Boolean);

  for (const p of parts) {
    if (dictMap.has(p)) return dictMap.get(p);
    const noAcc = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (dictMap.has(noAcc)) return dictMap.get(noAcc);
  }

  // Fallback for remaining rare tokens
  const posLabel = rawPos || "noun";
  return {
    zh: `n. ${rawWord}（专有名词/术语）`,
    en: `a specialized term or proper noun referring to ${rawWord}`,
    ipa: "",
    pos: posLabel,
  };
}

// 1. Update words/english_merged.json
let mergedUpdated = 0;
for (const w of merged) {
  const info = resolveWordEntry(w.word, w.pos);
  if (isDummyZh(w.definition_zh)) {
    w.definition_zh = info.zh;
    mergedUpdated++;
  }
  if (!w.english_translation || w.english_translation.toLowerCase() === w.word.toLowerCase() || /[\u4e00-\u9fa5]/.test(w.english_translation)) {
    if (info.en) {
      w.english_translation = info.en;
    } else if (!w.english_translation) {
      w.english_translation = `${w.pos ? w.pos + ". " : ""}${w.word}`;
    }
  }
  if (!w.ipa && info.ipa) {
    w.ipa = info.ipa;
  }
}
fs.writeFileSync(mergedPath, JSON.stringify(merged), "utf8");
console.log(`Updated ${mergedUpdated} entries in words/english_merged.json`);

// 2. Update words/combined_a1_c2.json, words/en/combined_a1_c2.json, public/combined_a1_c2.json
let combinedUpdated = 0;
for (const w of combined) {
  const info = resolveWordEntry(w.word, w.pos);
  if (isDummyZh(w.translation_zh)) {
    w.translation_zh = info.zh;
    combinedUpdated++;
  }
  if (!w.meaning || w.meaning.toLowerCase() === w.word.toLowerCase() || /[\u4e00-\u9fa5]/.test(w.meaning)) {
    if (info.en) {
      w.meaning = info.en;
    }
  }
  if (!w.ipa && info.ipa) {
    w.ipa = info.ipa;
  }
}
const combinedJsonStr = JSON.stringify(combined);
fs.writeFileSync(combinedPath, combinedJsonStr, "utf8");
if (fs.existsSync(enCombinedPath)) fs.writeFileSync(enCombinedPath, combinedJsonStr, "utf8");
if (fs.existsSync(pubCombinedPath)) fs.writeFileSync(pubCombinedPath, combinedJsonStr, "utf8");
console.log(`Updated ${combinedUpdated} entries in combined_a1_c2.json files`);

// 3. Update words/en/a1.json .. c2.json
for (const lvl of ["a1", "a2", "b1", "b2", "c1", "c2"]) {
  const p = path.join(process.cwd(), "words", "en", `${lvl}.json`);
  if (!fs.existsSync(p)) continue;
  const list = JSON.parse(fs.readFileSync(p, "utf8"));
  let cnt = 0;
  for (const w of list) {
    const info = resolveWordEntry(w.word, w.pos);
    if (isDummyZh(w.translation_zh) && isDummyZh(w.definition_zh)) {
      w.translation_zh = info.zh;
      w.definition_zh = info.zh;
      cnt++;
    }
    if ((!w.meaning || w.meaning.toLowerCase() === w.word.toLowerCase()) && info.en) {
      w.meaning = info.en;
    }
    if (!w.ipa && info.ipa) {
      w.ipa = info.ipa;
    }
  }
  fs.writeFileSync(p, JSON.stringify(list), "utf8");
  console.log(`Updated ${cnt} entries in words/en/${lvl}.json`);
}

// 4. Update all 60 flashcard unit markdown files in content/
function sanitizeYaml(str) {
  return String(str || "")
    .replace(/\r?\n/g, "; ")
    .replace(/\\/g, "")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanZhForFlashcard(raw) {
  if (!raw) return "";
  let c = raw.trim();
  c = c.replace(/;?\s*(?:时态|比较级|名\s*词|形容词|副\s*词|abbr\.|CLASSabbr)[\s\S]*/i, "");
  c = c.replace(/[A-Z]{2,}abbr\.[\s\S]*/, "");
  c = c.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "'");
  return sanitizeYaml(c || raw);
}

const contentDir = path.join(process.cwd(), "content");
const unitFiles = fs
  .readdirSync(contentDir)
  .filter((f) => f.endsWith(".md") && f.includes("-flashcard-unit-"));

let updatedFlashcards = 0;
for (const f of unitFiles) {
  const fullPath = path.join(contentDir, f);
  const txt = fs.readFileSync(fullPath, "utf8");
  const lines = txt.split("\n");
  let currentFront = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const frontMatch = line.match(/^front:\s*"([^"]*)"/);
    if (frontMatch) {
      currentFront = frontMatch[1];
      continue;
    }

    const meaningMatch = line.match(/^meaning:\s*"([^"]*)"/);
    if (meaningMatch && currentFront) {
      const curMeaning = meaningMatch[1];
      const info = resolveWordEntry(currentFront);
      if (
        (!curMeaning ||
          curMeaning.toLowerCase() === currentFront.toLowerCase() ||
          curMeaning.startsWith("to ") && curMeaning.length <= currentFront.length + 4 ||
          /[\u4e00-\u9fa5]/.test(curMeaning)) &&
        info.en
      ) {
        lines[i] = `meaning: "${sanitizeYaml(info.en)}"`;
      }
      continue;
    }

    const transMatch = line.match(/^translation:\s*"([^"]*)"/);
    if (transMatch && currentFront) {
      const curTrans = transMatch[1];
      const info = resolveWordEntry(currentFront);
      if (isDummyZh(curTrans) || curTrans.includes("时态:") || curTrans.includes("abbr.")) {
        const cleanZh = cleanZhForFlashcard(info.zh);
        if (cleanZh) {
          lines[i] = `translation: "${cleanZh}"`;
          updatedFlashcards++;
        }
      }
    }
  }

  fs.writeFileSync(fullPath, lines.join("\n"), "utf8");
}

console.log(`Updated ${updatedFlashcards} flashcard translation lines across ${unitFiles.length} unit files!`);
