import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: getModel("gemini-3.5-flash"),
      prompt,
    });

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Failed to generate AI prompt:", error);
    return NextResponse.json(
      { error: "Failed to generate AI prompt" },
      { status: 500 }
    );
  }
}
