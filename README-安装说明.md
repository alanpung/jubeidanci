# 去掉课程命名里的 `-course` 后缀

本次改动把**所有 45 门课程**的 id / 文件名里的冗余 `-course` 去掉，并同步更新了引用。

## 改了什么

| 项目 | 旧 | 新 |
|---|---|---|
| 课程文件名 | `a1-flashcard-course.md` | `a1-flashcard.md` |
| 课程 `id:` | `a1-flashcard-course` | `a1-flashcard` |
| 单元 `courseId:` | `a1-flashcard-course` | `a1-flashcard` |

覆盖全部等级（A1/A2/B1/B2/C1/C2）× 全部课程类型（fill-in-the-blank、flashcard、listening、multiple-choice、speaking、translation、word-order、writing），共 **45 门课程**、**232 个单元**。

同时更新：
- `lib/db/queries/courses.ts` 的 `SYSTEM_COURSE_IDS`（13 个系统课程 id）
- `lib/db/seed-content.ts` 的种子迁移：新增通用迁移，把数据库里所有旧 `-course` id 自动迁移到新 id（含更早的 `a1-essay-course`、`a1-word-bank-course` 两条旧链）
- 各内容生成脚本（`scripts/*.py` / `.mjs` / `.cjs`），以后重新生成也不会再带 `-course`

## 安装步骤

### 1. 先删除旧文件（重要）
改名后旧的 `-course.md` 文件必须删除，否则会出现重复的空课程：

```bash
git rm content/*-course.md
```

### 2. 覆盖新文件
把压缩包里的文件**保持目录结构**解压到项目根目录 `D:\AI Tools\jubeidanci`。新的课程文件是无 `-course` 后缀的文件名，单元文件的 `courseId` 也已更新。

### 3. 提交并推送
```bash
git add -A
git commit -m "refactor(content): drop -course suffix from all course ids and filenames"
git push origin main
```

## 数据库迁移
无需手动操作数据库。`lib/db/seed-content.ts` 里的通用迁移会在下次种子同步时自动：
- 把手工创建单元（UUID id）的 `courseId` 改到新 id，保留它们；
- 删除旧 id 的文件系统单元（会以新 id 重新写入）；
- 删除旧的课程行，避免出现重复空课程。

## 验证
- `npx tsc --noEmit` 无报错
- 内容加载器识别 45 门课程、232 个单元，无 `-course` 残留 id，无孤立单元
- 所有生成脚本语法检查通过
