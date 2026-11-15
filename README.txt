A2 写作课程 + 评分修复 — 文件清单
=====================================
把本 zip 解压到你本地 jubeidanci 仓库的根目录（覆盖同名文件即可）。

content/a2-writing-course.md              新增：A2 写作课程索引
content/a2-writing-unit-1..10.md           新增/更新：10 个单元（含新增的 core 字段）
lib/marking.ts                            修改：WRITING_RULES.extra 归零（多余表达不再扣分）
lib/content/exercise-schema.ts            修改：writingSchema 增加可选 core 字段
lib/content/types.ts                      修改：WritingExercise 增加 core?
lib/content/parser.ts                     修改：解析 core 字段
app/api/grade-writing/route.ts            修改：本地评分以 core 为金标准；AI prompt 对齐
components/exercises/writing.tsx          修改：提交评分时带上 core，level 改为 A2
scripts/_inject_core.py                   新增（开发脚本）：生成 core 字段用，可忽略

部署后行为：
- 学生忠实翻译中文（约 60 词）即可得到满分（内容覆盖 = 满分）。
- 学生自己发挥加词凑到 80-100 词：不扣分（多余表达 = 0）。
- 仅当真正漏掉中文内容、或语法/拼写错误时才扣分。
