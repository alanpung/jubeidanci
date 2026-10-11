import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { verifyTurnstileToken } from "./turnstile";

export const turnstilePlugin = () => {
  return {
    id: "turnstile",
    hooks: {
      before: [
        {
          matcher: (context) => {
            return (
              context.path === "/sign-in/email" ||
              context.path === "/sign-up/email"
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const token = ctx.headers?.get("x-turnstile-token") ?? "";

            const result = await verifyTurnstileToken(token);

            if (!result.success) {
              throw new APIError("BAD_REQUEST", {
                message: "Turnstile verification failed",
              });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
