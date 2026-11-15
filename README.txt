A2 写作课程 + 评分修复 + 中文题目 sticky 置顶 — 文件清单
========================================================
把本 zip 解压到你本地 jubeidanci 仓库的根目录（覆盖同名文件即可）。

content/a2-writing-course.md              新增：A2 写作课程索引
content/a2-writing-unit-1..10.md           新增/更新：10 个单元（含 core 字段）
lib/marking.ts                            修改：WRITING_RULES.extra 归零（多余表达不再扣分）
lib/content/exercise-schema.ts            修改：writingSchema 增加可选 core 字段
lib/content/types.ts                      修改：WritingExercise 增加 core?
lib/content/parser.ts                     修改：解析 core 字段
app/api/grade-writing/route.ts            修改：本地评分以 core 为金标准；AI prompt 对齐
components/exercises/writing.tsx          修改：键盘弹出时中文题 sticky 钉在顶部，输入框在下方独立区域
scripts/_inject_core.py                   新增（开发脚本）：生成 core 字段用，可忽略

移动端打字时的布局：
- 键盘弹出 → 中文题目变成 sticky 钉在屏幕顶部（紧凑、不透明、最高 26vh 可滚动），
  英文输入框在它下方独立区域，两者上下分离、绝不重叠。
- 键盘弹出时隐藏标题/音频/导航以节省竖向空间。
