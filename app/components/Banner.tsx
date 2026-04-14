"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Banner() {
  const pathname = usePathname() || "/";

  // store last visited path in sessionStorage so we can go back from /extra
  const [previousPage, setPreviousPage] = useState<string>("/");

  // on mount, read last path from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("pf_last_path");
      if (stored) setPreviousPage(stored);
    } catch {
      // ignore in non-browser env or restricted storage
      setPreviousPage("/");
    }
  }, []);

  // update last path whenever pathname changes
  useEffect(() => {
    try {
      sessionStorage.setItem("pf_last_path", pathname);
    } catch {
      // ignore
    }
  }, [pathname]);

  const target = pathname === "/extra" ? previousPage || "/" : "/extra";

  // Avoid raw single quotes to satisfy react/no-unescaped-entities
  const label =
    pathname === "/extra"
      ? "← Project Fluence — プロファイルに戻る"
      : "～あなたの未来に、英語の力を～ Project Fluenceについて →";

  return (
    <div className="w-full bg-blue-600 text-white text-center py-3">
      <Link href={target} className="text-lg font-medium hover:underline">
        {label}
      </Link>
    </div>
  );
}
