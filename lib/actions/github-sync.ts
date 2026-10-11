"use server";

import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getSession } from "@/lib/auth-server";
import { isAdminEmail } from "@/lib/ai/models";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface GitHubSyncConfig {
  repoUrl: string;
  branch: string;
  hasToken: boolean;
  maskedToken?: string;
  authorName?: string;
  authorEmail?: string;
  lastSyncedAt?: string;
  lastCommitHash?: string;
  lastMessage?: string;
}

interface StoredGitHubData {
  repoUrl: string;
  branch: string;
  token: string;
  authorName?: string;
  authorEmail?: string;
  lastSyncedAt?: string;
  lastCommitHash?: string;
  lastMessage?: string;
}

const LOCAL_DATA_FILE = path.join(process.cwd(), "data", "github-sync.json");

async function readLocalConfig(): Promise<StoredGitHubData | null> {
  try {
    const raw = await fs.readFile(LOCAL_DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeLocalConfig(data: StoredGitHubData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_DATA_FILE), { recursive: true });
    await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write local github config:", err);
  }
}

export async function getGitHubSyncConfig(): Promise<GitHubSyncConfig> {
  try {
    const session = await getSession();
    let stored: StoredGitHubData | null = null;

    if (session?.user?.id) {
      try {
        const [row] = await db
          .select()
          .from(userMemory)
          .where(eq(userMemory.userId, session.user.id));

        if (row && row.key === "github:config" && row.value) {
          stored = JSON.parse(row.value);
        }
      } catch {
        // Fallback to local
      }
    }

    if (!stored) {
      stored = await readLocalConfig();
    }

    if (!stored) {
      return {
        repoUrl: "",
        branch: "main",
        hasToken: false,
        authorName: session?.user?.name || "Developer",
        authorEmail: session?.user?.email || "",
      };
    }

    const token = stored.token || "";
    const masked = token.length > 8
      ? `${token.slice(0, 4)}...${token.slice(-4)}`
      : token.length > 0
        ? "••••••••"
        : "";

    return {
      repoUrl: stored.repoUrl || "",
      branch: stored.branch || "main",
      hasToken: Boolean(token),
      maskedToken: masked,
      authorName: stored.authorName || session?.user?.name || "Developer",
      authorEmail: stored.authorEmail || session?.user?.email || "",
      lastSyncedAt: stored.lastSyncedAt,
      lastCommitHash: stored.lastCommitHash,
      lastMessage: stored.lastMessage,
    };
  } catch (err) {
    console.error("getGitHubSyncConfig error:", err);
    return {
      repoUrl: "",
      branch: "main",
      hasToken: false,
    };
  }
}

export async function saveGitHubSyncConfig(params: {
  repoUrl: string;
  branch: string;
  token?: string;
  authorName?: string;
  authorEmail?: string;
}): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized. Only the administrator can modify GitHub settings.");
  }

  // Load existing to preserve token if not updating
  const existing = (await readLocalConfig()) || {
    repoUrl: "",
    branch: "main",
    token: "",
  };

  const finalToken = params.token?.trim() || existing.token || "";

  if (!params.repoUrl?.trim()) {
    return { success: false, message: "Repository URL is required." };
  }

  const updated: StoredGitHubData = {
    ...existing,
    repoUrl: params.repoUrl.trim(),
    branch: params.branch.trim() || "main",
    token: finalToken,
    authorName: params.authorName?.trim() || session.user.name || "Developer",
    authorEmail: params.authorEmail?.trim() || session.user.email || "",
  };

  // Save to DB userMemory
  try {
    await db
      .insert(userMemory)
      .values({
        userId: session.user.id,
        key: "github:config",
        value: JSON.stringify(updated),
      })
      .onConflictDoUpdate({
        target: [userMemory.userId, userMemory.key],
        set: { value: JSON.stringify(updated), updatedAt: new Date() },
      });
  } catch {
    // Non-fatal if DB is offline
  }

  await writeLocalConfig(updated);

  // Initialize or configure local git repo
  try {
    const cwd = process.cwd();
    await execAsync("git init", { cwd });
    if (updated.authorName) {
      await execAsync(`git config user.name ${JSON.stringify(updated.authorName)}`, { cwd });
    }
    if (updated.authorEmail) {
      await execAsync(`git config user.email ${JSON.stringify(updated.authorEmail)}`, { cwd });
    }
  } catch (err) {
    console.warn("Could not set local git config:", err);
  }

  return { success: true, message: "GitHub settings saved successfully!" };
}

