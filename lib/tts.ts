import { createHash } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import OpenAI from "openai";
import {
  getDefaultTemplate,
  interpolateTemplate,
  langCodeToName,
} from "@/lib/prompts";
import { detectTextLanguage } from "@/lib/language-detector";
import { db, isDbAvailable } from "@/lib/db";
import { userMemory, audioCache, user } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { uploadAudio, getAudio } from "@/lib/r2";

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Memory cache for generated audio to minimize API calls and avoid quota exhaustion
const memoryAudioCache = new Map<string, { buffer: Buffer; mimeType: string }>();

// Cache voice settings in memory for 60s to avoid sequential DB queries on every TTS call
let cachedGlobalVoiceSettings: {
  timestamp: number;
  voice?: string;
  instructions?: string;
} | null = null;

/**
 * Cleans raw 16-bit linear PCM audio to eliminate clicks, pops, DC offset, and buzz:
 * 1. Enforces 16-bit sample alignment.
 * 2. Removes any DC offset / voltage bias.
 * 3. Applies a rapid 5ms Hann window micro-fade-in (eliminates start click without clipping onset phonemes).
 * 4. Applies a rapid 5ms Hann window micro-fade-out (eliminates cutoff pop without cutting final consonants).
 * 5. Minimal 5ms digital silence padding so audio hardware transitions cleanly without delay.
 */
/**
 * Extracts pure, pristine PCM audio data from any input (raw PCM, single WAV, or nested WAV).
 * Strips all non-audio metadata chunks (C2PA, JUMBF, SynthID, IPTC, XMP) that cause buzzing static.
 */
