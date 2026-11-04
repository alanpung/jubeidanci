"use server";

import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, feedbackMessage } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { ensureFeedbackMessagesTable } from "@/lib/db/ensure-feedback-messages";
import { isAdminEmail } from "@/lib/ai/models";

interface FeedbackInput {
  message: string;
  email?: string;
  turnstileToken?: string;
}

interface FeedbackResult {
  success: boolean;
  error?: string;
}

export async function submitFeedback(
  input: FeedbackInput
): Promise<FeedbackResult> {
  const { message, email, turnstileToken } = input;

  if (!message.trim()) {
    return { success: false, error: "Message is required" };
  }

  const session = await getSession();

  // Unauthenticated: verify turnstile if provided
  if (!session) {
    if (turnstileToken) {
      const result = await verifyTurnstileToken(turnstileToken);
      if (!result.success) {
        return {
          success: false,
          error: "Bot verification failed. Please try again.",
        };
      }
    }
  }

  // Determine auth method for authenticated users
  let authMethod = "";
  let senderName = "";
  let senderEmail = email?.trim() || "Anonymous";

  if (session) {
    senderName = session.user.name;
    senderEmail = session.user.email;

    try {
      const accounts = await db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, session.user.id));

      const providers = accounts.map((a) => a.providerId);
      if (providers.includes("google")) {
        authMethod = "Google OAuth";
      } else if (providers.includes("credential")) {
        authMethod = "Email/Password";
      } else {
        authMethod = providers.join(", ") || "Unknown";
      }
    } catch {
      authMethod = "Unknown";
    }
  }

  // Always store feedback message in database for owner view
  try {
    await ensureFeedbackMessagesTable();
    await db.insert(feedbackMessage).values({
      userId: session?.user?.id || null,
      userEmail: senderEmail,
      userName: senderName || null,
      authMethod: authMethod || null,
      message: message.trim(),
    });
  } catch (dbErr) {
    console.error("Failed to store feedback message in database:", dbErr);
    // Proceed to Slack delivery even if DB store hit an error
  }

  // Build Slack message
  let slackText: string;
  if (session) {
    slackText = [
      `*Feedback from:* ${senderName} (${senderEmail})`,
      `*Auth method:* ${authMethod}`,
      "---",
      message.trim(),
    ].join("\n");
  } else {
    slackText = [
      `*Feedback from (not logged in):* ${senderEmail}`,
      "---",
      message.trim(),
    ].join("\n");
  }

  // Send to Slack if webhook configured
  const webhookUrl = process.env.SLACK_WEBHOOK;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK not set — feedback stored in DB, skipping Slack post.");
    return { success: true };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: slackText }),
    });

    if (!response.ok) {
      console.error("Slack webhook failed:", response.status);
    }

    return { success: true };
  } catch (err) {
    console.error("Slack webhook error:", err);
    return { success: true }; // DB saved feedback successfully
  }
}

export type FeedbackMessageItem = {
  id: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  authMethod: string | null;
  message: string;
  createdAt: Date;
};

export async function getFeedbackMessages(): Promise<{
  success: boolean;
  error?: string;
  data: FeedbackMessageItem[];
}> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return { success: false, error: "Unauthorized access", data: [] };
  }

  try {
    await ensureFeedbackMessagesTable();
    const rows = await db
      .select()
      .from(feedbackMessage)
      .orderBy(desc(feedbackMessage.createdAt));

    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userEmail: r.userEmail,
        userName: r.userName,
        authMethod: r.authMethod,
        message: r.message,
        createdAt: new Date(r.createdAt),
      })),
    };
  } catch (err) {
    console.error("Failed to get feedback messages:", err);
    return { success: false, error: "Failed to retrieve feedback messages", data: [] };
  }
}

export async function deleteFeedbackMessage(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return { success: false, error: "Unauthorized action" };
  }

  try {
    await ensureFeedbackMessagesTable();
    await db.delete(feedbackMessage).where(eq(feedbackMessage.id, id));
    return { success: true };
  } catch (err) {
    console.error("Failed to delete feedback message:", err);
    return { success: false, error: "Failed to delete feedback message" };
  }
}
