"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PromptEditor } from "./prompt-editor";
import { MemoryEditor } from "./memory-editor";
import { ChangePasswordForm } from "./change-password-form";
import { VoiceSelector } from "./voice-selector";
import type { PromptWithOverride } from "@/lib/actions/prompts";
import type { VoiceSettingsData } from "@/lib/tts-config";

export function SettingsView({
  isAdmin = false,
  userEmail,
  userName,
  prompts,
  initialMemory,
  voiceSettings,
}: {
  isAdmin?: boolean;
  userEmail?: string;
  userName?: string;
  prompts: PromptWithOverride[];
  initialMemory: string;
  voiceSettings?: VoiceSettingsData | null;
}) {
  const router = useRouter();

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete account");
      }
      router.push("/sign-in");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      setDeleteError(message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-6 pb-20 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-lingo-text mb-1">Settings</h1>
        <p className="text-sm text-lingo-text-light font-bold">
          Manage your security, account credentials, and preferences.
        </p>
      </div>

      {/* Account Info Card */}
      <div className="rounded-2xl border-2 border-lingo-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lingo-blue/15 text-2xl font-black text-lingo-blue">
            {userName ? userName.charAt(0).toUpperCase() : userEmail ? userEmail.charAt(0).toUpperCase() : "👤"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-lingo-text truncate">
              {userName || "Learner"}
            </p>
            <p className="text-xs text-lingo-text-light truncate">
              {userEmail}
            </p>
          </div>
          {isAdmin && (
            <span className="rounded-full bg-lingo-yellow/20 px-2.5 py-1 text-xs font-bold text-amber-700">
              Admin / Author
            </span>
          )}
        </div>
      </div>

      {/* Voice & Audio Persona Configuration */}
      {voiceSettings && (
        <VoiceSelector initialSettings={voiceSettings} />
      )}

      {/* Change Password */}
      <ChangePasswordForm />

      {/* Admin AI Configs */}
      {isAdmin && (
        <div className="space-y-4 pt-2">
          <h2 className="text-lg font-black text-lingo-text">AI Configuration</h2>
          <MemoryEditor initialValue={initialMemory} />

          {prompts.map((p) => (
            <PromptEditor key={p.id} prompt={p} />
          ))}
        </div>
      )}

      {/* Danger Zone */}
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6 shadow-sm">
        <h2 className="text-lg font-black text-red-600 mb-1">Danger Zone</h2>
        <p className="text-xs text-red-500 font-bold mb-4">
          Irreversible and destructive actions for your account.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-red-200">
          <div>
            <p className="text-sm font-bold text-lingo-text">Delete Account</p>
            <p className="text-xs text-lingo-text-light">
              Permanently delete your account, SRS vocabulary cards, and learning history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl border-b-4 border-red-800 transition-all cursor-pointer whitespace-nowrap"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border-2 border-red-200">
            <h3 className="text-xl font-black text-red-600 mb-2">
              Are you absolutely sure?
            </h3>
            <p className="text-sm text-lingo-text-light mb-6">
              This action cannot be undone. This will permanently delete your account and all associated data including learning progress, SRS review records, and preferences.
            </p>

            {deleteError && (
              <p className="text-sm text-red-600 font-bold mb-4">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-bold text-lingo-text border-2 border-lingo-border rounded-xl hover:bg-lingo-gray/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAccount}
                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl border-b-2 border-red-800 disabled:opacity-50 transition-all"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete My Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
