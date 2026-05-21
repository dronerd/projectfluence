"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AuthButtonProps = {
  compact?: boolean;
  variant?: "gradient" | "banner";
  initialMode?: AuthMode;
  onAuthenticated?: () => void;
};

type AuthMode = "sign-in" | "sign-up";

let passwordRecoveryClaimed = false;

export default function AuthButton({
  compact = false,
  variant = "gradient",
  initialMode = "sign-in",
  onAuthenticated,
}: AuthButtonProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordUpdateOpen, setPasswordUpdateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const openPasswordUpdateForm = useCallback((initialMessage = "新しいパスワードを設定してください。") => {
    setMode("sign-in");
    setResetPasswordOpen(false);
    setPasswordUpdateOpen(true);
    setEmail("");
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage(initialMessage);
    setModalOpen(true);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const isPasswordRecoveryUrl =
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"));

    if (isPasswordRecoveryUrl && !passwordRecoveryClaimed) {
      passwordRecoveryClaimed = true;
      openPasswordUpdateForm();
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY" && !passwordRecoveryClaimed) {
        passwordRecoveryClaimed = true;
        openPasswordUpdateForm();
        return;
      }
      if (session?.user) {
        if (mode === "sign-up") {
          setMessage("登録されました。");
          setEmail("");
          setPassword("");
        } else {
          setModalOpen(false);
        }
        onAuthenticated?.();
      }
    });

    return () => subscription.unsubscribe();
  }, [mode, onAuthenticated, openPasswordUpdateForm, supabase]);

  async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase public environment variables are not configured.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage("メールアドレスを入力してください。");
      return;
    }

    setLoading(true);
    try {
      const response =
        mode === "sign-up"
          ? await supabase.auth.signUp({
              email: normalizedEmail,
              password,
              options: {
                emailRedirectTo: getAuthRedirectUrl(),
              },
            })
          : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

      if (response.error) throw response.error;
      if (mode === "sign-up") {
        if (response.data.session) {
          setEmail("");
          setPassword("");
        }
        setMessage(
          response.data.session
            ? "登録されました。"
            : "確認メールを送信しました。メール内のリンクを開いてからログインしてください。",
        );
      } else {
        setMessage("");
      }
    } catch (error) {
      setMessage(formatAuthError(error, mode));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase public environment variables are not configured.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("パスワード再設定用のメールを送信しました。");
    }
    setLoading(false);
  }

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
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

    if (newPassword !== confirmNewPassword) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } else {
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordUpdateOpen(false);
      setModalOpen(false);
      setMessage("");
      passwordRecoveryClaimed = false;
    }
    setLoading(false);
  }

  async function handleGoogleAuth() {
    setMessage("");

    if (!supabase) {
      setMessage("Supabase public environment variables are not configured.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setEmail("");
    setPassword("");
    setResetEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordUpdateOpen(false);
    setMessage("");
    setModalOpen(false);
    passwordRecoveryClaimed = false;
  }

  function openAuthModal() {
    setMode(initialMode);
    setResetPasswordOpen(false);
    setPasswordUpdateOpen(false);
    setEmail("");
    setPassword("");
    setResetEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage("");
    setModalOpen(true);
  }

  const label = user ? "ログアウト" : initialMode === "sign-up" ? "新規登録" : "ログイン";
  const buttonClass =
    variant === "banner"
      ? "rounded-full border border-white/70 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
      : compact
        ? "rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        : "rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110";

  if (user && initialMode === "sign-up" && !modalOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={user ? handleLogout : openAuthModal}
        className={buttonClass}
      >
        {label}
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-950">Project Fluence</h2>
                <p className="mt-1 text-sm text-gray-600">ログインすると学習進捗がアカウントに保存されます。</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full px-3 py-1 text-xl leading-none text-gray-600 hover:bg-gray-100"
                aria-label="Close login"
              >
                x
              </button>
            </div>

            {!passwordUpdateOpen && (
              <div className="mt-5 grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setResetPasswordOpen(false);
                    setMessage("");
                  }}
                  className={`rounded-full px-3 py-2 ${mode === "sign-in" ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-up");
                    setResetPasswordOpen(false);
                    setMessage("");
                  }}
                  className={`rounded-full px-3 py-2 ${mode === "sign-up" ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}
                >
                  新規登録
                </button>
              </div>
            )}

            {passwordUpdateOpen ? (
              <form onSubmit={handlePasswordUpdate} className="mt-5 space-y-3">
                <label className="block text-sm font-semibold text-gray-700">
                  新しいパスワード
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                  <span className="mt-1 block text-xs font-medium text-gray-500">6文字以上で入力してください。</span>
                </label>
                <label className="block text-sm font-semibold text-gray-700">
                  新しいパスワードを再入力
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "更新中..." : "パスワードを更新"}
                </button>
              </form>
            ) : resetPasswordOpen ? (
              <form onSubmit={handlePasswordReset} className="mt-5 space-y-3">
                <label className="block text-sm font-semibold text-gray-700">
                  メールアドレス
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    required
                    autoComplete="email"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "送信中..." : "再設定メールを送信"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordOpen(false);
                    setMessage("");
                  }}
                  className="w-full rounded-full border border-gray-300 px-4 py-3 font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  ログインに戻る
                </button>
              </form>
            ) : (
              <>
                <form onSubmit={handleEmailAuth} className="mt-5 space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    メールアドレス
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    {mode === "sign-up" ? "パスワードを作成してください" : "パスワード"}
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                    {mode === "sign-up" && (
                      <span className="mt-1 block text-xs font-medium text-gray-500">6文字以上で入力してください。</span>
                    )}
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? "処理中..." : mode === "sign-up" ? "登録" : "ログイン"}
                  </button>
                </form>

                {mode === "sign-in" && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordOpen(true);
                      setMessage("");
                    }}
                    className="mt-3 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
                  >
                    パスワードを忘れた場合
                  </button>
                )}

                <div className="my-5 flex items-center gap-3 text-xs text-gray-500">
                  <span className="h-px flex-1 bg-gray-200" />
                  or
                  <span className="h-px flex-1 bg-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  className="w-full rounded-full border border-gray-300 px-4 py-3 font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {mode === "sign-up" ? "Googleで登録" : "Googleでログイン"}
                </button>
              </>
            )}

            {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function formatAuthError(error: unknown, mode: AuthMode) {
  const message = error instanceof Error ? error.message : "Authentication failed.";
  const normalized = message.toLowerCase();

  if (
    mode === "sign-up" &&
    (normalized.includes("already registered") ||
      normalized.includes("already exists") ||
      normalized.includes("user already") ||
      normalized.includes("duplicate"))
  ) {
    return "このメールアドレスはすでに登録されています。";
  }

  if (normalized.includes("email not confirmed") || normalized.includes("not confirmed")) {
    return "メールアドレスの確認が完了していません。確認メール内のリンクを開いてからログインしてください。";
  }

  if (normalized.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }

  return message;
}

function getAuthRedirectUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : undefined);
}

function getPasswordResetRedirectUrl() {
  const baseUrl = getAuthRedirectUrl();
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/auth/reset-password` : undefined;
}
