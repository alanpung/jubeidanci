"use server";

import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { generateSpeech } from "@/lib/tts";
import {
  VOICE_STYLE_PRESETS,
  type VoiceSettingsData,
} from "@/lib/tts-config";

export async function getVoiceSettings(): Promise<VoiceSettingsData> {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return {
        voiceName: "Kore",
        presetId: "default",
        customInstructions: VOICE_STYLE_PRESETS[0].template,
        isAdmin: false,
      };
    }

    const isAdmin = isAdminEmail(session.user.email);

    const records = await db
      .select()
      .from(userMemory)
      .where(eq(userMemory.userId, session.user.id));

    const map = new Map(records.map((r) => [r.key, r.value]));

    const voiceName = map.get("tts:voice") || "Kore";
    const presetId = map.get("tts:preset") || "default";
    const customInstructions =
      map.get("prompt:tts-instructions") ||
      VOICE_STYLE_PRESETS.find((p) => p.id === presetId)?.template ||
      VOICE_STYLE_PRESETS[0].template;

    return {
      voiceName,
      presetId,
      customInstructions,
      isAdmin,
    };
  } catch (err) {
    console.error("Failed to load voice settings:", err);
    return {
      voiceName: "Kore",
      presetId: "default",
      customInstructions: VOICE_STYLE_PRESETS[0].template,
      isAdmin: false,
    };
  }
}

export async function saveVoiceSettings({
  voiceName,
  presetId,
  customInstructions,
}: {
  voiceName: string;
  presetId: string;
  customInstructions?: string;
}) {
  const session = await requireSession();

  // Save voice selection for user and globally
  await db
    .insert(userMemory)
    .values([
      {
        userId: session.user.id,
        key: "tts:voice",
        value: voiceName,
      },
      {
        userId: session.user.id,
        key: "global:tts:voice",
        value: voiceName,
      },
    ])
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: voiceName, updatedAt: new Date() },
    });

  // Save preset selection for user and globally
  await db
    .insert(userMemory)
    .values([
      {
        userId: session.user.id,
        key: "tts:preset",
        value: presetId,
      },
      {
        userId: session.user.id,
        key: "global:tts:preset",
        value: presetId,
      },
    ])
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: presetId, updatedAt: new Date() },
    });

  // Save instruction template
  const instructionToSave =
    presetId === "custom"
      ? customInstructions || ""
      : VOICE_STYLE_PRESETS.find((p) => p.id === presetId)?.template || VOICE_STYLE_PRESETS[0].template;

  await db
    .insert(userMemory)
    .values([
      {
        userId: session.user.id,
        key: "prompt:tts-instructions",
        value: instructionToSave,
      },
      {
        userId: session.user.id,
        key: "global:prompt:tts-instructions",
        value: instructionToSave,
      },
    ])
    .onConflictDoUpdate({
      target: [userMemory.userId, userMemory.key],
      set: { value: instructionToSave, updatedAt: new Date() },
    });

  return { success: true };
}

export async function previewVoiceAudio({
  voiceName,
  instructions,
  sampleText,
  language = "en",
}: {
  voiceName: string;
  instructions?: string;
  sampleText?: string;
  language?: string;
}): Promise<{ url: string; audioBase64: string; mimeType: string }> {
  const session = await requireSession();

  const text =
    sampleText ||
    "Hello! Welcome to 句背单词 (jubeidanci). Master vocabulary and sentence translation with confidence, intelligence, and natural cadence.";

  try {
    const result = await generateSpeech(text, language, {
      voiceName,
      instructions,
      skipCache: false, // Enable caching so repeated voice tests don't consume API quota
    });

    const base64 = result.buffer.toString("base64");
    const mime = result.mimeType || "audio/wav";
    const dataUrl = `data:${mime};base64,${base64}`;

    return {
      url: dataUrl,
      audioBase64: base64,
      mimeType: mime,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error(
        "Gemini Free Tier rate limit reached (3 requests/min). Please wait ~30 seconds or test another voice."
      );
    }
    throw err;
  }
}