export function extractCleanPcm(
  pcmBase64OrBuffer: string | Buffer,
  fallbackSampleRate = 24000,
  fallbackNumChannels = 1
): { pcm: Buffer; sampleRate: number; numChannels: number } {
  let buf =
    typeof pcmBase64OrBuffer === "string"
      ? Buffer.from(pcmBase64OrBuffer, "base64")
      : pcmBase64OrBuffer;

  let sampleRate = fallbackSampleRate;
  let numChannels = fallbackNumChannels;

  // 1. Unwrap any outer/nested WAV RIFF containers and extract strictly the 'data' chunk
  while (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  ) {
    let offset = 12;
    let foundDataChunk: Buffer | null = null;

    while (offset <= buf.length - 8) {
      const chunkId = buf.toString("ascii", offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      const chunkDataStart = offset + 8;
      const nextChunkOffset = chunkDataStart + chunkSize + (chunkSize % 2);

      if (chunkId === "fmt " && chunkSize >= 16) {
        numChannels = buf.readUInt16LE(chunkDataStart + 2) || numChannels;
        sampleRate = buf.readUInt32LE(chunkDataStart + 4) || sampleRate;
      } else if (chunkId === "data") {
        const actualEnd = Math.min(buf.length, chunkDataStart + chunkSize);
        foundDataChunk = buf.subarray(chunkDataStart, actualEnd);
        // We found the actual audio payload; do not parse trailing metadata chunks (e.g. 'jumb', 'LIST')
        break;
      }
      offset = nextChunkOffset;
    }

    if (foundDataChunk) {
      buf = foundDataChunk;
    } else {
      break;
    }
  }

  // 2. Strip any embedded or trailing C2PA/SynthID/IPTC metadata signatures that might exist in raw PCM
  const metadataSignatures = [
    "jumb",
    "jumd",
    "c2pa",
    "http://cv.iptc.org",
    "http://c2pa",
    "trainedAlgorithmicMedia",
    "SynthID",
  ];

  let earliestCut = buf.length;
  for (const sig of metadataSignatures) {
    const idx = buf.indexOf(sig);
    if (idx !== -1 && idx < earliestCut) {
      // Align cut to 2-byte sample boundary
      earliestCut = idx - (idx % 2);
    }
  }

  const pcm = buf.subarray(0, earliestCut);
  return { pcm, sampleRate, numChannels };
}

/**
 * Cleans linear 16-bit PCM audio to eliminate clicks, pops, DC offset, and trailing buzz:
 * 1. Enforces 16-bit sample alignment.
 * 2. Removes any DC offset / voltage bias.
 * 3. Scans backwards to find the end of real speech activity and cuts off trailing vocoder hum/buzz,
 *    while preserving a generous 70ms natural release cushion so no ending consonant is ever cut.
 * 4. Applies a rapid 5ms Hann window micro-fade-in at onset.
 * 5. Applies a smooth 15ms Hann window fade-out to true zero at completion.
 * 6. Adds minimal 5ms digital silence padding so audio hardware powers down smoothly.
 */
export function cleanAndSmoothPcm(
  rawBuffer: Buffer,
  sampleRate = 24000
): Buffer {
  const numBytes = rawBuffer.length - (rawBuffer.length % 2);
  let numSamples = numBytes / 2;
  if (numSamples <= 0) return rawBuffer;

  const samples = new Int16Array(numSamples);
  let sum = 0;
  for (let i = 0; i < numSamples; i++) {
    const val = rawBuffer.readInt16LE(i * 2);
    samples[i] = val;
    sum += val;
  }

  // 1. Remove DC offset
  const dcOffset = Math.round(sum / numSamples);
  if (Math.abs(dcOffset) > 2) {
    for (let i = 0; i < numSamples; i++) {
      let val = samples[i] - dcOffset;
      if (val > 32767) val = 32767;
      else if (val < -32768) val = -32768;
      samples[i] = val;
    }
  }

  // 2. Trailing noise floor gate:
  // Detect where vocal energy finishes and trim any trailing neural vocoder static/buzz
  // Window size: 10ms (~240 samples at 24kHz)
  const windowSize = Math.max(1, Math.floor((sampleRate * 10) / 1000));
  let lastActiveSample = numSamples - 1;

  for (let i = numSamples - 1; i >= windowSize; i -= windowSize) {
    let peak = 0;
    const start = Math.max(0, i - windowSize);
    for (let j = start; j <= i; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    // Threshold for vocal activity: raised to 450 to cleanly ignore Gemini's persistent vocoder static/buzz
    if (peak > 450) {
      lastActiveSample = i;
      break;
    }
  }

  // Preserve generous 60ms natural acoustic decay cushion (~1440 samples at 24kHz)
  // This guarantees soft ending consonants ('t', 's', 'k', 'p', 'th', 'd') are NEVER clipped.
  const cushionSamples = Math.floor((sampleRate * 60) / 1000);
  const minSilence = Math.floor((sampleRate * 5) / 1000);

  const trailing = numSamples - 1 - lastActiveSample;
  const keepTrailing = Math.min(trailing, cushionSamples);
  const effectiveEndSample = lastActiveSample + 1 + keepTrailing;
  const leadOutSilence = Math.max(0, minSilence - keepTrailing);

  // 3. Ultra-short 5ms micro-fade-in (~120 samples at 24kHz) to protect crucial initial word sounds
  const fadeInSamples = Math.min(
    Math.floor((sampleRate * 5) / 1000),
    Math.floor(effectiveEndSample / 8)
  );
  if (fadeInSamples > 0) {
    for (let i = 0; i < fadeInSamples; i++) {
      const factor = 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples));
      samples[i] = Math.round(samples[i] * factor);
    }
  }

  // 4. Smooth fade-out starting at lastActiveSample to effectiveEndSample to completely dissolve any buzz or static
  const fadeOutSamples = effectiveEndSample - lastActiveSample;
  if (fadeOutSamples > 0) {
    for (let i = 0; i < fadeOutSamples; i++) {
      const idx = lastActiveSample + i;
      const factor = 0.5 * (1 + Math.cos((Math.PI * i) / fadeOutSamples));
      samples[idx] = Math.round(samples[idx] * factor);
    }
  }

  // 5. Minimal digital silence padding (at least 5ms)
  const totalSamples = effectiveEndSample + leadOutSilence;

  const resultBuffer = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < effectiveEndSample; i++) {
    resultBuffer.writeInt16LE(samples[i], i * 2);
  }
  // Remaining leadOutSilence bytes remain zeroed

  return resultBuffer;
}

