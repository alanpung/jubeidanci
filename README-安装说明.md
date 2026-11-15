# B1 Writing 课程安装说明

本压缩包包含两个改动：

1. **写作课程改名**：去掉冗余的 `-course` 后缀 —— `A1 writing`、`A2 writing`，并新增 **`B1 writing`**。
2. **B1 写作课程**：10 个单元 × 10 课 = 100 篇写作练习，均为 CEFR B1 难度，范文 100–150 词。
3. **修复 SRS 生词丢失**：A2 / B1 的 `srsWords` 原来的写法没有给每个单词加双引号，解析器会把整行当成一个"单词"，导致 100 篇作文只累计出约 100 个生词。现已给全部 200 行加上引号，并在解析器里加了兜底（未加引号的多个词也会按空白拆开）。修复后 A2 累计 **328 个不同生词**、B1 累计 **420 个**（原来各约 100）。

## 安装步骤

### 1. 覆盖文件
把压缩包里的文件**保持目录结构**解压到你的项目根目录 `D:\AI Tools\jubeidanci`（即解压后 `content\` 下的文件落在 `jubeidanci\content\`，以此类推）。

会覆盖/新增的主要文件：
- `content\a1-writing.md`、`content\a2-writing.md`（新文件名）
- `content\a1-writing-unit-1..10.md`、`content\a2-writing-unit-1..10.md`（`courseId` 已更新）
- `content\b1-writing.md` + `content\b1-writing-unit-1..10.md`（全新 B1 课程）
- `app\api\grade-writing\route.ts`、`components\exercises\writing.tsx`（写作评分支持 B1 级别）
- `lib\content\*.ts`、`lib\db\seed-content.ts`、`lib\marking.ts`（加载器/解析器/迁移；其中 `parser.ts` 含 SRS 引号兜底修复）
- `scripts\_gen_b1.py`（B1 内容生成脚本，供以后再生成用；已修正为给 srsWords 加引号）

> SRS 生词是以文件系统里的 markdown 为准的（`getUserLibraryWords` 会用文件系统版本覆盖数据库副本），所以覆盖文件后生词库会立刻反映新结果，无需手动清数据库。

### 2. 删除旧文件（重要）
课程改名后，旧的 `-course.md` 文件必须删除，否则会出现重复的空课程：

- 删除 `content\a1-writing-course.md`
- 删除 `content\a2-writing-course.md`

> 数据库里的旧课程行（id 为 `a1-writing-course` / `a2-writing-course`）会在下次种子同步时由 `lib\db\seed-content.ts` 里的迁移自动清理，无需手动操作数据库。

### 3. 重启应用
```bash
npm run dev
```
重新启动后，种子逻辑会自动检测文件系统里的新课程/新单元，并把 B1 writing 写入数据库。进入课程库即可看到 **A1 writing / A2 writing / B1 writing** 三门课，B1 每门 10 个单元。

## 验证（可选）
- TypeScript 类型检查：`npx tsc --noEmit`（应无报错）
- 重新生成 B1 内容：`python3 scripts/_gen_b1.py`（会重写 11 个 b1 文件并做字数校验，全部通过）

## 内容规格
| 字段 | 词数范围 |
|------|----------|
| `answer`（范文） | 100–150 |
| `acceptAlso`（可接受的另一种写法） | 70–150 |
| `core`（忠实简化版，用于评分对照） | 48–82 |

10 个单元主题：Personal Experiences、Opinions & Preferences、Travel & Culture、Environment & Society、Technology、Health & Fitness、Education、People & Relationships、Daily Life、Imagination。
