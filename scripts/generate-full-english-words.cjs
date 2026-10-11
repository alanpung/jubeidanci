const fs = require("fs");
const path = require("path");
const { generateText } = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const C1_C2_WORDS = [
  // C1 Words
  { word: "alleviate", pos: "verb", cefr_level: "C1", translation: "to make suffering or a problem less severe; 减轻，缓和", exEn: "The doctor prescribed medicine to alleviate the patient's pain.", exZh: "医生开了药来减轻病人的痛苦。" },
  { word: "advocate", pos: "verb", cefr_level: "C1", translation: "to publicly support or recommend a policy; 提倡，拥护", exEn: "She strongly advocates for educational reform.", exZh: "她强烈提倡教育改革。" },
  { word: "ambiguous", pos: "adjective", cefr_level: "C1", translation: "open to more than one interpretation; 模棱两可的", exEn: "His ambiguous response left everyone confused.", exZh: "他模棱两可的回答让大家都感到困惑。" },
  { word: "autonomous", pos: "adjective", cefr_level: "C1", translation: "having freedom to govern or control itself; 自主的，自治的", exEn: "The university department enjoys an autonomous status.", exZh: "大学这个部门享有自主地位。" },
  { word: "coherent", pos: "adjective", cefr_level: "C1", translation: "logical, consistent, and well-structured; 连贯的，有条理的", exEn: "He presented a clear and coherent argument during the debate.", exZh: "他在辩论中提出了清晰且有条理的论点。" },
  { word: "deteriorate", pos: "verb", cefr_level: "C1", translation: "to become progressively worse; 恶化", exEn: "The weather began to deteriorate rapidly in the afternoon.", exZh: "天气在下午开始迅速恶化。" },
  { word: "eloquent", pos: "adjective", cefr_level: "C1", translation: "fluent or persuasive in speaking or writing; 雄辩的，有说服力的", exEn: "His eloquent speech moved the entire audience to tears.", exZh: "他雄辩的演讲感动得全场观众落泪。" },
  { word: "exemplify", pos: "verb", cefr_level: "C1", translation: "to be a typical example of something; 是……的典范，举例说明", exEn: "Her dedication exemplifies the ideal company employee.", exZh: "她的奉献精神体现了公司理想员工的典范。" },
  { word: "feasible", pos: "adjective", cefr_level: "C1", translation: "possible to do easily or conveniently; 可行的，切合实际的", exEn: "It is technically feasible to build the bridge within two years.", exZh: "在两年内建成这座桥在技术上是可行的。" },
  { word: "fluctuate", pos: "verb", cefr_level: "C1", translation: "to rise and fall irregularly in level or number; 波动，起伏", exEn: "Oil prices fluctuate significantly based on global supply.", exZh: "石油价格根据全球供应情况频繁波动。" },
  { word: "hierarchy", pos: "noun", cefr_level: "C1", translation: "a system in which members are ranked according to status; 等级制度", exEn: "She worked her way up through the corporate hierarchy.", exZh: "她通过努力在公司等级晋升体系中一路上升。" },
  { word: "implicit", pos: "adjective", cefr_level: "C1", translation: "implied though not plainly expressed; 含蓄的，暗含的", exEn: "There was an implicit understanding between the two business partners.", exZh: "两位商业伙伴之间存在着一种暗含的默契。" },
  { word: "inevitable", pos: "adjective", cefr_level: "C1", translation: "certain to happen; unavoidable; 不可避免的，必然发生的", exEn: "Change is an inevitable part of career growth.", exZh: "变化是职业成长中不可避免的一部分。" },
  { word: "inherent", pos: "adjective", cefr_level: "C1", translation: "existing in something as a permanent or essential attribute; 固有的，内在的", exEn: "There are inherent risks involved in any financial investment.", exZh: "任何金融投资都存在着固有的风险。" },
  { word: "meticulous", pos: "adjective", cefr_level: "C1", translation: "showing great attention to detail; careful and precise; 严谨的，一丝不苟的", exEn: "The researcher kept meticulous records of every experiment.", exZh: "研究人员对每一次实验都作了一丝不苟的记录。" },
  { word: "plausible", pos: "adjective", cefr_level: "C1", translation: "seeming reasonable or probable; 看似合理的", exEn: "He offered a plausible explanation for his absence.", exZh: "他为自己的缺席提供了一个看似合理的解释。" },
  { word: "pragmatic", pos: "adjective", cefr_level: "C1", translation: "dealing with things sensibly and realistically; 务实的，重实效的", exEn: "We need a pragmatic approach to solving this economic challenge.", exZh: "我们需要一种务实的方法来解决这个经济挑战。" },
  { word: "profound", pos: "adjective", cefr_level: "C1", translation: "very great, intense, or insightful; 深刻的，深远的影响", exEn: "The discovery had a profound impact on modern medicine.", exZh: "这项发现在现代医学上产生了深远的影响。" },
  { word: "resilient", pos: "adjective", cefr_level: "C1", translation: "able to withstand or recover quickly from difficult conditions; 有强韧复原力的", exEn: "The local economy proved remarkably resilient after the storm.", exZh: "当地经济在风暴过后展现出惊人的复原力。" },
  { word: "scrutiny", pos: "noun", cefr_level: "C1", translation: "critical observation or examination; 仔细审查，严密监视", exEn: "The government proposal came under intense public scrutiny.", exZh: "政府的提案受到了公众的严密审查。" },
  { word: "unprecedented", pos: "adjective", cefr_level: "C1", translation: "never done or known before; 史无前例的，空前的", exEn: "The region experienced an unprecedented period of growth.", exZh: "该地区经历了史无前例的增长时期。" },
  { word: "versatile", pos: "adjective", cefr_level: "C1", translation: "able to adapt or be adapted to many different functions; 多才多艺的，多用途的", exEn: "He is a versatile actor who excels in both drama and comedy.", exZh: "他是一位多才多艺的演员，在正剧和喜剧方面都很出色。" },
  { word: "vulnerable", pos: "adjective", cefr_level: "C1", translation: "exposed to the possibility of being attacked or harmed; 易受伤害的，脆弱的", exEn: "Elderly citizens are particularly vulnerable during heatwaves.", exZh: "老年人在酷暑期间尤其脆弱。" },

  // C2 Words
  { word: "acquiesce", pos: "verb", cefr_level: "C2", translation: "to accept something reluctantly but without protest; 默许，勉强同意", exEn: "The director chose to acquiesce to the board's demands.", exZh: "董事选择默许董事会的要求。" },
  { word: "anachronism", pos: "noun", cefr_level: "C2", translation: "a thing belonging or appropriate to a period other than that in which it exists; 时代错误，不合时宜的事物", exEn: "Typewriters have become a charming anachronism in modern offices.", exZh: "打字机在现代办公室里已成为一种有趣而不合时宜的存在。" },
  { word: "capricious", pos: "adjective", cefr_level: "C2", translation: "given to sudden and unaccountable changes of mood or behavior; 变化无常的，反复无常的", exEn: "The weather in spring can be remarkably capricious.", exZh: "春天的天气可能会非常变化无常。" },
  { word: "deleterious", pos: "adjective", cefr_level: "C2", translation: "causing harm or damage; 有害的，有损的", exEn: "Smoking has a deleterious effect on pulmonary health.", exZh: "吸烟对肺部健康有有害的影响。" },
  { word: "dichotomy", pos: "noun", cefr_level: "C2", translation: "a division or contrast between two things that are represented as being opposed; 一分为二，二分法", exEn: "There is a false dichotomy between economic growth and environmental protection.", exZh: "在经济增长与环境保护之间存在着虚假的对立。" },
  { word: "ephemeral", pos: "adjective", cefr_level: "C2", translation: "lasting for a very short time; 转瞬即逝的，短暂的", exEn: "Fame in the digital age is often fleeting and ephemeral.", exZh: "数字时代的名声往往是短暂且转瞬即逝的。" },
  { word: "esoteric", pos: "adjective", cefr_level: "C2", translation: "intended for or likely to be understood by only a small number of people; 深奥的，圈内人理解的", exEn: "The academic journal publishes articles on esoteric philosophical topics.", exZh: "该学术期刊发表关于深奥哲学主题的文章。" },
  { word: "exacerbate", pos: "verb", cefr_level: "C2", translation: "to make a problem, bad situation, or negative feeling worse; 加重，使恶化", exEn: "Delaying the decision will only exacerbate the current conflict.", exZh: "拖延决定只会加重现有的冲突。" },
  { word: "fastidious", pos: "adjective", cefr_level: "C2", translation: "very attentive to and concerned about accuracy and detail; 一丝不苟的，极挑剔的", exEn: "He is fastidious about maintaining a clean workspace.", exZh: "他对保持工作区整洁有着近乎挑剔的严格要求。" },
  { word: "idiosyncrasy", pos: "noun", cefr_level: "C2", translation: "a mode of behavior or way of thought peculiar to an individual; 癖好，个人独特性格", exEn: "Wearing mismatched socks was one of his endearing idiosyncrasies.", exZh: "穿不配套的袜子是他讨喜的个人癖好之一。" },
  { word: "juxtaposition", pos: "noun", cefr_level: "C2", translation: "the fact of two things being seen or placed close together with contrasting effect; 并列，并置对比", exEn: "The museum exhibition highlighted the juxtaposition of ancient and contemporary art.", exZh: "博物馆展览突出了古代艺术与当代艺术的对比并置。" },
  { word: "magnanimous", pos: "adjective", cefr_level: "C2", translation: "generous or forgiving, especially toward a rival or less powerful person; 宽宏大量的，慷慨的", exEn: "The winner was magnanimous in defeat, praising his opponent's performance.", exZh: "获胜者表现得十分宽宏大量，赞扬了对手的出色表现。" },
  { word: "obfuscate", pos: "verb", cefr_level: "C2", translation: "to render obscure, unclear, or unintelligible; 使模糊，弄暗，故意混淆", exEn: "The lawyer attempted to obfuscate the facts during cross-examination.", exZh: "律师试图在交叉询问中混淆事实。" },
  { word: "ostentatious", pos: "adjective", cefr_level: "C2", translation: "characterized by vulgar or pretentious display; 炫耀的，卖弄的", exEn: "She avoided wearing ostentatious jewelry to official events.", exZh: "她避免在官方活动中佩戴炫耀张扬的珠宝。" },
  { word: "paradigm", pos: "noun", cefr_level: "C2", translation: "a typical example or pattern of something; a model; 范例，典范，模式", exEn: "Quantum computing represents a fundamental paradigm shift in technology.", exZh: "量子计算代表了技术领域的根本性模式转变。" },
  { word: "perspicacious", pos: "adjective", cefr_level: "C2", translation: "having a ready insight into and understanding of things; 敏锐的，有洞察力的", exEn: "Her perspicacious analysis helped the company anticipate market trends.", exZh: "她敏锐的分析帮助公司预见了市场趋势。" },
  { word: "quixotic", pos: "adjective", cefr_level: "C2", translation: "exceedingly idealistic; unrealistic and impractical; 堂吉诃德式的，不切实际的", exEn: "Launching a startup without capital turned out to be a quixotic dream.", exZh: "没有资金启动一家创业公司被证明是一个不切实际的梦想。" },
  { word: "sagacious", pos: "adjective", cefr_level: "C2", translation: "having or showing keen mental discernment and good judgment; 睿智的，有远见的", exEn: "The elder statesman provided sagacious advice during the national crisis.", exZh: "这位资深政客在国家危机期间提供了睿智的建议。" },
  { word: "serendipity", pos: "noun", cefr_level: "C2", translation: "the occurrence of events by chance in a happy or beneficial way; 意外发现珍贵事物的运气，机缘巧合", exEn: "Discovering the rare manuscript in a secondhand bookstore was pure serendipity.", exZh: "在旧书店里发现这本罕见的手稿纯属意外的惊喜巧合。" },
  { word: "ubiquitous", pos: "adjective", cefr_level: "C2", translation: "present, appearing, or found everywhere; 无所不在的，普遍存在的", exEn: "Smartphones have become ubiquitous in modern urban society.", exZh: "智能手机在现代城市社会中已变得无处不在。" },
  { word: "unequivocal", pos: "adjective", cefr_level: "C2", translation: "leaving no doubt; clear and unambiguous; 明确无误的，单刀直入的", exEn: "The scientist gave an unequivocal 'yes' to the committee's question.", exZh: "科学家对委员会的问题给出了明确无误的'是'的回答。" },
  { word: "veracity", pos: "noun", cefr_level: "C2", translation: "conformity to facts; accuracy and truthfulness; 真实性，诚实", exEn: "The tribunal questioned the veracity of the witness's testimony.", exZh: "法庭质疑证人证词的真实性。" }
];