// Convert PCM or contaminated WAV into standard, pristine WAV format with de-buzzing DSP
export function pcmToWav(
  pcmBase64OrBuffer: string | Buffer,
  sampleRate = 24000,
  numChannels = 1
): Buffer {
  const { pcm: rawPcm, sampleRate: sr, numChannels: ch } = extractCleanPcm(
    pcmBase64OrBuffer,
    sampleRate,
    numChannels
  );

  const cleanPcm = cleanAndSmoothPcm(rawPcm, sr);

  const byteRate = sr * ch * 2;
  const blockAlign = ch * 2;
  const dataSize = cleanPcm.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, cleanPcm]);
}

/**
 * Re-smooth an existing WAV buffer to remove metadata, DC offset, and buzz
 */
export function smoothWavBuffer(wavBuffer: Buffer): Buffer {
  return pcmToWav(wavBuffer);
}

export function getCachedAudio(key: string): { buffer: Buffer; mimeType: string } | null {
  return memoryAudioCache.get(key) ?? null;
}

/**
 * Check persistent DB audio cache
 */
export async function getPersistentCachedAudio(
  key: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const mem = memoryAudioCache.get(key);
  if (mem) return mem;

  try {
    const dbUp = await isDbAvailable();
    if (!dbUp) return null;

    const rows = await db
      .select()
      .from(audioCache)
      .where(or(eq(audioCache.text, key), eq(audioCache.language, key)))
      .limit(1);

    if (rows.length > 0 && rows[0].r2Key) {
      const raw = rows[0].r2Key;
      let buffer: Buffer | null = null;
      let mimeType = "audio/wav";

      if (raw.startsWith("base64:wav:")) {
        buffer = Buffer.from(raw.slice(11), "base64");
        mimeType = "audio/wav";
      } else if (raw.startsWith("base64:mp3:")) {
        buffer = Buffer.from(raw.slice(11), "base64");
        mimeType = "audio/mpeg";
      } else if (raw.startsWith("base64:")) {
        buffer = Buffer.from(raw.slice(7), "base64");
        mimeType = "audio/wav";
      }

      if (buffer) {
        if (mimeType === "audio/wav") {
          buffer = smoothWavBuffer(buffer);
        }
        const item = { buffer, mimeType };
        memoryAudioCache.set(key, item);
        return item;
      }
    }
  } catch (err) {
    console.warn("DB audio cache lookup error:", err);
  }

  return null;
}

export interface GenerateSpeechOptions {
  voiceName?: string;
  instructions?: string;
  userId?: string;
  skipCache?: boolean;
}

// Fallback voice mapping for OpenAI TTS
const GEMINI_TO_OPENAI_VOICE: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  Fenrir: "onyx",
  Charon: "fable",
  Zephyr: "alloy",
  Puck: "nova",
  Kore: "shimmer",
  Aoede: "alloy",
  Leda: "shimmer",
  Orus: "echo",
};

const VALID_GEMINI_VOICES = new Set(["Puck", "Charon", "Kore", "Fenrir", "Aoede"]);
const GEMINI_VOICE_FALLBACK_MAP: Record<string, string> = {
  Zephyr: "Fenrir",
  Orus: "Charon",
  Evander: "Charon",
  Leda: "Kore",
  Callisto: "Aoede",
};

export function normalizeGeminiVoice(voiceName?: string): string {
  if (!voiceName) return "Kore";
  if (VALID_GEMINI_VOICES.has(voiceName)) return voiceName;
  return GEMINI_VOICE_FALLBACK_MAP[voiceName] || "Kore";
}

