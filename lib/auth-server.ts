import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { hasDbConfig } from "./db";

export const DEMO_USER = {
  id: "user_demo_123",
  email: "testing@openlingo.dev",
  name: "OpenLingo Learner",
};

export const getSession = async () => {
  // Ask better-auth for the real session whenever a DATABASE_URL is configured.
  //
  // This used to be gated behind isDbAvailable(), a probe that races the 10s
  // connect handshake and false-negatives on cold serverless invocations. When
  // it lost that race we silently skipped the real session lookup and fell
  // through to DEMO_USER, so the *same browser* was a different user from one
  // request to the next: writes landed under "user_demo_123" (or a fabricated
  // cookie id) while reads used the real id — hence learning/mastered flipping
  // between a real count and 0, and "it survived until I logged out".
  //
  // hasDbConfig is a static env check and cannot lie. If the DB is genuinely
  // unreachable, auth.api.getSession() throws and is handled below.
  try {
    if (hasDbConfig) {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      if (session) return session;
    }
  } catch (err: unknown) {
    const errorObj = err as { digest?: string; message?: string };
    if (
      errorObj?.digest === "DYNAMIC_SERVER_USAGE" ||
      errorObj?.digest === "NEXT_REDIRECT" ||
      errorObj?.message?.includes("Dynamic server usage")
    ) {
      // Re-throw so Next.js App Router properly flags the route as dynamic without warning logs
      throw err;
    }
    console.warn("Session retrieval error:", err);
  }

  // Check fallback session cookie
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("openlingo.session_user")?.value;
    if (userCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(userCookie));
        return { user: parsed };
      } catch {}
    }
    const demoCookie = cookieStore.get("openlingo.demo_session")?.value;
    if (demoCookie) {
      return { user: DEMO_USER };
    }
  } catch {}

  // Only fall back to the demo identity when there is genuinely no database to
  // authenticate against. When a DATABASE_URL exists, returning null here makes
  // requireSession() redirect to sign-in, which is the honest outcome — far
  // better than silently attributing a signed-in learner's practice to
  // user_demo_123 and losing it.
  if (!hasDbConfig) {
    return { user: DEMO_USER };
  }

  return null;
};

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}
