# CN→EN Translation Courses (B1 / B2 / C1 / C2)

Same pattern as A1/A2 **中英翻译**:

| Level | Course title (suggested) | Units | Lessons/unit | Sentences |
|-------|--------------------------|-------|--------------|-----------|
| B1 | B1 中英翻译 | 10 | 10 | 1000 |
| B2 | B2 中英翻译 | 10 | 10 | 1000 |
| C1 | C1 中英翻译 | 10 | 10 | 1000 |
| C2 | C2 中英翻译 | 10 | 10 | 1000 |

## Unit themes

- **B1**: Work, Travel, Health, Education, Housing, Shopping, Media, Relationships, Environment, Plans
- **B2**: Workplace challenges, Culture, Debate, Science, News, Arts, Economy, Law, Sustainability, Wellbeing
- **C1**: Politics, Academic discourse, Global economy, Ethics & tech, Rhetoric, Globalization, Critical arts, Research, Justice, Philosophy
- **C2**: Nuanced argument, Irony, Idioms, Literary register, Legal precision, Scientific formality, Diplomatic language, Abstract reasoning, Editorial voice, Stylistic flexibility

## Import (admin)

Courses live in the **database** as unit markdown (not static files in git). To load:

1. **Create course** for each level (`zh` → `en`, level = B1/B2/C1/C2).
2. For each of the 10 units, create a unit (question type **translation**) and paste the unit markdown into the editor / `/markdown` admin flow.
3. Attach units to the course and publish.

Generated unit markdown packs are produced offline (agent artifacts: `translation-courses/B1|B2|C1|C2/unit-XX.md`). Ask the agent for a re-export if you need the files again.

## Format reminder

```markdown
---
unitTitle: "Unit 1: Work & Career"
targetLanguage: "en"
sourceLanguage: "zh"
level: "B1"
questionType: "translation"
---

---
lessonTitle: "Lesson 1"
---

[translation]
sentence: "中文句子"
answer: "English sentence"
```