export async function generateSpeech(
  text: string,
  language: string,
  options?: GenerateSpeechOptions
): Promise<{ url: string; buffer: Buffer; mimeType: string }> {
  const normalized = text.trim();
  const resolvedLang = detectTextLanguage(normalized, { targetLanguage: language });
  const target_language = langCodeToName[resolvedLang] || resolvedLang;

  let selectedVoice = options?.voiceName;
  let customInstructions = options?.instructions;

  // 1. If not explicitly provided, check cached or database preferences
  if (!selectedVoice || !customInstructions) {
    if (
      cachedGlobalVoiceSettings &&
      Date.now() - cachedGlobalVoiceSettings.timestamp < 60_000
    ) {
      selectedVoice = selectedVoice || cachedGlobalVoiceSettings.voice;
      customInstructions = customInstructions || cachedGlobalVoiceSettings.instructions;
    } else {
      try {
        const dbUp = await isDbAvailable();
        if (dbUp) {
          // First check user's personal settings if provided
          if (options?.userId) {
            const records = await db
              .select()
              .from(userMemory)
              .where(eq(userMemory.userId, options.userId));
            const map = new Map(records.map((r) => [r.key, r.value]));
            if (!selectedVoice && map.has("tts:voice")) {
              selectedVoice = map.get("tts:voice");
            }
            if (!customInstructions && map.has("prompt:tts-instructions")) {
              customInstructions = map.get("prompt:tts-instructions");
            }
          }

          // 2. Load the Author's (alan.pung@gmail.com) exact voice settings so students always match the author
          if (!selectedVoice || !customInstructions) {
            try {
              const authorRows = await db
                .select({ key: userMemory.key, value: userMemory.value })
                .from(userMemory)
                .innerJoin(user, eq(userMemory.userId, user.id))
                .where(eq(user.email, "alan.pung@gmail.com"));

              const authorMap = new Map(authorRows.map((r) => [r.key, r.value]));
              if (!selectedVoice) {
                selectedVoice = authorMap.get("tts:voice") || authorMap.get("global:tts:voice");
              }
              if (!customInstructions) {
                customInstructions =
                  authorMap.get("prompt:tts-instructions") ||
                  authorMap.get("global:prompt:tts-instructions");
              }
            } catch {
              // Fallback if query fails
            }
          }

          // 3. Fallback to any global setting in userMemory
          if (!selectedVoice || !customInstructions) {
            const globalRecords = await db
              .select()
              .from(userMemory)
              .where(
                or(
                  eq(userMemory.key, "global:tts:voice"),
                  eq(userMemory.key, "global:prompt:tts-instructions"),
                  eq(userMemory.key, "tts:voice"),
                  eq(userMemory.key, "prompt:tts-instructions")
                )
              );
            const globalMap = new Map(globalRecords.map((r) => [r.key, r.value]));
            if (!selectedVoice) {
              selectedVoice = globalMap.get("global:tts:voice") || globalMap.get("tts:voice");
            }
            if (!customInstructions) {
              customInstructions =
                globalMap.get("global:prompt:tts-instructions") ||
                globalMap.get("prompt:tts-instructions");
            }
          }

          cachedGlobalVoiceSettings = {
            timestamp: Date.now(),
            voice: selectedVoice,
            instructions: customInstructions,
          };
        }
      } catch {
        // Fallback silently if DB lookup fails
      }
    }
  }

  const effectiveVoice = normalizeGeminiVoice(selectedVoice);

  if (!customInstructions) {
    try {
      const ttsTemplate = getDefaultTemplate("tts-instructions");
      customInstructions = interpolateTemplate(ttsTemplate, { target_language });
    } catch {
      customInstructions = `Speak in ${target_language} with clear, native pronunciation. Clear, lively, brisk native pace.`;
    }
  } else {
    customInstructions = interpolateTemplate(customInstructions, { target_language });
  }

  const hash = createHash("md5")
    .update(`${resolvedLang}:${effectiveVoice}:${customInstructions}:${normalized.toLowerCase()}`)
    .digest("hex");
  const cacheKey = `${resolvedLang}/${effectiveVoice}/${hash}`;

  // 2. Check memory cache first
  const existing = memoryAudioCache.get(cacheKey);
  if (existing && !options?.skipCache) {
    return {
      url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
      buffer: existing.buffer,
      mimeType: existing.mimeType,
    };
  }

  // 3. Check persistent database cache (survives restarts/deployments forever)
  if (!options?.skipCache) {
    const dbCached = await getPersistentCachedAudio(cacheKey);
    if (dbCached) {
      return {
        url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
        buffer: dbCached.buffer,
        mimeType: dbCached.mimeType,
      };
    }
  }

  // 4. Check Cloudflare R2 cache if available
  if (!options?.skipCache) {
    const r2Buffer = await getAudio(cacheKey);
    if (r2Buffer) {
      memoryAudioCache.set(cacheKey, { buffer: r2Buffer, mimeType: "audio/mpeg" });
      return {
        url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
        buffer: r2Buffer,
        mimeType: "audio/mpeg",
      };
    }
  }

  // 5. Primary Default: OpenAI TTS (gpt-4o-mini / tts-1)
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const openAiVoice = GEMINI_TO_OPENAI_VOICE[effectiveVoice] || "alloy";
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: openAiVoice,
        input: normalized,
        speed: 1.15,
      });

      const arrayBuffer = await mp3Response.arrayBuffer();
      const mp3Buffer = Buffer.from(arrayBuffer);

      memoryAudioCache.set(cacheKey, {
        buffer: mp3Buffer,
        mimeType: "audio/mpeg",
      });

      // Cache audio to Cloudflare R2
      await uploadAudio(cacheKey, mp3Buffer, "audio/mpeg");

      // Persist permanently in database
      try {
        if (await isDbAvailable()) {
          await db
            .insert(audioCache)
            .values({
              text: cacheKey,
              language: resolvedLang,
              r2Key: `base64:mp3:${mp3Buffer.toString("base64")}`,
            })
            .onConflictDoUpdate({
              target: [audioCache.text, audioCache.language],
              set: { r2Key: `base64:mp3:${mp3Buffer.toString("base64")}` },
            });
        }
      } catch (dbErr) {
        console.warn("Could not write audio to database cache:", dbErr);
      }

      return {
        url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
        buffer: mp3Buffer,
        mimeType: "audio/mpeg",
      };
    } catch (openAiErr) {
      console.warn("Primary OpenAI TTS failed, trying Gemini Neural TTS fallback...", openAiErr);
    }
  }

  // 6. Secondary Fallback: Gemini Neural TTS
  const geminiModels = ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash"];
  let lastError: unknown = null;

  try {
    const ai = getGeminiClient();

    for (const model of geminiModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: normalized,
          config: {
            systemInstruction: customInstructions,
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: effectiveVoice },
              },
            },
          },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const base64Data = part?.inlineData?.data;

        if (base64Data) {
          // Gemini returns raw 24kHz 16-bit PCM little-endian
          const wavBuffer = pcmToWav(base64Data, 24000, 1);

          memoryAudioCache.set(cacheKey, {
            buffer: wavBuffer,
            mimeType: "audio/wav",
          });

          // Cache audio to Cloudflare R2
          await uploadAudio(cacheKey, wavBuffer, "audio/wav");

          // Persist permanently in database
          try {
            if (await isDbAvailable()) {
              await db
                .insert(audioCache)
                .values({
                  text: cacheKey,
                  language: resolvedLang,
                  r2Key: `base64:wav:${wavBuffer.toString("base64")}`,
                })
                .onConflictDoUpdate({
                  target: [audioCache.text, audioCache.language],
                  set: { r2Key: `base64:wav:${wavBuffer.toString("base64")}` },
                });
            }
          } catch (dbErr) {
            console.warn("Could not write audio to database cache:", dbErr);
          }

          return {
            url: `/api/tts?key=${encodeURIComponent(cacheKey)}`,
            buffer: wavBuffer,
            mimeType: "audio/wav",
          };
        }
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`TTS attempt with model ${model} failed (${errMsg}), trying next...`);
      }
    }
  } catch (geminiInitErr) {
    console.warn("Gemini client init failed:", geminiInitErr);
  }

  // If all server TTS options fail, rethrow with descriptive message
  const message =
    lastError instanceof Error
      ? lastError.message
      : "Audio service temporarily rate-limited. Falling back to browser speech synthesis.";
  throw new Error(message);
}
