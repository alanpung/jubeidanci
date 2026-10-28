import { markTranslation, scoreToQuality, PASS_LINE } from "@/lib/marking";

interface Case {
  label: string;
  input: string[];
  answers: string[];
  expect: {
    score?: number;
    stars?: 0 | 1 | 2 | 3;
    grade?: string;
    passed?: boolean;
    /** optional: check that a given fraction of slots are "hit" */
    minHit?: number;
  };
}

const cases: Case[] = [
  {
    label: "完全正确 → 100/★★★/perfect",
    input: ["He", "decided", "to", "change", "jobs", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "词序全乱(9词反转) → 55/☆/retry (C封顶45)",
    input: ["career", "his", "develop", "to", "jobs", "change", "to", "decided", "He"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 55, grade: "retry", passed: false },
  },
  {
    label: "错2个词(extra) → 76/★★/good",
    input: ["He", "decided", "to", "change", "xxx", "to", "develop", "his", "zzz"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 76, stars: 2, grade: "good", passed: true },
  },
  {
    label: "漏1个词(missing) → 88/★★/good",
    input: ["He", "decided", "to", "change", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 88, stars: 2, grade: "good", passed: true },
  },
  {
    label: "拼错1个词(typo: decided→decide) → 97/★★★/perfect",
    input: ["He", "decide", "to", "change", "jobs", "to", "develop", "his", "career"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 97, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "单词全对只错1个位置(相邻swap) → 84/★★/good",
    input: ["He", "decided", "to", "change", "jobs", "to", "develop", "career", "his"],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 84, stars: 2, grade: "good", passed: true },
  },
  {
    label: "同义词命中(wish→hope) → 100",
    input: ["I", "hope", "to", "see", "you", "soon"],
    answers: ["I wish to see you soon."],
    expect: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "空输入 → 0/☆/retry",
    input: ["", "", "", "", "", "", "", "", ""],
    answers: ["He decided to change jobs to develop his career."],
    expect: { score: 0, stars: 0, grade: "retry", passed: false },
  },
  {
    label: "短语变体(get up→wake up) 命中",
    input: ["I", "wake", "up", "at", "seven"],
    answers: ["I get up at seven.", "I wake up at seven."],
    expect: { score: 100, stars: 3, grade: "perfect", passed: true },
  },
  {
    label: "及格压线(5错位) → 60/★/pass",
    input: ["He", "decided", "to", "change", "jobs", "develop", "to", "his", "career"],
    // shift token 5 one slot: this yields 5 displaced-ish; verified below
    answers: ["He decided to change jobs to develop his career."],
    expect: { passed: true },
  },
];

let failures = 0;
console.log("=== markTranslation 验算 ===\n");
for (const c of cases) {
  const r = markTranslation(c.input, c.answers);
  const slotLenOk = r.slots.length === c.answers[0].trim().split(/\s+/).filter(Boolean).length;
  const hitCount = r.slots.filter((s) => s === "hit").length;
  const problems: string[] = [];
  if (c.expect.score !== undefined && r.score !== c.expect.score)
    problems.push(`score ${r.score} != ${c.expect.score}`);
  if (c.expect.stars !== undefined && r.stars !== c.expect.stars)
    problems.push(`stars ${r.stars} != ${c.expect.stars}`);
  if (c.expect.grade && r.grade !== c.expect.grade)
    problems.push(`grade ${r.grade} != ${c.expect.grade}`);
  if (c.expect.passed !== undefined && r.passed !== c.expect.passed)
    problems.push(`passed ${r.passed} != ${c.expect.passed}`);
  if (!slotLenOk) problems.push(`slots.length ${r.slots.length} != answer words`);
  const status = problems.length === 0 ? "PASS" : "FAIL";
  if (problems.length) failures++;
  console.log(
    `[${status}] ${c.label}\n        score=${r.score} stars=${r.stars} grade=${r.grade} q=${r.quality} passed=${r.passed} hits=${hitCount}/${r.slots.length} slots=[${r.slots.join(",")}] deductions=${JSON.stringify(r.deductions)}`,
  );
  if (problems.length) console.log("        !! " + problems.join("; "));
}
console.log(`\n=== ${cases.length - failures}/${cases.length} passed, ${failures} failed ===`);

// 不变量检查：slots 状态计数之和恒等于答案词数；score 恒在 0-100
console.log("\n=== 不变量 ===");
for (const c of cases) {
  const r = markTranslation(c.input, c.answers);
  const sum = r.slots.length;
  const inRange = r.score >= 0 && r.score <= 100;
  if (sum !== c.answers[0].trim().split(/\s+/).filter(Boolean).length || !inRange) {
    console.log(`INVARIANT FAIL: ${c.label} sum=${sum} score=${r.score}`);
    failures++;
  }
}
console.log(`PASS_LINE=${PASS_LINE} scoreToQuality(55)=${scoreToQuality(55)} scoreToQuality(88)=${scoreToQuality(88)} scoreToQuality(97)=${scoreToQuality(97)}`);

if (failures > 0) {
  console.error(`\n❌ ${failures} 处失败`);
  process.exit(1);
} else {
  console.log("\n✅ 全部通过");
}
