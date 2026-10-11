"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileRef } from "@/components/auth/turnstile";
import Image from "next/image";
import Link from "next/link";
import { DEFAULT_PATH } from "@/lib/constants";

interface SignInFormProps {
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

export function SignInForm({ redirectUrl, initialError, hasGoogleAuth = true }: SignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(getErrorMessage(initialError));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileRef>(null);

  const destination = redirectUrl || DEFAULT_PATH;

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
      const result = await signIn.email(
        { email: cleanEmail, password },
        {
          headers: turnstileToken
            ? { "x-turnstile-token": turnstileToken }
            : undefined,
        }
      );
      setLoading(false);

      if (result.error) {
        let errorMsg =
          result.error.status === 500
            ? "Server error (500). Please check that your PostgreSQL database is connected and migrated."
            : result.error.message || "Sign in failed. Please check your credentials.";

        if (
          result.error.code === "INVALID_EMAIL_OR_PASSWORD" ||
          errorMsg.toLowerCase().includes("invalid email or password") ||
          errorMsg.toLowerCase().includes("credentials")
        ) {
          errorMsg = "Invalid email or password. If you originally registered with Google or forgot your password, please click 'Forgot password?' to reset it.";
        }

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
          : "Sign in request failed. Please check your network and server connection.";
      setError(msg);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    if (!hasGoogleAuth) {
      setError("Google Sign-In is not configured on this server. Please sign in with your email and password.");
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
            ? "Google Sign-In is not configured on this server. Please sign in with your email and password."
            : res.error.message || "Google sign-in failed. Please check Google OAuth configuration.";
        setError(errorMsg);
        setGoogleLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(
        msg.includes("Provider not found") || msg.includes("provider")
          ? "Google Sign-In is not configured on this server. Please sign in with your email and password."
          : msg
      );
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="flex justify-end -mt-2">
          <Link
            href="/forgot-password"
            className="text-sm font-bold text-lingo-blue hover:underline"
          >
            Forgot password?
          </Link>
        </div>
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
          Sign In
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
        Sign in with Google
      </Button>

      <p className="text-center text-sm text-lingo-text-light">
        Don&apos;t have an account?{" "}
        <Link
          href={redirectUrl ? `/sign-up?redirect=${encodeURIComponent(redirectUrl)}` : "/sign-up"}
          className="font-bold text-lingo-blue hover:underline"
        >
          Sign Up
        </Link>
      </p>
    </div>
  );
}