export async function syncToGitHub(customMessage?: string): Promise<{
  success: boolean;
  message: string;
  commitHash?: string;
}> {
  const session = await requireSession();
  if (!isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized");
  }

  let stored: StoredGitHubData | null = null;
  try {
    const [row] = await db
      .select()
      .from(userMemory)
      .where(eq(userMemory.userId, session.user.id));
    if (row && row.key === "github:config" && row.value) {
      stored = JSON.parse(row.value);
    }
  } catch {}

  if (!stored) {
    stored = await readLocalConfig();
  }

  if (!stored || !stored.repoUrl || !stored.token) {
    return {
      success: false,
      message: "GitHub repository URL or token not configured. Please fill in your GitHub settings first.",
    };
  }

  const { repoUrl, branch = "main", token, authorName, authorEmail } = stored;
  const cwd = process.cwd();

  // Normalize URL to authenticated format: https://<token>@github.com/owner/repo.git
  let cleanUrl = repoUrl.trim();
  cleanUrl = cleanUrl.replace(/^https?:\/\//, "");
  // Remove any existing user/token in url
  cleanUrl = cleanUrl.replace(/^[^@]+@/, "");
  if (!cleanUrl.endsWith(".git")) {
    cleanUrl += ".git";
  }
  const authedRemote = `https://${token}@${cleanUrl}`;

  const scrub = (str: string) => (token ? str.replaceAll(token, "******") : str);

  try {
    // 1. Ensure git init
    await execAsync("git init", { cwd });

    // 2. Set author
    const name = authorName || session.user.name || "OpenLingo Author";
    const email = authorEmail || session.user.email || "developer@openlingo.dev";
    await execAsync(`git config user.name ${JSON.stringify(name)}`, { cwd });
    await execAsync(`git config user.email ${JSON.stringify(email)}`, { cwd });

    // 3. Set remote origin
    try {
      await execAsync("git remote remove origin", { cwd });
    } catch {}
    await execAsync(`git remote add origin ${JSON.stringify(authedRemote)}`, { cwd });

    // 4. Ensure branch
    await execAsync(`git branch -M ${branch}`, { cwd });

    // 5. Stage files
    await execAsync("git add -A", { cwd });

    // 6. Check if there are changes to commit
    const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd });
    let commitHash = "";

    const now = new Date();
    const defaultMsg = `Sync updates from AI Studio (${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString()})`;
    const commitMsg = customMessage?.trim() || defaultMsg;

    if (statusOut.trim().length > 0) {
      await execAsync(`git commit -m ${JSON.stringify(commitMsg)}`, { cwd });
      const { stdout: revOut } = await execAsync("git rev-parse --short HEAD", { cwd });
      commitHash = revOut.trim();
    } else {
      // Nothing new to stage, get current HEAD
      try {
        const { stdout: revOut } = await execAsync("git rev-parse --short HEAD", { cwd });
        commitHash = revOut.trim();
      } catch {
        // First commit
        await execAsync(`git commit --allow-empty -m ${JSON.stringify(commitMsg)}`, { cwd });
        const { stdout: revOut } = await execAsync("git rev-parse --short HEAD", { cwd });
        commitHash = revOut.trim();
      }
    }

    // 7. Push to remote
    // First try normal push, if rejected try push with force
    try {
      await execAsync(`git push -u origin ${branch}`, { cwd });
    } catch (pushErr: unknown) {
      console.warn("Standard push rejected, forcing push to maintain current state:", pushErr);
      await execAsync(`git push -u origin ${branch} --force`, { cwd });
    }

    // Update last sync info
    stored.lastSyncedAt = new Date().toISOString();
    stored.lastCommitHash = commitHash;
    stored.lastMessage = commitMsg;

    await writeLocalConfig(stored);
    try {
      await db
        .insert(userMemory)
        .values({
          userId: session.user.id,
          key: "github:config",
          value: JSON.stringify(stored),
        })
        .onConflictDoUpdate({
          target: [userMemory.userId, userMemory.key],
          set: { value: JSON.stringify(stored), updatedAt: new Date() },
        });
    } catch {}

    return {
      success: true,
      message: `Successfully pushed commit ${commitHash} to ${cleanUrl} (${branch})!`,
      commitHash,
    };
  } catch (err: unknown) {
    const rawError = err instanceof Error ? err.message : String(err);
    const safeError = scrub(rawError);
    console.error("Git sync error:", safeError);
    return {
      success: false,
      message: `Sync failed: ${safeError}`,
    };
  }
}
