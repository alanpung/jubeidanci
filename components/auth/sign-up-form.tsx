"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileRef } from "@/components/auth/turnstile";
import Image from "next/image";
import Link from "next/link";

interface SignUpFormProps {
  redirectUrl?: string;
  initialError?: string;
  hasGoogleAuth?: boolean;
}

const getErrorMessage = (errCode?: string) => {
  if (!errCode) return "";
  if (errCode === "account_not_linked") {
    return "This email is already registered with a password. Please sign in with your email and password first, or account linking has now been enabled.";
  }
  return errCode;
};

export function SignUpForm({ redirectUrl, initialError, hasGoogleAuth = true }: SignUpFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(getErrorMessage(initialError));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileRef>(null);

  const destination = redirectUrl || "/onboarding";

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = await signUp.email(
        { name: name.trim(), email: cleanEmail, password },
        {
          headers: turnstileToken
            ? { "x-turnstile-token": turnstileToken }
            : undefined,
        }
      );
      setLoading(false);

      if (result.error) {
        const errorMsg =
          result.error.status === 500
            ? "Server error (500). Please check that your PostgreSQL database (DATABASE_URL) is connected and migrated."
            : result.error.message || "Sign up failed. Please try again.";
        setError(errorMsg);
        setTurnstileToken(null);
        turnstileRef.current?.reset();
      } else {
        router.push(destination);
      }
    } catch (err: unknown) {
      setLoading(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Sign up request failed. Please check your network and server connection.";
      setError(msg);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    if (!hasGoogleAuth) {
      setError("Google Sign-Up is not configured on this server. Please create an account with email and password.");
      return;
    }

    setGoogleLoading(true);
    try {
      const res = await signIn.social({
        provider: "google",
        callbackURL: destination,
      });
      if (res?.error) {
        const errorMsg =
          res.error.message?.includes("Provider not found") || res.error.message?.includes("provider")
            ? "Google Sign-Up is not configured on this server. Please create an account with email and password."
            : res.error.message || "Google sign-in failed. Please check Google OAuth configuration.";
        setError(errorMsg);
        setGoogleLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(
        msg.includes("Provider not found") || msg.includes("provider")
          ? "Google Sign-Up is not configured on this server. Please create an account with email and password."
          : msg
      );
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <Turnstile
          ref={turnstileRef}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
          onError={handleTurnstileExpire}
        />
        {error && (
          <p className="text-sm text-lingo-red font-medium">{error}</p>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={turnstileToken === null && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          className="w-full"
        >
          Create Account
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-lingo-border" />
        <span className="text-sm text-lingo-text-light uppercase tracking-wide">or</span>
        <div className="h-px flex-1 bg-lingo-border" />
      </div>

      <Button
        variant="outline"
        loading={googleLoading}
        onClick={handleGoogleSignIn}
        className="w-full"
      >
        <Image src="/google.svg" alt="" width={20} height={20} className="inline-block mr-2" />
        Sign up with Google
      </Button>

      <p className="text-center text-sm text-lingo-text-light">
        Already have an account?{" "}
        <Link
          href={redirectUrl ? `/sign-in?redirect=${encodeURIComponent(redirectUrl)}` : "/sign-in"}
          className="font-bold text-lingo-blue hover:underline"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
