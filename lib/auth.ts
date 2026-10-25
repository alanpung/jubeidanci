import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { userStats, userPreferences } from "./db/schema";
import { DEFAULT_NATIVE_LANGUAGE } from "./constants";
import { turnstilePlugin } from "./turnstile-plugin";
import { sendEmail } from "./email";

const getBaseURL = () => {
  const raw =
    process.env.BETTER_AUTH_URL ||
    process.env.BETTER_AUTH_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
};

const baseURL = getBaseURL();
console.log("DEBUG: Resolved BetterAuth baseURL:", baseURL);

const googleClientId =
  process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

console.log("DEBUG: Google Client ID present:", !!googleClientId);
console.log("DEBUG: Google Client Secret present:", !!googleClientSecret);

const staticTrustedOrigins = Array.from(
  new Set([
    baseURL,
    "https://jubeidanci.vercel.app",
    "https://*.vercel.app",
    "https://*.run.app",
    ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/+$/, "")] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((s) => s.trim())
      : []),
    "http://localhost:3000",
    "http://localhost:*",
  ])
).filter(Boolean);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "openlingo-default-secret-key-32-chars-long",
  baseURL,
  trustedOrigins: async (request) => {
    const list = [...staticTrustedOrigins];
    if (request) {
      const origin = request.headers.get("origin");
      if (origin) list.push(origin);
      const referer = request.headers.get("referer");
      if (referer) {
        try {
          const refOrigin = new URL(referer).origin;
          list.push(refOrigin);
        } catch {}
      }
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") || "https";
      if (host) {
        list.push(`${proto}://${host}`);
      }
    }
    return Array.from(new Set(list));
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  plugins: [],
  advanced: {
    cookiePrefix: "openlingo",
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "重置您的 句背单词 密码",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #58cc02; font-size: 28px; margin-bottom: 8px;">句背单词 · jubeidanci</h1>
            <p style="color: #777; font-size: 14px; margin-bottom: 32px;">语境记词 · 句中得悟</p>
            <h2 style="color: #3c3c3c; font-size: 20px; margin-bottom: 16px;">重置您的密码</h2>
            <p style="color: #3c3c3c; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
              您好 ${user.name || ""}，<br><br>
              我们收到了重置您密码的请求。请点击下方按钮设置新密码：
            </p>
            <a href="${url}" style="display: inline-block; background-color: #58cc02; color: white; font-weight: bold; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 16px;">
              Reset Password
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 32px; line-height: 1.5;">
              If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.
            </p>
          </div>
        `,
      });
    },
  },
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const userStatsInsert = db
              .insert(userStats)
              .values({ userId: user.id })
              .onConflictDoNothing();
            const userPreferencesInsert = db
              .insert(userPreferences)
              .values({
                userId: user.id,
                nativeLanguage: DEFAULT_NATIVE_LANGUAGE,
              })
              .onConflictDoNothing();

            const slackNotification = process.env.SLACK_WEBHOOK
              ? fetch(process.env.SLACK_WEBHOOK, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: `New user signup: ${user.name} (${user.email})`,
                  }),
                }).catch(() => {})
              : Promise.resolve();

            await Promise.all([
              userStatsInsert,
              userPreferencesInsert,
              slackNotification,
            ]);
          } catch (hookErr) {
            console.error("Warning: Error in user create after-hook:", hookErr);
          }
        },
      },
    },
  },
});
