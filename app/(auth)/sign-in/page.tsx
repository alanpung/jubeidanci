import { SignInForm } from "@/components/auth/sign-in-form";
import { getSession } from "@/lib/auth-server";
import { hasDbConfig } from "@/lib/db";
import { safeRedirectPath } from "@/lib/safe-redirect";

interface PageProps {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}

// getSession() reads cookies/headers, so this route must not be statically cached.
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps) {
  const { redirect: redirectParam, error } = await searchParams;
  const destination = safeRedirectPath(redirectParam);
  const hasGoogleAuth = Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
    (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET)
  );

  // If the browser already holds a valid session, do not show the login form
  // again. This is the safety net for the mobile sign-in bug: on a cold
  // serverless DB read, /library can briefly fail its session lookup and 302
  // straight back to /sign-in, leaving a signed-in user staring at the login
  // page until they close and reopen the tab. Now they get a one-tap way in.
  //
  // We deliberately do NOT server-redirect here. An automatic redirect could
  // ping-pong with /library while the DB is warming up; a link is a user
  // gesture, is always followed by Safari, and cannot loop.
  //
  // The demo/fallback auth (no DATABASE_URL) reports a synthetic DEMO_USER for
  // everyone, so only run this check against real sessions.
  const session = hasDbConfig ? await getSession() : null;

  if (session) {
    return (
      <>
        <h2 className="mb-3 text-center text-2xl font-bold text-lingo-text">
          You&apos;re signed in
        </h2>
        <p className="mb-6 text-center text-sm text-lingo-text-light">
          {session.user.email ? `Signed in as ${session.user.email}. ` : ""}
          Your session is active — continue below.
        </p>
        <a
          href={destination}
          className="block w-full rounded-xl border-b-4 border-lingo-green-dark bg-lingo-green px-4 py-2.5 text-center text-base font-bold uppercase text-white transition-colors hover:bg-lingo-green/90"
        >
          Continue to your library
        </a>
        <p className="mt-4 text-center text-sm text-lingo-text-light">
          To use a different account, sign out from Settings first.
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold text-lingo-text">
        Welcome back!
      </h2>
      <SignInForm redirectUrl={destination} initialError={error} hasGoogleAuth={hasGoogleAuth} />
    </>
  );
}
