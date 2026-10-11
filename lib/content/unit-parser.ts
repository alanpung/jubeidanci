import matter from "gray-matter";
import { parseExercisesFromMarkdown } from "./parser";
import type { ParsedUnit, UnitLesson } from "./types";

function parseLessonMeta(blockStr: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const lines = blockStr.split("\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  }
  return meta;
}

export function parseUnitMarkdown(raw: string): ParsedUnit {
  const { data: fm, content } = matter(raw);

  // 1. Try finding all --- delimited lesson metadata blocks in the content
  const lessonBlockRegex = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*$/gm;
  const blocks: { meta: string; start: number; end: number }[] = [];

  let match;
  while ((match = lessonBlockRegex.exec(content)) !== null) {
    blocks.push({
      meta: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  let lessons: UnitLesson[] = blocks.map((block, i) => {
    const nextStart =
      i + 1 < blocks.length ? blocks[i + 1].start : content.length;
    const exerciseContent = content.slice(block.end, nextStart).trim();

    const meta = parseLessonMeta(block.meta);

    return {
      title: (meta.lessonTitle as string) ?? "Untitled",
      description: (meta.description as string) ?? undefined,
      icon: (meta.icon as string) ?? undefined,
      color: (meta.color as string) ?? undefined,
      exercises: parseExercisesFromMarkdown(exerciseContent),
    };
  });

  // 2. Fallback: If no --- lesson blocks found, look for ## Lesson or ## Headings
  if (lessons.length === 0) {
    const headingRegex = /^##\s+(?:Lesson\s*\d*[:\-]?\s*)?(.*?)$/gm;
    const headingMatches: { title: string; start: number; end: number }[] = [];
    let hMatch;
    while ((hMatch = headingRegex.exec(content)) !== null) {
      headingMatches.push({
        title: hMatch[1]?.trim() || `Lesson ${headingMatches.length + 1}`,
        start: hMatch.index,
        end: hMatch.index + hMatch[0].length,
      });
    }

    if (headingMatches.length > 0) {
      lessons = headingMatches.map((hm, i) => {
        const nextStart =
          i + 1 < headingMatches.length
            ? headingMatches[i + 1].start
            : content.length;
        const exerciseContent = content.slice(hm.end, nextStart).trim();
        return {
          title: hm.title,
          description: undefined,
          icon: undefined,
          color: undefined,
          exercises: parseExercisesFromMarkdown(exerciseContent),
        };
      });
    } else if (content.trim().length > 0) {
      // 3. Fallback: Parse exercises directly if no lesson blocks or headings exist
      const exercises = parseExercisesFromMarkdown(content.trim());
      if (exercises.length > 0) {
        lessons = [
          {
            title: "Lesson 1",
            description: (fm.description as string) ?? undefined,
            icon: (fm.icon as string) ?? undefined,
            color: (fm.color as string) ?? undefined,
            exercises,
          },
        ];
      }
    }
  }

  return {
    title: fm.unitTitle ?? fm.title ?? "Untitled",
    description: fm.description ?? "",
    icon: fm.icon ?? "📘",
    color: fm.color ?? "#4CAF50",
    targetLanguage: fm.targetLanguage ?? null,
    sourceLanguage: fm.sourceLanguage ?? null,
    level: fm.level ?? null,
    courseId: fm.courseId ?? null,
    questionType: (fm.questionType ?? fm.exerciseType)
      ? String(fm.questionType ?? fm.exerciseType)
      : null,
    lessons,
  };
}
