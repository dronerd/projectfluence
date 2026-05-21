"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase public environment variables are not configured.");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("パスワードは6文字以上で入力してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setMessage(
        error.message.toLowerCase().includes("session")
          ? "再設定リンクの有効期限が切れている可能性があります。もう一度パスワード再設定メールを送信してください。"
          : error.message,
      );
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setSuccess(true);
    setMessage("パスワードを更新しました。");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-950 shadow-xl">
        <h1 className="text-2xl font-bold">パスワード再設定</h1>
        <p className="mt-2 text-sm text-gray-600">新しいパスワードを設定してください。</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-gray-700">
            新しいパスワード
            <span className="relative mt-1 block">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={success}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100"
              />
              {!success && (
                <PasswordVisibilityButton
                  visible={showNewPassword}
                  onClick={() => setShowNewPassword((visible) => !visible)}
                />
              )}
            </span>
            <span className="mt-1 block text-xs font-medium text-gray-500">6文字以上で入力してください。</span>
          </label>

          <label className="block text-sm font-semibold text-gray-700">
            新しいパスワードを再入力
            <span className="relative mt-1 block">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={success}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100"
              />
              {!success && (
                <PasswordVisibilityButton
                  visible={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                />
              )}
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "更新中..." : "パスワードを更新"}
          </button>
        </form>

        {message && (
          <p className={`mt-4 rounded-lg p-3 text-sm ${success ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {message}
          </p>
        )}

        {success && (
          <Link
            href="/"
            className="mt-4 inline-flex w-full justify-center rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            ホームに戻る
          </Link>
        )}
      </div>
    </main>
  );
}

function PasswordVisibilityButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-50"
      aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
    >
      {visible ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c5.2 0 8.5 4.2 9.5 5.7a1.5 1.5 0 0 1 0 1.6 16.3 16.3 0 0 1-2.1 2.6" />
          <path d="M6.5 6.7a16 16 0 0 0-4 3 1.5 1.5 0 0 0 0 1.6C3.5 12.8 6.8 17 12 17a10.1 10.1 0 0 0 3.5-.6" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 9.7a1.5 1.5 0 0 0 0 1.6C3.5 12.8 6.8 17 12 17s8.5-4.2 9.5-5.7a1.5 1.5 0 0 0 0-1.6C20.5 8.2 17.2 4 12 4S3.5 8.2 2.5 9.7Z" />
          <circle cx="12" cy="10.5" r="2.5" />
        </svg>
      )}
    </button>
  );
}