async function buildFullDictionary() {
  console.log("Reading existing words from words/english.json...");
  const raw = fs.readFileSync(path.join(process.cwd(), "words", "english.json"), "utf8");
  const existingWords = JSON.parse(raw);
  console.log(`Initial English words in JSON: ${existingWords.length}`);

  const wordMap = new Map();

  existingWords.forEach((w) => {
    if (w && w.word) {
      const key = w.word.toLowerCase().trim();
      wordMap.set(key, {
        word: key,
        pos: w.pos || "noun",
        cefr_level: w.cefr_level || "A1",
        english_translation: w.english_translation || w.word,
        example_sentence_native: w.example_sentence_native || "",
        example_sentence_english: w.example_sentence_english || "",
        useful_for_flashcard: w.useful_for_flashcard !== false,
        word_frequency: w.word_frequency || 1000,
        goethe_b1_wordlist: w.goethe_b1_wordlist || false,
      });
    }
  });

  C1_C2_WORDS.forEach((item) => {
    const key = item.word.toLowerCase().trim();
    wordMap.set(key, {
      word: key,
      pos: item.pos,
      cefr_level: item.cefr_level,
      english_translation: item.translation,
      example_sentence_native: item.exEn,
      example_sentence_english: item.exZh,
      useful_for_flashcard: true,
      word_frequency: item.cefr_level === "C2" ? 4500 : 3500,
    });
  });

  const finalArray = Array.from(wordMap.values());
  console.log(`Total expanded English words: ${finalArray.length}`);

  const levelCounts = {};
  finalArray.forEach((w) => {
    const lvl = w.cefr_level || "A1";
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
  });

  console.log("CEFR level summary:", levelCounts);

  fs.writeFileSync(
    path.join(process.cwd(), "words", "english.json"),
    JSON.stringify(finalArray, null, 2),
    "utf8"
  );

  console.log("Saved updated words/english.json successfully!");
}

buildFullDictionary().catch(console.error);
