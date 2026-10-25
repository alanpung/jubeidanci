import { ImageResponse } from "next/og";
import { getUnitWithContent } from "@/lib/db/queries/courses";
import { getLanguageName } from "@/lib/languages";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await params;
  const unit = await getUnitWithContent(unitId);

  if (!unit || unit.visibility !== "public") {
    return new Response("Not found", { status: 404 });
  }

  const lessonCount = unit.lessons.length;
  const languageName = getLanguageName(unit.targetLanguage);
  const details = [
    lessonCount > 0
      ? `${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}`
      : null,
    languageName,
    unit.level,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #f7f7f7 0%, #e8f5e9 100%)",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Icon */}
        <div
          style={{
            fontSize: 80,
            marginBottom: 24,
          }}
        >
          {unit.icon}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#4b4b4b",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "90%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {unit.title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 26,
            color: "#777",
            textAlign: "center",
            marginTop: 16,
            maxWidth: "80%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {unit.description}
        </div>

        {/* Details badge */}
        {details && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 28,
              fontSize: 22,
              color: "#58CC02",
              fontWeight: 700,
              background: "rgba(88, 204, 2, 0.1)",
              padding: "10px 24px",
              borderRadius: 16,
            }}
          >
            {details}
          </div>
        )}

        {/* Branding */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#58CC02",
            }}
          >
<<<<<<< HEAD
            jubeidanci
=======
            句背单词 · jubeidanci
>>>>>>> 2c1df5327456bac13425315bafe7b7206562a381
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
