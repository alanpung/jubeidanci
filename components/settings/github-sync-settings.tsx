"use client";

import { useState } from "react";
import {
  saveGitHubSyncConfig,
  syncToGitHub,
  type GitHubSyncConfig,
} from "@/lib/actions/github-sync";

export function GitHubSyncSettings({
  initialConfig,
}: {
  initialConfig: GitHubSyncConfig;
}) {
  const [repoUrl, setRepoUrl] = useState(initialConfig.repoUrl);
  const [branch, setBranch] = useState(initialConfig.branch || "main");
  const [token, setToken] = useState("");
  const [authorName, setAuthorName] = useState(initialConfig.authorName || "");
  const [authorEmail, setAuthorEmail] = useState(initialConfig.authorEmail || "");
  const [hasToken, setHasToken] = useState(initialConfig.hasToken);
  const [maskedToken, setMaskedToken] = useState(initialConfig.maskedToken || "");

  const [customCommitMessage, setCustomCommitMessage] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState(initialConfig.lastSyncedAt);
  const [lastCommitHash, setLastCommitHash] = useState(initialConfig.lastCommitHash);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await saveGitHubSyncConfig({
        repoUrl,
        branch,
        token: token.trim() || undefined,
        authorName,
        authorEmail,
      });

      if (res.success) {
        setStatusMessage({ type: "success", text: res.message });
        if (token.trim()) {
          setHasToken(true);
          const t = token.trim();
          setMaskedToken(
            t.length > 8 ? `${t.slice(0, 4)}...${t.slice(-4)}` : "••••••••",
          );
          setToken("");
        }
      } else {
        setStatusMessage({ type: "error", text: res.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNow = async () => {
    if (!repoUrl) {
      setStatusMessage({
        type: "error",
        text: "Please enter and save your GitHub Repository URL first.",
      });
      return;
    }
    if (!hasToken && !token.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please enter and save a GitHub Personal Access Token first.",
      });
      return;
    }

    setIsSyncing(true);
    setStatusMessage({ type: "info", text: "Staging, committing, and pushing to GitHub..." });

    try {
      // If user typed a new token before clicking sync, save it first
      if (token.trim()) {
        await saveGitHubSyncConfig({
          repoUrl,
          branch,
          token: token.trim(),
          authorName,
          authorEmail,
        });
        setHasToken(true);
        setToken("");
      }

      const res = await syncToGitHub(customCommitMessage.trim() || undefined);
      if (res.success) {
        setStatusMessage({ type: "success", text: res.message });
        setLastSyncedAt(new Date().toISOString());
        if (res.commitHash) setLastCommitHash(res.commitHash);
        setCustomCommitMessage("");
      } else {
        setStatusMessage({ type: "error", text: res.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-lingo-border bg-white p-6 shadow-sm space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🐙</span>
            <h2 className="text-lg font-black text-lingo-text">GitHub Auto-Sync & Export</h2>
          </div>
          <p className="text-xs text-lingo-text-light font-bold mt-1">
            Configure your GitHub repository and token once. Changes can be pushed automatically or with one click anytime without prompting you again.
          </p>
        </div>
        {lastSyncedAt && (
          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Synced
            </span>
            <p className="text-[10px] text-lingo-text-light mt-0.5 font-medium">
              {new Date(lastSyncedAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-wider text-lingo-text-light mb-1">
            GitHub Repository URL <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/your-username/your-repo.git"
            className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm font-semibold text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-lingo-text-light mb-1">
              Target Branch
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm font-semibold text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-lingo-text-light mb-1">
              Personal Access Token (PAT)
            </label>
            <div className="relative">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hasToken ? `Saved (${maskedToken})` : "ghp_xxxxxxxxxxxx"}
                className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm font-semibold text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
              />
              {hasToken && !token && (
                <span className="absolute right-3 top-2.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">
                  TOKEN SAVED
                </span>
              )}
            </div>
            <p className="text-[11px] text-lingo-text-light mt-1">
              Needs <code className="font-mono font-bold bg-lingo-gray/30 px-1 py-0.5 rounded">repo</code> permissions.{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=OpenLingo%20Sync"
                target="_blank"
                rel="noreferrer"
                className="text-lingo-blue underline font-bold"
              >
                Create token on GitHub →
              </a>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-lingo-text-light mb-1">
              Git Commit Author Name
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Alan Pung"
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm font-semibold text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-lingo-text-light mb-1">
              Git Commit Email
            </label>
            <input
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="alan.pung@gmail.com"
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm font-semibold text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving || isSyncing}
            className="rounded-xl border-2 border-lingo-border bg-lingo-gray px-4 py-2.5 text-xs font-black uppercase tracking-wider text-lingo-text hover:bg-lingo-border transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>

      {/* Sync Execution Section */}
      <div className="rounded-xl border-2 border-dashed border-lingo-border bg-slate-50/70 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-lingo-text">
              Push Workspace to GitHub
            </h3>
            <p className="text-[11px] text-lingo-text-light font-medium">
              Stages all modified files, creates a commit, and pushes directly to your branch.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing || (!repoUrl && !hasToken)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-lingo-blue px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-40"
          >
            {isSyncing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Syncing...
              </>
            ) : (
              <>
                <span>🚀</span>
                Sync & Push Now
              </>
            )}
          </button>
        </div>

        <div className="pt-1">
          <input
            type="text"
            value={customCommitMessage}
            onChange={(e) => setCustomCommitMessage(e.target.value)}
            placeholder="Optional custom commit message (e.g. 'Updated vocabulary and learning units')"
            className="w-full rounded-lg border border-lingo-border bg-white px-3 py-1.5 text-xs font-medium text-lingo-text placeholder:text-lingo-text-light/50 focus:border-lingo-blue focus:outline-none"
          />
        </div>

        {lastCommitHash && (
          <p className="text-[11px] text-lingo-text-light">
            Last pushed commit: <code className="font-mono font-bold text-lingo-text">{lastCommitHash}</code>
          </p>
        )}
      </div>

      {statusMessage && (
        <div
          className={`rounded-xl p-3 text-xs font-bold ${
            statusMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : statusMessage.type === "error"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          {statusMessage.text}
        </div>
      )}
    </div>
  );
}
