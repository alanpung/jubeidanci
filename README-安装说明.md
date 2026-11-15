# B1 写作：三段式引导 + 范文分段（增量包）

## 这次改了什么

B1 写作原来 100 篇范文都是**单段**，评分器也**完全没有结构维度**。本次让 B1 作文默认按 **3 段**（开头 / 中间 / 结尾）来引导，但**不把它变成扣分门槛**。

### 1. 三层引导（第 1 层）

- **中文题干**末尾统一加了：`（请写成三段：开头点题、中间展开、结尾收束。）`
- **英文指令**改为：`Write this passage in English in three short paragraphs: an opening, a middle and an ending`
- **评分反馈**新增一段 `PARAGRAPH PLANNING` 规则：
  - 三段只是**规划指引，NOT 评分标准**，段落数**不加分也不扣分**；
  - 学生用了分段或连接词（First / Also / However / Finally / In addition）→ 写进 `strengths` 表扬；
  - 学生通篇写成一个大块 → 只在 `corrections` 里加**一条温和建议**，不当作错误、不降分；
  - 明确写了 `Paragraph breaks (or the lack of them) are NOT grammar errors.`

> 现有「语法是唯一扣分项」的初学者友好策略**保持不变**。

### 2. 范文分段示范（第 2 层）

- 100 篇 `answer` 和 100 篇 `acceptAlso` 都按语义切成 3 段：
  - 段 1 = 首句（点题）
  - 段 2 = 中间句（展开）
  - 段 3 = 末句（收束）
- 内容文件里用单行分隔符 ` || `，避免真实换行破坏 markdown 的 `key: "value"` 字段解析。
- `lib/content/parser.ts` 的 `parseWriting` 会把 ` || ` 还原成真实 `\n`；写作页的 `whitespace-pre-wrap` 直接渲染成段落，朗读也会在段落处自然停顿。
- `A1` / `A2` 完全不受影响（它们的范文没有分隔符，转换是空操作）。

## 覆盖步骤

把本 zip 里的文件**按原目录结构覆盖**到 `D:\AI Tools\jubeidanci`：

```
app/api/grade-writing/route.ts
lib/content/parser.ts
lib/content/parser.test.ts
scripts/_gen_b1.py
content/b1-writing.md
content/b1-writing-unit-1.md  ...  content/b1-writing-unit-10.md
```

- 全是**覆盖/更新**，没有新增或删除文件。
- **不需要清数据库**：生词和范文以文件系统 markdown 为准，会覆盖数据库副本。
- 若评分器接的是外部 AI provider，改的是提示词，**无需改环境变量**。

## 验证记录

| 检查项 | 结果 |
|---|---|
| 字数校验（生成器） | 100/100 篇 answer 100–150 词、acceptAlso 70–150 词，全部通过 |
| 端到端解析 | B1：100/100 课范文为 3 段、替代范文 3 段、中英文三段指令齐全；A1/A2 不受影响 |
| 解析器单测 | 新增 2 个用例（`||` 展开、单段保持不变）；类型检查 `npx tsc --noEmit` 无报错 |
| 段落语义抽查 | 段1 点题 / 段2 展开 / 段3 收束，切分自然 |

## Git 提交命令

```bash
cd "D:/AI Tools/jubeidanci"

git add -A
git status                         # 应看到 M: route.ts / parser.ts / parser.test.ts / _gen_b1.py / 11 个 b1 content 文件
git commit -m "feat(b1-writing): guide three-paragraph essays and split model answers into paragraphs"
git push origin main
```

## 说明：为什么是 3 段而不是 4 段

- CEFR B1 要求写「连贯的简单短文」；主流 B1 考试的 100 词任务，高分范文通常也就 2–3 段。
- 我们的篇幅是 100–150 词：3 段每段约 30–50 词很自然；4 段每段仅 25–35 词，容易逼出空话。
- 因此 **3 段 = B1 默认目标（软引导）**，4 段留给 150 词以上或 B2 进阶。
