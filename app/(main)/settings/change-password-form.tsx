"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsPending(true);

    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (res?.error) {
        setError(res.error.message || "Failed to update password. Please check your current password.");
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-lingo-border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🔒</span>
        <h2 className="text-lg font-black text-lingo-text">Change Password</h2>
      </div>
      <p className="text-xs text-lingo-text-light font-medium mb-5">
        Ensure your account uses a secure password of at least 8 characters.
      </p>

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-lingo-green/30 bg-lingo-green/10 p-3 text-xs font-bold text-lingo-green">
          <span>✓</span>
          <span>Your password has been changed successfully!</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-600">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
            Current Password
          </label>
          <input
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
            required
            className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              New Password
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-lingo-text-light">
              Confirm New Password
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={8}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-3.5 py-2.5 text-sm text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-lingo-text-light cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="rounded border-lingo-border text-lingo-blue focus:ring-0"
            />
            <span>Show passwords</span>
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl border-2 border-lingo-blue bg-lingo-blue px-5 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_0] shadow-blue-700 transition-all hover:bg-lingo-blue/90 active:translate-y-[1px] active:shadow-none disabled:opacity-50"
          >
            {isPending ? "Updating..." : "Update Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
