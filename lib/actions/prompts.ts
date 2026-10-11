"use server";

import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { and, eq, like } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { PROMPT_DEFINITIONS, PROMPTS_BY_ID } from "@/lib/prompts";

export type PromptWithOverride = {
  id: string;
  displayName: string;
  description: string;
  defaultTemplate: string;
  variables: string[];
  customTemplate: string | null;
};

export async function getPrompts(): Promise<PromptWithOverride[]> {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.user.email)) return [];

    const overrides = await db
      .select()
      .from(userMemory)
      .where(
        and(
          eq(userMemory.userId, session.user.id),
          like(userMemory.key, "prompt:%"),
        ),
      );

    const overrideMap = new Map(
      overrides.map((o) => [o.key.replace("prompt:", ""), o.value]),
    );

    return PROMPT_DEFINITIONS.map((def) => ({
      ...def,
      customTemplate: overrideMap.get(def.id) ?? null,
    }));
  } catch (err) {
    console.error("getPrompts error:", err);
    return [];
  }
}

export async function savePrompt(id: string, value: string) {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) throw new Error("Unauthorized");
  if (!PROMPTS_BY_ID[id]) throw new Error(`Unknown prompt ID: ${id}`);

  const key = `prompt:${id}`;

  await db
    .insert(userMemory)
    .values({
      userId: session.user.id,
      key,
      value,
    })
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function resetPrompt(id: string) {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) throw new Error("Unauthorized");
  if (!PROMPTS_BY_ID[id]) throw new Error(`Unknown prompt ID: ${id}`);

  await db
    .delete(userMemory)
    .where(
      and(
        eq(userMemory.userId, session.user.id),
        eq(userMemory.key, `prompt:${id}`),
      ),
    );
}

export async function getMemory(): Promise<string> {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.user.email)) return "";

    const [row] = await db
      .select()
      .from(userMemory)
      .where(
        and(eq(userMemory.userId, session.user.id), eq(userMemory.key, "memory")),
      )
      .limit(1);

    return row?.value ?? "";
  } catch (err) {
    console.error("getMemory error:", err);
    return "";
  }
}

export async function saveMemory(value: string) {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) throw new Error("Unauthorized");

  await db
    .insert(userMemory)
    .values({ userId: session.user.id, key: "memory", value })
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value, updatedAt: new Date() },
    });
}

/** Non-action helper: get user's prompt template with fallback to default */
export async function getUserPromptTemplate(
  userId: string,
  promptId: string,
): Promise<string> {
  const def = PROMPTS_BY_ID[promptId];
  if (!def) throw new Error(`Unknown prompt ID: ${promptId}`);

  try {
    const [override] = await db
      .select()
      .from(userMemory)
      .where(
        and(
          eq(userMemory.userId, userId),
          eq(userMemory.key, `prompt:${promptId}`),
        ),
      )
      .limit(1);

    return override?.value ?? def.defaultTemplate;
  } catch {
    return def.defaultTemplate;
  }
}
