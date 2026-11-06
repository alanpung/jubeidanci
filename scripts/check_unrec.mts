import { getUnrecordedWords } from "../lib/content/unrecorded-words";
const words = getUnrecordedWords();
console.log("Total globally-unique unrecorded words:", words.length);
console.log("\nAll rows:");
for (const w of words) {
  const srcs = w.sources.map(s => `${s.courseId}/${s.unitId}(x${s.count})`).join(", ");
  console.log(`  ${w.word}  [${w.occurrences}x]  ${srcs}`);
}
