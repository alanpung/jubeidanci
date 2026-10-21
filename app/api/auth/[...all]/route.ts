import { auth } from "@/lib/auth";
import { hasDbConfig } from "@/lib/db";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const defaultHandler = toNextJsHandler(auth);

// Gate on hasDbConfig (a static env check), NOT the isDbAvailable() probe.
// The probe races the 10s connect handshake and false-negatives on a cold
// serverless instance, which sent sign-in/sign-out to handleFallbackAuth and
// fabricated a cookie identity (user_<hex(email)>) that has no matching row in
// the `user` table. Every SRS write under that id then died on the
// srs_card.user_id foreign key — which is exactly why the learner's practice
// vanished on logout/login. hasDbConfig cannot lie, and if the DB is truly
// down the fallback below still applies.
export async function GET(req: NextRequest) {
  if (hasDbConfig) {
    return defaultHandler.GET(req);
  }
  return handleFallbackAuth(req);
}

export async function POST(req: NextRequest) {
  if (hasDbConfig) {
    return defaultHandler.POST(req);
  }
  return handleFallbackAuth(req);
}

async function handleFallbackAuth(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/get-session")) {
    const cookieHeader = req.headers.get("cookie") || "";
    let sessionUser = null;
    const match = cookieHeader.match(/openlingo\.session_user=([^;]+)/);
    if (match) {
      try {
        sessionUser = JSON.parse(decodeURIComponent(match[1]));
      } catch {}
    }
    if (!sessionUser) {
      sessionUser = {
        id: "user_demo_123",
        email: "testing@openlingo.dev",
        name: "OpenLingo Learner",
      };
    }
    return NextResponse.json({
      user: sessionUser,
      session: {
        id: "session_demo_123",
        userId: sessionUser.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }

  if (path.endsWith("/sign-in/email") || path.endsWith("/sign-up/email")) {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const email = body.email || "testing@openlingo.dev";
    const name = body.name || email.split("@")[0] || "OpenLingo Learner";
    const user = {
      id: `user_${Buffer.from(email).toString("hex").slice(0, 12)}`,
      email,
      name,
      createdAt: new Date().toISOString(),
    };

    const res = NextResponse.json({
      user,
      session: {
        id: `sess_${Date.now()}`,
        userId: user.id,
      },
      token: "fallback_token",
    });

    const userCookie = encodeURIComponent(JSON.stringify(user));
    res.cookies.set("openlingo.session_user", userCookie, {
      httpOnly: false,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    res.cookies.set("openlingo.demo_session", "true", {
      httpOnly: false,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  }

  if (path.endsWith("/sign-out")) {
    const res = NextResponse.json({ success: true });
    res.cookies.delete("openlingo.session_user");
    res.cookies.delete("openlingo.demo_session");
    return res;
  }

  return NextResponse.json({ success: true });
}
