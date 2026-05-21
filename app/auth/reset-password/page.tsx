"use client";

import AuthButton from "@/app/components/AuthButton";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-950">パスワード再設定</h1>
        <p className="mt-3 text-sm text-gray-600">
          認証が完了すると、新しいパスワードを設定する画面が表示されます。
        </p>
        <div className="mt-6 flex justify-center">
          <AuthButton />
        </div>
      </div>
    </main>
  );
}
