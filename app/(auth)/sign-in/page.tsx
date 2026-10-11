import { SignInForm } from "@/components/auth/sign-in-form";

interface PageProps {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { redirect, error } = await searchParams;
  const hasGoogleAuth = Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
    (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET)
  );

  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold text-lingo-text">
        Welcome back!
      </h2>
      <SignInForm redirectUrl={redirect} initialError={error} hasGoogleAuth={hasGoogleAuth} />
    </>
  );
}
