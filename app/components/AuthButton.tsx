"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AuthButtonProps = {
  compact?: boolean;
  hideWhenAuthenticated?: boolean;
  variant?: "gradient" | "banner";
  initialMode?: AuthMode;
  onAuthenticated?: () => void;
  logoutRedirectTo?: string;
  userMenu?: boolean;
};

type AuthMode = "sign-in" | "sign-up";

let passwordRecoveryClaimed = false;

export default function AuthButton({
  compact = false,
  hideWhenAuthenticated = false,
  variant = "gradient",
  initialMode = "sign-in",
  onAuthenticated,
  logoutRedirectTo,
  userMenu = false,
}: AuthButtonProps) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordUpdateOpen, setPasswordUpdateOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const signupSucceeded = mode === "sign-up" && message === "登録されました。";

  const openPasswordUpdateForm = useCallback((initialMessage = "新しいパスワードを設定してください。") => {
    setMode("sign-in");
    setResetPasswordOpen(false);
    setPasswordUpdateOpen(true);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
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
          setConfirmPassword("");
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

    if (mode === "sign-up" && password !== confirmPassword) {
      setMessage("確認用パスワードが一致しません。");
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
          setConfirmPassword("");
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

  function handleStartUsingApp() {
    setMessage("");
    setModalOpen(false);
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
      return;
    }

    setUser(null);
    setAccountMenuOpen(false);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setResetEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordUpdateOpen(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setMessage("");
    setModalOpen(false);
    passwordRecoveryClaimed = false;

    if (logoutRedirectTo) {
      router.replace(logoutRedirectTo);
      router.refresh();
    }
  }

  function openAuthModal() {
    setMode(initialMode);
    setResetPasswordOpen(false);
    setPasswordUpdateOpen(false);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setResetEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setMessage("");
    setAccountMenuOpen(false);
    setModalOpen(true);
  }

  const label = user ? "ログアウト" : initialMode === "sign-up" ? "新規登録" : "ログイン";
  const accountLabel = getUserDisplayLabel(user);
  const buttonClass =
    variant === "banner"
      ? "rounded-full border border-white/70 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
      : compact
        ? "rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        : "rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110";
  const authModal =
    modalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 sm:items-center">
            <div className="my-auto max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-gray-950 shadow-2xl">
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
                      setPassword("");
                      setConfirmPassword("");
                      setShowPassword(false);
                      setShowConfirmPassword(false);
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
                      setPassword("");
                      setConfirmPassword("");
                      setShowPassword(false);
                      setShowConfirmPassword(false);
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
                    <span className="relative mt-1 block">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                      <PasswordVisibilityButton
                        visible={showNewPassword}
                        onClick={() => setShowNewPassword((visible) => !visible)}
                      />
                    </span>
                    <span className="mt-1 block text-xs font-medium text-gray-500">6文字以上で入力してください。</span>
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    新しいパスワードを再入力
                    <span className="relative mt-1 block">
                      <input
                        type={showConfirmNewPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                      <PasswordVisibilityButton
                        visible={showConfirmNewPassword}
                        onClick={() => setShowConfirmNewPassword((visible) => !visible)}
                      />
                    </span>
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
                      <span className="relative mt-1 block">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          minLength={6}
                          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                        <PasswordVisibilityButton
                          visible={showPassword}
                          onClick={() => setShowPassword((visible) => !visible)}
                        />
                      </span>
                      {mode === "sign-up" && (
                        <span className="mt-1 block text-xs font-medium text-gray-500">6文字以上で入力してください。</span>
                      )}
                    </label>
                    {mode === "sign-up" && (
                      <label className="block text-sm font-semibold text-gray-700">
                        パスワードを再入力してください
                        <span className="relative mt-1 block">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                          />
                          <PasswordVisibilityButton
                            visible={showConfirmPassword}
                            onClick={() => setShowConfirmPassword((visible) => !visible)}
                          />
                        </span>
                      </label>
                    )}
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
              {signupSucceeded && (
                <button
                  type="button"
                  onClick={handleStartUsingApp}
                  className="mt-3 w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-3 font-bold text-white shadow-md transition hover:brightness-110"
                >
                  アプリを使い始める
                </button>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  if (user && hideWhenAuthenticated && !modalOpen) {
    return null;
  }

  if (user && initialMode === "sign-up" && !modalOpen) {
    return null;
  }

  if (user && userMenu && !modalOpen) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((open) => !open)}
          className={`${buttonClass} flex max-w-[220px] items-center gap-2`}
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
        >
          <span className="truncate">{accountLabel}</span>
          <span aria-hidden="true" className="text-xs">▼</span>
        </button>

        {accountMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 text-gray-900 shadow-xl"
          >
            <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
              <div className="truncate">{accountLabel}</div>
            </div>
            <a
              role="menuitem"
              href="/analytics"
              onClick={() => setAccountMenuOpen(false)}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              学習分析
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    );
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
      {authModal}
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

function getUserDisplayLabel(user: User | null) {
  if (!user) return "";
  const metadata = user.user_metadata;
  const name =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : "";

  return user.email || name || "アカウント";
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
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
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
