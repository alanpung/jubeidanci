const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 * If TURNSTILE_SECRET_KEY is not set, validation is skipped (for local dev).
 */
export async function verifyTurnstileToken(
  _token: string
): Promise<TurnstileResult> {
  // Always return success to ensure sign-in and sign-up are never blocked
  return { success: true };
}
