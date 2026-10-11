import { NextRequest, NextResponse } from "next/server";
import {
  generateSpeech,
  getCachedAudio,
  getPersistentCachedAudio,
  smoothWavBuffer,
} from "@/lib/tts";
import { getAudio } from "@/lib/r2";
import { getSession } from "@/lib/auth-server";

/**
 * Creates an audio response with full HTTP 206 Partial Content (Range) support.
 * This is strictly required by iOS Safari and mobile browsers to play audio properly.
 */
function createAudioResponse(
  buffer: Buffer,
  mimeType: string,
  request: NextRequest
): NextResponse {
  const totalLength = buffer.length;
  const rangeHeader = request.headers.get("range");

  const commonHeaders: Record<string, string> = {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  if (!rangeHeader) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Length": totalLength.toString(),
      },
    });
  }

  // Parse Range header: e.g. "bytes=0-" or "bytes=0-1023"
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!match) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Length": totalLength.toString(),
      },
    });
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;

  if (start >= totalLength || end >= totalLength || start > end) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalLength}`,
      },
    });
  }

  const chunk = buffer.subarray(start, end + 1);

  return new NextResponse(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...commonHeaders,
      "Content-Range": `bytes ${start}-${end}/${totalLength}`,
      "Content-Length": chunk.length.toString(),
    },
  });
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  // 1. Check in-memory Gemini TTS cache first
  const memoryCached = getCachedAudio(key);
  if (memoryCached) {
    const cleanBuffer =
      memoryCached.mimeType === "audio/wav"
        ? smoothWavBuffer(memoryCached.buffer)
        : memoryCached.buffer;
    return createAudioResponse(
      cleanBuffer,
      memoryCached.mimeType || "audio/wav",
      request
    );
  }

  // 2. Check persistent database audio cache
  const dbCached = await getPersistentCachedAudio(key);
  if (dbCached) {
    return createAudioResponse(
      dbCached.buffer,
      dbCached.mimeType || "audio/wav",
      request
    );
  }

  // 3. Check Cloudflare R2 if configured
  const buffer = await getAudio(key);
  if (buffer) {
    return createAudioResponse(buffer, "audio/mpeg", request);
  }

  return new NextResponse(null, { status: 404 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, language, voice, instructions } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json(
        { error: "language is required" },
        { status: 400 }
      );
    }
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "text must be under 4096 characters" },
        { status: 400 }
      );
    }

    let userId: string | undefined = undefined;
    try {
      const session = await getSession();
      if (session?.user?.id) {
        userId = session.user.id;
      }
    } catch {
      // Ignore session errors
    }

    const { url } = await generateSpeech(text, language, {
      voiceName: voice,
      instructions,
      userId,
    });
    return NextResponse.json({ url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "TTS generation failed";
    console.error("TTS generation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
