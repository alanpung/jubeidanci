"use server";

import { db, isDbAvailable } from "@/lib/db";
import { chatConversation } from "@/lib/db/schema";
import { and, eq, desc, or, sql } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";

export async function listConversations() {
  const session = await getSession();
  if (!session?.user?.id) return [];

  const dbUp = await isDbAvailable();
  if (!dbUp) return [];

  try {
    const userEmail = session.user.email?.toLowerCase();
    const rows = await db
      .select({
        id: chatConversation.id,
        title: chatConversation.title,
        language: chatConversation.language,
        updatedAt: chatConversation.updatedAt,
      })
      .from(chatConversation)
      .where(
        userEmail
          ? or(
              eq(chatConversation.userId, session.user.id),
              eq(sql`LOWER(${chatConversation.userId})`, userEmail)
            )
          : eq(chatConversation.userId, session.user.id)
      )
      .orderBy(desc(chatConversation.updatedAt));

    return rows;
  } catch (err) {
    console.error("Failed to list chat conversations:", err);
    return [];
  }
}

export async function getConversation(id: string) {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const dbUp = await isDbAvailable();
  if (!dbUp) return null;

  try {
    const userEmail = session.user.email?.toLowerCase();
    const [row] = await db
      .select()
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.id, id),
          userEmail
            ? or(
                eq(chatConversation.userId, session.user.id),
                eq(sql`LOWER(${chatConversation.userId})`, userEmail)
              )
            : eq(chatConversation.userId, session.user.id)
        )
      )
      .limit(1);

    return row ?? null;
  } catch (err) {
    console.error("Failed to get chat conversation:", err);
    return null;
  }
}

export async function createConversation(
  language: string,
  title: string,
  messages: unknown[]
) {
  const session = await requireSession();
  const [row] = await db
    .insert(chatConversation)
    .values({
      userId: session.user.id,
      language,
      title,
      messages,
    })
    .returning({ id: chatConversation.id });

  revalidatePath("/chat", "layout");
  return row.id;
}

export async function saveMessages(id: string, messages: unknown[]) {
  const session = await requireSession();
  const userEmail = session.user.email?.toLowerCase();
  await db
    .update(chatConversation)
    .set({ messages, updatedAt: new Date() })
    .where(
      and(
        eq(chatConversation.id, id),
        userEmail
          ? or(
              eq(chatConversation.userId, session.user.id),
              eq(sql`LOWER(${chatConversation.userId})`, userEmail)
            )
          : eq(chatConversation.userId, session.user.id)
      )
    );
}

export async function deleteConversation(id: string) {
  const session = await requireSession();
  const userEmail = session.user.email?.toLowerCase();
  try {
    await db
      .delete(chatConversation)
      .where(
        and(
          eq(chatConversation.id, id),
          userEmail
            ? or(
                eq(chatConversation.userId, session.user.id),
                eq(sql`LOWER(${chatConversation.userId})`, userEmail)
              )
            : eq(chatConversation.userId, session.user.id)
        )
      );
  } catch (err) {
    console.error("Failed to delete conversation:", err);
  }
  revalidatePath("/chat", "layout");
  revalidatePath(`/chat/${id}`);
  return { success: true };
}

export async function deleteAllConversations() {
  const session = await requireSession();
  const userEmail = session.user.email?.toLowerCase();
  try {
    await db
      .delete(chatConversation)
      .where(
        userEmail
          ? or(
              eq(chatConversation.userId, session.user.id),
              eq(sql`LOWER(${chatConversation.userId})`, userEmail)
            )
          : eq(chatConversation.userId, session.user.id)
      );
  } catch (err) {
    console.error("Failed to delete all conversations:", err);
  }
  revalidatePath("/chat", "layout");
  return { success: true };
}
