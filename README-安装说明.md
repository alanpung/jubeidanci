# B2 写作课程 + 全级别字数标注

## 这次做了什么

### 1. 新增 B2 writing 课程（全新）

- `content/b2-writing.md` + `b2-writing-unit-1..10.md`：10 单元 × 10 课 = **100 篇** B2 难度写作练习。
- 10 个主题：Society & Change、Work & Careers、Technology & Ethics、Environment & Future、Culture & Identity、Education & Learning、Health & Wellbeing、Relationships & Communication、Money & Consumerism、Imagination & Innovation。
- **四段式**：开头 / 两个中间段 / 结尾，范文 150–200 词。
- `scripts/_gen_b2.py` 为生成脚本，字数闸门：answer 150–200、acceptAlso 120–200、core 70–110。

### 2. 所有写作单元标注字数要求

中文题干末尾统一加字数提示（含段落指引）：

| 课程 | 段落 | 字数标注 | 范文字数 |
|---|---|---|---|
| A1 writing | 单段 | `（字数50-70）` | 50–70 |
| A2 writing | 单段 | `（字数80-100）` | 80–100 |
| B1 writing | 三段 | `（请写成三段：开头点题、中间展开、结尾收束。字数100-150）` | 100–150 |
| **B2 writing** | 四段 | `（请写成四段：开头点题、两个中间段展开、结尾总结。字数150-200）` | 150–200 |

- A1/A2/B1 的 300 课题干已全部更新；A2/B1 生成脚本模板也同步改好，重新生成不会丢标注。
- B1 有一课（Is Homework Necessary?）补足了几词，使按空格口径也达到 100+。

### 3. 评分器按级别动态段落引导

`app/api/grade-writing/route.ts` 的段落提示不再写死 B1 三段，而是按 level 生成：
- A1/A2 → 短文单段即可；
- B1 → 三段；
- B2 → 四段。

**段落数永远只是规划建议，不加分也不扣分**；原有「语法是唯一扣分项」策略不变。用了段落/主题句/连接词会写进 `strengths`；通篇一段只给一条温和建议。

## 覆盖步骤

把本 zip 里的内容**按原目录结构覆盖**到 `D:\AI Tools\jubeidanci`：

```
app/api/grade-writing/route.ts
scripts/_gen_b1.py
scripts/_gen_b2.py              ← 新增
scripts/_gen_a2_v2.py
content/a1-writing.md  ...  content/a1-writing-unit-1..10.md
content/a2-writing.md  ...  content/a2-writing-unit-1..10.md
content/b1-writing.md  ...  content/b1-writing-unit-1..10.md
content/b2-writing.md  ...  content/b2-writing-unit-1..10.md   ← 新增 B2
```

- **不需要清数据库**：内容以文件系统 markdown 为准，下次种子同步会自动发现 B2 课程与单元。
- 评分器改的是提示词，**无需改环境变量**。

## 验证记录

| 检查项 | 结果 |
|---|---|
| 全级别字数闸门（生成器） | A1/A2/B1/B2 全部 400 篇通过 |
| 端到端解析 | 400/400 课：段落数、字数、题干字数标注、生词、level 全部达标 |
| 加载器 | 46 门课程、242 单元，B2 writing 发现正常且 10 单元齐全，0 孤立单元 |
| TypeScript | `npx tsc --noEmit` 无报错 |

## Git 提交命令

```bash
cd "D:/AI Tools/jubeidanci"

git add -A
git status        # 应看到：新增 B2 的 11 个文件 + 修改的 A1/A2/B1 content、route.ts、3 个脚本
git commit -m "feat(b2-writing): add B2 four-paragraph writing course and word-count hints for all levels"
git push origin main
```

## 说明：为什么 B2 是 4 段 150–200 词

- CEFR B2 要求写「条理清晰、细节充分的文章」，需要开头、展开、结尾的完整结构；4 段是最经典的议论文框架（开头 + 两个主体段 + 结尾）。
- 150–200 词让每个主体段有 50–70 词空间，足以展开论据和例证，区别于 B1 的 100–150 词。
- 段落与字数只是**给学生的写作指引**，评分仍只看语法与内容覆盖，保持对初学者友好的定位。
