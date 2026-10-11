import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isDbAvailable } from "./db";

export const DEMO_USER = {
  id: "user_demo_123",
  email: "testing@openlingo.dev",
  name: "OpenLingo Learner",
};

export const getSession = async () => {
  try {
    const dbUp = await isDbAvailable();
    if (dbUp) {
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

  // If no DB is available, default to DEMO_USER session so app works seamlessly
  if (!(await isDbAvailable())) {
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
