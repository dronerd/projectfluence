"use client";

import React, { useCallback, useEffect, useMemo, useState, useId, useRef } from "react";
import Modal from "./Modal";
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
  inlineUserMenu?: boolean;
  authenticatedOnly?: boolean;
};

type AuthMode = "sign-in" | "sign-up";

let passwordRecoveryClaimed = false;

export default function AuthButton({
  compact = false,
  hideWhenAuthenticated = false,
  initialMode = "sign-in",
  onAuthenticated,
  logoutRedirectTo,
  userMenu = false,
  inlineUserMenu = false,
  authenticatedOnly = false,
}: AuthButtonProps) {
  const router = useRouter();
  const titleId = useId();
  const messageId = useId();
  const accountRef = useRef<HTMLDivElement>(null);
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
  const signupSucceeded = mode === "sign-up" && message === "アカウントを作成しました。";

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

    // The dedicated reset page owns recovery there; the header must not open a second form.
    const isDedicatedResetPage = window.location.pathname.replace(/\/$/, "") === "/auth/reset-password";
    const isPasswordRecoveryUrl =
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"));

    if (!isDedicatedResetPage && isPasswordRecoveryUrl && !passwordRecoveryClaimed) {
      passwordRecoveryClaimed = true;
      openPasswordUpdateForm();
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    }).catch(() => setUser(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY" && !isDedicatedResetPage && !passwordRecoveryClaimed) {
        passwordRecoveryClaimed = true;
        openPasswordUpdateForm();
        return;
      }
      if (session?.user && !passwordUpdateOpen) {
        if (mode === "sign-up") {
          setMessage("アカウントを作成しました。");
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
  }, [mode, onAuthenticated, openPasswordUpdateForm, passwordUpdateOpen, supabase]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function dismiss(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [accountMenuOpen]);

  async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("現在ログインを利用できません。時間をおいて再度お試しください。");
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
            ? "アカウントを作成しました。"
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
      setMessage("現在ログインを利用できません。時間をおいて再度お試しください。");
      return;
    }

    setLoading(true);
    try {
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });

    if (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } else {
      setMessage("パスワード再設定用のメールを送信しました。");
    }
    } catch (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("現在ログインを利用できません。時間をおいて再度お試しください。");
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
    try {
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
    } catch (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setMessage("");

    if (!supabase) {
      setMessage("現在ログインを利用できません。時間をおいて再度お試しください。");
      return;
    }

    setLoading(true);
    try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });

    if (error) {
      setMessage(formatAuthError(error, "sign-in"));
      setLoading(false);
    }
    } catch (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase || loading) return;
    setLoading(true);
    try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(formatAuthError(error, "sign-in"));
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
    } catch (error) {
      setMessage(formatAuthError(error, "sign-in"));
    } finally {
      setLoading(false);
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
  const accountEmail = user?.email || accountLabel;
  const buttonClass = `${initialMode === "sign-up" ? "pf-button" : "pf-button-secondary"} ${compact ? "px-3" : ""}`;
  const accountButtonClass = "pf-button-secondary rounded-full p-2";
  const authModal =
    modalOpen && typeof document !== "undefined"
      ? (
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} labelledBy={titleId}>
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id={titleId} className="text-xl font-bold text-gray-950">{passwordUpdateOpen ? "パスワードを再設定" : resetPasswordOpen ? "パスワードをお忘れですか？" : "学習の記録を残そう"}</h2>
                  <p className="mt-1 text-sm text-gray-600">ログインすると、学習の記録を保存できます。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="shrink-0 rounded-lg px-3 text-xl leading-none text-gray-600 hover:bg-gray-100"
                  aria-label="閉じる"
                >
                  ×
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
                <form aria-describedby={message ? messageId : undefined} aria-busy={loading} onSubmit={handlePasswordUpdate} className="mt-5 space-y-3">
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
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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
                    className="pf-button w-full"
                  >
                    {loading ? "更新中..." : "パスワードを更新"}
                  </button>
                </form>
              ) : resetPasswordOpen ? (
                <form aria-describedby={message ? messageId : undefined} aria-busy={loading} onSubmit={handlePasswordReset} className="mt-5 space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    メールアドレス
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="pf-button w-full"
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
                  <form aria-describedby={message ? messageId : undefined} aria-busy={loading} onSubmit={handleEmailAuth} className="mt-5 space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      メールアドレス
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
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
                      className="pf-button w-full"
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
                      className="mt-3 text-sm font-semibold text-sky-700 underline-offset-4 hover:underline"
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
                    className="pf-button-secondary w-full"
                  >
                    {mode === "sign-up" ? "Googleで登録" : "Googleでログイン"}
                  </button>
                </>
              )}

              {message && <p id={messageId} role="status" className={`mt-4 rounded-lg p-3 text-sm ${signupSucceeded || message.includes("送信しました") ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{message}</p>}
              {signupSucceeded && (
                <button
                  type="button"
                  onClick={handleStartUsingApp}
                  className="pf-button mt-3 w-full"
                >
                  アプリを使い始める
                </button>
              )}
            </div>
          </Modal>
        )
      : null;

  if (user && hideWhenAuthenticated && !modalOpen) {
    return null;
  }

  if (user && initialMode === "sign-up" && !modalOpen) {
    return null;
  }

  if (!user && authenticatedOnly && !modalOpen) {
    return null;
  }

  if (user && inlineUserMenu && !modalOpen) {
    return (
      <div className="w-full">
        <div className="px-1 pb-3">
          <div className="text-xs font-semibold uppercase text-gray-500">Email</div>
          <div className="mt-1 break-all text-sm font-bold text-gray-900">{accountEmail}</div>
        </div>
        <a
          href="/analytics"
          className="block w-full rounded-lg px-1 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
        >
          学習の記録
        </a>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="mt-1 w-full rounded-lg px-1 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>
    );
  }

  if (user && userMenu && !modalOpen) {
    return (
      <div className="relative" ref={accountRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAccountMenuOpen(false); }}>
        <button
          type="button"
          onClick={() => setAccountMenuOpen((open) => !open)}
          className={`${accountButtonClass} flex h-11 w-11 items-center justify-center`}
          aria-label="アカウント"
          aria-expanded={accountMenuOpen}
        >
          <AccountIcon />
        </button>

        {accountMenuOpen && (
          <div
            className="absolute right-0 z-[80] mt-2 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-gray-200 bg-white p-2 text-gray-900 shadow-xl"
          >
            <div className="border-b border-gray-100 px-3 py-3">
              <div className="text-xs font-semibold uppercase text-gray-500">Email</div>
              <div className="mt-1 truncate text-sm font-bold text-gray-900">{accountEmail}</div>
            </div>
            <a
              href="/analytics"
              onClick={() => setAccountMenuOpen(false)}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              学習の記録
            </a>
            <button
              type="button"
              onClick={handleLogout}
          disabled={loading}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              ログアウト
            </button>
            {message && <p role="status" className="px-3 py-2 text-sm text-amber-900">{message}</p>}
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

function AccountIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
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

  return "手続きを完了できませんでした。接続を確認して、もう一度お試しください。";
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
      aria-pressed={visible}
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
